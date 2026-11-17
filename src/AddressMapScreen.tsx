import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { type AddrMap, type AlarmDef, defaultMap, effectiveMap, FORMAT_HINT, fromAlarmCsv, fromCsv, GROUPS, ITEMS, parse, type Protocol, toAlarmCsv, toCsv, validate, validateAlarms, withType } from './addressMap';
import type { AppConfig } from './config';
import { Btn, C, Card, s, useZoom } from './ui';

type Props = {
  protocol: Protocol;
  cfg: AppConfig;
  onSave: (c: AppConfig) => Promise<void>;
  current: number; // shuttle shown in the top bar (live values are read from it)
  regs: number[] | null; // live values of the current shuttle, by default register
  alarmState: Record<string, number>; // live alarm bits of the current shuttle, by address
  run: (label: string, fn: () => Promise<unknown>) => void;
  db?: number; // S7 default DB
};

export function AddressMapScreen(props: Props) {
  // Locked again every time the screen is left (state resets on unmount).
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <AdminArea {...props} /> : <AdminGate pin={props.cfg.pinAdmin} onOk={() => setUnlocked(true)} />;
}

function AdminArea(props: Props) {
  const z = useZoom();
  const [view, setView] = useState<'alamat' | 'alarm'>('alamat');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10 * z.k, paddingBottom: 6 * z.k }}>
        {([['alamat', 'Alamat Item'], ['alarm', 'Daftar Alarm']] as const).map(([k, l]) => (
          <View key={k} style={{ width: 180 * z.k }}>
            <Btn label={l} color={C.navy} outline={view !== k} onPress={() => setView(k)} />
          </View>
        ))}
      </View>
      {view === 'alamat' ? <MapEditor {...props} /> : <AlarmEditor {...props} />}
    </View>
  );
}

// Share a text file through Android's share sheet (save to Files/Drive, WhatsApp, email).
async function shareText(fileName: string, content: string) {
  if (Platform.OS === 'web') throw new Error('Ekspor hanya tersedia di tablet');
  const { File, Paths } = require('expo-file-system');
  const Sharing = require('expo-sharing');
  const f = new File(Paths.cache, fileName);
  if (f.exists) f.delete();
  f.create();
  await f.write('\uFEFF' + content); // BOM so Excel reads UTF-8
  await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
}

// Pick a text file; null when cancelled.
async function pickText(): Promise<string | null> {
  if (Platform.OS === 'web') throw new Error('Impor hanya tersedia di tablet');
  const { File } = require('expo-file-system');
  const res = await File.pickFileAsync({ mimeTypes: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'] });
  return res.canceled ? null : await res.result.text();
}

const stamp = (cfg: AppConfig, i: number) => `${(cfg.shuttles[i]?.name ?? `Shuttle-${i + 1}`).replace(/\s+/g, '-')}_${new Date().toISOString().slice(0, 10)}`;

function AdminGate({ pin, onOk }: { pin: string; onOk: () => void }) {
  const z = useZoom();
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (v === pin) return onOk();
    setErr('PIN Admin salah');
    setV('');
  };
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <View style={[s.card, { width: 420 * z.k, maxWidth: '100%', padding: 24 * z.k, borderTopWidth: 4, borderColor: C.yellow }]}>
        <Text style={{ fontSize: 22 * z.k, fontWeight: '800', color: C.navy }}>🔒 Peta Alamat</Text>
        <Text style={[s.note, z.note, { marginTop: 6, marginBottom: 16 }]}>
          Mengubah alamat bisa membuat shuttle menjalankan perintah yang salah. Masukkan PIN Admin untuk melanjutkan.
        </Text>
        <TextInput
          style={[s.input, z.input, { fontSize: 26 * z.k, textAlign: 'center', letterSpacing: 8 }]}
          value={v}
          onChangeText={(t) => {
            setV(t.replace(/\D/g, ''));
            setErr('');
          }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          placeholder="PIN Admin"
          onSubmitEditing={submit}
          accessibilityLabel="PIN Admin"
        />
        <Text style={{ color: C.red, textAlign: 'center', height: 22 * z.k, marginTop: 6, fontSize: 13 * z.k }}>{err}</Text>
        <Btn big label="Buka" color={C.navy} onPress={submit} disabled={!v} />
      </View>
    </View>
  );
}

function MapEditor({ protocol, cfg, onSave, current, regs, run, db = 1 }: Props) {
  const z = useZoom();
  const [target, setTarget] = useState(current);
  const saved = effectiveMap(protocol, cfg.addrMaps[String(target)], db);
  const [draft, setDraft] = useState<AddrMap>(saved);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => setDraft(effectiveMap(protocol, cfg.addrMaps[String(target)], db)), [protocol, cfg, target, db]);

  const errors = validate(protocol, draft);
  const changed = ITEMS.filter((it) => (draft[it.id] ?? '').trim().toUpperCase() !== saved[it.id].toUpperCase());
  const nErr = Object.keys(errors).length;
  const live = (id: string, reg: number) => (!regs || target !== current || changed.some((c) => c.id === id) ? '—' : String(regs[reg] ?? '—'));

  const save = () => {
    setConfirm(false);
    const clean = Object.fromEntries(ITEMS.map((it) => [it.id, draft[it.id].trim().toUpperCase()]));
    run('Simpan peta alamat', () => onSave({ ...cfg, addrMaps: { ...cfg.addrMaps, [String(target)]: clean } }));
  };

  const exportCsv = () => shareText(`peta-alamat_${protocol.toUpperCase()}_${stamp(cfg, target)}.csv`, toCsv(protocol, draft));
  const importCsv = async () => {
    const text = await pickText();
    if (text === null) return;
    const found = fromCsv(protocol, text);
    setDraft((d) => ({ ...d, ...found }));
    setNote(`${Object.keys(found).length} alamat dimuat dari file. Periksa, lalu Tinjau & Simpan.`);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: '#FFF4D1', borderBottomWidth: 1, borderColor: C.yellow, paddingHorizontal: 12, paddingVertical: 8 * z.k }}>
        <Text style={{ fontSize: 14 * z.k, color: C.ink }}>
          ⏸ Perintah ke PLC <Text style={{ fontWeight: '800' }}>dijeda</Text> selama layar ini terbuka. Format: <Text style={{ fontWeight: '800' }}>{FORMAT_HINT[protocol]}</Text>
          {'  ·  Pilih WORD/BIT per item (item angka selalu WORD).'}
          {protocol === 'modbus' ? '  ·  Bit perintah ditulis baca-ubah-tulis: jangan satu register dengan bit yang ditulis PLC.' : ''}
          {cfg.simulate ? '  ·  Mode simulasi memakai alamat default.' : ''}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10 * z.k }}>
        <Text style={[s.label, z.label, { marginBottom: 0 }]}>Berlaku untuk:</Text>
        {cfg.shuttles.map((x, i) => (
          <View key={i} style={{ width: 130 * z.k }}>
            <Btn label={x.name} color={i === target ? C.navy : C.brand} outline={i !== target} onPress={() => setTarget(i)} />
          </View>
        ))}
        <View style={{ flex: 1 }} />
        <View style={{ width: 120 * z.k }}>
          <Btn label="Default" outline color={C.muted} onPress={() => setDraft(defaultMap(protocol, db))} />
        </View>
        <View style={{ width: 110 * z.k }}>
          <Btn label="Ekspor" outline onPress={() => run('Ekspor CSV', exportCsv)} />
        </View>
        <View style={{ width: 110 * z.k }}>
          <Btn label="Impor" outline onPress={() => run('Impor CSV', importCsv)} />
        </View>
      </View>
      {note ? <Text style={[s.note, z.note, { paddingHorizontal: 12, paddingTop: 6, color: C.brand }]}>{note}</Text> : null}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 * z.k }} keyboardShouldPersistTaps="handled">
        {GROUPS.map((g) => (
          <Card key={g} title={g}>
            <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderColor: C.line, marginBottom: 4 }}>
              <Text style={[s.note, z.note, { flex: 1 }]}>Item</Text>
              <Text style={[s.note, z.note, { width: 104 * z.k }]}>Tipe</Text>
              <Text style={[s.note, z.note, { width: 136 * z.k }]}>Alamat</Text>
              <Text style={[s.note, z.note, { width: 60 * z.k, textAlign: 'right' }]}>Nilai</Text>
            </View>
            {ITEMS.filter((it) => it.group === g).map((it) => {
              const err = errors[it.id];
              const isChanged = changed.some((c) => c.id === it.id);
              const type = parse(protocol, draft[it.id] ?? '')?.bit != null ? 'BIT' : 'WORD';
              return (
                <View key={it.id} style={{ paddingVertical: 4 * z.k, backgroundColor: err ? '#FDECEA' : isChanged ? '#FFF7DB' : undefined, borderRadius: 6, paddingHorizontal: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.label, z.label, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>
                      {isChanged && !err ? '● ' : ''}
                      {it.label}
                    </Text>
                    <View style={{ width: 104 * z.k, flexDirection: 'row' }}>
                      {(['WORD', 'BIT'] as const).map((t, i) => {
                        const on = type === t;
                        const can = it.kind === 'flag';
                        return (
                          <Pressable
                            key={t}
                            disabled={!can || on}
                            onPress={() => setDraft((d) => ({ ...d, [it.id]: withType(protocol, d[it.id] ?? '', t === 'BIT') }))}
                            accessibilityRole="button"
                            accessibilityLabel={`${it.label} tipe ${t}`}
                            style={{
                              paddingHorizontal: 7 * z.k,
                              paddingVertical: 4 * z.k,
                              backgroundColor: on ? (t === 'BIT' ? C.yellow : C.navy) : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: on ? (t === 'BIT' ? C.yellow : C.navy) : C.line,
                              borderTopLeftRadius: i === 0 ? 6 : 0,
                              borderBottomLeftRadius: i === 0 ? 6 : 0,
                              borderTopRightRadius: i === 1 ? 6 : 0,
                              borderBottomRightRadius: i === 1 ? 6 : 0,
                              opacity: !can && !on ? 0.35 : 1,
                            }}
                          >
                            <Text style={{ fontSize: 11 * z.k, fontWeight: '800', color: on ? (t === 'BIT' ? C.navy : '#FFFFFF') : C.muted }}>{t}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <TextInput
                      style={[
                        s.input,
                        z.input,
                        { width: 136 * z.k, paddingVertical: 4 * z.k, paddingHorizontal: 6, fontFamily: 'monospace', fontSize: 14 * z.k },
                        err ? { borderColor: C.red } : isChanged ? { borderColor: C.yellow, borderWidth: 2 } : null,
                      ]}
                      value={draft[it.id] ?? ''}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onChangeText={(v) => setDraft((d) => ({ ...d, [it.id]: v }))}
                      accessibilityLabel={`Alamat ${it.label}`}
                    />
                    <Text style={{ width: 60 * z.k, textAlign: 'right', fontSize: 14 * z.k, fontWeight: '700', color: C.ink, fontFamily: 'monospace' }}>{live(it.id, it.reg)}</Text>
                  </View>
                  {err ? <Text style={{ color: C.red, fontSize: 12 * z.k, marginTop: 2 }}>⚠ {err}</Text> : null}
                </View>
              );
            })}
          </Card>
        ))}
      </ScrollView>

      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 10, backgroundColor: C.navy, borderRadius: 12, padding: 10 * z.k, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: '#fff', fontSize: 15 * z.k, flex: 1 }}>
          <Text style={{ fontWeight: '800', color: C.yellow }}>{changed.length} perubahan</Text> belum disimpan
          {nErr ? <Text style={{ color: '#FFB0A6' }}>{`  ·  ${nErr} alamat bermasalah`}</Text> : null}
        </Text>
        <View style={{ width: 140 * z.k }}>
          <Btn label="Batal" color="#2B4A86" onPress={() => (setDraft(saved), setNote(''))} disabled={!changed.length} />
        </View>
        <View style={{ width: 200 * z.k }}>
          <Btn label="Tinjau & Simpan" color={C.yellow} textColor={C.navy} disabled={!changed.length || nErr > 0} onPress={() => setConfirm(true)} />
        </View>
      </View>

      <Modal transparent visible={confirm} animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={[s.card, { padding: 20, width: '100%', maxWidth: 620 * z.k, alignSelf: 'center', maxHeight: '90%' }]}>
            <Text style={{ fontSize: 20 * z.k, fontWeight: '800', color: C.ink, marginBottom: 4 }}>Simpan peta alamat?</Text>
            <Text style={[s.note, z.note, { marginBottom: 12 }]}>
              Berlaku untuk {cfg.shuttles[target]?.name}. Pastikan programmer PLC sudah memindahkan alamat yang sama. Koneksi ke shuttle ini akan tersambung ulang.
            </Text>
            <ScrollView style={{ flexGrow: 0 }}>
              {changed.map((it) => (
                <View key={it.id} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line }}>
                  <Text style={[s.label, z.label, { flex: 1, marginBottom: 0 }]}>{it.label}</Text>
                  <Text style={{ fontFamily: 'monospace', fontSize: 14 * z.k, color: C.muted }}>{saved[it.id]}</Text>
                  <Text style={{ fontSize: 14 * z.k, marginHorizontal: 8 }}>→</Text>
                  <Text style={{ fontFamily: 'monospace', fontSize: 14 * z.k, fontWeight: '800', color: C.brand }}>{(draft[it.id] ?? '').toUpperCase()}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={[s.row, { marginTop: 16 }]}>
              <View style={{ flex: 1 }}>
                <Btn label="Batal" outline onPress={() => setConfirm(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn label="Simpan" color={C.brand} onPress={save} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---- Daftar Alarm: one bit per alarm, message and how to solve it ----
function AlarmEditor({ protocol, cfg, onSave, current, alarmState, run }: Props) {
  const z = useZoom();
  const [target, setTarget] = useState(current);
  const saved: AlarmDef[] = cfg.alarmLists[String(target)] ?? [];
  const [rows, setRows] = useState<AlarmDef[]>(saved);
  const [openSol, setOpenSol] = useState<number | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => setRows(cfg.alarmLists[String(target)] ?? []), [cfg, target]);

  const errors = validateAlarms(protocol, rows);
  const nErr = Object.keys(errors).length;
  const changed = JSON.stringify(rows) !== JSON.stringify(saved);
  const savedAddrs = new Set(saved.map((r) => r.addr.trim().toUpperCase()));
  const live = (addr: string) => {
    const k = addr.trim().toUpperCase();
    return target === current && savedAddrs.has(k) ? alarmState[k] : undefined;
  };
  const set = (i: number, patch: Partial<AlarmDef>) => setRows((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
  const save = () => {
    const clean = rows.map((r) => ({ addr: r.addr.trim().toUpperCase(), message: r.message.trim(), solution: r.solution.trim() }));
    run('Simpan daftar alarm', () => onSave({ ...cfg, alarmLists: { ...cfg.alarmLists, [String(target)]: clean } }));
  };
  const importCsv = async () => {
    const text = await pickText();
    if (text === null) return;
    const list = fromAlarmCsv(protocol, text);
    setRows(list);
    setNote(`${list.length} alarm dimuat dari file. Periksa, lalu Simpan.`);
  };
  const example = protocol === 's7' ? 'DB1.DBX140.0' : '140.0';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: '#FFF4D1', borderBottomWidth: 1, borderTopWidth: 1, borderColor: C.yellow, paddingHorizontal: 12, paddingVertical: 8 * z.k }}>
        <Text style={{ fontSize: 14 * z.k, color: C.ink }}>
          Satu alarm = satu <Text style={{ fontWeight: '800' }}>BIT</Text> ({example}). Bit = 1 → pesan muncul di layar Alarm; ketuk pesan untuk melihat cara mengatasi.
          {cfg.simulate ? '  ·  Mode simulasi memakai 2 alarm contoh; daftar ini dipakai saat tersambung ke PLC.' : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10 * z.k }}>
        <Text style={[s.label, z.label, { marginBottom: 0 }]}>Berlaku untuk:</Text>
        {cfg.shuttles.map((x, i) => (
          <View key={i} style={{ width: 130 * z.k }}>
            <Btn label={x.name} color={i === target ? C.navy : C.brand} outline={i !== target} onPress={() => setTarget(i)} />
          </View>
        ))}
        <View style={{ flex: 1 }} />
        <View style={{ width: 110 * z.k }}>
          <Btn label="Ekspor" outline onPress={() => run('Ekspor CSV', () => shareText(`daftar-alarm_${protocol.toUpperCase()}_${stamp(cfg, target)}.csv`, toAlarmCsv(protocol, rows)))} />
        </View>
        <View style={{ width: 110 * z.k }}>
          <Btn label="Impor" outline onPress={() => run('Impor CSV', importCsv)} />
        </View>
      </View>
      {note ? <Text style={[s.note, z.note, { paddingHorizontal: 12, paddingTop: 6, color: C.brand }]}>{note}</Text> : null}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 * z.k }} keyboardShouldPersistTaps="handled">
        <Card title={`Daftar alarm (${rows.length})`}>
          {rows.length === 0 ? <Text style={[s.note, z.note, { marginBottom: 8 }]}>Belum ada alarm. Tekan "+ Tambah alarm" atau Impor CSV (kolom: alamat, pesan, solusi).</Text> : null}
          {rows.length ? (
            <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderColor: C.line, marginBottom: 4, gap: 8 }}>
              <Text style={[s.note, z.note, { width: 52 * z.k }]}>Aktif</Text>
              <Text style={[s.note, z.note, { width: 150 * z.k }]}>Alamat bit</Text>
              <Text style={[s.note, z.note, { flex: 1 }]}>Pesan</Text>
            </View>
          ) : null}
          {rows.map((r, i) => {
            const st = live(r.addr);
            return (
              <View key={i} style={{ borderBottomWidth: 1, borderColor: C.line, paddingVertical: 6 * z.k, paddingHorizontal: 4, backgroundColor: errors[i] ? '#FDECEA' : openSol === i ? '#FFF7DB' : undefined, borderRadius: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 52 * z.k, alignItems: 'center' }}>
                    <View style={{ width: 16 * z.k, height: 16 * z.k, borderRadius: 8 * z.k, backgroundColor: st === 1 ? C.red : st === 0 ? C.off : 'transparent', borderWidth: st === undefined ? 1 : 0, borderColor: C.line }} />
                  </View>
                  <TextInput
                    style={[s.input, z.input, { width: 150 * z.k, fontFamily: 'monospace', fontSize: 14 * z.k, paddingVertical: 4 * z.k }, errors[i] ? { borderColor: C.red } : null]}
                    value={r.addr}
                    placeholder={example}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    onChangeText={(v) => set(i, { addr: v })}
                    accessibilityLabel={`Alamat alarm ${i + 1}`}
                  />
                  <TextInput
                    style={[s.input, z.input, { flex: 1, paddingVertical: 4 * z.k, fontSize: 15 * z.k }]}
                    value={r.message}
                    placeholder="Pesan alarm"
                    onChangeText={(v) => set(i, { message: v })}
                    accessibilityLabel={`Pesan alarm ${i + 1}`}
                  />
                  <View style={{ width: 96 * z.k }}>
                    <Btn label={openSol === i ? 'Tutup' : 'Solusi'} outline onPress={() => setOpenSol(openSol === i ? null : i)} />
                  </View>
                  <View style={{ width: 60 * z.k }}>
                    <Btn label="✕" color={C.red} outline onPress={() => (setRows((x) => x.filter((_, j) => j !== i)), setOpenSol(null))} />
                  </View>
                </View>
                {errors[i] ? <Text style={{ color: C.red, fontSize: 12 * z.k, marginLeft: 60 * z.k, marginTop: 2 }}>⚠ {errors[i]}</Text> : null}
                {openSol === i ? (
                  <View style={{ marginTop: 8, marginLeft: 60 * z.k }}>
                    <Text style={[s.label, z.label]}>Cara mengatasi (satu langkah per baris)</Text>
                    <TextInput
                      style={[s.input, z.input, { minHeight: 110 * z.k, textAlignVertical: 'top', fontSize: 15 * z.k }]}
                      value={r.solution}
                      multiline
                      onChangeText={(v) => set(i, { solution: v })}
                      accessibilityLabel={`Cara mengatasi alarm ${i + 1}`}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
          <View style={{ marginTop: 10, width: 220 * z.k }}>
            <Btn label="+ Tambah alarm" outline onPress={() => (setRows((x) => [...x, { addr: '', message: '', solution: '' }]), setOpenSol(rows.length))} />
          </View>
        </Card>
      </ScrollView>

      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 10, backgroundColor: C.navy, borderRadius: 12, padding: 10 * z.k, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: '#fff', fontSize: 15 * z.k, flex: 1 }}>
          {changed ? <Text style={{ fontWeight: '800', color: C.yellow }}>Daftar alarm berubah</Text> : 'Tidak ada perubahan'}
          {nErr ? <Text style={{ color: '#FFB0A6' }}>{`  ·  ${nErr} baris bermasalah`}</Text> : null}
        </Text>
        <View style={{ width: 140 * z.k }}>
          <Btn label="Batal" color="#2B4A86" onPress={() => (setRows(saved), setNote(''))} disabled={!changed} />
        </View>
        <View style={{ width: 200 * z.k }}>
          <Btn label="Simpan" color={C.yellow} textColor={C.navy} disabled={!changed || nErr > 0} onPress={save} />
        </View>
      </View>
    </View>
  );
}
