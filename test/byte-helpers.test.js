import QUnit from 'qunit';
import {
  bytesToString,
  stringToBytes,
  toUint8,
  concatTypedArrays,
  toHexString,
  toBinaryString,
  bytesToNumber,
  numberToBytes,
  bytesMatch
} from '../src/byte-helpers.js';
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

const rawBytes = [0x47, 0x40, 0x00, 0x10, 0x00, 0x00, 0xb0, 0x0d, 0x00, 0x01];

QUnit.test('should function as expected', function(assert) {
  arrayNames.forEach(function(name) {
    const testObj = name === 'Array' ? testBytes : new window[name](testBytes);

    assert.equal(bytesToString(testObj), testString, `testString work as a string arg with ${name}`);
    assert.equal(bytesToString(new window[name]()), '', `empty ${name} returns empty string`);
  });

  assert.equal(bytesToString(), '', 'undefined returns empty string');
  assert.equal(bytesToString(null), '', 'null returns empty string');
  assert.equal(bytesToString(stringToBytes(testString)), testString, 'stringToBytes -> bytesToString works');
});

QUnit.module('stringToBytes');

QUnit.test('should function as expected', function(assert) {
  assert.deepEqual(stringToBytes(testString), testBytes, 'returns an array of bytes');
  assert.deepEqual(stringToBytes(), [], 'empty array for undefined');
  assert.deepEqual(stringToBytes(null), [], 'empty array for null');
  assert.deepEqual(stringToBytes(''), [], 'empty array for empty string');
  assert.deepEqual(stringToBytes(10), [0x31, 0x30], 'converts numbers to strings');
  assert.deepEqual(stringToBytes(bytesToString(testBytes)), testBytes, 'bytesToString -> stringToBytes works');
  assert.deepEqual(stringToBytes(bytesToString(rawBytes), true), rawBytes, 'equal to original with raw bytes mode');
  assert.notDeepEqual(stringToBytes(bytesToString(rawBytes)), rawBytes, 'without raw byte mode works, not equal');
});

QUnit.module('toUint8');

QUnit.test('should function as expected', function(assert) {
  const tests = {
    undef: {
      data: undefined,
      expected: new Uint8Array()
    },
    null: {
      data: null,
      expected: new Uint8Array()
    },
    string: {
      data: 'foo',
      expected: new Uint8Array()
    },
    NaN: {
      data: NaN,
      expected: new Uint8Array()
    },
    object: {
      data: {},
      expected: new Uint8Array()
    },
    number: {
      data: 0x11,
      expected: new Uint8Array([0x11])
    }
  };

  Object.keys(tests).forEach(function(name) {
    const {data, expected} = tests[name];
    const result = toUint8(data);

    assert.ok(result instanceof Uint8Array, `obj is a Uint8Array for ${name}`);
    assert.deepEqual(result, expected, `data is as expected for ${name}`);
  });

  arrayNames.forEach(function(name) {
    const testObj = name === 'Array' ? testBytes : new window[name](testBytes);
    const uint = toUint8(testObj);

    assert.ok(uint instanceof Uint8Array && uint.length > 0, `converted ${name} to Uint8Array`);
  });

});

QUnit.module('concatTypedArrays');

QUnit.test('should function as expected', function(assert) {
  const tests = {
    undef: {
      data: concatTypedArrays(),
      expected: toUint8([])
    },
    empty: {
      data: concatTypedArrays(toUint8([])),
      expected: toUint8([])
    },
    single: {
      data: concatTypedArrays([0x01]),
      expected: toUint8([0x01])
    },
    array: {
      data: concatTypedArrays([0x01], [0x02]),
      expected: toUint8([0x01, 0x02])
    },
    uint: {
      data: concatTypedArrays(toUint8([0x01]), toUint8([0x02])),
      expected: toUint8([0x01, 0x02])
    },
    buffer: {
      data: concatTypedArrays(toUint8([0x01]).buffer, toUint8([0x02]).buffer),
      expected: toUint8([0x01, 0x02])
    },
    manyarray: {
      data: concatTypedArrays([0x01], [0x02], [0x03], [0x04]),
      expected: toUint8([0x01, 0x02, 0x03, 0x04])
    },
    manyuint: {
      data: concatTypedArrays(toUint8([0x01]), toUint8([0x02]), toUint8([0x03]), toUint8([0x04])),
      expected: toUint8([0x01, 0x02, 0x03, 0x04])
    }
  };

  Object.keys(tests).forEach(function(name) {
    const {data, expected} = tests[name];

    assert.ok(data instanceof Uint8Array, `obj is a Uint8Array for ${name}`);
    assert.deepEqual(data, expected, `data is as expected for ${name}`);
  });
});

QUnit.module('toHexString');
QUnit.test('should function as expected', function(assert) {
  assert.equal(toHexString(0xFF), 'ff', 'works with single value');
  assert.equal(toHexString([0xFF, 0xaa]), 'ffaa', 'works with array');
  assert.equal(toHexString(toUint8([0xFF, 0xaa])), 'ffaa', 'works with uint8');
  assert.equal(toHexString(toUint8([0xFF, 0xaa]).buffer), 'ffaa', 'works with buffer');
  assert.equal(toHexString(toUint8([0xFF, 0xaa, 0xbb]).subarray(1, 3)), 'aabb', 'works with subarray');
  assert.equal(toHexString([0x01, 0x02, 0x03]), '010203', 'works with single digits');
});

QUnit.module('toBinaryString');
QUnit.test('should function as expected', function(assert) {
  const ff = '11111111';
  const aa = '10101010';
  const bb = '10111011';
  const zerof = '00001111';
  const one = '00000001';
  const zero = '00000000';
  const fzero = '11110000';

  assert.equal(toBinaryString(0xFF), ff, 'works with single value');
  assert.equal(toBinaryString([0xFF, 0xaa]), ff + aa, 'works with array');
  assert.equal(toBinaryString(toUint8([0xFF, 0xbb])), ff + bb, 'works with uint8');
  assert.equal(toBinaryString(toUint8([0xFF, 0xaa]).buffer), ff + aa, 'works with buffer');
  assert.equal(toBinaryString(toUint8([0xFF, 0xaa, 0xbb]).subarray(1, 3)), aa + bb, 'works with subarray');
  assert.equal(toBinaryString([0x0F, 0x01, 0xF0, 0x00]), zerof + one + fzero + zero, 'works with varying digits digits');
});

QUnit.module('bytesToNumber');
QUnit.test('should function as expected', function(assert) {
  assert.equal(bytesToNumber(0xFF), 0xFF, 'single value');
  assert.equal(bytesToNumber([0xFF, 0xFF]), 0xFFFF, 'works with array');
  assert.equal(bytesToNumber(toUint8([0xFF, 0xbb])), 0xFFBB, 'works with uint8');
  assert.equal(bytesToNumber(toUint8([0xFF, 0xaa]).buffer), 0xFFAA, 'works with buffer');
  assert.equal(bytesToNumber(toUint8([0xFF, 0xaa, 0xbb]).subarray(1, 3)), 0xAABB, 'works with subarray');
  assert.equal(bytesToNumber([0x0F, 0x01, 0xF0, 0x00]), 0x0F01F000, 'works with varying digits digits');
});

QUnit.module('numberToBytes');
QUnit.test('should function as expected', function(assert) {
  assert.deepEqual(numberToBytes(), [0x00], 'no bytes');
  assert.deepEqual(numberToBytes(0xFFFF), [0xFF, 0xFF], 'two bytes');
  assert.deepEqual(numberToBytes(0xFFFa), [0xFF, 0xFa], 'alternative two bytes');
  assert.deepEqual(numberToBytes(0xFFFabb), [0xFF, 0xFa, 0xbb], 'three bytes');
  assert.deepEqual(numberToBytes(0xFFFabbcc), [0xFF, 0xFa, 0xbb, 0xcc], 'four bytes');
});

QUnit.module('bytesMatch');
QUnit.test('should function as expected', function(assert) {
  assert.equal(bytesMatch(), false, 'no a or b bytes, false');
  assert.equal(bytesMatch(null, []), false, 'no a bytes, false');
  assert.equal(bytesMatch([]), false, 'no b bytes, false');
  assert.equal(bytesMatch([0x00], [0x00, 0x02]), false, 'not enough bytes');
  assert.equal(bytesMatch([0x00], [0x00], {offset: 1}), false, 'not due to offset');
  assert.equal(bytesMatch([0xbb, 0xaa], [0xaa]), false, 'bytes do not match');
  assert.equal(bytesMatch([0xaa], [0xaa], {mask: [0x10]}), false, 'bytes do not match due to mask');
  assert.equal(bytesMatch([0xaa], [0xaa]), true, 'bytes match');
  assert.equal(bytesMatch([0xbb, 0xaa], [0xbb]), true, 'bytes match more a');
  assert.equal(bytesMatch([0xbb, 0xaa], [0xaa], {offset: 1}), true, 'bytes match with offset');
  assert.equal(bytesMatch([0xaa], [0x20], {mask: [0x20]}), true, 'bytes match with mask');
  assert.equal(bytesMatch([0xbb, 0xaa], [0x20], {mask: [0x20], offset: 1}), true, 'bytes match with mask and offset');
  assert.equal(bytesMatch([0xbb, 0xaa, 0xaa], [0x20, 0x20], {mask: [0x20, 0x20], offset: 1}), true, 'bytes match with many masks and offset');
});
