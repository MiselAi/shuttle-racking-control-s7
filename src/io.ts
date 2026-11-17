// Translates the app's fixed item keys (default register numbers) to the addresses in the
// shuttle's address map, so screens never deal with real PLC addresses.
import { type AddrMap, ITEMS, ITEM_BY_REG, parse } from './addressMap';
import { READ_COUNT } from './registers';

export type Io = {
  connect(): Promise<void>;
  close(): void;
  readonly connected: boolean;
  // regs: values indexed by default register (what the screens expect); alarms: 0/1 per alarm address
  poll(): Promise<{ regs: number[]; alarms: number[] }>;
  writeReg(reg: number, value: number): Promise<void>; // `reg` = item's default register
};

// Contiguous read blocks covering every unit (register or byte), merging small gaps.
export function planReads(units: number[], maxGap = 8, maxLen = 120): [number, number][] {
  const sorted = [...new Set(units)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r - (last[0] + last[1]) <= maxGap && r - last[0] + 1 <= maxLen) last[1] = r - last[0] + 1;
    else out.push([r, 1]);
  }
  return out;
}

export type RegisterLink = {
  connect(): Promise<void>;
  close(): void;
  readonly connected: boolean;
  readHolding(start: number, count: number): Promise<number[]>;
  writeSingle(addr: number, value: number): Promise<void>;
};

// The simulator speaks plain registers and always uses the default addresses.
// Its alarms use register.bit addresses ("64.0").
export function registerIo(link: RegisterLink, alarms: string[] = []): Io {
  const al = alarms.map((t) => parse('modbus', t));
  return {
    connect: () => link.connect(),
    close: () => link.close(),
    get connected() {
      return link.connected;
    },
    async poll() {
      const regs = await link.readHolding(0, READ_COUNT);
      return { regs, alarms: al.map((a) => (a && a.bit !== null ? ((regs[a.reg] ?? 0) >> a.bit) & 1 : 0)) };
    },
    writeReg: (reg, value) => link.writeSingle(reg, value),
  };
}

export type S7Link = {
  connect(): Promise<void>;
  close(): void;
  readonly connected: boolean;
  readBytes(db: number, byte: number, len: number): Promise<Uint8Array>;
  writeWord(db: number, byte: number, value: number): Promise<void>;
  writeBit(db: number, byte: number, bit: number, on: boolean): Promise<void>;
};

type Loc = { db: number; byte: number; bit: number | null };

// `alarms`: one DBX address per alarm; an invalid one always reads 0.
export function s7Io(link: S7Link, map: AddrMap, alarms: string[] = []): Io {
  const loc = new Map<number, Loc>();
  for (const it of ITEMS) {
    const a = parse('s7', map[it.id] ?? '');
    if (!a) throw new Error(`Alamat "${it.label}" tidak valid`);
    loc.set(it.reg, { db: a.db, byte: a.byte, bit: a.bit });
  }
  // Byte blocks per DB (a word needs 2 bytes, a bit 1).
  const byDb = new Map<number, number[]>();
  for (const l of loc.values()) {
    const bytes = byDb.get(l.db) ?? [];
    bytes.push(l.byte);
    if (l.bit === null) bytes.push(l.byte + 1);
    byDb.set(l.db, bytes);
  }
  const alarmLoc = alarms.map((t) => parse('s7', t)).map((a) => (a && a.bit !== null ? a : null));
  for (const a of alarmLoc) if (a) byDb.set(a.db, [...(byDb.get(a.db) ?? []), a.byte]);
  const blocks = [...byDb].flatMap(([db, bytes]) => planReads(bytes, 16, 200).map(([start, len]) => ({ db, start, len })));

  return {
    connect: () => link.connect(),
    close: () => link.close(),
    get connected() {
      return link.connected;
    },
    async poll() {
      const mem = new Map<string, number>();
      for (const b of blocks) {
        const r = await link.readBytes(b.db, b.start, b.len);
        r.forEach((v, i) => mem.set(`${b.db}:${b.start + i}`, v));
      }
      const byte = (db: number, i: number) => mem.get(`${db}:${i}`) ?? 0;
      const regs = new Array<number>(READ_COUNT).fill(0);
      for (const [reg, l] of loc) {
        regs[reg] = l.bit === null ? (byte(l.db, l.byte) << 8) | byte(l.db, l.byte + 1) : (byte(l.db, l.byte) >> l.bit) & 1;
      }
      return { regs, alarms: alarmLoc.map((a) => (a ? (byte(a.db, a.byte) >> (a.bit as number)) & 1 : 0)) };
    },
    writeReg(reg, value) {
      const l = loc.get(reg);
      if (!l || !ITEM_BY_REG.has(reg)) return Promise.reject(new Error(`Item ${reg} tidak dikenal`));
      return l.bit === null ? link.writeWord(l.db, l.byte, value) : link.writeBit(l.db, l.byte, l.bit, !!value);
    },
  };
}
