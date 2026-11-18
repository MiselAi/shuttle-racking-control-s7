// HMI-style command buttons: the PLC word is 1 while the button is pressed and 0 after release,
// held at least `minMs` so the PLC always sees the press. A release lost while the link is down
// is sent again on reconnect (`flush`).
type Writer = { readonly connected: boolean; writeReg(reg: number, value: number): Promise<void> };
type Held = { at: number; done: Promise<unknown>; timer?: ReturnType<typeof setTimeout> };

export function cmdButtons(link: () => Writer | null, minMs = 500) {
  const held = new Map<number, Held>();
  const pendingOff = new Set<number>(); // words whose 0 has not reached the PLC yet

  return {
    // `before` runs first (e.g. the quantity for Start).
    press(reg: number, before?: () => Promise<unknown>) {
      clearTimeout(held.get(reg)?.timer);
      pendingOff.add(reg);
      const done = (async () => {
        if (before) await before();
        const l = link();
        if (!l?.connected) throw new Error('Shuttle belum terhubung');
        await l.writeReg(reg, 1);
      })();
      held.set(reg, { at: Date.now(), done });
      return done;
    },
    release(reg: number) {
      const h = held.get(reg);
      if (!h) return;
      const off = () => {
        if (held.get(reg) !== h) return; // pressed again meanwhile
        held.delete(reg);
        link()?.writeReg(reg, 0).then(() => pendingOff.delete(reg), () => undefined);
      };
      h.done
        .catch(() => undefined)
        .then(() => {
          h.timer = setTimeout(off, Math.max(0, h.at + minMs - Date.now()));
        });
    },
    // After (re)connecting: send the 0s that were lost, except for buttons still held.
    async flush(l: Writer) {
      for (const reg of [...pendingOff]) {
        if (held.has(reg)) continue;
        await l.writeReg(reg, 0);
        pendingOff.delete(reg);
      }
    },
    // Link going away: every word that may still be 1.
    drain(): number[] {
      for (const h of held.values()) clearTimeout(h.timer);
      const regs = [...pendingOff];
      held.clear();
      pendingOff.clear();
      return regs;
    },
  };
}
