import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { type AddrMap, defaultMap, effectiveMap, FORMAT_HINT, fromCsv, GROUPS, ITEMS, parse, type Protocol, toCsv, validate, withType } from './addressMap';
import type { AppConfig } from './config';
import { Btn, C, Card, s, useZoom } from './ui';

type Props = {
  protocol: Protocol;
  cfg: AppConfig;
  onSave: (c: AppConfig) => Promise<void>;
  current: number; // shuttle shown in the top bar (live values are read from it)
  regs: number[] | null; // live values of the current shuttle, by default register
  run: (label: string, fn: () => Promise<unknown>) => void;
  db?: number; // S7 default DB
};

export function AddressMapScreen(props: Props) {
  // Locked again every time the screen is left (state resets on unmount).
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <MapEditor {...props} /> : <AdminGate pin={props.cfg.pinAdmin} onOk={() => setUnlocked(true)} />;
}

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

  const fileName = `peta-alamat_${protocol.toUpperCase()}_${(cfg.shuttles[target]?.name ?? `Shuttle-${target + 1}`).replace(/\s+/g, '-')}_${new Date().toISOString().slice(0, 10)}.csv`;
  const exportCsv = async () => {
    if (Platform.OS === 'web') throw new Error('Ekspor hanya tersedia di tablet');
    const { File, Paths } = require('expo-file-system');
    const Sharing = require('expo-sharing');
    const f = new File(Paths.cache, fileName);
    if (f.exists) f.delete();
    f.create();
    await f.write('\uFEFF' + toCsv(protocol, draft)); // BOM so Excel reads UTF-8
    await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
  };
  const importCsv = async () => {
    if (Platform.OS === 'web') throw new Error('Impor hanya tersedia di tablet');
    const { File } = require('expo-file-system');
    const res = await File.pickFileAsync({ mimeTypes: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'] });
    if (res.canceled) return;
    const found = fromCsv(protocol, await res.result.text());
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
