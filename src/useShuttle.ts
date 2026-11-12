import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AppConfig } from './config';
import { S7Client } from './s7';
import { CMD, Cmd, decodeStatus, HEARTBEAT, JOG, Jog, READ_COUNT } from './registers';
import { SimulatedShuttle } from './simulator';

type Link = Pick<S7Client, 'connect' | 'close' | 'readHolding' | 'writeSingle' | 'connected' | 'onClose'>;

const CYCLE_MS = 200; // heartbeat + status read; PLC watchdog trips after 500 ms
const RETRY_MS = 2000;

function makeLink(cfg: AppConfig, ip: string): Link {
  if (cfg.simulate) return new SimulatedShuttle();
  // Loaded only off-simulation: the native module does not exist on web.
  const native = require('../modules/iso-tcp').default;
  const transport = require('./nativeTransport').makeNativeTransport(native);
  return new S7Client(transport, ip, { port: cfg.port, db: cfg.db, rack: cfg.rack, slot: cfg.slot });
}

export function useShuttle(cfg: AppConfig, index: number) {
  const ip = cfg.shuttles[index]?.ip ?? '';
  const [regs, setRegs] = useState<number[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = useRef<Link | null>(null);

  useEffect(() => {
    let alive = true;
    let active = AppState.currentState === 'active';
    let beat = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let l: Link;
    try {
      l = makeLink(cfg, ip);
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
        }
        beat = (beat + 1) % 32768;
        await l.writeSingle(HEARTBEAT, beat);
        const r = await l.readHolding(0, READ_COUNT);
        if (!alive) return;
        setRegs(r);
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
      const off = Object.values(JOG).map((a) => l.writeSingle(a, 0).catch(() => undefined));
      Promise.all(off).finally(() => l.close());
      link.current = null;
    };
  }, [cfg, ip]);

  const write = useCallback(async (reg: number, value: number) => {
    const l = link.current;
    if (!l?.connected) throw new Error('Shuttle belum terhubung');
    await l.writeSingle(reg, value);
  }, []);

  const sendCmd = useCallback((c: Cmd) => write(CMD[c], 1), [write]);
  const setJog = useCallback((j: Jog, on: boolean) => write(JOG[j], on ? 1 : 0), [write]);

  return {
    ip,
    connected,
    error,
    regs,
    status: regs ? decodeStatus(regs) : null,
    write,
    sendCmd,
    setJog,
  };
}
