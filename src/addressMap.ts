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
  { id: 'cmd.homeBack', group: G.cmd, label: 'Home Back (pilihan + status)', kind: 'flag', reg: 25 },
  { id: 'cmd.homeFront', group: G.cmd, label: 'Home Front (pilihan + status)', kind: 'flag', reg: 26 },
  { id: 'jog.lifterUp', group: G.jog, label: 'Lifter UP', kind: 'flag', reg: 30 },
  { id: 'jog.lifterDown', group: G.jog, label: 'Lifter DOWN', kind: 'flag', reg: 31 },
  { id: 'jog.forward', group: G.jog, label: 'Maju', kind: 'flag', reg: 32 },
  { id: 'jog.reverse', group: G.jog, label: 'Mundur', kind: 'flag', reg: 33 },
  { id: 'st.activeMode', group: G.sys, label: 'Mode (ditulis APK)', kind: 'value', reg: 65 },
  { id: 'sys.qtyReq', group: G.sys, label: 'Jumlah palet (N)', kind: 'value', reg: 41 },
  { id: 'sys.heartbeat', group: G.sys, label: 'Heartbeat', kind: 'value', reg: 49 },
  { id: 'st.ready', group: G.st, label: 'Siap / connected', kind: 'flag', reg: 50 },
  { id: 'st.run', group: G.st, label: 'RUN', kind: 'flag', reg: 51 },
  { id: 'st.emergency', group: G.st, label: 'EMERGENCY', kind: 'flag', reg: 52 },
  { id: 'st.idle', group: G.st, label: 'IDLE', kind: 'flag', reg: 53 },
  { id: 'st.standby', group: G.st, label: 'STANDBY', kind: 'flag', reg: 54 },
  { id: 'st.bwLimit', group: G.st, label: 'BW Limit', kind: 'flag', reg: 57 },
  { id: 'st.fwLimit', group: G.st, label: 'FW Limit', kind: 'flag', reg: 58 },
  { id: 'st.batteryOk', group: G.st, label: 'Baterai OK', kind: 'flag', reg: 59 },
  { id: 'st.lifterUp', group: G.st, label: 'Lifter UP', kind: 'flag', reg: 60 },
  { id: 'st.lifterDown', group: G.st, label: 'Lifter DOWN', kind: 'flag', reg: 61 },
  { id: 'st.buzzerEnabled', group: G.st, label: 'Buzzer enable', kind: 'flag', reg: 62 },
  { id: 'st.palletCounter', group: G.st, label: 'Counter palet', kind: 'value', reg: 63 },
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
const q = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// RFC 4180-ish: quoted cells may contain separators, quotes ("") and line breaks.
// Separator auto-detected from the first data line (Excel with Indonesian locale saves ";").
export function parseCsv(text: string): { protocol: string | null; rows: string[][] } {
  const t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  const proto = lines.find((l) => l.startsWith('# protokol='))?.split('=')[1]?.trim() ?? null;
  const body = lines.filter((l) => !l.startsWith('#')).join('\n');
  const first = body.split('\n').find((l) => l.trim()) ?? '';
  const sep = first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQ) {
      if (c === '"' && body[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  row.push(cur);
  rows.push(row);
  return { protocol: proto, rows: rows.filter((r) => r.some((c) => c.trim())).map((r) => r.map((c) => c.trim())) };
}

function checkProtocol(p: Protocol, proto: string | null) {
  if (proto && proto !== p) throw new Error(`File ini untuk ${proto.toUpperCase()}, bukan ${p.toUpperCase()}`);
}

export function toCsv(p: Protocol, map: AddrMap): string {
  const rows = ITEMS.map((it) => {
    const a = parse(p, map[it.id] ?? '');
    return [it.id, it.group, it.label, a?.bit != null ? 'BIT' : 'WORD', (map[it.id] ?? '').toUpperCase()].map(q).join(',');
  });
  return [`# protokol=${p}`, CSV_HEADER, ...rows].join('\r\n') + '\r\n';
}

// Returns the addresses found in the file (by id) or throws a readable error.
export function fromCsv(p: Protocol, text: string): AddrMap {
  const { protocol, rows } = parseCsv(text);
  checkProtocol(p, protocol);
  const head = (rows[0] ?? []).map((h) => h.toLowerCase());
  const iId = head.indexOf('id');
  const iAddr = head.indexOf('alamat');
  if (iId < 0 || iAddr < 0) throw new Error('Kolom "id" dan "alamat" tidak ditemukan');
  const known = new Set(ITEMS.map((it) => it.id));
  const map: AddrMap = {};
  for (const c of rows.slice(1)) if (known.has(c[iId]) && c[iAddr]) map[c[iId]] = c[iAddr].toUpperCase();
  if (!Object.keys(map).length) throw new Error('Tidak ada alamat yang dikenali di file ini');
  return map;
}

// ---- Alarm list: one bit per alarm, message + how to solve it ----
export type AlarmDef = { addr: string; message: string; solution: string };

// Errors per row index: not a bit address, duplicate address, or empty message.
export function validateAlarms(p: Protocol, list: AlarmDef[]): Record<number, string> {
  const err: Record<number, string> = {};
  const seen = new Map<string, number>();
  list.forEach((r, i) => {
    const a = parse(p, r.addr);
    if (!a || a.bit === null) err[i] = `Alamat harus BIT (${p === 's7' ? 'DB1.DBX140.0' : '140.0'})`;
    else if (!r.message.trim()) err[i] = 'Pesan alarm kosong';
    const key = r.addr.trim().toUpperCase();
    if (seen.has(key) && !err[i]) {
      err[i] = 'Alamat dipakai alarm lain';
      err[seen.get(key)!] ??= 'Alamat dipakai alarm lain';
    } else seen.set(key, i);
  });
  return err;
}

export function toAlarmCsv(p: Protocol, list: AlarmDef[]): string {
  const rows = list.map((r) => [r.addr.toUpperCase(), r.message, r.solution].map(q).join(','));
  return [`# protokol=${p}`, 'alamat,pesan,solusi', ...rows].join('\r\n') + '\r\n';
}

export function fromAlarmCsv(p: Protocol, text: string): AlarmDef[] {
  const { protocol, rows } = parseCsv(text);
  checkProtocol(p, protocol);
  const head = (rows[0] ?? []).map((h) => h.toLowerCase());
  const iA = head.indexOf('alamat');
  const iM = head.indexOf('pesan');
  const iS = head.indexOf('solusi');
  if (iA < 0 || iM < 0) throw new Error('Kolom "alamat" dan "pesan" tidak ditemukan');
  const list = rows
    .slice(1)
    .map((c) => ({ addr: (c[iA] ?? '').toUpperCase(), message: c[iM] ?? '', solution: iS >= 0 ? c[iS] ?? '' : '' }))
    .filter((r) => r.addr || r.message);
  if (!list.length) throw new Error('Tidak ada alarm di file ini');
  return list;
}
