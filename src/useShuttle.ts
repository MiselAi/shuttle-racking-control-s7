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
const RETRY_MS = 2000;
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
  const buttons = useRef(cmdButtons(() => link.current, MIN_PRESS_MS)).current;

  useEffect(() => {
    let alive = true;
    let active = AppState.currentState === 'active';
    let beat = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
        beat = (beat + 1) % 32768;
        await l.writeReg(HEARTBEAT, beat);
        const { regs: r, alarms: ab } = await l.poll();
        if (!alive) return;
        setRegs(r);
        setAlarmBits(ab);
        setConnected(true);
        schedule(CYCLE_MS);
      } catch (e) {
        if (!alive) return;
        l.close();
        setConnected(false);
        setError((e as Error).message);
        schedule(RETRY_MS);
      }
    }
    // Leaving the app stops the heartbeat on purpose, so the PLC watchdog stops any jog.
    const sub = AppState.addEventListener('change', (s) => {
      active = s === 'active';
      if (active) schedule(0);
      else {
        clearTimeout(timer);
        l.close();
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
    alarms,
    alarmState,
    write,
    press,
    release,
    setJog,
  };
}
