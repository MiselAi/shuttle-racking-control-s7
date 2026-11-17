import type { AlarmDef } from './addressMap';

// Shown whenever the EMERGENCY status item is 1 (it keeps its own address in the address map).
export const EMERGENCY_ALARM: AlarmDef = {
  addr: 'EMERGENCY',
  message: 'EMERGENCY ditekan',
  solution: 'Pastikan area rak dan shuttle aman.\nLepaskan (putar) tombol emergency fisik di shuttle.\nTekan Reset Alarm.',
};

// The simulator raises these on register 64 (bit 0 = lane full, bit 1 = lane empty).
export const SIM_ALARMS: AlarmDef[] = [
  { addr: '64.0', message: 'Lajur penuh, Load tidak bisa dijalankan', solution: 'Kosongkan minimal satu posisi dengan Pick-1.\nTekan Reset Alarm, lalu ulangi Load.' },
  { addr: '64.1', message: 'Lajur kosong, Pick tidak bisa dijalankan', solution: 'Isi lajur dengan Load-1 terlebih dulu.\nTekan Reset Alarm, lalu ulangi Pick.' },
];
