import QUnit from 'qunit';
import {detectContainerForBytes, isLikelyFmp4MediaSegment} from '../src/containers.js';
import {stringToBytes} from '../src/byte-helpers.js';

const fillerArray = (size) => Array.apply(null, Array(size)).map(() => 0x00);
const otherMp4Data = [0x00, 0x00, 0x00, 0x00].concat(stringToBytes('stypiso'));
const id3Data = []
  // id3 header is 10 bytes without footer
  // 10th byte is length 0x23 or 35 in decimal
  // so a total length of 45
  .concat(stringToBytes('ID3').concat([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23]))
  // add in the id3 content
  .concat(Array.apply(null, Array(35)).map(() => 0x00));

const id3DataWithFooter = []
  // id3 header is 20 bytes with footer
  // "we have a footer" is the sixth byte
  // 10th byte is length of 0x23 or 35 in decimal
  // so a total length of 55
  .concat(stringToBytes('ID3').concat([0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x23]))
  // add in the id3 content
  .concat(Array.apply(null, Array(45)).map(() => 0x00));

const testData = {
  // EBML tag + dataSize
  // followed by DocType + dataSize and then actual data for that tag
  'mkv': [0x1a, 0x45, 0xdf, 0xa3, 0x99, 0x42, 0x82, 0x88].concat(stringToBytes('matroska')),
  'webm': [0x1a, 0x45, 0xdf, 0xa3, 0x99, 0x42, 0x82, 0x88].concat(stringToBytes('webm')),
  'flac': stringToBytes('fLaC'),
  'ogg': stringToBytes('OggS'),
  'aac': [0xFF, 0xF1],
  'ac3': [0x0B, 0x77],
  'mp3': [0xFF, 0xFB],
  '3gp': [0x00, 0x00, 0x00, 0x00].concat(stringToBytes('ftyp3g')),
  'mp4': [0x00, 0x00, 0x00, 0x00].concat(stringToBytes('ftypiso')),
  'mov': [0x00, 0x00, 0x00, 0x00].concat(stringToBytes('ftypqt')),
  'avi': [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49],
  'wav': [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45],
  'ts': [0x47],
  // seq_parameter_set_rbsp
  'h264': [0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0xc0, 0x0d, 0xd9, 0x01, 0xa1, 0xfa, 0x10, 0x00, 0x00, 0x03, 0x20, 0x00, 0x00, 0x95, 0xe0, 0xf1, 0x42, 0xa4, 0x80, 0x00, 0x00, 0x00, 0x01],
  // video_parameter_set_rbsp
  'h265': [0x00, 0x00, 0x00, 0x01, 0x40, 0x01, 0x0c, 0x01, 0xff, 0xff, 0x24, 0x08, 0x00, 0x00, 0x00, 0x9c, 0x08, 0x00, 0x00, 0x00, 0x00, 0x78, 0x95, 0x98, 0x09, 0x00, 0x00, 0x00, 0x01]
};

// seq_parameter_set_rbsp
const h265seq = [
  0x00, 0x00, 0x00, 0x01,
  0x42, 0x01, 0x01, 0x21,
  0x60, 0x00, 0x00, 0x00,
  0x90, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x78, 0xa0,
  0x0d, 0x08, 0x0f, 0x16,
  0x59, 0x59, 0xa4, 0x93,
  0x2b, 0x9a, 0x02, 0x00,
  0x00, 0x00, 0x64, 0x00,
  0x00, 0x09, 0x5e, 0x10,
  0x00, 0x00, 0x00, 0x01
];

const h264shortnal = testData.h264.slice();

// remove 0x00 from the front
h264shortnal.splice(0, 1);
// remove 0x00 from the back
h264shortnal.splice(h264shortnal.length - 2, 1);

const h265shortnal = testData.h265.slice();

// remove 0x00 from the front
h265shortnal.splice(0, 1);
// remove 0x00 from the back
h265shortnal.splice(h265shortnal.length - 2, 1);

QUnit.module('detectContainerForBytes');

QUnit.test('should identify known types', function(assert) {
  Object.keys(testData).forEach(function(key) {
    const data = new Uint8Array(testData[key]);

    assert.equal(detectContainerForBytes(testData[key]), key, `found ${key} with Array`);
    assert.equal(detectContainerForBytes(data.buffer), key, `found ${key} with ArrayBuffer`);
    assert.equal(detectContainerForBytes(data), key, `found ${key} with Uint8Array`);
  });

  const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00].concat(stringToBytes('styp')));

  assert.equal(detectContainerForBytes(mp4Bytes), 'mp4', 'styp mp4 detected as mp4');

  // mp3/aac/flac/ac3 audio can have id3 data before the
  // signature for the file, so we need to handle that.
  ['mp3', 'aac', 'flac', 'ac3'].forEach(function(type) {
    const dataWithId3 = new Uint8Array([].concat(id3Data).concat(testData[type]));
    const dataWithId3Footer = new Uint8Array([].concat(id3DataWithFooter).concat(testData[type]));

    assert.equal(detectContainerForBytes(dataWithId3), type, `id3 skipped and ${type} detected`);
    assert.equal(detectContainerForBytes(dataWithId3Footer), type, `id3 + footer skipped and ${type} detected`);
  });

  const notTs = []
    .concat(testData.ts)
    .concat(fillerArray(188));
  const longTs = []
    .concat(testData.ts)
    .concat(fillerArray(187))
    .concat(testData.ts);

  const unsyncTs = []
    .concat(fillerArray(187))
    .concat(testData.ts)
    .concat(fillerArray(187))
    .concat(testData.ts);

  const badTs = []
    .concat(fillerArray(188))
    .concat(testData.ts)
    .concat(fillerArray(187))
    .concat(testData.ts);

  assert.equal(detectContainerForBytes(longTs), 'ts', 'long ts data is detected');
  assert.equal(detectContainerForBytes(unsyncTs), 'ts', 'unsynced ts is detected');
  assert.equal(detectContainerForBytes(badTs), '', 'ts without a sync byte in 188 bytes is not detected');
  assert.equal(detectContainerForBytes(notTs), '', 'ts missing 0x47 at 188 is not ts at all');
  assert.equal(detectContainerForBytes(otherMp4Data), 'mp4', 'fmp4 detected as mp4');
  assert.equal(detectContainerForBytes(new Uint8Array()), '', 'no type');
  assert.equal(detectContainerForBytes(), '', 'no type');

  assert.equal(detectContainerForBytes(h265seq), 'h265', 'h265 with only seq_parameter_set_rbsp, works');
  assert.equal(detectContainerForBytes(h265shortnal), 'h265', 'h265 with short nals works');
  assert.equal(detectContainerForBytes(h264shortnal), 'h264', 'h265 with short nals works');
});

const createBox = function(type) {
  const size = 0x20;

  // size bytes
  return [0x00, 0x00, 0x00, size]
    // box identfier styp
    .concat(stringToBytes(type))
    // filler data for size minus identfier and size bytes
    .concat(fillerArray(size - 8));
};

QUnit.module('isLikelyFmp4MediaSegment');
QUnit.test('works as expected', function(assert) {
  const fmp4Data = []
    .concat(createBox('styp'))
    .concat(createBox('sidx'))
    .concat(createBox('moof'));

  const mp4Data = []
    .concat(createBox('ftyp'))
    .concat(createBox('sidx'))
    .concat(createBox('moov'));

  const fmp4Fake = []
    .concat(createBox('test'))
    .concat(createBox('moof'))
    .concat(createBox('fooo'))
    .concat(createBox('bar'));

  assert.ok(isLikelyFmp4MediaSegment(fmp4Data), 'fmp4 is recognized as fmp4');
  assert.ok(isLikelyFmp4MediaSegment(fmp4Fake), 'fmp4 with moof and unknown boxes is still fmp4');
  assert.ok(isLikelyFmp4MediaSegment(createBox('moof')), 'moof alone is recognized as fmp4');
  assert.notOk(isLikelyFmp4MediaSegment(mp4Data), 'mp4 is not recognized');
  assert.notOk(isLikelyFmp4MediaSegment([].concat(id3DataWithFooter).concat(testData.mp3)), 'bad data is not recognized');
  assert.notOk(isLikelyFmp4MediaSegment(new Uint8Array()), 'no errors on empty data');
  assert.notOk(isLikelyFmp4MediaSegment(), 'no errors on empty data');
});
