// FrameTransport over the local native module (modules/iso-tcp).
import type { FrameTransport } from './s7';

export type NativeIsoTcp = {
  connect(host: string, port: number, timeoutMs: number): Promise<number>;
  request(id: number, frame: number[]): Promise<number[]>;
  close(id: number): void;
};

export function makeNativeTransport(native: NativeIsoTcp): FrameTransport {
  let id: number | null = null;
  return {
    async open(host, port, timeoutMs) {
      id = await native.connect(host, port, timeoutMs);
    },
    async request(frame) {
      if (id === null) throw new Error('Belum terhubung');
      return Uint8Array.from(await native.request(id, Array.from(frame)));
    },
    close() {
      if (id !== null) native.close(id);
      id = null;
    },
  };
}
