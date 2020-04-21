import QUnit from 'qunit';
import sinon from 'sinon';
import {
  detectContainerForBytes,
  requestAndDetectSegmentContainer
} from '../src/containers.js';
import {stringToBytes} from '../src/byte-helpers.js';
import {default as vjsxhr} from '@videojs/xhr';

const vhsxhr = function(options, cb) {
  const request = vjsxhr(options, function(error, response) {
    cb(error, request);
  });

  return request;
};

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

QUnit.module('requestAndDetectSegmentContainer', function(hooks) {
  hooks.beforeEach(function() {
    this.xhr = sinon.useFakeXMLHttpRequest();
    this.requests = [];
    this.xhr.onCreate = (req) => {
      this.requests.push(req);
    };
    this.oldxmlHttp = vjsxhr.XMLHttpRequest;
    vjsxhr.XMLHttpRequest = this.xhr;
  });
  hooks.afterEach(function() {
    vjsxhr.XMLHttpRequest = this.oldxmlHttp;
    this.xhr.restore();
  });

  ['vjsxhr', 'vhsxhr'].forEach((xhrName) => {
    QUnit.module(xhrName, {beforeEach() {
      this.reqxhr = xhrName === 'vjsxhr' ? vjsxhr : vhsxhr;
    }});

    Object.keys(testData).filter((k) => k !== 'ts').forEach(function(key) {
      QUnit.test(`requests and detects ${key}`, function(assert) {
        const done = assert.async();

        requestAndDetectSegmentContainer(`test.${key}`, this.reqxhr, function(error, request, codec) {
          assert.notOk(error, 'no error');
          assert.equal(codec, key, `${key} codec detected from request`);
          done();
        });

        assert.deepEqual(this.requests[0].headers, {Range: 'bytes=0-9'}, 'Only requested 10 bytes');

        this.requests.shift().respond(200, null, new Uint8Array(testData[key]).buffer);
      });
    });

    QUnit.test('Requests twice for ts', function(assert) {
      const done = assert.async();

      requestAndDetectSegmentContainer('test.ts', this.reqxhr, function(error, request, codec) {
        assert.notOk(error, 'no error');
        assert.equal(codec, 'ts', 'ts codec detected from request');
        done();
      });

      assert.deepEqual(this.requests[0].headers, {Range: 'bytes=0-9'}, 'Only requested 10 bytes');
      this.requests.shift().respond(200, null, new Uint8Array(testData.ts).buffer);

      assert.deepEqual(this.requests[0].headers, {Range: 'bytes=188-188'}, 'Only requested 1 bytes');
      this.requests.shift().respond(200, null, new Uint8Array(testData.ts).buffer);
    });

    ['mp3', 'aac'].forEach(function(key) {
      QUnit.test(`Requests twice for ${key} with id3`, function(assert) {
        const done = assert.async();

        requestAndDetectSegmentContainer(`test.${key}`, this.reqxhr, function(error, request, codec) {
          assert.notOk(error, 'no error');
          assert.equal(codec, key, `${key} codec detected from request`);
          done();
        });

        assert.deepEqual(this.requests[0].headers, {Range: 'bytes=0-9'}, 'Only requested 10 bytes');
        this.requests.shift().respond(200, null, new Uint8Array(id3Data).buffer);

        assert.deepEqual(this.requests[0].headers, {Range: 'bytes=45-46'}, 'Only requested 2 bytes after id3');
        this.requests.shift().respond(200, null, new Uint8Array(testData[key]).buffer);
      });

      QUnit.test(`Requests twice for ${key} with id3 + id3 footer`, function(assert) {
        const done = assert.async();

        requestAndDetectSegmentContainer(`test.${key}`, this.reqxhr, function(error, request, codec) {
          assert.notOk(error, 'no error');
          assert.equal(codec, key, `${key} codec detected from request`);
          done();
        });

        assert.deepEqual(this.requests[0].headers, {Range: 'bytes=0-9'}, 'Only requested 10 bytes');
        this.requests.shift().respond(200, null, new Uint8Array(id3DataWithFooter).buffer);

        assert.deepEqual(this.requests[0].headers, {Range: 'bytes=55-56'}, 'Only requested 2 bytes after id3');
        this.requests.shift().respond(200, null, new Uint8Array(testData[key]).buffer);
      });
    });
  });
});
