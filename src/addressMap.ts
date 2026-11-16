// Editable address map: every signal the app reads or writes, with its default address.
// "value" items (numbers) must be a word; "flag" items (0/1) may be a word or a bit.
// `reg` is the item's default register; the screens keep using it as the item's key.

export type Protocol = 'modbus' | 's7';
export type Kind = 'value' | 'flag';
export type Item = { id: string; group: string; label: string; kind: Kind; reg: number };
export type AddrMap = Record<string, string>; // item id -> address text

const G = { set: 'Setting', cmd: 'Perintah', jog: 'Gerak manual', sys: 'Mode & komunikasi', st: 'Status' };

export const ITEMS: Item[] = [
  { id: 'set.lowAuto', group: G.set, label: 'Low speed auto', kind: 'value', reg: 0 },
  { id: 'set.highAuto', group: G.set, label: 'High speed auto', kind: 'value', reg: 1 },
  { id: 'set.lifterAuto', group: G.set, label: 'Lifter speed auto', kind: 'value', reg: 2 },
  { id: 'set.lowMan', group: G.set, label: 'Low speed manual', kind: 'value', reg: 3 },
  { id: 'set.highMan', group: G.set, label: 'High speed manual', kind: 'value', reg: 4 },
  { id: 'set.lifterMan', group: G.set, label: 'Lifter speed manual', kind: 'value', reg: 5 },
  { id: 'set.pulseFw', group: G.set, label: 'Target pulse forward', kind: 'value', reg: 6 },
  { id: 'set.pulseBw', group: G.set, label: 'Target pulse backward', kind: 'value', reg: 8 },
  { id: 'set.pickRepos', group: G.set, label: 'Pick reposition', kind: 'value', reg: 9 },
  { id: 'cmd.start', group: G.cmd, label: 'Start', kind: 'flag', reg: 20 },
  { id: 'cmd.stop', group: G.cmd, label: 'Stop', kind: 'flag', reg: 21 },
  { id: 'cmd.resetAlarm', group: G.cmd, label: 'Reset alarm', kind: 'flag', reg: 22 },
  { id: 'cmd.buzzer', group: G.cmd, label: 'Buzzer on/off', kind: 'flag', reg: 23 },
  { id: 'cmd.backToHome', group: G.cmd, label: 'Back to Home', kind: 'flag', reg: 24 },
  { id: 'jog.lifterUp', group: G.jog, label: 'Lifter UP', kind: 'flag', reg: 30 },
  { id: 'jog.lifterDown', group: G.jog, label: 'Lifter DOWN', kind: 'flag', reg: 31 },
  { id: 'jog.forward', group: G.jog, label: 'Maju', kind: 'flag', reg: 32 },
  { id: 'jog.reverse', group: G.jog, label: 'Mundur', kind: 'flag', reg: 33 },
  { id: 'sys.modeReq', group: G.sys, label: 'Mode diminta', kind: 'value', reg: 40 },
  { id: 'sys.qtyReq', group: G.sys, label: 'Jumlah palet (N)', kind: 'value', reg: 41 },
  { id: 'sys.heartbeat', group: G.sys, label: 'Heartbeat', kind: 'value', reg: 49 },
  { id: 'st.ready', group: G.st, label: 'Siap / connected', kind: 'flag', reg: 50 },
  { id: 'st.run', group: G.st, label: 'RUN', kind: 'flag', reg: 51 },
  { id: 'st.emergency', group: G.st, label: 'EMERGENCY', kind: 'flag', reg: 52 },
  { id: 'st.idle', group: G.st, label: 'IDLE', kind: 'flag', reg: 53 },
  { id: 'st.standby', group: G.st, label: 'STANDBY', kind: 'flag', reg: 54 },
  { id: 'st.homeBack', group: G.st, label: 'Home Back', kind: 'flag', reg: 55 },
  { id: 'st.homeFront', group: G.st, label: 'Home Front', kind: 'flag', reg: 56 },
  { id: 'st.bwLimit', group: G.st, label: 'BW Limit', kind: 'flag', reg: 57 },
  { id: 'st.fwLimit', group: G.st, label: 'FW Limit', kind: 'flag', reg: 58 },
  { id: 'st.batteryOk', group: G.st, label: 'Baterai OK', kind: 'flag', reg: 59 },
  { id: 'st.lifterUp', group: G.st, label: 'Lifter UP', kind: 'flag', reg: 60 },
  { id: 'st.lifterDown', group: G.st, label: 'Lifter DOWN', kind: 'flag', reg: 61 },
  { id: 'st.buzzerEnabled', group: G.st, label: 'Buzzer enable', kind: 'flag', reg: 62 },
  { id: 'st.palletCounter', group: G.st, label: 'Counter palet', kind: 'value', reg: 63 },
  { id: 'st.alarmCode', group: G.st, label: 'Kode alarm', kind: 'value', reg: 64 },
  { id: 'st.activeMode', group: G.st, label: 'Mode aktif', kind: 'value', reg: 65 },
  { id: 'st.targetQty', group: G.st, label: 'N job berjalan', kind: 'value', reg: 66 },
  { id: 'st.doneQty', group: G.st, label: 'Palet selesai', kind: 'value', reg: 67 },
  { id: 'st.messageCode', group: G.st, label: 'Kode pesan status', kind: 'value', reg: 68 },
];

export const GROUPS = [G.set, G.cmd, G.jog, G.sys, G.st];
export const ITEM_BY_REG = new Map(ITEMS.map((it) => [it.reg, it]));

// Parsed address.
// Modbus: `reg` = holding register offset (0 = HR 40001), `bit` 0-15 (0 = least significant) or null.
// S7: `db`, `byte` offset in the DB, `bit` 0-7 or null (word = DBW at `byte`, big-endian).
export type Addr = { db: number; byte: number; reg: number; bit: number | null };

export function defaultText(p: Protocol, reg: number, db = 1) {
  return p === 'modbus' ? String(reg) : `DB${db}.DBW${reg * 2}`;
}

export function defaultMap(p: Protocol, db = 1): AddrMap {
  return Object.fromEntries(ITEMS.map((it) => [it.id, defaultText(p, it.reg, db)]));
}

export function parse(p: Protocol, text: string): Addr | null {
  const t = text.trim().toUpperCase();
  if (p === 'modbus') {
    const m = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(t);
    if (!m || Number(m[1]) > 65535 || (m[2] !== undefined && Number(m[2]) > 15)) return null;
    return { db: 0, byte: Number(m[1]) * 2, reg: Number(m[1]), bit: m[2] === undefined ? null : Number(m[2]) };
  }
  let m = /^DB(\d{1,5})\.DBW(\d{1,5})$/.exec(t);
  if (m) return { db: Number(m[1]), byte: Number(m[2]), reg: -1, bit: null };
  m = /^DB(\d{1,5})\.DBX(\d{1,5})\.([0-7])$/.exec(t);
  if (m) return { db: Number(m[1]), byte: Number(m[2]), reg: -1, bit: Number(m[3]) };
  return null;
}

// Switch an address between word and bit, keeping the location: 42 <-> 42.0, DB1.DBW40 <-> DB1.DBX40.0
export function withType(p: Protocol, text: string, bit: boolean): string {
  const a = parse(p, text);
  if (!a) return text;
  if (p === 'modbus') return bit ? `${a.reg}.${a.bit ?? 0}` : String(a.reg);
  return bit ? `DB${a.db}.DBX${a.byte}.${a.bit ?? 0}` : `DB${a.db}.DBW${a.byte}`;
}

export const FORMAT_HINT = {
  modbus: '20 (word) atau 20.3 (bit 0-15)',
  s7: 'DB1.DBW40 (word) atau DB1.DBX40.0 (bit 0-7)',
};

// Bits an address occupies, for overlap checks.
function span(p: Protocol, a: Addr): [number, number] {
  if (p === 'modbus') return a.bit === null ? [a.reg * 16, a.reg * 16 + 15] : [a.reg * 16 + a.bit, a.reg * 16 + a.bit];
  return a.bit === null ? [a.byte * 8, a.byte * 8 + 15] : [a.byte * 8 + a.bit, a.byte * 8 + a.bit];
}

// Errors per item id: bad format, bit on a number item, or overlapping another item.
export function validate(p: Protocol, map: AddrMap): Record<string, string> {
  const err: Record<string, string> = {};
  const ok: [Item, Addr][] = [];
  for (const it of ITEMS) {
    const a = parse(p, map[it.id] ?? '');
    if (!a) err[it.id] = `Format salah (${FORMAT_HINT[p]})`;
    else if (it.kind === 'value' && a.bit !== null) err[it.id] = 'Item angka harus WORD, bukan BIT';
    else if (p === 's7' && a.db < 1) err[it.id] = 'Nomor DB minimal 1';
    else ok.push([it, a]);
  }
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const [x, ax] = ok[i];
      const [y, ay] = ok[j];
      if (ax.db !== ay.db) continue;
      const [x0, x1] = span(p, ax);
      const [y0, y1] = span(p, ay);
      if (x0 <= y1 && y0 <= x1) {
        err[x.id] ??= `Bentrok dengan "${y.label}"`;
        err[y.id] ??= `Bentrok dengan "${x.label}"`;
      }
    }
  }
  return err;
}

// Full, valid map for a shuttle: stored edits over the defaults; an invalid stored map falls back to defaults.
export function effectiveMap(p: Protocol, stored: AddrMap | undefined, db = 1): AddrMap {
  const m = { ...defaultMap(p, db), ...stored };
  return Object.keys(validate(p, m)).length ? defaultMap(p, db) : m;
}

// ---- CSV export / import (opens in Excel) ----
const CSV_HEADER = 'id,grup,item,tipe,alamat';

export function toCsv(p: Protocol, map: AddrMap): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = ITEMS.map((it) => {
    const a = parse(p, map[it.id] ?? '');
    return [it.id, it.group, it.label, a?.bit != null ? 'BIT' : 'WORD', (map[it.id] ?? '').toUpperCase()].map(q).join(',');
  });
  return [`# protokol=${p}`, CSV_HEADER, ...rows].join('\r\n') + '\r\n';
}

// Returns the addresses found in the file (by id) or throws a readable error.
export function fromCsv(p: Protocol, text: string): AddrMap {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const proto = lines.find((l) => l.startsWith('# protokol='))?.split('=')[1]?.trim();
  if (proto && proto !== p) throw new Error(`File ini untuk ${proto.toUpperCase()}, bukan ${p.toUpperCase()}`);
  const body = lines.filter((l) => !l.startsWith('#'));
  const sep = body[0]?.includes(';') && !body[0].includes(',') ? ';' : ','; // Excel with Indonesian locale saves ";"
  const cols = (l: string) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (inQ) {
        if (c === '"' && l[i + 1] === '"') (cur += '"'), i++;
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) out.push(cur), (cur = '');
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const head = cols(body[0] ?? '').map((h) => h.toLowerCase());
  const iId = head.indexOf('id');
  const iAddr = head.indexOf('alamat');
  if (iId < 0 || iAddr < 0) throw new Error('Kolom "id" dan "alamat" tidak ditemukan');
  const known = new Set(ITEMS.map((it) => it.id));
  const map: AddrMap = {};
  for (const l of body.slice(1)) {
    const c = cols(l);
    if (known.has(c[iId]) && c[iAddr]) map[c[iId]] = c[iAddr].toUpperCase();
  }
  if (!Object.keys(map).length) throw new Error('Tidak ada alamat yang dikenali di file ini');
  return map;
}
