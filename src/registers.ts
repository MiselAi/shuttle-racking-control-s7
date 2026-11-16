// Register map shared with the PLC program. Must match docs/S7_MAP.md.
// Offsets are 0-based: offset 0 = HR 40001 = MB_HOLD_REG word [0].

export const SETTING_GROUPS = [
  {
    title: 'Speed Auto',
    items: [
      { reg: 0, label: 'Low speed', unit: '%', min: 0, max: 100 },
      { reg: 1, label: 'High speed', unit: '%', min: 0, max: 100 },
      { reg: 2, label: 'Lifter up/down speed', unit: '%', min: 0, max: 100 },
    ],
  },
  {
    title: 'Speed Manual',
    items: [
      { reg: 3, label: 'Low speed', unit: '%', min: 0, max: 100 },
      { reg: 4, label: 'High speed', unit: '%', min: 0, max: 100 },
      { reg: 5, label: 'Lifter up/down speed', unit: '%', min: 0, max: 100 },
    ],
  },
  {
    title: 'Posisi',
    items: [
      { reg: 6, label: 'Target pulse forward middle sensor', unit: 'pulse', min: 0, max: 32767 },
      { reg: 8, label: 'Target pulse backward middle sensor', unit: 'pulse', min: 0, max: 32767 },
      { reg: 9, label: 'Pick reposition', unit: '', min: 0, max: 32767 },
    ],
  },
] as const;
// shortcut: min/max are placeholders until the PLC programmer gives real limits; reg 7 (ex VW2014) skipped on purpose.

export const CMD = {
  start: 20,
  stop: 21,
  resetAlarm: 22,
  buzzer: 23,
  backToHome: 24,
} as const;
export type Cmd = keyof typeof CMD;

export const JOG = { lifterUp: 30, lifterDown: 31, forward: 32, reverse: 33 } as const;
export type Jog = keyof typeof JOG;

// Mode: the app writes the mode code straight into the PLC's active-mode word (Reg 65), and reads it back.
export const MODE = 65;
export const QTY_REQ = 41;
export const HEARTBEAT = 49;

// Mode codes used by the PLC program.
export const MODES = { 0: 'Belum dipilih', 2: 'Load-1', 3: 'Load-N', 4: 'Manual', 5: 'Shuffle', 6: 'Pick-1', 7: 'Pick-N' } as const;
export type Mode = keyof typeof MODES;
export const modeName = (m: number) => (MODES as Record<number, string>)[m] ?? `Kode ${m}`;
export const isLoad = (m: number) => m === 2 || m === 3;
export const isPick = (m: number) => m === 6 || m === 7;
export const isRunMode = (m: number) => isLoad(m) || isPick(m) || m === 5;

export const STATUS_START = 50;
const STATUS_KEYS = [
  'ready', 'run', 'emergency', 'idle', 'standby',
  'homeBack', 'homeFront', 'bwLimit', 'fwLimit', 'batteryOk',
  'lifterUp', 'lifterDown', 'buzzerEnabled',
  'palletCounter', 'alarmCode', 'activeMode', 'targetQty', 'doneQty', 'messageCode',
] as const;
export type Status = Record<(typeof STATUS_KEYS)[number], number>;

// One read covers settings, commands (to see the PLC clear them) and status.
export const READ_COUNT = STATUS_START + STATUS_KEYS.length;

export function decodeStatus(regs: number[]): Status {
  return Object.fromEntries(STATUS_KEYS.map((k, i) => [k, regs[STATUS_START + i] ?? 0])) as Status;
}
