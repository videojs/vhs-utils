import QUnit from 'qunit';
import {detectContainerForBytes} from '../src/containers.js';
import {stringToBytes} from '../src/byte-helpers.js';

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
  'webm': [0x1A, 0x45, 0xDf, 0xA3],
  'flac': stringToBytes('fLaC'),
  'ogg': stringToBytes('OggS'),
  'aac': [0xFF, 0xF1],
  'mp3': [0xFF, 0xFB],
  '3gp': [0x00, 0x00, 0x00, 0x00].concat(stringToBytes('ftyp3g')),
  'mp4': [0x00, 0x00, 0x00, 0x00].concat(stringToBytes('ftypiso')),
  'ts': [0x47]
};

QUnit.module('detectContainerForBytes');

QUnit.test('should identify known types', function(assert) {
  Object.keys(testData).forEach(function(key) {
    assert.equal(detectContainerForBytes(new Uint8Array(testData[key])), key, `found ${key}`);
  });

  const fmp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00].concat(stringToBytes('styp')));

  assert.equal(detectContainerForBytes(fmp4Bytes), 'mp4', 'fmp4 detected as mp4');

  // mp3 and aac audio can have id3 data before the
  // signature for the file, so we need to handle that.
  ['mp3', 'aac'].forEach(function(type) {
    const dataWithId3 = new Uint8Array([].concat(id3Data).concat(testData[type]));
    const dataWithId3Footer = new Uint8Array([].concat(id3DataWithFooter).concat(testData[type]));

    assert.equal(detectContainerForBytes(dataWithId3), type, `id3 skipped and ${type} detected`);
    assert.equal(detectContainerForBytes(dataWithId3Footer), type, `id3 + footer skipped and ${type} detected`);
  });

  const notTs = [testData.ts].concat(Array.apply(null, Array(188)).map(() => 0x00));
  const longTs = [testData.ts]
    .concat(Array.apply(null, Array(187)).map(() => 0x00))
    .concat(testData.ts);

  assert.equal(detectContainerForBytes(longTs), 'ts', 'long ts data is detected');
  assert.equal(detectContainerForBytes(notTs), '', 'ts missing 0x47 at 188 is not ts at all');
  assert.equal(detectContainerForBytes(new Uint8Array([])), '', 'no type');
});
