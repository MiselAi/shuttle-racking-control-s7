import { ReactNode, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

export const C = {
  bg: '#EEF1F4',
  card: '#FFFFFF',
  ink: '#16202A',
  muted: '#5F6B78',
  line: '#D5DBE1',
  brand: '#0E5A7A',
  green: '#1E9E4A',
  red: '#D23B2E',
  amber: '#E8A317',
  off: '#B9C1C9',
};

// Size factor: 1 on phones, grows up to 1.6 on tablets so buttons and text fill the screen.
export function useScale() {
  const { width, height } = useWindowDimensions();
  return Math.max(1, Math.min(1.6, Math.min(width / 900, height / 450)));
}

// Scaled text styles for screens: use as [s.note, z.note, ...].
export function useZoom() {
  const k = useScale();
  return {
    k,
    note: { fontSize: 13 * k },
    label: { fontSize: 14 * k },
    input: { fontSize: 16 * k, paddingVertical: 8 * k },
  };
}

export function Lamp({ on, label, color = C.green }: { on: boolean; label: string; color?: string }) {
  const k = useScale();
  const d = 16 * k;
  return (
    <View style={[s.lamp, { paddingVertical: 6 * k }]}>
      <View style={[s.dot, { width: d, height: d, borderRadius: d / 2, backgroundColor: on ? color : C.off }]} />
      <Text style={[s.lampText, { fontSize: 15 * k }, !on && { color: C.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

type BtnProps = {
  label: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  big?: boolean;
  outline?: boolean;
};

export function Btn({ label, onPress, color = C.brand, disabled, big, outline }: BtnProps) {
  const k = useScale();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { paddingVertical: (big ? 18 : 12) * k, minHeight: (big ? 64 : 48) * k, borderRadius: 10 * k },
        outline ? { borderColor: color, borderWidth: 2, backgroundColor: C.card } : { backgroundColor: color },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
      ]}
    >
      <Text style={[s.btnText, { fontSize: (big ? 20 : 16) * k }, outline && { color }]}>{label}</Text>
    </Pressable>
  );
}

// Sends `on` while held and `off` on release; also releases on unmount so a jog never sticks.
export function HoldBtn({ label, onChange, disabled }: { label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  const k = useScale();
  const held = useRef(false);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => () => void (held.current && cb.current(false)), []);
  const set = (on: boolean) => {
    if (held.current === on) return;
    held.current = on;
    onChange(on);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Tahan untuk menggerakkan"
      disabled={disabled}
      onPressIn={() => set(true)}
      onPressOut={() => set(false)}
      style={({ pressed }) => [s.hold, { minHeight: 84 * k, borderRadius: 14 * k }, pressed && { backgroundColor: C.amber }, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.holdText, { fontSize: 18 * k }]}>{label}</Text>
    </Pressable>
  );
}

// Side-by-side columns on wide (landscape) screens, stacked on narrow ones.
export function Cols({ children }: { children: ReactNode[] }) {
  const wide = useWindowDimensions().width >= 700;
  const k = useScale();
  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 * k, alignItems: 'flex-start' }}>
      {children.map((c, i) => (
        <View key={i} style={wide ? { flex: 1, minWidth: 0 } : { alignSelf: 'stretch' }}>
          {c}
        </View>
      ))}
    </View>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  const k = useScale();
  return (
    <View style={[s.card, { padding: 14 * k, marginBottom: 12 * k }]}>
      {title ? <Text style={[s.cardTitle, { fontSize: 13 * k }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export const s = StyleSheet.create({
  lamp: { flexDirection: 'row', alignItems: 'center', width: '50%', paddingVertical: 6 },
  dot: { width: 16, height: 16, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  lampText: { fontSize: 15, color: C.ink, flexShrink: 1 },
  btn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hold: {
    flex: 1,
    minHeight: 84,
    margin: 6,
    borderRadius: 14,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdText: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: {
    minWidth: 0, // let inputs shrink inside rows instead of overflowing the card
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    color: C.ink,
    backgroundColor: '#fff',
  },
  label: { fontSize: 14, color: C.ink, marginBottom: 4 },
  note: { fontSize: 13, color: C.muted },
});
