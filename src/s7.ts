// Minimal S7 (ISO-on-TCP, port 102) client: COTP connect, setup communication,
// read/write DB bytes. Same API as ModbusClient so the rest of the app is unchanged:
// "register" n = DB word at byte offset n*2 (DBW n*2) of one non-optimized DB.

// One TPKT-framed request → one TPKT-framed response (framing done by the transport).
export type FrameTransport = {
  open(host: string, port: number, timeoutMs: number): Promise<void>;
  request(frame: Uint8Array): Promise<Uint8Array>;
  close(): void;
};

export type S7Options = { port?: number; db: number; rack?: number; slot?: number; timeoutMs?: number };

const RETURN_CODES: Record<number, string> = {
  0x01: 'hardware error di PLC',
  0x03: 'akses ditolak (cek "Permit PUT/GET" dan DB tidak "Optimized block access")',
  0x05: 'alamat di luar ukuran DB',
  0x06: 'tipe data tidak didukung',
  0x07: 'ukuran data tidak sesuai',
  0x0a: 'DB tidak ada di PLC (cek nomor DB)',
};

const tpkt = (body: number[]) => {
  const n = body.length + 4;
  return new Uint8Array([3, 0, n >> 8, n & 0xff, ...body]);
};
const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];

export class S7Client {
  private open = false;
  private pduRef = 1;
  private queue: Promise<unknown> = Promise.resolve();
  private opts: Required<S7Options>;
  private transport: FrameTransport;
  private host: string;
  onClose?: () => void;

  constructor(transport: FrameTransport, host: string, opts: S7Options) {
    this.transport = transport;
    this.host = host;
    this.opts = { port: 102, rack: 0, slot: 1, timeoutMs: 1000, ...opts };
  }

  get connected() {
    return this.open;
  }

  async connect(): Promise<void> {
    const { port, rack, slot, timeoutMs } = this.opts;
    try {
      await this.transport.open(this.host, port, timeoutMs * 2);
      // COTP connection request: local TSAP 0x0100, remote TSAP = PG (0x01) + rack/slot.
      const remoteTsap = 0x0100 | (rack * 0x20 + slot);
      const cc = await this.withTimeout(
        this.transport.request(
          tpkt([0x11, 0xe0, 0, 0, 0, 1, 0, 0xc0, 1, 0x0a, 0xc1, 2, 1, 0, 0xc2, 2, remoteTsap >> 8, remoteTsap & 0xff]),
        ),
      );
      if (cc[5] !== 0xd0) throw new Error('PLC menolak koneksi ISO (cek rack/slot)');
      // S7 setup communication, ask for a 480-byte PDU.
      const setup = await this.job([0xf0, 0, 0, 1, 0, 1, 0x01, 0xe0], []);
      if (setup.param[0] !== 0xf0) throw new Error('Jawaban setup S7 tidak valid');
      this.open = true;
    } catch (e) {
      this.transport.close();
      throw e;
    }
  }

  close() {
    this.drop();
  }

  // Read `count` words starting at word `start` (DBW start*2).
  readHolding(start: number, count: number): Promise<number[]> {
    return this.serial(async () => {
      const { param, data } = await this.job([0x04, 1, ...this.item(start * 2, count * 2)], []);
      if (param[0] !== 0x04) throw new Error('Jawaban baca S7 tidak valid');
      this.checkItem(data[0]);
      const bytes = data.subarray(4);
      if (bytes.length < count * 2) throw new Error('Jawaban PLC tidak lengkap');
      return Array.from({ length: count }, (_, i) => u16(bytes, i * 2));
    });
  }

  // Write one word at word `addr` (DBW addr*2).
  writeSingle(addr: number, value: number): Promise<void> {
    const v = value & 0xffff;
    return this.serial(async () => {
      const { param, data } = await this.job([0x05, 1, ...this.item(addr * 2, 2)], [0, 0x04, 0, 16, v >> 8, v & 0xff]);
      if (param[0] !== 0x05) throw new Error('Jawaban tulis S7 tidak valid');
      this.checkItem(data[0]);
    });
  }

  // S7ANY item: BYTE transport, `len` bytes, DB area (0x84), bit address = byteOffset*8.
  private item(byteOffset: number, len: number) {
    const bit = byteOffset * 8;
    const db = this.opts.db;
    return [0x12, 0x0a, 0x10, 0x02, len >> 8, len & 0xff, db >> 8, db & 0xff, 0x84, (bit >> 16) & 0xff, (bit >> 8) & 0xff, bit & 0xff];
  }

  private checkItem(code: number) {
    if (code !== 0xff) throw new Error(`PLC menolak: ${RETURN_CODES[code] ?? `kode ${code}`}`);
  }

  // Send one S7 job (ROSCTR 1) and return the ack_data parameter and data parts.
  private async job(param: number[], data: number[]) {
    if (!this.open && param[0] !== 0xf0) throw new Error('Belum terhubung');
    const ref = this.pduRef;
    this.pduRef = (this.pduRef % 0xffff) + 1;
    const frame = tpkt([
      0x02, 0xf0, 0x80, // COTP data
      0x32, 0x01, 0, 0, ref >> 8, ref & 0xff, param.length >> 8, param.length & 0xff, data.length >> 8, data.length & 0xff,
      ...param,
      ...data,
    ]);
    const r = await this.withTimeout(this.transport.request(frame));
    if (r.length < 19 || r[7] !== 0x32 || r[8] !== 0x03) throw new Error('Jawaban PLC bukan S7 yang valid');
    if (u16(r, 11) !== ref) throw new Error('Jawaban PLC tidak sesuai urutan');
    if (r[17] || r[18]) {
      throw new Error(`PLC menolak: error S7 ${r[17].toString(16)}/${r[18].toString(16)} (cek "Permit PUT/GET")`);
    }
    const pLen = u16(r, 13);
    const dLen = u16(r, 15);
    return { param: r.subarray(19, 19 + pLen), data: r.subarray(19 + pLen, 19 + pLen + dLen) };
  }

  // One request on the wire at a time.
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = () => (this.open ? fn() : Promise.reject(new Error('Belum terhubung')));
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.drop();
        reject(new Error('PLC tidak menjawab (timeout)'));
      }, this.opts.timeoutMs);
      p.then(
        (v) => (clearTimeout(t), resolve(v)),
        (e) => {
          clearTimeout(t);
          this.drop();
          reject(e);
        },
      );
    });
  }

  private drop() {
    const was = this.open;
    this.open = false;
    this.transport.close();
    if (was) this.onClose?.();
  }
}
