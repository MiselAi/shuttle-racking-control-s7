import { ReactNode, useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

export const C = {
  'bg': '#EEF2F8',
  'card': '#FFFFFF',
  'ink': '#0F1E3D',
  'muted': '#5B6B85',
  'line': '#D6DEEA',
  'brand': '#0057B8',
  'green': '#1E9E4A',
  'red': '#D23B2E',
  'amber': '#F07C00',
  'off': '#BCC6D6',
  'navy': '#0B2A63',
  'yellow': '#F5B400',
  'sideBg': '#0B2A63',
  'sideText': '#C9D6EE',
  'sideActiveBg': '#16397F',
  'sideActiveText': '#FFFFFF',
  'sideLogout': '#FFB0A6',
  'topBg': '#0057B8',
  'chipOn': '#F5B400',
  'chipOnText': '#0B2A63',
  'chipOff': '#2F72C9',
  'chipOffText': '#FFFFFF',
  'title': '#0B2A63'
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

const LOGO_MISEL = require('../assets/brand/misel-logo.png');

// Copyright footer: one flat line across the bottom of the screen.
export function Copyright() {
  const k = useScale();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10 * k,
        paddingVertical: 4 * k,
        backgroundColor: C.card,
        borderTopWidth: 3,
        borderColor: C.yellow,
      }}
    >
      <Text style={{ fontSize: 12 * k, color: C.muted }}>Copyright © 2026</Text>
      <Image source={LOGO_MISEL} style={{ width: 66 * k, height: 29 * k }} resizeMode="contain" accessibilityLabel="MISEL" />
      <Text style={{ fontSize: 12 * k, fontWeight: '700', color: C.ink }}>PT. Mitrainti Sejahtera Eletrindo</Text>
    </View>
  );
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
  textColor?: string;
  onHold?: (on: boolean) => void; // HMI-style: true on press, false on release (instead of onPress)
};

export function Btn({ label, onPress, color = C.brand, disabled, big, outline, textColor, onHold }: BtnProps) {
  const k = useScale();
  const held = useRef(false);
  const sawIn = useRef(false); // a very short tap can fire onPress without onPressIn (react-native-web)
  const cb = useRef(onHold);
  cb.current = onHold;
  const set = (on: boolean) => {
    if (held.current === on) return;
    held.current = on;
    cb.current?.(on);
  };
  // Never leave a command at 1: release on unmount or when the button gets disabled while held.
  useEffect(() => () => set(false), []);
  useEffect(() => void (disabled && set(false)), [disabled]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={
        onHold
          ? () => {
              if (!sawIn.current) (set(true), set(false)); // still a full press: 1, then 0 after the minimum time
              sawIn.current = false;
            }
          : onPress
      }
      onPressIn={onHold ? () => ((sawIn.current = true), set(true)) : undefined}
      onPressOut={onHold ? () => set(false) : undefined}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { paddingVertical: (big ? 18 : 12) * k, minHeight: (big ? 64 : 48) * k, borderRadius: 10 * k },
        outline ? { borderColor: color, borderWidth: 2, backgroundColor: C.card } : { backgroundColor: color },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
      ]}
    >
      <Text style={[s.btnText, { fontSize: (big ? 20 : 16) * k }, textColor ? { color: textColor } : null, outline && { color }]}>{label}</Text>
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
      {title ? <Text style={[s.cardTitle, { fontSize: 13 * k, color: C.title }]}>{title}</Text> : null}
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
