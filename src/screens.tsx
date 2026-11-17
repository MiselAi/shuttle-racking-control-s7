import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

export const LOGO_FULL = require('../assets/brand/logo-full.png');
export const LOGO_MARK = require('../assets/brand/logo-mark.png');
import type { AlarmDef } from './addressMap';
import { AppConfig, isValidIp } from './config';
import { CMD, isLoad, isPick, isRunMode, MODE, modeName, QTY_REQ, SETTING_GROUPS } from './registers';
import { Btn, C, Card, Cols, Copyright, HoldBtn, Lamp, s, useZoom } from './ui';
import type { useShuttle } from './useShuttle';

type Sh = ReturnType<typeof useShuttle>;
type Run = (label: string, fn: () => Promise<unknown>) => void;

// ---------- Login ----------
export function LoginScreen({ cfg, onLogin }: { cfg: AppConfig; onLogin: (role: 'operator' | 'maintenance') => void }) {
  const z = useZoom();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (pin === cfg.pinMaintenance) onLogin('maintenance');
    else if (pin === cfg.pinOperator) onLogin('operator');
    else setErr('PIN salah');
    setPin('');
  };
  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
        <View style={{ alignItems: 'center' }}>
          <Image source={LOGO_FULL} style={{ width: 230 * z.k, height: 203 * z.k }} resizeMode="contain" accessibilityLabel="MiNDX" />
          <Text style={{ fontSize: 22 * z.k, fontWeight: '800', color: C.ink, marginTop: 8 }}>Shuttle Control · S7</Text>
        </View>
        <View style={{ width: 340 * z.k, maxWidth: '100%' }}>
          <Text style={[s.note, z.note, { textAlign: 'center', marginBottom: 16 }]}>Masukkan PIN Operator atau Maintenance</Text>
          <TextInput
            style={[s.input, z.input, { fontSize: 28 * z.k, textAlign: 'center', letterSpacing: 8 }]}
            value={pin}
            onChangeText={(t) => {
              setPin(t.replace(/\D/g, ''));
              setErr('');
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            placeholder="PIN"
            onSubmitEditing={submit}
            accessibilityLabel="PIN"
          />
          <Text style={{ color: C.red, textAlign: 'center', height: 24, marginTop: 6 }}>{err}</Text>
          <Btn big label="Masuk" onPress={submit} disabled={!pin} />
        </View>
      </View>
    </ScrollView>
    <Copyright />
    </View>
  );
}

// ---------- Status (shared by Operasi and Manual) ----------
export function StatusCard({ sh }: { sh: Sh }) {
  const st = sh.status;
  if (!st) return null;
  return (
    <Card title="Status">
      <View style={s.wrap}>
        <Lamp on={!!st.idle} label="IDLE" color={C.brand} />
        <Lamp on={!!st.standby} label="STANDBY" color={C.brand} />
        <Lamp on={!!st.homeBack} label="Home Back" />
        <Lamp on={!!st.homeFront} label="Home Front" />
        <Lamp on={!!st.bwLimit} label="BW Limit" color={C.amber} />
        <Lamp on={!!st.fwLimit} label="FW Limit" color={C.amber} />
        <Lamp on={!!st.lifterUp} label="Lifter UP" />
        <Lamp on={!!st.lifterDown} label="Lifter DOWN" />
        <Lamp on={!!st.batteryOk} label={st.batteryOk ? 'Baterai OK' : 'Baterai LOW'} />
      </View>
    </Card>
  );
}

// ---------- Operasi ----------
export function OperasiScreen({ sh, run }: { sh: Sh; run: Run }) {
  const z = useZoom();
  const st = sh.status;
  const [menu, setMenu] = useState<'load' | 'pick' | null>(null); // open sub-menu
  const [confirm, setConfirm] = useState(false);
  if (!st) return null;
  const mode = st.activeMode;
  const loadPick = isLoad(mode) || isPick(mode);
  const label = modeName(mode);
  const n = mode === 3 || mode === 7 ? 0 : 1; // 0 = jalan terus sampai lajur penuh (Load) / kosong (Pick)
  const untilText = isLoad(mode) ? 'sampai lajur penuh' : 'sampai lajur kosong';
  const canStart = sh.connected && !!st.idle && !st.emergency && isRunMode(mode);
  const busy = !sh.connected || !!st.run;

  const choose = (code: number) => {
    setMenu(null);
    run(`Pilih ${modeName(code)}`, () => sh.write(MODE, code));
  };
  const start = () => {
    setConfirm(false);
    run('Start', async () => {
      await sh.write(QTY_REQ, loadPick ? n : 0);
      await sh.sendCmd('start');
    });
  };
  const sub = menu === 'load' ? [2, 3] : menu === 'pick' ? [6, 7] : [];
  return (
    <ScrollView contentContainerStyle={{ padding: 12 }}>
      <Cols>
      <View>
      <Card title="Mode kerja">
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Btn label="Load" outline={!isLoad(mode) && menu !== 'load'} onPress={() => setMenu(menu === 'load' ? null : 'load')} disabled={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label="Pick" outline={!isPick(mode) && menu !== 'pick'} onPress={() => setMenu(menu === 'pick' ? null : 'pick')} disabled={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label="Shuffle" outline={mode !== 5} onPress={() => choose(5)} disabled={busy} />
          </View>
        </View>
        {sub.length ? (
          <View style={[s.row, { marginTop: 10, padding: 8, backgroundColor: C.bg, borderRadius: 10 }]}>
            {sub.map((code) => (
              <View key={code} style={{ flex: 1 }}>
                <Btn label={modeName(code)} color={C.brand} outline={mode !== code} onPress={() => choose(code)} disabled={busy} />
              </View>
            ))}
          </View>
        ) : null}
        <Text style={[s.note, z.note, { marginTop: 8 }]}>
          {mode === 4
            ? 'Shuttle sedang di mode Manual. Pilih mode kerja untuk keluar.'
            : !isRunMode(mode)
              ? 'Pilih mode dulu sebelum Start.'
              : `Mode terpilih: ${label}${loadPick ? (n ? ' (1 palet)' : ` (${untilText})`) : ''}`}
        </Text>
        {sh.alarms.length ? (
          <Text style={[s.note, z.note, { marginTop: 4, color: C.red }]}>Ada alarm aktif. Cek menu Alarm.</Text>
        ) : null}
        {st.run ? (
          <Text style={{ marginTop: 10, fontSize: 16 * z.k, fontWeight: '700', color: C.green }}>
            Berjalan: {label}
            {loadPick && !st.targetQty ? ` — ${st.doneQty} palet selesai` : ''}
          </Text>
        ) : null}
      </Card>
      <View style={[s.row, { marginBottom: 12 }]}>
        <View style={{ flex: 1 }}>
          <Btn big label="START" color={C.green} onPress={() => setConfirm(true)} disabled={!canStart} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn big label="STOP" color={C.red} onPress={() => run('Stop', () => sh.sendCmd('stop'))} disabled={!sh.connected} />
        </View>
      </View>
      <View style={[s.row, { marginBottom: 12 }]}>
        <View style={{ flex: 1 }}>
          <Btn label="Reset Alarm" color={C.amber} onPress={() => run('Reset alarm', () => sh.sendCmd('resetAlarm'))} disabled={!sh.connected} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            label={st.buzzerEnabled ? '🔔 Buzzer: ON' : '🔕 Buzzer: OFF'}
            color={st.buzzerEnabled ? C.amber : C.muted}
            outline={!st.buzzerEnabled}
            onPress={() => run(st.buzzerEnabled ? 'Buzzer OFF' : 'Buzzer ON', () => sh.sendCmd('buzzer'))}
            disabled={!sh.connected}
          />
        </View>
      </View>

      </View>
      <StatusCard sh={sh} />
      </Cols>

      <Modal transparent visible={confirm} animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={[s.card, { padding: 20, width: '100%', maxWidth: 520 * z.k, alignSelf: 'center' }]}>
            <Text style={{ fontSize: 20 * z.k, fontWeight: '800', color: C.ink, marginBottom: 8 }}>Mulai shuttle?</Text>
            <Text style={{ fontSize: 16 * z.k, color: C.ink, marginBottom: 16 }}>
              Mode {label}
              {loadPick ? (n ? ', 1 palet' : `, ${untilText}`) : ''}. Pastikan area rak aman.
            </Text>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Btn label="Batal" outline onPress={() => setConfirm(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn label="START" color={C.green} onPress={start} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ---------- Alarm ----------
// Only the messages of active alarms; tapping one opens how to solve it.
export function AlarmScreen({ sh, run }: { sh: Sh; run: Run }) {
  const z = useZoom();
  const [open, setOpen] = useState<AlarmDef | null>(null);
  const st = sh.status;
  if (!st) return null;
  const reset = () => run('Reset alarm', () => sh.sendCmd('resetAlarm'));
  return (
    <ScrollView contentContainerStyle={{ padding: 12 }}>
      <Cols>
      <Card title="Alarm aktif">
        {sh.alarms.length === 0 ? (
          <Text style={[s.label, z.label, { color: C.green, fontWeight: '700' }]}>Tidak ada alarm.</Text>
        ) : (
          sh.alarms.map((a) => (
            <Pressable
              key={a.addr}
              onPress={() => setOpen(a)}
              accessibilityRole="button"
              accessibilityHint="Lihat cara mengatasi"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', backgroundColor: C.red, borderRadius: 8, padding: 12 * z.k, marginBottom: 8, opacity: pressed ? 0.8 : 1 })}
            >
              <Text style={{ color: '#fff', fontWeight: '800', flex: 1, fontSize: 16 * z.k }}>{a.message}</Text>
              <Text style={{ color: '#FFE3DF', fontSize: 13 * z.k }}>Cara mengatasi ›</Text>
            </Pressable>
          ))
        )}
      </Card>
      <View>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Btn label="Reset Alarm" color={C.amber} onPress={reset} disabled={!sh.connected} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            label={st.buzzerEnabled ? '🔔 Buzzer: ON' : '🔕 Buzzer: OFF'}
            color={st.buzzerEnabled ? C.amber : C.muted}
            outline={!st.buzzerEnabled}
            onPress={() => run(st.buzzerEnabled ? 'Buzzer OFF' : 'Buzzer ON', () => sh.sendCmd('buzzer'))}
            disabled={!sh.connected}
          />
        </View>
      </View>
      <Text style={[s.note, z.note, { marginTop: 10 }]}>Ketuk pesan alarm untuk melihat cara mengatasinya.</Text>
      </View>
      </Cols>

      <Modal transparent visible={!!open} animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={[s.card, { padding: 0, width: '100%', maxWidth: 640 * z.k, maxHeight: '90%', alignSelf: 'center', overflow: 'hidden' }]}>
            <View style={{ backgroundColor: C.red, padding: 16 * z.k }}>
              <Text style={{ color: '#FFE3DF', fontSize: 13 * z.k, fontWeight: '700' }}>ALARM</Text>
              <Text style={{ color: '#fff', fontSize: 22 * z.k, fontWeight: '800' }}>{open?.message}</Text>
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 18 * z.k }}>
              <Text style={{ fontSize: 15 * z.k, fontWeight: '800', color: C.navy, marginBottom: 8 }}>Cara mengatasi</Text>
              {(open?.solution ?? '').split('\n').map((x) => x.trim()).filter(Boolean).length === 0 ? (
                <Text style={[s.note, z.note]}>Belum ada cara mengatasi untuk alarm ini. Isi di Peta Alamat → Daftar Alarm.</Text>
              ) : (
                (open?.solution ?? '').split('\n').map((x) => x.trim()).filter(Boolean).map((step, i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                    <View style={{ width: 26 * z.k, height: 26 * z.k, borderRadius: 13 * z.k, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                      <Text style={{ fontWeight: '800', color: C.navy, fontSize: 13 * z.k }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 16 * z.k, color: C.ink, lineHeight: 22 * z.k }}>{step}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={[s.row, { padding: 18 * z.k, paddingTop: 0 }]}>
              <View style={{ flex: 1 }}>
                <Btn label="Tutup" outline onPress={() => setOpen(null)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn label="Reset Alarm" color={C.amber} disabled={!sh.connected} onPress={() => (reset(), setOpen(null))} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ---------- Manual (maintenance) ----------
export function ManualScreen({ sh, run }: { sh: Sh; run: Run }) {
  const z = useZoom();
  const st = sh.status;
  if (!st) return null;
  const inManual = st.activeMode === 4;
  const can = sh.connected && inManual && !st.run && !st.emergency;
  const jog = (j: Parameters<Sh['setJog']>[0]) => (on: boolean) => run(on ? 'Gerak manual' : 'Lepas', () => sh.setJog(j, on));
  return (
    <ScrollView contentContainerStyle={{ padding: 12 }}>
      <Cols>
      <View>
      {!inManual ? (
        <Card>
          <Text style={[s.label, z.label, { marginBottom: 10 }]}>Shuttle belum di mode Manual. Tombol gerak dikunci.</Text>
          <Btn label="Masuk Mode Manual" color={C.amber} onPress={() => run('Mode manual', () => sh.write(MODE, 4))} disabled={!sh.connected || !!st.run} />
        </Card>
      ) : (
        <Text style={[s.note, z.note, { marginBottom: 8 }]}>Tahan tombol untuk bergerak. Lepas = berhenti.</Text>
      )}
      <View style={s.row}>
        <HoldBtn label={'▲\nLifter UP'} onChange={jog('lifterUp')} disabled={!can} />
        <HoldBtn label={'▼\nLifter DOWN'} onChange={jog('lifterDown')} disabled={!can} />
      </View>
      <View style={[s.row, { marginBottom: 12 }]}>
        <HoldBtn label={'◀\nMUNDUR'} onChange={jog('reverse')} disabled={!can} />
        <HoldBtn label={'▶\nMAJU'} onChange={jog('forward')} disabled={!can} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <Btn big label="STOP" color={C.red} onPress={() => run('Stop', () => sh.sendCmd('stop'))} disabled={!sh.connected} />
      </View>
      <Card title="Home">
        <Text style={[s.label, z.label, { marginBottom: 6 }]}>Orientasi Home</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Btn label="◀ HOME BACK" outline={!st.homeBack} color={st.homeBack ? C.green : C.brand} onPress={() => run('Pilih Home Back', async () => { await sh.write(CMD.homeFront, 0); await sh.write(CMD.homeBack, 1); })} disabled={!can} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label="HOME FRONT ▶" outline={!st.homeFront} color={st.homeFront ? C.green : C.brand} onPress={() => run('Pilih Home Front', async () => { await sh.write(CMD.homeBack, 0); await sh.write(CMD.homeFront, 1); })} disabled={!can} />
          </View>
        </View>
        <View style={{ marginTop: 10 }}>
          <Btn label="Back to Home" onPress={() => run('Back to home', () => sh.sendCmd('backToHome'))} disabled={!can} />
        </View>
        <Text style={[s.note, z.note, { marginTop: 6 }]}>Pilih orientasi Home (hijau = terpilih), lalu tekan Back to Home.</Text>
      </Card>
      </View>
      <StatusCard sh={sh} />
      </Cols>
    </ScrollView>
  );
}

// ---------- Setting PLC (maintenance) ----------
export function SettingPlcScreen({ sh, run }: { sh: Sh; run: Run }) {
  const z = useZoom();
  const [edit, setEdit] = useState<Record<number, string>>({});
  if (!sh.regs) return null;
  const regs = sh.regs;
  return (
    <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={[s.note, z.note, { marginBottom: 8 }]}>Isi nilai yang mau diubah, lalu tekan Simpan di grupnya. Kolom kosong tidak diubah.</Text>
      <Cols>
      {SETTING_GROUPS.map((g) => {
        const changed = g.items.filter((it) => (edit[it.reg] ?? '') !== '');
        const bad = changed.filter((it) => {
          const n = Number(edit[it.reg]);
          return !(Number.isInteger(n) && n >= it.min && n <= it.max);
        });
        const save = () =>
          run(`Simpan ${g.title}`, async () => {
            for (const it of changed) await sh.write(it.reg, Number(edit[it.reg]));
            setEdit((e) => {
              const next = { ...e };
              for (const it of changed) delete next[it.reg];
              return next;
            });
          });
        return (
          <Card key={g.title} title={g.title}>
            {g.items.map((it) => {
              const text = edit[it.reg] ?? '';
              const isBad = bad.includes(it);
              return (
                <View key={it.reg} style={{ marginBottom: 10 }}>
                  <View style={[s.row, { alignItems: 'center' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.label, z.label]}>{it.label}</Text>
                      <Text style={[s.note, z.note, isBad && { color: C.red }]}>
                        Sekarang: {regs[it.reg]} {it.unit}
                      </Text>
                    </View>
                    <TextInput
                      style={[s.input, z.input, { width: 96 * z.k }, isBad && { borderColor: C.red }]}
                      keyboardType="number-pad"
                      value={text}
                      placeholder={`${it.min}–${it.max}`}
                      onChangeText={(t) => setEdit((e) => ({ ...e, [it.reg]: t.replace(/\D/g, '') }))}
                      accessibilityLabel={`${g.title} ${it.label}`}
                    />
                  </View>
                </View>
              );
            })}
            <Btn label={`Simpan ${g.title}`} disabled={!sh.connected || changed.length === 0 || bad.length > 0} onPress={save} />
          </Card>
        );
      })}
      </Cols>
    </ScrollView>
  );
}

// ---------- Pengaturan aplikasi (maintenance) ----------
export function PengaturanScreen({ cfg, onSave }: { cfg: AppConfig; onSave: (c: AppConfig) => Promise<void> }) {
  const z = useZoom();
  const [d, setD] = useState(cfg);
  const [msg, setMsg] = useState('');
  useEffect(() => setD(cfg), [cfg]);
  const ipsOk = d.shuttles.every((x) => isValidIp(x.ip) && x.name.trim());
  const pins = [d.pinOperator, d.pinMaintenance, d.pinAdmin];
  const pinsOk = pins.every((p) => /^\d{4,8}$/.test(p)) && new Set(pins).size === 3;
  const portOk = d.port >= 1 && d.port <= 65535 && d.db >= 1 && d.db <= 65535 && d.rack <= 7 && d.slot <= 31;
  const setSh = (i: number, k: 'name' | 'ip', v: string) =>
    setD((x) => ({ ...x, shuttles: x.shuttles.map((y, j) => (j === i ? { ...y, [k]: v } : y)) }));
  return (
    <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
      <Cols>
      <View>
      <Card title="Alamat IP shuttle">
        {d.shuttles.map((x, i) => (
          <View key={i} style={{ marginBottom: 10 }}>
            <View style={s.row}>
              <TextInput style={[s.input, z.input, { flex: 1 }]} value={x.name} onChangeText={(v) => setSh(i, 'name', v)} accessibilityLabel={`Nama shuttle ${i + 1}`} />
              <TextInput
                style={[s.input, z.input, { flex: 1.3 }, !isValidIp(x.ip) && { borderColor: C.red }]}
                value={x.ip}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                onChangeText={(v) => setSh(i, 'ip', v.trim())}
                accessibilityLabel={`IP shuttle ${i + 1}`}
              />
            </View>
          </View>
        ))}
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, z.label]}>Port</Text>
            <TextInput style={[s.input, z.input]} keyboardType="number-pad" value={String(d.port)} onChangeText={(v) => setD({ ...d, port: Number(v.replace(/\D/g, '')) })} accessibilityLabel="Port" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, z.label]}>Nomor DB</Text>
            <TextInput style={[s.input, z.input]} keyboardType="number-pad" value={String(d.db)} onChangeText={(v) => setD({ ...d, db: Number(v.replace(/\D/g, '')) })} accessibilityLabel="Nomor DB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, z.label]}>Rack</Text>
            <TextInput style={[s.input, z.input]} keyboardType="number-pad" value={String(d.rack)} onChangeText={(v) => setD({ ...d, rack: Number(v.replace(/\D/g, '')) })} accessibilityLabel="Rack" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, z.label]}>Slot</Text>
            <TextInput style={[s.input, z.input]} keyboardType="number-pad" value={String(d.slot)} onChangeText={(v) => setD({ ...d, slot: Number(v.replace(/\D/g, '')) })} accessibilityLabel="Slot" />
          </View>
        </View>
        <Text style={[s.note, z.note, { marginTop: 6 }]}>S7-1200: rack 0, slot 1. DB harus non-optimized dan PLC mengizinkan PUT/GET. Nomor DB = DB untuk alamat default (bisa diubah per item di Peta Alamat).</Text>
      </Card>
      </View>
      <View>
      <Card title="PIN">
        <Text style={[s.label, z.label]}>PIN Operator</Text>
        <TextInput style={[s.input, z.input, { marginBottom: 10 }]} keyboardType="number-pad" value={d.pinOperator} onChangeText={(v) => setD({ ...d, pinOperator: v.replace(/\D/g, '') })} maxLength={8} />
        <Text style={[s.label, z.label]}>PIN Maintenance</Text>
        <TextInput style={[s.input, z.input]} keyboardType="number-pad" value={d.pinMaintenance} onChangeText={(v) => setD({ ...d, pinMaintenance: v.replace(/\D/g, '') })} maxLength={8} />
        <Text style={[s.label, z.label, { marginTop: 10 }]}>PIN Admin (Peta Alamat)</Text>
        <TextInput style={[s.input, z.input]} keyboardType="number-pad" value={d.pinAdmin} onChangeText={(v) => setD({ ...d, pinAdmin: v.replace(/\D/g, '') })} maxLength={8} accessibilityLabel="PIN Admin baru" />
        <Text style={[s.note, z.note, { marginTop: 6 }]}>4–8 angka, dan ketiga PIN harus berbeda.</Text>
      </Card>
      <Card title="Mode simulasi">
        <Pressable style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setD({ ...d, simulate: !d.simulate })}>
          <Text style={[s.label, z.label, { flex: 1 }]}>Pakai shuttle simulasi (tanpa PLC)</Text>
          <Switch value={d.simulate} onValueChange={(v) => setD({ ...d, simulate: v })} />
        </Pressable>
        <Text style={[s.note, z.note]}>Matikan untuk tersambung ke PLC sungguhan.</Text>
      </Card>
      <Btn
        big
        label="Simpan"
        disabled={!ipsOk || !pinsOk || !portOk}
        onPress={() => onSave(d).then(() => setMsg('Tersimpan'), (e) => setMsg(`Gagal menyimpan: ${e.message}`))}
      />
      <Text style={[s.note, z.note, { textAlign: 'center', marginTop: 8 }]}>{msg}</Text>
      </View>
      </Cols>
    </ScrollView>
  );
}
