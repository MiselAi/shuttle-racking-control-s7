// Run: npm test  (needs: pip install python-snap7)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import { S7Client, type FrameTransport } from '../src/s7.ts';

// TPKT-framed transport over node:net, same contract as the phone's native module.
function netTransport(): FrameTransport {
  let s: net.Socket | null = null;
  let buf = Buffer.alloc(0);
  let waiter: { res: (b: Uint8Array) => void; rej: (e: Error) => void } | null = null;
  const pump = () => {
    if (waiter && buf.length >= 4 && buf.length >= buf.readUInt16BE(2)) {
      const n = buf.readUInt16BE(2);
      const out = new Uint8Array(buf.subarray(0, n));
      buf = buf.subarray(n);
      const w = waiter;
      waiter = null;
      w.res(out);
    }
  };
  return {
    open: (host, port) =>
      new Promise((resolve, reject) => {
        s = net.createConnection({ host, port }, () => resolve());
        s.on('data', (d) => ((buf = Buffer.concat([buf, d])), pump()));
        s.on('error', (e) => (waiter ? waiter.rej(e) : reject(e)));
      }),
    request: (frame) =>
      new Promise((res, rej) => {
        if (!s) return rej(new Error('Belum terhubung'));
        waiter = { res, rej };
        s.write(frame);
      }),
    close: () => {
      s?.destroy();
      s = null;
    },
  };
}

const PORT = 11102;
let srv: ChildProcess;
before(async () => {
  srv = spawn('python3', [new URL('./s7_server.py', import.meta.url).pathname, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    srv.stdout!.on('data', (d) => String(d).includes('ready') && resolve());
    srv.on('exit', (c) => reject(new Error(`snap7 server exited ${c}`)));
  });
});
after(() => srv.kill());

test('connect, read words, write and read back against python-snap7', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 100 });
  await c.connect();
  const regs = await c.readHolding(0, 69);
  assert.equal(regs.length, 69);
  assert.deepEqual(regs.slice(0, 4), [0, 10, 20, 30]);
  await c.writeSingle(49, 4321);
  await c.writeSingle(41, 65535);
  assert.deepEqual(await c.readHolding(41, 1), [65535]);
  assert.deepEqual(await c.readHolding(49, 1), [4321]);
  await Promise.all(Array.from({ length: 20 }, (_, i) => c.writeSingle(60 + (i % 5), i)));
  assert.deepEqual(await c.readHolding(60, 5), [15, 16, 17, 18, 19]);
  c.close();
  await assert.rejects(c.readHolding(0, 1), /Belum terhubung/);
});

test('missing DB gives a readable error', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 7 });
  await c.connect();
  await assert.rejects(c.readHolding(0, 2), /PLC menolak/);
  c.close();
});

test('reading past the end of the DB is rejected', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: PORT, db: 100 });
  await c.connect();
  await assert.rejects(c.readHolding(95, 20), /PLC menolak/);
  c.close();
});

test('silent peer times out', async () => {
  const s = net.createServer(() => undefined);
  await new Promise<void>((r) => s.listen(11103, '127.0.0.1', r));
  const c = new S7Client(netTransport(), '127.0.0.1', { port: 11103, db: 100, timeoutMs: 200 });
  await assert.rejects(c.connect(), /timeout/);
  assert.equal(c.connected, false);
  s.close();
});

test('refused connection rejects', async () => {
  const c = new S7Client(netTransport(), '127.0.0.1', { port: 11999, db: 100, timeoutMs: 200 });
  await assert.rejects(c.connect());
});

// Phone path: S7Client → makeNativeTransport → fake native module (mirrors IsoTcpModule.kt).
import { makeNativeTransport, type NativeIsoTcp } from '../src/nativeTransport.ts';

function fakeNative(): NativeIsoTcp {
  const t = new Map<number, FrameTransport>();
  let next = 1;
  return {
    connect: async (host, port, timeoutMs) => {
      const x = netTransport();
      await x.open(host, port, timeoutMs);
      t.set(next, x);
      return next++;
    },
    request: async (id, frame) => {
      const x = t.get(id);
      if (!x) throw new Error('Koneksi sudah ditutup');
      return [...(await x.request(Uint8Array.from(frame)))];
    },
    close: (id) => {
      t.get(id)?.close();
      t.delete(id);
    },
  };
}

test('phone path (native transport) reads and writes against python-snap7', async () => {
  const c = new S7Client(makeNativeTransport(fakeNative()), '127.0.0.1', { port: PORT, db: 100 });
  await c.connect();
  await c.writeSingle(49, 777);
  assert.deepEqual(await c.readHolding(49, 1), [777]);
  assert.equal((await c.readHolding(0, 69)).length, 69);
  c.close();
});
