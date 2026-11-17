// Run: npm test  (needs: pip install python-snap7)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import { S7Client, type FrameTransport } from '../src/s7.ts';

// TPKT-framed transport over node:net, same contract as the phone's native module.
function netTransport(): FrameTransport {
  let s: net.Socket | null = null;
  let buf = Buffer.alloc(0);
  let waiter: { res: (b: Uint8Array) => void; rej: (e: Error) => void } | null = null;
  const pump = () => {
    if (waiter && buf.length >= 4 && buf.length >= buf.readUInt16BE(2)) {
      const n = buf.readUInt16BE(2);
      const out = new Uint8Array(buf.subarray(0, n));
      buf = buf.subarray(n);
      const w = waiter;
      waiter = null;
      w.res(out);
    }
  };
  return {
    open: (host, port) =>
      new Promise((resolve, reject) => {
        s = net.createConnection({ host, port }, () => resolve());
        s.on('data', (d) => ((buf = Buffer.concat([buf, d])), pump()));
        s.on('error', (e) => (waiter ? waiter.rej(e) : reject(e)));
      }),
    request: (frame) =>
      new Promise((res, rej) => {
        if (!s) return rej(new Error('Belum terhubung'));
        waiter = { res, rej };
        s.write(frame);
      }),
    close: () => {
      s?.destroy();
      s = null;
    },
  };
}

const PORT = 11102;
let srv: ChildProcess;
before(async () => {
  srv = spawn('python3', [new URL('./s7_server.py', import.meta.url).pathname, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    srv.stdout!.on('data', (d) => String(d).includes('ready') && resolve());
    srv.on('exit', (c) => reject(new Error(`snap7 server exited ${c}`)));
  });
});
after(() => srv.kill());

test('connect, read words, write and read back against python-snap7', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 1 });
  await c.connect();
  const regs = await c.readHolding(0, 69);
  assert.equal(regs.length, 69);
  assert.deepEqual(regs.slice(0, 4), [0, 10, 20, 30]);
  await c.writeSingle(49, 4321);
  await c.writeSingle(41, 65535);
  assert.deepEqual(await c.readHolding(41, 1), [65535]);
  assert.deepEqual(await c.readHolding(49, 1), [4321]);
  await Promise.all(Array.from({ length: 20 }, (_, i) => c.writeSingle(60 + (i % 5), i)));
  assert.deepEqual(await c.readHolding(60, 5), [15, 16, 17, 18, 19]);
  c.close();
  await assert.rejects(c.readHolding(0, 1), /Belum terhubung/);
});

test('missing DB gives a readable error', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 7 });
  await c.connect();
  await assert.rejects(c.readHolding(0, 2), /PLC menolak/);
  c.close();
});

test('reading past the end of the DB is rejected', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 1 });
  await c.connect();
  await assert.rejects(c.readHolding(95, 20), /PLC menolak/);
  c.close();
});

test('silent peer times out', async () => {
  const s = net.createServer(() => undefined);
  await new Promise<void>((r) => s.listen(11103, '127.0.0.1', r));
  const c = new S7Client(netTransport(), '127.0.0.1', { port: 11103, db: 1, timeoutMs: 200 });
  await assert.rejects(c.connect(), /timeout/);
  assert.equal(c.connected, false);
  s.close();
});

test('refused connection rejects', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: 11999, db: 1, timeoutMs: 200 });
  await assert.rejects(c.connect());
});

// Phone path: S7Client → makeNativeTransport → fake native module (mirrors IsoTcpModule.kt).
import { makeNativeTransport, type NativeIsoTcp } from '../src/nativeTransport.ts';

function fakeNative(): NativeIsoTcp {
  const t = new Map<number, FrameTransport>();
  let next = 1;
  return {
    connect: async (host, port, timeoutMs) => {
      const x = netTransport();
      await x.open(host, port, timeoutMs);
      t.set(next, x);
      return next++;
    },
    request: async (id, frame) => {
      const x = t.get(id);
      if (!x) throw new Error('Koneksi sudah ditutup');
      return [...(await x.request(Uint8Array.from(frame)))];
    },
    close: (id) => {
      t.get(id)?.close();
      t.delete(id);
    },
  };
}

test('phone path (native transport) reads and writes against python-snap7', async () => {
  const c = new S7Client(makeNativeTransport(fakeNative()), '127.0.0.1', { port: PORT, db: 1 });
  await c.connect();
  await c.writeSingle(49, 777);
  assert.deepEqual(await c.readHolding(49, 1), [777]);
  assert.equal((await c.readHolding(0, 69)).length, 69);
  c.close();
});

// Address map end to end: native S7 bit writes, bits and words across two DBs.
import { s7Io } from '../src/io.ts';
import { defaultMap } from '../src/addressMap.ts';

test('S7 writeBit sends a native single-bit write (DBX)', async () => {
  // python-snap7's test server writes a bit as a whole byte, so check the frame itself;
  // a real S7 PLC changes only the addressed bit.
  const sent: Uint8Array[] = [];
  const fake: FrameTransport = {
    async open() {},
    async request(frame) {
      sent.push(frame);
      if (frame[5] === 0xe0) return new Uint8Array([3, 0, 0, 11, 6, 0xd0, 0, 1, 0, 1, 0]);
      const ref = [frame[11], frame[12]];
      if (frame[17] === 0xf0) return new Uint8Array([3, 0, 0, 27, 2, 0xf0, 0x80, 0x32, 3, 0, 0, ...ref, 0, 8, 0, 0, 0, 0, 0xf0, 0, 0, 1, 0, 1, 1, 0xe0]);
      return new Uint8Array([3, 0, 0, 22, 2, 0xf0, 0x80, 0x32, 3, 0, 0, ...ref, 0, 2, 0, 1, 0, 0, 5, 1, 0xff]);
    },
    close() {},
  };
  const c = new S7Client(fake, '127.0.0.1', { db: 1 });
  await c.connect();
  await c.writeBit(7, 181, 3, true);
  const f = sent[sent.length - 1];
  const item = [...f.subarray(19, 31)];
  const addr = 181 * 8 + 3;
  assert.deepEqual(item, [0x12, 0x0a, 0x10, 0x01, 0, 1, 0, 7, 0x84, (addr >> 16) & 0xff, (addr >> 8) & 0xff, addr & 0xff]);
  assert.deepEqual([...f.subarray(31)], [0, 0x03, 0, 1, 1]); // BIT data, length 1, value 1
});

test('S7 bit writes reach the right byte on python-snap7', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 1 });
  await c.connect();
  await c.writeBit(1, 180, 0, true);
  await c.writeBit(1, 181, 7, true);
  assert.deepEqual([...(await c.readBytes(1, 180, 2))].map((b) => b !== 0), [true, true]);
  c.close();
});

test('address map over S7: bit commands, moved words, second DB', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 1 });
  await c.connect();
  // one bit per byte here: the test server overwrites the whole byte on a bit write
  const map = { ...defaultMap('s7'), 'cmd.start': 'DB1.DBX190.0', 'cmd.stop': 'DB1.DBX191.1', 'st.run': 'DB2.DBX10.3', 'sys.heartbeat': 'DB2.DBW20' };
  const io = s7Io(c, map);
  await io.writeReg(20, 1); // Start -> DB1.DBX190.0
  await io.writeReg(21, 1); // Stop -> DB1.DBX191.1
  await io.writeReg(20, 0);
  await io.writeReg(49, 4242); // heartbeat -> DB2.DBW20
  assert.deepEqual([...(await c.readBytes(2, 20, 2))], [4242 >> 8, 4242 & 0xff]);
  await c.writeWord(2, 10, 0b1000 << 8); // DB2.DBX10.3 set by the 'PLC' (byte 10 = high byte)
  await c.writeWord(1, 190, 0b10); // byte 190 = 0 (Start off), byte 191 bit 1 = Stop on
  await c.writeWord(1, 2, 85); // High speed auto default DB1.DBW2
  const { regs: r } = await io.poll();
  assert.equal(r[51], 1); // RUN from DB2.DBX10.3
  assert.equal(r[21], 1); // Stop bit
  assert.equal(r[20], 0); // Start bit cleared
  assert.equal(r[49], 4242);
  assert.equal(r[1], 85);
  c.close();
});

test('S7 alarm bits are read per address; invalid ones read 0', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 1 });
  await c.connect();
  const io = s7Io(c, defaultMap('s7'), ['DB1.DBX150.0', 'DB1.DBX150.5', 'DB2.DBX30.7', 'DB1.DBW40', 'xx']);
  await c.writeWord(1, 150, 0b0010_0000 << 8); // byte 150: bit 5 on, bit 0 off
  await c.writeWord(2, 30, 0x80 << 8); // DB2 byte 30 bit 7 on
  const { alarms } = await io.poll();
  assert.deepEqual(alarms, [0, 1, 1, 0, 0]);
  c.close();
});
