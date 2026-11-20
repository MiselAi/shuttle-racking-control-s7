import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AppConfig } from './config';
import { type AlarmDef, effectiveMap } from './addressMap';
import { EMERGENCY_ALARM, SIM_ALARMS } from './alarms';
import { Io, registerIo, s7Io } from './io';
import { S7Client } from './s7';
import { CMD, Cmd, decodeStatus, HEARTBEAT, JOG, Jog } from './registers';
import { SimulatedShuttle } from './simulator';
import { cmdButtons } from './cmdButtons';

const CYCLE_MS = 200; // heartbeat + status read; PLC watchdog trips after 500 ms
const RETRY_FAST_MS = 300; // first reconnect attempts: WiFi gaps are usually short
const RETRY_MS = 2000;
const FAST_RETRIES = 10;
const WEAK_MS = 5000; // a gap shorter than this shows as "sinyal lemah", not "terputus"

export type LinkEvent = { at: number; text: string };
type Stats = { drops: number; rttMs: number; maxRttMs: number; lastOkAt: number; events: LinkEvent[] };
const MIN_PRESS_MS = 500; // command buttons stay 1 at least this long, so the PLC always sees the press

// Alarm list in effect for a shuttle (the simulator has its own two).
export function alarmDefs(cfg: AppConfig, index: number): AlarmDef[] {
  return cfg.simulate ? SIM_ALARMS : cfg.alarmLists[String(index)] ?? [];
}

function makeLink(cfg: AppConfig, ip: string, index: number): Io {
  const alarms = alarmDefs(cfg, index).map((a) => a.addr);
  // The simulator always uses the default addresses.
  if (cfg.simulate) return registerIo(new SimulatedShuttle(), alarms);
  // Loaded only off-simulation: the native module does not exist on web.
  const native = require('../modules/iso-tcp').default;
  const transport = require('./nativeTransport').makeNativeTransport(native);
  const client = new S7Client(transport, ip, { port: cfg.port, db: cfg.db, rack: cfg.rack, slot: cfg.slot });
  return s7Io(client, effectiveMap('s7', cfg.addrMaps[String(index)], cfg.db), alarms);
}

export function useShuttle(cfg: AppConfig, index: number) {
  const ip = cfg.shuttles[index]?.ip ?? '';
  const [regs, setRegs] = useState<number[] | null>(null);
  const [alarmBits, setAlarmBits] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = useRef<Io | null>(null);
  const stats = useRef<Stats>({ drops: 0, rttMs: 0, maxRttMs: 0, lastOkAt: 0, events: [] });
  const [, bump] = useState(0); // re-render on every failed attempt, so "lemah" turns into "terputus"
  const buttons = useRef(cmdButtons(() => link.current, MIN_PRESS_MS)).current;

  useEffect(() => {
    let alive = true;
    let active = AppState.currentState === 'active';
    let beat = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = 0;
    let up = false;
    const st: Stats = (stats.current = { drops: 0, rttMs: 0, maxRttMs: 0, lastOkAt: 0, events: [] });
    const note = (text: string) => {
      st.events.unshift({ at: Date.now(), text });
      st.events.length = Math.min(st.events.length, 30);
    };
    let l: Io;
    try {
      l = makeLink(cfg, ip, index);
    } catch (e) {
      // Never crash the app on a missing/broken native module: show it and stay usable.
      setConnected(false);
      setError(`Modul koneksi gagal dimuat: ${(e as Error).message}`);
      return;
    }
    link.current = l;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (alive && active) timer = setTimeout(cycle, ms);
    };
    async function cycle() {
      try {
        if (!l.connected) {
          await l.connect();
          setError(null);
          await buttons.flush(l); // a release lost while WiFi was down
        }
        const t0 = Date.now();
        beat = (beat + 1) % 32768;
        await l.writeReg(HEARTBEAT, beat);
        const { regs: r, alarms: ab } = await l.poll();
        if (!alive) return;
        const now = Date.now();
        st.rttMs = now - t0;
        st.maxRttMs = Math.max(st.maxRttMs, st.rttMs);
        if (!up) note(st.lastOkAt ? `Tersambung lagi setelah ${((now - st.lastOkAt) / 1000).toFixed(1)} detik` : 'Tersambung');
        st.lastOkAt = now;
        up = true;
        fails = 0;
        setRegs(r);
        setAlarmBits(ab);
        setConnected(true);
        schedule(CYCLE_MS);
      } catch (e) {
        if (!alive) return;
        l.close();
        const msg = (e as Error).message;
        if (up) {
          st.drops++;
          note(`Putus: ${msg}`);
        }
        up = false;
        fails++;
        setConnected(false);
        setError(msg);
        bump((n) => n + 1);
        schedule(fails <= FAST_RETRIES ? RETRY_FAST_MS : RETRY_MS);
      }
    }
    // Leaving the app stops the heartbeat on purpose, so the PLC watchdog stops any jog.
    const sub = AppState.addEventListener('change', (s) => {
      active = s === 'active';
      if (active) schedule(0);
      else {
        clearTimeout(timer);
        l.close();
        up = false;
        setConnected(false);
      }
    });
    schedule(0);
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.remove();
      const regs = [...Object.values(JOG), ...buttons.drain()];
      const off = regs.map((a) => l.writeReg(a, 0).catch(() => undefined));
      Promise.all(off).finally(() => l.close());
      link.current = null;
    };
  }, [cfg, ip, index]);

  const write = useCallback(async (reg: number, value: number) => {
    const l = link.current;
    if (!l?.connected) throw new Error('Shuttle belum terhubung');
    await l.writeReg(reg, value);
  }, []);

  // HMI-style command buttons (Start, Stop, Reset alarm, Buzzer, Back to Home).
  const press = useCallback((c: Cmd, before?: () => Promise<unknown>) => buttons.press(CMD[c], before), [buttons]);
  const release = useCallback((c: Cmd) => buttons.release(CMD[c]), [buttons]);
  const setJog = useCallback((j: Jog, on: boolean) => write(JOG[j], on ? 1 : 0), [write]);

  const status = regs ? decodeStatus(regs) : null;
  const defs = alarmDefs(cfg, index);
  // Active alarms: EMERGENCY first, then the list entries whose bit is 1.
  const alarms: AlarmDef[] = [...(status?.emergency ? [EMERGENCY_ALARM] : []), ...defs.filter((_, i) => alarmBits[i] === 1)];
  // Bit state by address, for the alarm list editor.
  const alarmState: Record<string, number> = Object.fromEntries(defs.map((d, i) => [d.addr.trim().toUpperCase(), alarmBits[i] ?? 0]));

  return {
    ip,
    connected,
    error,
    regs,
    status,
    // ok / weak (short gap, reconnecting) / down
    quality: connected ? 'ok' : stats.current.lastOkAt && Date.now() - stats.current.lastOkAt < WEAK_MS ? 'weak' : 'down',
    stats: stats.current,
    alarms,
    alarmState,
    write,
    press,
    release,
    setJog,
  };
}
