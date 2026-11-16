import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMap, effectiveMap, fromCsv, parse, toCsv, validate, withType } from '../src/addressMap.ts';
import { planReads } from '../src/io.ts';

test('parse word and bit addresses for both protocols', () => {
  assert.deepEqual(parse('modbus', '20'), { db: 0, byte: 40, reg: 20, bit: null });
  assert.deepEqual(parse('modbus', '20.15'), { db: 0, byte: 40, reg: 20, bit: 15 });
  assert.equal(parse('modbus', '20.16'), null);
  assert.deepEqual(parse('s7', 'db1.dbw40'), { db: 1, byte: 40, reg: -1, bit: null });
  assert.deepEqual(parse('s7', 'DB3.DBX41.7'), { db: 3, byte: 41, reg: -1, bit: 7 });
  assert.equal(parse('s7', 'DB1.DBX40.8'), null);
  assert.equal(parse('s7', 'MW10'), null);
});

test('withType converts between word and bit', () => {
  assert.equal(withType('modbus', '42', true), '42.0');
  assert.equal(withType('modbus', '42.5', false), '42');
  assert.equal(withType('s7', 'DB1.DBW42', true), 'DB1.DBX42.0');
  assert.equal(withType('s7', 'DB1.DBX42.3', false), 'DB1.DBW42');
});

test('defaults are valid; overlaps and bits on numbers are rejected', () => {
  for (const p of ['modbus', 's7'] as const) assert.deepEqual(validate(p, defaultMap(p)), {});
  const m = { ...defaultMap('s7'), 'cmd.buzzer': 'DB1.DBW42' }; // same as Stop
  const e = validate('s7', m);
  assert.match(e['cmd.buzzer'], /Bentrok/);
  assert.match(e['cmd.stop'], /Bentrok/);
  // a bit inside a word used by another item
  assert.match(validate('s7', { ...defaultMap('s7'), 'cmd.start': 'DB1.DBX43.2' })['cmd.start'], /Bentrok/);
  // two bits of the same byte are fine
  assert.deepEqual(validate('s7', { ...defaultMap('s7'), 'cmd.start': 'DB1.DBX200.0', 'cmd.stop': 'DB1.DBX200.1' }), {});
  assert.deepEqual(validate('modbus', { ...defaultMap('modbus'), 'cmd.start': '120.0', 'cmd.stop': '120.1' }), {});
  assert.match(validate('modbus', { ...defaultMap('modbus'), 'sys.heartbeat': '49.0' })['sys.heartbeat'], /WORD/);
  // an invalid stored map never reaches the PLC
  assert.deepEqual(effectiveMap('modbus', { 'cmd.buzzer': '21' }), defaultMap('modbus'));
});

test('CSV round trip, Excel semicolons, and protocol check', () => {
  const m = { ...defaultMap('s7'), 'cmd.start': 'DB1.DBX200.0' };
  const csv = toCsv('s7', m);
  assert.deepEqual(fromCsv('s7', '﻿' + csv), m);
  const semi = csv.replace(/,/g, ';');
  assert.equal(fromCsv('s7', semi)['cmd.start'], 'DB1.DBX200.0');
  assert.throws(() => fromCsv('modbus', csv), /untuk S7/);
  assert.throws(() => fromCsv('s7', 'a,b\n1,2'), /Kolom/);
});

test('planReads merges nearby registers into blocks', () => {
  assert.deepEqual(planReads([0, 1, 2, 9, 20, 21, 200]), [[0, 10], [20, 2], [200, 1]]);
  assert.deepEqual(planReads([0, 130], 200, 120), [[0, 1], [130, 1]]);
});

