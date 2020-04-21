import QUnit from 'qunit';
import {bytesToString, stringToBytes, toUint8} from '../src/byte-helpers.js';
import window from 'global/window';

const arrayNames = [];

[
  'Array',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array'
].forEach(function(name) {
  if (window[name]) {
    arrayNames.push(name);
  }
});

QUnit.module('bytesToString');

const testString = 'hello竜';
const testBytes = [
  // h
  0x68,
  // e
  0x65,
  // l
  0x6c,
  // l
  0x6c,
  // o
  0x6f,
  // 竜
  0xe7, 0xab, 0x9c
];

QUnit.test('should function as expected', function(assert) {
  arrayNames.forEach(function(name) {
    const testObj = name === 'Array' ? testBytes : new window[name](testBytes);

    assert.equal(bytesToString(testObj), testString, `testString work a string arg with ${name}`);
    assert.equal(bytesToString(new window[name]()), '', `empty ${name} returns empty string`);
  });

  assert.equal(bytesToString(), '', 'undefined returns empty string');
  assert.equal(bytesToString(null), '', 'null returns empty string');
  assert.equal(bytesToString(stringToBytes(testString)), testString, 'string to bytes and bytes to string work');
});

QUnit.module('stringToBytes');

QUnit.test('should function as expected', function(assert) {
  assert.deepEqual(stringToBytes(testString), testBytes, 'returns an array of bytes');
  assert.deepEqual(stringToBytes(), [], 'empty array for undefined');
  assert.deepEqual(stringToBytes(null), [], 'empty array for null');
  assert.deepEqual(stringToBytes(''), [], 'empty array for empty string');
  assert.deepEqual(stringToBytes(10), [0x31, 0x30], 'converts numbers to strings');
});

QUnit.module('toUint8');

QUnit.test('should function as expected', function(assert) {
  const undef = toUint8();

  assert.ok(undef instanceof Uint8Array && undef.length === 0, 'undef is a blank Uint8Array');

  const nul = toUint8(null);

  assert.ok(nul instanceof Uint8Array && nul.length === 0, 'undef is a blank Uint8Array');
});
