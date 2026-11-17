// Fake shuttle PLC for trying the app without hardware. Behaves like the PLC logic
// described in docs/S7_MAP.md (handshake, mode rules, heartbeat watchdog).
import { CMD, HEARTBEAT, isLoad, isPick, isRunMode, JOG, QTY_REQ, READ_COUNT, STATUS_START } from './registers';

const S = (i: number) => STATUS_START + i;
const READY = S(0), RUN = S(1), EMG = S(2), IDLE = S(3), STANDBY = S(4);
const BW_LIMIT = S(7), FW_LIMIT = S(8), BATTERY = S(9), P_UP = S(10), P_DOWN = S(11), BUZZER = S(12);
const COUNTER = S(13), ALARM = S(14), ACTIVE_MODE = S(15), TARGET = S(16), DONE = S(17);
const LANE_CAP = 6; // pallets per lane in the simulation

export class SimulatedShuttle {
  private r = new Array<number>(100).fill(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastBeat = -1;
  private lastBeatAt = 0;
  private pos = 0; // 0 = back end, 100 = front end
  private jobTicks = 0;
  connected = false;
  onClose?: () => void;

  constructor() {
    [40, 80, 30, 20, 50, 30, 1200, 0, 1200, 50].forEach((v, i) => (this.r[i] = v));
    for (const k of [READY, IDLE, CMD.homeBack, BW_LIMIT, BATTERY, P_DOWN]) this.r[k] = 1;
    this.r[COUNTER] = 3;
  }

  async connect() {
    await new Promise((res) => setTimeout(res, 300));
    this.connected = true;
    this.lastBeatAt = Date.now();
    this.timer = setInterval(() => this.tick(), 100);
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.connected = false;
  }

  async readHolding(start: number, count: number) {
    if (!this.connected) throw new Error('Belum terhubung');
    return this.r.slice(start, start + count);
  }

  async writeSingle(addr: number, value: number) {
    if (!this.connected) throw new Error('Belum terhubung');
    if (addr >= READ_COUNT) throw new Error('PLC menolak: alamat di luar ukuran DB');
    this.r[addr] = value & 0xffff;
  }

  private tick() {
    const r = this.r;
    const now = Date.now();
    if (r[HEARTBEAT] !== this.lastBeat) {
      this.lastBeat = r[HEARTBEAT];
      this.lastBeatAt = now;
    }
    const linkOk = now - this.lastBeatAt <= 500;
    const idle = !r[RUN];

    // Watchdog: no heartbeat → every jog off.
    if (!linkOk) for (const a of Object.values(JOG)) r[a] = 0;


    if (r[CMD.stop]) {
      r[RUN] = 0;
      r[CMD.stop] = 0;
    }
    if (r[CMD.start]) {
      const m = r[ACTIVE_MODE];
      if (idle && !r[EMG] && !r[ALARM] && isRunMode(m)) {
        // Lane already full (Load) or empty (Pick) → alarm instead of running.
        if ((isLoad(m) && r[COUNTER] >= LANE_CAP) || (isPick(m) && r[COUNTER] === 0)) r[ALARM] = isLoad(m) ? 1 : 2;
        else {
          r[RUN] = 1;
          r[TARGET] = r[QTY_REQ]; // 0 = until lane full / empty
          r[DONE] = 0;
          this.jobTicks = 0;
        }
      }
      r[CMD.start] = 0;
    }
    if (r[CMD.resetAlarm]) {
      r[ALARM] = 0;
      r[CMD.resetAlarm] = 0;
    }
    if (r[CMD.buzzer]) {
      r[BUZZER] = r[BUZZER] ? 0 : 1;
      r[CMD.buzzer] = 0;
    }
    const manual = idle && r[ACTIVE_MODE] === 4;
    if (r[CMD.backToHome]) {
      if (manual) this.pos = r[CMD.homeFront] ? 100 : 0; // goes to the home chosen by the app
      r[CMD.backToHome] = 0;
    }

    if (r[RUN] && ++this.jobTicks % 15 === 0) {
      const m = r[ACTIVE_MODE];
      r[DONE]++;
      r[COUNTER] = Math.min(LANE_CAP, Math.max(0, r[COUNTER] + (isPick(m) ? -1 : isLoad(m) ? 1 : 0)));
      const laneDone = (isLoad(m) && r[COUNTER] >= LANE_CAP) || (isPick(m) && r[COUNTER] === 0);
      if ((r[TARGET] && r[DONE] >= r[TARGET]) || laneDone || m === 5) r[RUN] = 0;
    }

    if (manual && linkOk) {
      if (r[JOG.forward] && !r[JOG.reverse]) this.pos = Math.min(100, this.pos + 2);
      if (r[JOG.reverse] && !r[JOG.forward]) this.pos = Math.max(0, this.pos - 2);
      if (r[JOG.lifterUp]) [r[P_UP], r[P_DOWN]] = [1, 0];
      if (r[JOG.lifterDown]) [r[P_UP], r[P_DOWN]] = [0, 1];
    } else {
      for (const a of Object.values(JOG)) r[a] = 0; // PLC refuses jog outside manual mode
    }
    r[BW_LIMIT] = this.pos === 0 ? 1 : 0;
    r[FW_LIMIT] = this.pos === 100 ? 1 : 0;
    r[IDLE] = r[RUN] ? 0 : 1;
    r[STANDBY] = r[IDLE] && r[ACTIVE_MODE] !== 0 ? 1 : 0;
  }
}
