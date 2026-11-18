import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cmdButtons } from '../src/cmdButtons.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function fakeLink() {
  const log: [number, number, number][] = []; // [ms since start, reg, value]
  const t0 = Date.now();
  const l = { connected: true, words: new Map<number, number>(), fail: false,
    async writeReg(reg: number, v: number) {
      await wait(5);
      if (l.fail) throw new Error('down');
      l.words.set(reg, v); log.push([Date.now() - t0, reg, v]);
    } };
  return { l, log };
}

test('held button stays 1 until released, then 0', async () => {
  const { l } = fakeLink();
  const b = cmdButtons(() => l, 100);
  await b.press(21);
  await wait(300);
  assert.equal(l.words.get(21), 1);
  b.release(21);
  await wait(30);
  assert.equal(l.words.get(21), 0);
});

test('quick tap is held at least the minimum time', async () => {
  const { l, log } = fakeLink();
  const b = cmdButtons(() => l, 150);
  b.press(21);
  b.release(21); // released before the 1 was even sent
  await wait(250);
  assert.deepEqual(log.map(([, r, v]) => [r, v]), [[21, 1], [21, 0]]);
  assert.ok(log[1][0] - log[0][0] >= 130, `0 sent ${log[1][0] - log[0][0]} ms after 1`);
});

test('runs `before` first (Start quantity)', async () => {
  const { l, log } = fakeLink();
  const b = cmdButtons(() => l, 50);
  b.press(20, () => l.writeReg(41, 0));
  b.release(20);
  await wait(120);
  assert.deepEqual(log.map(([, r, v]) => [r, v]), [[41, 0], [20, 1], [20, 0]]);
});

test('pressing again before the delayed 0 keeps it at 1', async () => {
  const { l } = fakeLink();
  const b = cmdButtons(() => l, 100);
  b.press(21); b.release(21);
  await wait(30);
  b.press(21); // second press while the first release is still waiting
  await wait(200);
  assert.equal(l.words.get(21), 1);
  b.release(21);
  await wait(150);
  assert.equal(l.words.get(21), 0);
});

test('a 0 lost while the link is down is sent on reconnect', async () => {
  const { l } = fakeLink();
  const b = cmdButtons(() => l, 20);
  await b.press(21);
  l.fail = true;
  b.release(21);
  await wait(60);
  assert.equal(l.words.get(21), 1);
  l.fail = false;
  await b.flush(l);
  assert.equal(l.words.get(21), 0);
  assert.deepEqual(b.drain(), []);
});

test('drain lists words that may still be 1', async () => {
  const { l } = fakeLink();
  const b = cmdButtons(() => l, 1000);
  await b.press(22);
  assert.deepEqual(b.drain(), [22]);
});
