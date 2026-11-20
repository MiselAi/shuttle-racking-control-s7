import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppConfig, loadConfig, saveConfig } from './src/config';
import { AlarmScreen, LOGO_MARK, LoginScreen, ManualScreen, OperasiScreen, PengaturanScreen, SettingPlcScreen } from './src/screens';
import { Btn, C, Copyright, s, useScale } from './src/ui';
import { useShuttle } from './src/useShuttle';
import { AddressMapScreen } from './src/AddressMapScreen';

type Role = 'operator' | 'maintenance';
const TABS = [
  { key: 'operasi', label: 'Operasi', maint: false },
  { key: 'alarm', label: 'Alarm', maint: false },
  { key: 'manual', label: 'Manual', maint: true },
  { key: 'plc', label: 'Setting PLC', maint: true },
  { key: 'peta', label: 'Peta Alamat', maint: true },
  { key: 'app', label: 'Pengaturan', maint: true },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => void loadConfig().then(setCfg), []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        {!cfg ? null : !role ? (
          <LoginScreen cfg={cfg} onLogin={setRole} />
        ) : (
          <Main
            cfg={cfg}
            role={role}
            onLogout={() => setRole(null)}
            onSave={async (c) => {
              await saveConfig(c);
              setCfg(c);
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Main({ cfg, role, onLogout, onSave }: { cfg: AppConfig; role: Role; onLogout: () => void; onSave: (c: AppConfig) => Promise<void> }) {
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<Tab>('operasi');
  const [linkInfo, setLinkInfo] = useState(false);
  const [flash, setFlash] = useState<{ text: string; bad: boolean } | null>(null);
  const sh = useShuttle(cfg, idx);
  const alarms = sh.alarms;
  const k = useScale();

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.bad ? 4000 : 1500);
    return () => clearTimeout(t);
  }, [flash]);

  const run = useCallback((label: string, fn: () => Promise<unknown>) => {
    fn().then(
      () => setFlash({ text: `${label}: terkirim`, bad: false }),
      (e: Error) => setFlash({ text: `${label} gagal: ${e.message}`, bad: true }),
    );
  }, []);

  const q =
    sh.quality === 'ok'
      ? { bg: '#DDF3E4', dot: C.green, text: `Terhubung ${sh.ip} · ${sh.stats.rttMs} ms` }
      : sh.quality === 'weak'
        ? { bg: '#FFF1D6', dot: C.amber, text: `Sinyal lemah, menyambung ulang ${sh.ip}…` }
        : { bg: '#FBE3E1', dot: C.red, text: `Terputus ${sh.ip}${sh.error ? ` (${sh.error})` : ''}` };
  const tabs = TABS.filter((t) => role === 'maintenance' || !t.maint);
  return (
    <View style={{ flex: 1 }}>
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Side menu (landscape) */}
      <View style={{ width: 132 * k, backgroundColor: C.sideBg, borderRightWidth: 1, borderColor: C.line }}>
        <View style={{ padding: 10, alignItems: 'center', backgroundColor: C.card, borderBottomWidth: 4, borderColor: C.yellow }}>
          <Image source={LOGO_MARK} style={{ width: 96 * k, height: 68 * k }} resizeMode="contain" accessibilityLabel="MiNDX" />
          <Text style={{ color: C.ink, fontSize: 13 * k, fontWeight: '800', marginTop: 4 }}>Shuttle S7</Text>
          <Text style={{ color: C.muted, fontSize: 12 * k }}>{role === 'maintenance' ? 'Maintenance' : 'Operator'}</Text>
        </View>
        <ScrollView>
          {tabs.map((t) => {
            const on = tab === t.key;
            const alarm = t.key === 'alarm' && alarms.length > 0;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ paddingVertical: 16 * k, paddingHorizontal: 12, borderLeftWidth: 5, borderColor: on ? C.yellow : 'transparent', backgroundColor: on ? C.sideActiveBg : undefined }}
              >
                <Text style={{ fontWeight: on ? '800' : '500', color: alarm ? (on ? C.red : '#FF6B5B') : on ? C.sideActiveText : C.sideText, fontSize: 15 * k }}>
                  {alarm ? `● Alarm (${alarms.length})` : t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable onPress={onLogout} accessibilityRole="button" style={{ padding: 14 * k, borderTopWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.sideLogout, fontWeight: '700', fontSize: 14 * k }}>Keluar</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {/* Top bar: shuttle choice + connection */}
        <View style={{ backgroundColor: C.topBg, borderBottomWidth: 4, borderColor: C.yellow, paddingHorizontal: 12, paddingVertical: 8 * k, minHeight: 64 * k, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {cfg.shuttles.map((x, i) => (
            <View key={i} style={{ width: 150 * k }}>
              <Btn label={i === idx ? `● ${x.name}` : x.name} color={i === idx ? C.chipOn : C.chipOff} textColor={i === idx ? C.chipOnText : C.chipOffText} onPress={() => setIdx(i)} />
            </View>
          ))}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {cfg.simulate ? (
              <View style={{ backgroundColor: C.yellow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontWeight: '800', color: C.ink, fontSize: 12 * k }}>SIMULASI</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Info koneksi"
              onPress={() => setLinkInfo(true)}
              style={{ backgroundColor: q.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: q.dot, marginRight: 6 }} />
              <Text style={{ color: C.ink, fontSize: 13 * k, flexShrink: 1 }} numberOfLines={1}>
                {q.text}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          {tab === 'peta' ? (
            <AddressMapScreen protocol="s7" cfg={cfg} onSave={onSave} current={idx} regs={sh.regs} alarmState={sh.alarmState} run={run} db={cfg.db} />
          ) : tab === 'app' ? (
            <PengaturanScreen cfg={cfg} onSave={onSave} />
          ) : !sh.status ? (
            <Text style={[s.note, { padding: 24, textAlign: 'center' }]}>Menunggu data dari shuttle…</Text>
          ) : tab === 'alarm' ? (
            <AlarmScreen sh={sh} run={run} />
          ) : tab === 'operasi' ? (
            <OperasiScreen key={idx} sh={sh} run={run} />
          ) : tab === 'manual' ? (
            <ManualScreen sh={sh} run={run} />
          ) : (
            <SettingPlcScreen key={idx} sh={sh} run={run} />
          )}
        </View>

        <Modal transparent visible={linkInfo} animationType="fade" onRequestClose={() => setLinkInfo(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
            <View style={[s.card, { padding: 20, width: '100%', maxWidth: 560 * k, maxHeight: '90%', alignSelf: 'center' }]}>
              <Text style={{ fontSize: 20 * k, fontWeight: '800', color: C.ink, marginBottom: 8 }}>Koneksi {cfg.shuttles[idx]?.name} ({sh.ip})</Text>
              <Text style={{ fontSize: 15 * k, color: C.ink }}>Putus sejak dibuka: {sh.stats.drops} kali</Text>
              <Text style={{ fontSize: 15 * k, color: C.ink, marginBottom: 10 }}>
                Waktu respon PLC: {sh.stats.rttMs} ms (terlama {sh.stats.maxRttMs} ms)
              </Text>
              <ScrollView style={{ maxHeight: 300 * k, marginBottom: 12 }}>
                {sh.stats.events.length === 0 ? <Text style={{ color: C.muted, fontSize: 14 * k }}>Belum ada kejadian.</Text> : null}
                {sh.stats.events.map((e, i) => (
                  <Text key={i} style={{ fontSize: 14 * k, color: e.text.startsWith('Putus') ? C.red : C.ink, marginBottom: 4 }}>
                    {new Date(e.at).toLocaleTimeString('id-ID')}  {e.text}
                  </Text>
                ))}
              </ScrollView>
              <Btn label="Tutup" outline onPress={() => setLinkInfo(false)} />
            </View>
          </View>
        </Modal>

        {flash ? (
          <View style={{ position: 'absolute', right: 12, bottom: 12, maxWidth: 420, backgroundColor: flash.bad ? C.red : C.ink, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#fff', fontSize: 14 * k }}>{flash.text}</Text>
          </View>
        ) : null}
      </View>
    </View>
    <Copyright />
    </View>
  );
}
