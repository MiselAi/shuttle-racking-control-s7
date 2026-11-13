import AsyncStorage from '@react-native-async-storage/async-storage';

export type ShuttleCfg = { name: string; ip: string };
export type AppConfig = {
  shuttles: ShuttleCfg[];
  port: number;
  db: number; // non-optimized DB that holds the shared words (DBW0 = "Reg 0")
  rack: number;
  slot: number;
  simulate: boolean;
  pinOperator: string;
  pinMaintenance: string;
};

export const DEFAULT_CONFIG: AppConfig = {
  shuttles: [
    { name: 'Shuttle 1', ip: '192.168.0.11' },
    { name: 'Shuttle 2', ip: '192.168.0.12' },
  ],
  port: 102,
  db: 1,
  rack: 0,
  slot: 1,
  simulate: true,
  pinOperator: '1111',
  pinMaintenance: '9999',
};

const KEY = 'app-config-v1';

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(c: AppConfig) {
  return AsyncStorage.setItem(KEY, JSON.stringify(c));
}

export function isValidIp(ip: string) {
  const p = ip.trim().split('.');
  return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
}
