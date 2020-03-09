import window from 'global/window';
import QUnit from 'qunit';
import {
  mapLegacyAvcCodecs,
  translateLegacyCodecs,
  parseCodecs,
  codecsFromDefault,
  isVideoCodec,
  isAudioCodec,
  muxerSupportsCodec,
  browserSupportsCodec,
  isCodecSupported
} from '../src/codecs';

const supportedMuxerCodecs = [
  'mp4a',
  'avc1'
];

const unsupportedMuxerCodecs = [
  'hvc1',
  'ac-3',
  'ec-3',
  'mp3'
];

QUnit.module('Legacy Codecs');

QUnit.test('maps legacy AVC codecs', function(assert) {
  assert.equal(
    mapLegacyAvcCodecs('avc1.deadbeef'),
    'avc1.deadbeef',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('avc1.dead.beef, mp4a.something'),
    'avc1.dead.beef, mp4a.something',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('avc1.dead.beef,mp4a.something'),
    'avc1.dead.beef,mp4a.something',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('mp4a.something,avc1.dead.beef'),
    'mp4a.something,avc1.dead.beef',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('mp4a.something, avc1.dead.beef'),
    'mp4a.something, avc1.dead.beef',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('avc1.42001e'),
    'avc1.42001e',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('avc1.4d0020,mp4a.40.2'),
    'avc1.4d0020,mp4a.40.2',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('mp4a.40.2,avc1.4d0020'),
    'mp4a.40.2,avc1.4d0020',
    'does nothing for non legacy pattern'
  );
  assert.equal(
    mapLegacyAvcCodecs('mp4a.40.40'),
    'mp4a.40.40',
    'does nothing for non video codecs'
  );

  assert.equal(
    mapLegacyAvcCodecs('avc1.66.30'),
    'avc1.42001e',
    'translates legacy video codec alone'
  );
  assert.equal(
    mapLegacyAvcCodecs('avc1.66.30, mp4a.40.2'),
    'avc1.42001e, mp4a.40.2',
    'translates legacy video codec when paired with audio'
  );
  assert.equal(
    mapLegacyAvcCodecs('mp4a.40.2, avc1.66.30'),
    'mp4a.40.2, avc1.42001e',
    'translates video codec when specified second'
  );
});

QUnit.test('translates legacy codecs', function(assert) {
  assert.deepEqual(
    translateLegacyCodecs(['avc1.66.30', 'avc1.66.30']),
    ['avc1.42001e', 'avc1.42001e'],
    'translates legacy avc1.66.30 codec'
  );

  assert.deepEqual(
    translateLegacyCodecs(['avc1.42C01E', 'avc1.42C01E']),
    ['avc1.42C01E', 'avc1.42C01E'],
    'does not translate modern codecs'
  );

  assert.deepEqual(
    translateLegacyCodecs(['avc1.42C01E', 'avc1.66.30']),
    ['avc1.42C01E', 'avc1.42001e'],
    'only translates legacy codecs when mixed'
  );

  assert.deepEqual(
    translateLegacyCodecs(['avc1.4d0020', 'avc1.100.41', 'avc1.77.41',
      'avc1.77.32', 'avc1.77.31', 'avc1.77.30',
      'avc1.66.30', 'avc1.66.21', 'avc1.42C01e']),
    ['avc1.4d0020', 'avc1.640029', 'avc1.4d0029',
      'avc1.4d0020', 'avc1.4d001f', 'avc1.4d001e',
      'avc1.42001e', 'avc1.420015', 'avc1.42C01e'],
    'translates a whole bunch'
  );
});

QUnit.module('parseCodecs');

QUnit.test('parses video only codec string', function(assert) {
  assert.deepEqual(
    parseCodecs('avc1.42001e'),
    {
      codecCount: 1,
      videoCodec: 'avc1',
      videoObjectTypeIndicator: '.42001e'
    },
    'parsed video only codec string'
  );
});

QUnit.test('parses audio only codec string', function(assert) {
  assert.deepEqual(
    parseCodecs('mp4a.40.2'),
    {
      codecCount: 1,
      audioCodec: 'mp4a',
      audioProfile: '.40.2'
    },
    'parsed audio only codec string'
  );
});

QUnit.test('parses video and audio codec string', function(assert) {
  assert.deepEqual(
    parseCodecs('avc1.42001e, mp4a.40.2'),
    {
      codecCount: 2,
      videoCodec: 'avc1',
      audioCodec: 'mp4a',
      videoObjectTypeIndicator: '.42001e',
      audioProfile: '.40.2'
    },
    'parsed video and audio codec string'
  );
});

QUnit.module('codecsFromDefault');

QUnit.test('returns falsey when no audio group ID', function(assert) {
  assert.notOk(
    codecsFromDefault(
      { mediaGroups: { AUDIO: {} } },
      '',
    ),
    'returns falsey when no audio group ID'
  );
});

QUnit.test('returns falsey when no matching audio group', function(assert) {
  assert.notOk(
    codecsFromDefault(
      {
        mediaGroups: {
          AUDIO: {
            au1: {
              en: {
                default: false,
                playlists: [{
                  attributes: { CODECS: 'mp4a.40.2' }
                }]
              },
              es: {
                default: true,
                playlists: [{
                  attributes: { CODECS: 'mp4a.40.5' }
                }]
              }
            }
          }
        }
      },
      'au2'
    ),
    'returned falsey when no matching audio group'
  );
});

QUnit.test('returns falsey when no default for audio group', function(assert) {
  assert.notOk(
    codecsFromDefault(
      {
        mediaGroups: {
          AUDIO: {
            au1: {
              en: {
                default: false,
                playlists: [{
                  attributes: { CODECS: 'mp4a.40.2' }
                }]
              },
              es: {
                default: false,
                playlists: [{
                  attributes: { CODECS: 'mp4a.40.5' }
                }]
              }
            }
          }
        }
      },
      'au1'
    ),
    'returned falsey when no default for audio group'
  );
});

QUnit.test('returns audio profile for default in audio group', function(assert) {
  assert.deepEqual(
    codecsFromDefault(
      {
        mediaGroups: {
          AUDIO: {
            au1: {
              en: {
                default: false,
                playlists: [{
                  attributes: { CODECS: 'mp4a.40.2' }
                }]
              },
              es: {
                default: true,
                playlists: [{
                  attributes: { CODECS: 'mp4a.40.5' }
                }]
              }
            }
          }
        }
      },
      'au1'
    ),
    {audioCodec: 'mp4a', audioProfile: '.40.5', codecCount: 1},
    'returned parsed codec audio profile'
  );
});

QUnit.module('isVideoCodec');
QUnit.test('works as expected', function(assert) {
  [
    'av1',
    'avc01',
    'avc1',
    'avc02',
    'avc2',
    'vp09',
    'vp9',
    'vp8',
    'vp08',
    'hvc1',
    'hev1',
    'theora',
    'mp4v'
  ].forEach(function(codec) {
    assert.ok(isVideoCodec(codec), `"${codec}" is seen as a video codec`);
    assert.ok(isVideoCodec(` ${codec} `), `" ${codec} " is seen as video codec`);
    assert.ok(isVideoCodec(codec.toUpperCase()), `"${codec.toUpperCase()}" is seen as video codec`);
  });

  ['invalid', 'foo', 'mp4a', 'opus', 'vorbis'].forEach(function(codec) {
    assert.notOk(isVideoCodec(codec), `${codec} is not a video codec`);
  });

});

QUnit.module('isAudioCodec');
QUnit.test('works as expected', function(assert) {
  [
    'mp4a',
    'flac',
    'vorbis',
    'opus',
    'ac-3',
    'ac-4',
    'ec-3',
    'alac'
  ].forEach(function(codec) {
    assert.ok(isAudioCodec(codec), `"${codec}" is seen as an audio codec`);
    assert.ok(isAudioCodec(` ${codec} `), `" ${codec} " is seen as an audio codec`);
    assert.ok(isAudioCodec(codec.toUpperCase()), `"${codec.toUpperCase()}" is seen as an audio codec`);
  });

  ['invalid', 'foo', 'bar', 'avc1', 'av1'].forEach(function(codec) {
    assert.notOk(isAudioCodec(codec), `${codec} is not an audio codec`);
  });
});

QUnit.module('muxerSupportCodec');
QUnit.test('works as expected', function(assert) {
  const validMuxerCodecs = [];
  const invalidMuxerCodecs = [];

  unsupportedMuxerCodecs.forEach(function(badCodec) {
    invalidMuxerCodecs.push(badCodec);
    supportedMuxerCodecs.forEach(function(goodCodec) {
      invalidMuxerCodecs.push(`${goodCodec}, ${badCodec}`);
    });
  });

  // generate all combinations of valid codecs
  supportedMuxerCodecs.forEach(function(codec, i) {
    validMuxerCodecs.push(codec);

    supportedMuxerCodecs.forEach(function(subcodec, z) {
      if (z === i) {
        return;
      }
      validMuxerCodecs.push(`${codec}, ${subcodec}`);
      validMuxerCodecs.push(`${codec},${subcodec}`);
    });
  });

  validMuxerCodecs.forEach(function(codec) {
    assert.ok(muxerSupportsCodec(codec), `"${codec}" is supported`);
    assert.ok(muxerSupportsCodec(` ${codec} `), `" ${codec} " is supported`);
    assert.ok(muxerSupportsCodec(codec.toUpperCase()), `"${codec.toUpperCase()}" is supported`);
  });

  invalidMuxerCodecs.forEach(function(codec) {
    assert.notOk(muxerSupportsCodec(codec), `${codec} not supported`);
  });
});

QUnit.module('browserSupportsCodec', {
  beforeEach() {
    this.oldMediaSource = window.MediaSource;
  },
  afterEach() {
    window.MediaSource = this.oldMediaSource;
  }
});

QUnit.test('works as expected', function(assert) {
  window.MediaSource = {isTypeSupported: () => true};
  assert.ok(browserSupportsCodec('test'), 'isTypeSupported true, browser does support codec');

  window.MediaSource = {isTypeSupported: () => false};
  assert.notOk(browserSupportsCodec('test'), 'isTypeSupported false, browser does not support codec');

  window.MediaSource = null;
  assert.notOk(browserSupportsCodec('test'), 'no MediaSource, browser does not support codec');

  window.MediaSource = {isTypeSupported: null};
  assert.notOk(browserSupportsCodec('test'), 'no isTypeSupported, browser does not support codec');
});

QUnit.module('isCodecSupported', {
  beforeEach() {
    this.oldMediaSource = window.MediaSource;
  },
  afterEach() {
    window.MediaSource = this.oldMediaSource;
  }
});

QUnit.test('works as expected', function(assert) {
  window.MediaSource = {isTypeSupported: () => true};
  assert.ok(isCodecSupported(supportedMuxerCodecs[0]), 'browser true, muxer true, supported');

  window.MediaSource = {isTypeSupported: () => false};
  assert.notOk(isCodecSupported(supportedMuxerCodecs[0]), 'browser false, muxer true, not supported');

  window.MediaSource = {isTypeSupported: () => true};
  assert.notOk(isCodecSupported(unsupportedMuxerCodecs[0]), 'browser true, muxer false, not supported');

  window.MediaSource = {isTypeSupported: () => false};
  assert.notOk(isCodecSupported(unsupportedMuxerCodecs[0]), 'browser false, muxer false, not supported');
});
