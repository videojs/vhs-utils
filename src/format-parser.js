import {bytesToString, toUint8, toHexString, bytesMatch} from './byte-helpers.js';
import {findBox, parseDescriptors} from './mp4-helpers.js';
import {findEbml, EBML_TAGS} from './ebml-helpers.js';
import {findFourCC} from './riff-helpers.js';
import {getPages} from './ogg-helpers.js';
import {detectContainerForBytes} from './containers.js';

const padzero = (b, count) => ('0'.repeat(count) + b.toString()).slice(-count);

// VP9 Codec Feature Metadata (CodecPrivate)
// https://www.webmproject.org/docs/container/
const parseVp9Private = (bytes) => {
  let i = 0;
  const params = {};

  while (i < bytes.length) {
    const id = bytes[i] & 0x7f;
    const len = bytes[i + 1];
    let val;

    if (len === 1) {
      val = bytes[i + 2];
    } else {
      val = bytes.subarray(i + 2, i + 2 + len);
    }

    if (id === 1) {
      params.profile = val;
    } else if (id === 2) {
      params.level = val;
    } else if (id === 3) {
      params.bitDepth = val;
    } else if (id === 4) {
      params.chromaSubsampling = val;
    } else {
      params[id] = val;
    }

    i += 2 + len;
  }

  return params;
};

// https://aomediacodec.github.io/av1-isobmff/#av1codecconfigurationbox-syntax
// https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter#AV1
const getAv1Codec = function(bytes) {
  let codec = '';
  const profile = bytes[1] >>> 3;
  const level = bytes[1] & 0x1F;
  const tier = bytes[2] >>> 7;
  const highBitDepth = (bytes[2] & 0x40) >> 6;
  const twelveBit = (bytes[2] & 0x20) >> 5;
  const monochrome = (bytes[2] & 0x10) >> 4;
  const chromaSubsamplingX = (bytes[2] & 0x08) >> 3;
  const chromaSubsamplingY = (bytes[2] & 0x04) >> 2;
  const chromaSamplePosition = bytes[2] & 0x03;

  codec += `${profile}.${padzero(level, 2)}`;

  if (tier === 0) {
    codec += 'M';
  } else if (tier === 1) {
    codec += 'H';
  }

  let bitDepth;

  if (profile === 2 && highBitDepth) {
    bitDepth = twelveBit ? 12 : 10;
  } else {
    bitDepth = highBitDepth ? 10 : 8;
  }

  codec += `.${padzero(bitDepth, 2)}`;

  // TODO: can we parse color range??

  codec += `.${monochrome}`;
  codec += `.${chromaSubsamplingX}${chromaSubsamplingY}${chromaSamplePosition}`;

  return codec;
};

const getAvcCodec = function(bytes) {
  const profileId = toHexString(bytes[1]);
  const constraintFlags = toHexString(bytes[2] & 0xF0);
  const levelId = toHexString(bytes[3]);

  return `${profileId}${constraintFlags}${levelId}`;
};

const getHvcCodec = function(bytes) {
  let codec = '';
  const profileSpace = bytes[1] >> 6;
  const profileId = bytes[1] & 0x1F;
  const tierFlag = (bytes[1] & 0x20) >> 5;
  const profileCompat = bytes.subarray(2, 6);
  const constraintIds = bytes.subarray(6, 12);
  const levelId = bytes[12];

  if (profileSpace === 1) {
    codec += 'A';
  } else if (profileSpace === 2) {
    codec += 'B';
  } else if (profileSpace === 3) {
    codec += 'C';
  }

  codec += `${profileId}.`;

  // reverse every digit of profile compat
  const profileCompatString = profileCompat.reduce((acc, v) => {
    if (v) {
      acc = acc + v.toString(16)
        .split('')
        .reverse()
        .join('')
        .replace(/^0/, '');
    }

    return acc;
  }, '');

  codec += `${profileCompatString}.`;

  if (tierFlag === 0) {
    codec += 'L';
  } else {
    codec += 'H';
  }

  codec += levelId;

  const constraints = constraintIds.reduce((acc, v) => {
    if (v) {
      acc += toHexString(v);
    }

    return acc;
  }, '');

  if (constraints) {
    codec += `.${constraints}`;
  }

  return codec;
};

const formatMimetype = (name, codecs) => {
  const codecString = ['video', 'audio'].reduce((acc, type) => {
    if (codecs[type]) {
      acc += (acc.length ? ',' : '') + codecs[type];
    }

    return acc;
  }, '');

  return `${(codecs.video ? 'video' : 'audio')}/${name}${codecString ? `;codecs="${codecString}"` : ''}`;
};

const parseCodecFrom = {
  mp4(bytes) {
    bytes = toUint8(bytes);
    const codecs = {};
    const traks = findBox(bytes, ['moov', 'trak']);

    traks.forEach(function(trak) {
      const mdia = findBox(trak, ['mdia'])[0];
      const hdlr = findBox(mdia, ['hdlr'])[0];
      const stsd = findBox(mdia, ['minf', 'stbl', 'stsd'])[0];

      let codecType;
      let codecConfigIndex;
      const trakType = bytesToString(hdlr.subarray(8, 12));

      if (trakType === 'soun') {
        codecType = 'audio';
        codecConfigIndex = 28;
      } else if (trakType === 'vide') {
        codecType = 'video';
        codecConfigIndex = 78;
      } else {
        return;
      }

      const sampleDescriptions = stsd.subarray(8);
      let codec = bytesToString(sampleDescriptions.subarray(4, 8));
      const codecBox = findBox(sampleDescriptions, [codec])[0];
      const codecConfig = codecBox.subarray(codecConfigIndex);
      const atomType = bytesToString(codecConfig.subarray(4, 8));
      const atomData = findBox(codecConfig, [atomType])[0];

      if (atomType === 'avcC') {
        codec += `.${getAvcCodec(atomData)}`;
        // HEVCDecoderConfigurationRecord
      } else if (atomType === 'hvcC') {
        codec += `.${getHvcCodec(atomData)}`;
      } else if (atomType === 'esds') {
        const esDescriptor = parseDescriptors(atomData.subarray(4))[0];
        const decoderConfig = esDescriptor.descriptors.filter(({tag}) => tag === 0x04)[0];

        if (decoderConfig) {
          if (decoderConfig.oti === 0x40) {
            codec += '.' + (decoderConfig.descriptors[0].bytes[0] >> 3).toString();
          } else if (decoderConfig.oti === 0xdd) {
            codec = 'vorbis';
          } else {
            codec += '.' + decoderConfig.oti;
          }
        }
      } else if (atomType === 'av1C') {
        codec += `.${getAv1Codec(atomData)}`;
      } else if (atomType === 'vpcC') {
        // VPCodecConfigurationRecord

        // https://www.webmproject.org/vp9/mp4/
        const profile = bytes[0];
        const level = bytes[1];
        const bitDepth = bytes[2] >> 4;
        const chromaSubsampling = (bytes[2] & 0x0F) >> 1;
        const videoFullRangeFlag = (bytes[2] & 0x0F) >> 3;
        const colourPrimaries = bytes[3];
        const transferCharacteristics = bytes[4];
        const matrixCoefficients = bytes[5];
        // const codecIntializationDataSize = bytes[6] << 8 | bytes[5];
        // const codecIntializationData = bytes.subarray(6, 6 + codecIntializationDataSize)

        codec += `.${padzero(profile, 2)}`;
        codec += `.${padzero(level, 2)}`;
        codec += `.${padzero(bitDepth, 2)}`;
        codec += `.${padzero(chromaSubsampling, 2)}`;
        codec += `.${padzero(colourPrimaries, 2)}`;
        codec += `.${padzero(transferCharacteristics, 2)}`;
        codec += `.${padzero(matrixCoefficients, 2)}`;
        codec += `.${padzero(videoFullRangeFlag, 2)}`;
      } else {
        codec = codec.toLowerCase();
      }
      /* eslint-enable */
      // flac, ac-3, ec-3, opus
      codecs[codecType] = codec;

      // codec has no sub parameters
    });

    return {codecs, mimetype: formatMimetype('mp4', codecs)};
  },
  '3gp'(bytes) {
    return {codecs: {}, mimetype: 'video/3gpp'};
  },
  ogg(bytes) {
    const pages = getPages(bytes, 0, 4);
    const codecs = {};

    pages.forEach(function(page) {
      if (bytesMatch(page, [0x4F, 0x70, 0x75, 0x73], {offset: 28})) {
        codecs.audio = 'opus';
      } else if (bytesMatch(page, [0x56, 0x50, 0x38, 0x30], {offset: 29})) {
        codecs.audio = 'vp08';
      } else if (bytesMatch(page, [0x74, 0x68, 0x65, 0x6F, 0x72, 0x61], {offset: 29})) {
        codecs.video = 'theora';
      } else if (bytesMatch(page, [0x46, 0x4C, 0x41, 0x43], {offset: 29})) {
        codecs.audio = 'flac';
      } else if (bytesMatch(page, [0x53, 0x70, 0x65, 0x65, 0x78], {offset: 28})) {
        codecs.audio = 'speex';
      } else if (bytesMatch(page, [0x76, 0x6F, 0x72, 0x62, 0x69, 0x73], {offset: 29})) {
        codecs.audio = 'vorbis';
      }
    });

    return {codecs, mimetype: formatMimetype('ogg', codecs)};
  },
  wav(bytes) {
    const format = findFourCC(bytes, ['WAVE', 'fmt'])[0];
    const code = Array.prototype.slice.call(format, 0, 2).reverse();
    const codecs = {};
    let mimetype = 'audio/vnd.wave';

    // TODO: should we list the actual codec from the spec?
    // https://tools.ietf.org/html/rfc2361
    codecs.audio = code.reduce(function(acc, v) {
      if (v) {
        acc += toHexString(v);
      }
      return acc;
    }, '');

    if (codecs.audio) {
      mimetype += `;codec=${codecs.audio}`;
    }

    return {codecs, mimetype};
  },
  avi(bytes) {
    const strls = findFourCC(bytes, ['AVI', 'hdrl', 'strl']);
    const codecs = {};

    strls.forEach(function(strl) {
      const strh = findFourCC(strl, ['strh'])[0];
      const strf = findFourCC(strl, ['strf'])[0];

      // now parse AVIStreamHeader to get codec and type:
      // https://docs.microsoft.com/en-us/previous-versions/windows/desktop/api/avifmt/ns-avifmt-avistreamheader
      const type = bytesToString(strh.subarray(0, 4));
      let codec;
      let codecType;

      if (type === 'vids') {
        // https://docs.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader
        const handler = bytesToString(strh.subarray(4, 8));
        const compression = bytesToString(strf.subarray(16, 20));

        // TODO: can we parse the codec here:
        if (handler === 'H264' || compression === 'H264') {
          codec = 'avc1.4d400d';
        } else if (handler === 'HEVC' || compression === 'HEVC') {
          codec = 'hvc1.2.4.L130.B0';
        } else if (handler === 'FMP4' || compression === 'FMP4') {
          codec = 'm4v.20.8';
        } else if (handler === 'VP80' || compression === 'VP80') {
          codec = 'vp8';
        } else if (handler === 'VP90' || compression === 'VP90') {
          codec = 'vp9';
        } else if (handler === 'AV01' || compression === 'AV01') {
          codec = 'av01';
        } else if (handler === 'theora' || compression === 'theora') {
          codec = 'theora';
        }

        codecType = 'video';
      } else if (type === 'auds') {
        // https://docs.microsoft.com/en-us/windows/win32/medfound/audio-subtype-guids
        codecType = 'audio';
        const format = Array.prototype.slice.call(strf, 0, 2).reverse();

        if (bytesMatch(format, [0x00, 0x55])) {
          codec = 'mp3';
        } else if (bytesMatch(format, [0x16, 0x00]) || bytesMatch(format, [0x00, 0xFF])) {
          codec = 'aac';
        } else if (bytesMatch(format, [0x70, 0x4f])) {
          codec = 'opus';
        } else if (bytesMatch(format, [0xF1, 0xAC])) {
          codec = 'flac';
        } else if (bytesMatch(format, [0x20, 0x00])) {
          codec = 'ac-3';
        } else if (bytesMatch(format, [0xFF, 0xFE])) {
          codec = 'ec-3';
        } else if (bytesMatch(format, [0x00, 0x50])) {
          codec = 'mp2';
        } else if (bytesMatch(format, [0x56, 0x6f])) {
          codec = 'vorbis';
        } else if (bytesMatch(format, [0xA1, 0x09])) {
          codec = 'speex';
        }
      } else {
        return;
      }

      if (codec) {
        codecs[codecType] = codec;
      }
    });

    return {codecs, mimetype: formatMimetype('avi', codecs)};
  },

  ts(bytes) {
    let startIndex = 0;
    let endIndex = 188;
    const SYNC_BYTE = 0x47;
    const pmt = {};
    const codecs = {};

    while (endIndex < bytes.byteLength && (!pmt.pid || !pmt.table)) {
      if (bytes[startIndex] !== SYNC_BYTE && bytes[endIndex] !== SYNC_BYTE) {
        endIndex += 1;
        startIndex += 1;
        continue;
      }
      const packet = bytes.subarray(startIndex, endIndex);
      const pid = (((packet[1] & 0x1f) << 8) | packet[2]);
      const hasPusi = !!(packet[1] & 0x40);
      const hasAdaptationHeader = (((packet[3] & 0x30) >>> 4) > 0x01);
      let payloadOffset = 4 + (hasAdaptationHeader ? (packet[4] + 1) : 0);

      if (hasPusi) {
        payloadOffset += packet[payloadOffset] + 1;
      }

      if (pid === 0 && !pmt.pid) {
        pmt.pid = (packet[payloadOffset + 10] & 0x1f) << 8 | packet[payloadOffset + 11];
      } else if (pmt.pid && pid === pmt.pid && !pmt.table) {
        const isNotForward = packet[payloadOffset + 5] & 0x01;

        // ignore forward pmt delarations
        if (!isNotForward) {
          continue;
        }
        pmt.table = {};

        const sectionLength = (packet[payloadOffset + 1] & 0x0f) << 8 | packet[payloadOffset + 2];
        const tableEnd = 3 + sectionLength - 4;
        const programInfoLength = (packet[payloadOffset + 10] & 0x0f) << 8 | packet[payloadOffset + 11];
        let offset = 12 + programInfoLength;

        while (offset < tableEnd) {
          // add an entry that maps the elementary_pid to the stream_type
          const i = payloadOffset + offset;
          const type = packet[i];
          const esLength = ((packet[i + 3] & 0x0F) << 8 | packet[i + 4]);
          // const esInfo = packet.subarray(i + 5, i + esLength);

          // TODO: can we parse the codec here:
          if (type === 0x1B) {
            codecs.video = 'avc1.4d400d';
          } else if (type === 0x24) {
            codecs.video = 'hvc1.2.4.L130.B0';
          } else if (type === 0x10) {
            codecs.video = 'mp4v.20.9';
          } else if (type === 0x0F) {
            codecs.audio = 'aac';
          } else if (type === 0x81) {
            codecs.audio = 'ac-3';
          } else if (type === 0x87) {
            codecs.audio = 'ec-3';
          } else if (type === 0x03) {
            codecs.audio = 'mpeg';

          }

          offset += esLength + 5;
        }
      }

      startIndex += 188;
      endIndex += 188;
    }

    return {codecs, mimetype: formatMimetype('mp2t', codecs)};
  },
  webm(bytes) {
    // mkv and webm both use ebml to store code info
    const retval = parseCodecFrom.mkv(bytes);

    if (retval.mimetype) {
      retval.mimetype = retval.mimetype.replace('x-matroska', 'webm');
    }

    return retval;
  },
  mkv(bytes) {
    const codecs = {};
    const trackTags = findEbml(bytes, [EBML_TAGS.Segment, EBML_TAGS.Tracks, EBML_TAGS.Track]);

    // and a switch to return common mime types for this codec
    trackTags.forEach((trackTag) => {
      let codec = bytesToString(findEbml(trackTag, [EBML_TAGS.CodecID])[0]);
      const trackType = findEbml(trackTag, [EBML_TAGS.TrackType])[0][0];
      const codecPrivate = findEbml(trackTag, [EBML_TAGS.CodecPrivate])[0];
      let codecType;

      // 1 is video, 2 is audio,
      // other values are unimportant in this context
      if (trackType === 1) {
        codecType = 'video';
      } else if (trackType === 2) {
        codecType = 'audio';
      } else {
        return;
      }

      // TODO: VP09/VP09 codec parsing
      if ((/V_MPEG4\/ISO\/AVC/).test(codec)) {
        codec = `avc1.${getAvcCodec(codecPrivate)}`;
      } else if ((/V_MPEGH\/ISO\/HEVC/).test(codec)) {
        codec = `hvc1.${getHvcCodec(codecPrivate)}`;
      } else if ((/V_MPEGH\/ISO\/ASP/).test(codec)) {
        codec = 'mp4v';
      } else if ((/^V_THEORA/).test(codec)) {
        codec = 'theora';
      } else if ((/^V_VP8/).test(codec)) {
        codec = 'vp8';
      } else if ((/^V_VP9/).test(codec)) {
        if (codecPrivate) {
          const {profile, level, bitDepth, chromaSubsampling} = parseVp9Private(codecPrivate);

          codec = 'vp09.';
          codec += `${padzero(profile, 2)}.`;
          codec += `${padzero(level, 2)}.`;
          codec += `${padzero(bitDepth, 2)}.`;
          codec += `${padzero(chromaSubsampling, 2)}`;

          // Video -> Colour -> Ebml name
          const matrixCoefficients = findEbml(trackTag, [0xE0, [0x55, 0xB0], [0x55, 0xB1]])[0] || [];
          const videoFullRangeFlag = findEbml(trackTag, [0xE0, [0x55, 0xB0], [0x55, 0xB9]])[0] || [];
          const transferCharacteristics = findEbml(trackTag, [0xE0, [0x55, 0xB0], [0x55, 0xBA]])[0] || [];
          const colourPrimaries = findEbml(trackTag, [0xE0, [0x55, 0xB0], [0x55, 0xBB]])[0] || [];

          // if we find any optional codec parameter specify them all.
          if (matrixCoefficients.length ||
            videoFullRangeFlag.length ||
            transferCharacteristics.length ||
            colourPrimaries.length) {
            codec += `.${padzero(colourPrimaries[0], 2)}`;
            codec += `.${padzero(transferCharacteristics[0], 2)}`;
            codec += `.${padzero(matrixCoefficients[0], 2)}`;
            codec += `.${padzero(videoFullRangeFlag[0], 2)}`;
          }

        } else {
          codec = 'vp9';
        }
      } else if ((/^V_AV1/).test(codec)) {
        codec = `av01.${getAv1Codec(codecPrivate)}`;
      } else if ((/A_ALAC/).test(codec)) {
        codec = 'alac';
      } else if ((/A_MPEG\/L2/).test(codec)) {
        codec = 'mp2';
      } else if ((/A_MPEG\/L3/).test(codec)) {
        codec = 'mp3';
      } else if ((/^A_AAC/).test(codec)) {
        codec = 'mp4a';
      } else if ((/^A_AC3/).test(codec)) {
        codec = 'ac-3';
      } else if ((/^A_PCM/).test(codec)) {
        codec = 'pcm';
      } else if ((/^A_MS\/ACM/).test(codec)) {
        codec = 'speex';
      } else if ((/^A_EAC3/).test(codec)) {
        codec = 'ec-3';
      } else if ((/^A_VORBIS/).test(codec)) {
        codec = 'vorbis';
      } else if ((/^A_FLAC/).test(codec)) {
        codec = 'flac';
      } else if ((/^A_OPUS/).test(codec)) {
        codec = 'opus';
      }

      codecs[codecType] = codec;
    });

    return {codecs, mimetype: formatMimetype('x-matroska', codecs)};
  },
  aac(bytes) {
    return {codecs: {audio: 'aac'}, mimetype: 'audio/aac'};
  },
  ac3(bytes) {
    return {codecs: {audio: 'ac3'}, mimetype: 'audio/vnd.dolby.dd-raw'};
  },
  mp3(bytes) {
    return {codecs: {audio: 'mpeg'}, mimetype: 'audio/mpeg'};
  },
  flac(bytes) {
    return {codecs: {audio: 'flac'}, mimetype: 'audio/flac'};
  }
};

export const parseFormatForBytes = (bytes) => {
  bytes = toUint8(bytes);
  const result = {
    codecs: {},
    container: detectContainerForBytes(bytes),
    mimetype: ''
  };

  const parseCodecFn = parseCodecFrom[result.container];

  if (parseCodecFn) {
    const parsed = parseCodecFn ? parseCodecFn(bytes) : {};

    result.codecs = parsed.codecs || {};
    result.mimetype = parsed.mimetype || '';
  }

  return result;
};

