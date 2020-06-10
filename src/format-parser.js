import {bytesToString, toUint8, toHexString, toBinaryString, bytesMatch} from './byte-helpers.js';
import {findBox, parseDescriptors, findNamedBox} from './mp4-helpers.js';
import {findEbml, EBML_TAGS} from './ebml-helpers.js';
import {findFourCC} from './riff-helpers.js';
import {getPages} from './ogg-helpers.js';
import {detectContainerForBytes} from './containers.js';

const padzero = (b, count) => ('0'.repeat(count) + b.toString()).slice(-count);

// https://docs.microsoft.com/en-us/windows/win32/medfound/audio-subtype-guids
// https://tools.ietf.org/html/rfc2361
const wFormatTagCodec = function(wFormatTag) {
  wFormatTag = toUint8(wFormatTag);

  if (bytesMatch(wFormatTag, [0x00, 0x55])) {
    return 'mp3';
  } else if (bytesMatch(wFormatTag, [0x16, 0x00]) || bytesMatch(wFormatTag, [0x00, 0xFF])) {
    return 'aac';
  } else if (bytesMatch(wFormatTag, [0x70, 0x4f])) {
    return 'opus';
  } else if (bytesMatch(wFormatTag, [0x6C, 0x61])) {
    return 'alac';
  } else if (bytesMatch(wFormatTag, [0xF1, 0xAC])) {
    return 'flac';
  } else if (bytesMatch(wFormatTag, [0x20, 0x00])) {
    return 'ac-3';
  } else if (bytesMatch(wFormatTag, [0xFF, 0xFE])) {
    return 'ec-3';
  } else if (bytesMatch(wFormatTag, [0x00, 0x50])) {
    return 'mp2';
  } else if (bytesMatch(wFormatTag, [0x56, 0x6f])) {
    return 'vorbis';
  } else if (bytesMatch(wFormatTag, [0xA1, 0x09])) {
    return 'speex';
  }

  return '';
};

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

  // ffmpeg does this in big endian
  let profileCompatVal = parseInt(toBinaryString(profileCompat).split('').reverse().join(''), 2);

  // apple does this in little endian...
  if (profileCompatVal > 255) {
    profileCompatVal = parseInt(toBinaryString(profileCompat), 2);
  }

  codec += `${profileCompatVal.toString(16)}.`;

  if (tierFlag === 0) {
    codec += 'L';
  } else {
    codec += 'H';
  }

  codec += levelId;

  const constraints = constraintIds.reduce((acc, v) => {
    if (v) {
      if (acc) {
        acc += '.';
      }
      acc += v.toString(16);
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
  mov(bytes) {
    // mov and mp4 both use a nearly identical box structure.
    const retval = parseCodecFrom.mp4(bytes);

    if (retval.mimetype) {
      retval.mimetype = retval.mimetype.replace('mp4', 'quicktime');
    }

    return retval;
  },
  mp4(bytes) {
    bytes = toUint8(bytes);
    const codecs = {};
    const traks = findBox(bytes, ['moov', 'trak']);

    traks.forEach(function(trak) {
      const mdia = findBox(trak, ['mdia'])[0];
      const hdlr = findBox(mdia, ['hdlr'])[0];
      const stsd = findBox(mdia, ['minf', 'stbl', 'stsd'])[0];

      let codecType;
      const trakType = bytesToString(hdlr.subarray(8, 12));

      if (trakType === 'soun') {
        codecType = 'audio';
      } else if (trakType === 'vide') {
        codecType = 'video';
      } else {
        return;
      }

      const sampleDescriptions = stsd.subarray(8);
      let codec = bytesToString(sampleDescriptions.subarray(4, 8));
      const codecBox = findBox(sampleDescriptions, [codec])[0];

      if (codec === 'avc1') {
        // AVCDecoderConfigurationRecord
        codec += `.${getAvcCodec(findNamedBox(codecBox, 'avcC'))}`;
        // HEVCDecoderConfigurationRecord
      } else if (codec === 'hvc1' || codec === 'hev1') {
        codec += `.${getHvcCodec(findNamedBox(codecBox, 'hvcC'))}`;
      } else if (codec === 'mp4a' || codec === 'mp4v') {
        const esds = findNamedBox(codecBox, 'esds');
        const esDescriptor = parseDescriptors(esds.subarray(4))[0];
        const decoderConfig = esDescriptor.descriptors.filter(({tag}) => tag === 0x04)[0];

        if (decoderConfig) {
          codec += '.' + toHexString(decoderConfig.oti);
          if (decoderConfig.oti === 0x40) {
            codec += '.' + (decoderConfig.descriptors[0].bytes[0] >> 3).toString();
          } else if (decoderConfig.oti === 0x20) {
            codec += '.' + (decoderConfig.descriptors[0].bytes[4]).toString();
          } else if (decoderConfig.oti === 0xdd) {
            codec = 'vorbis';
          }
        }
      } else if (codec === 'av01') {
        // AV1DecoderConfigurationRecord
        codec += `.${getAv1Codec(findNamedBox(codecBox, 'av1C'))}`;
      } else if (codec === 'vp09') {
        // VPCodecConfigurationRecord
        const vpcC = findNamedBox(codecBox, 'vpcC');

        // https://www.webmproject.org/vp9/mp4/
        const profile = vpcC[0];
        const level = vpcC[1];
        const bitDepth = vpcC[2] >> 4;
        const chromaSubsampling = (vpcC[2] & 0x0F) >> 1;
        const videoFullRangeFlag = (vpcC[2] & 0x0F) >> 3;
        const colourPrimaries = vpcC[3];
        const transferCharacteristics = vpcC[4];
        const matrixCoefficients = vpcC[5];

        codec += `.${padzero(profile, 2)}`;
        codec += `.${padzero(level, 2)}`;
        codec += `.${padzero(bitDepth, 2)}`;
        codec += `.${padzero(chromaSubsampling, 2)}`;
        codec += `.${padzero(colourPrimaries, 2)}`;
        codec += `.${padzero(transferCharacteristics, 2)}`;
        codec += `.${padzero(matrixCoefficients, 2)}`;
        codec += `.${padzero(videoFullRangeFlag, 2)}`;
      } else if (codec === 'theo') {
        codec = 'theora';
      } else if (codec === 'spex') {
        codec = 'speex';
      } else if (codec === '.mp3') {
        codec = 'mp4a.40.34';
      } else if (codec === 'msVo') {
        codec = 'vorbis';
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
        codecs.audio = 'vp8';
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
    const wFormatTag = Array.prototype.slice.call(format, 0, 2).reverse();
    let mimetype = 'audio/vnd.wave';
    const codecs = {
      audio: wFormatTagCodec(wFormatTag)
    };

    const codecString = wFormatTag.reduce(function(acc, v) {
      if (v) {
        acc += toHexString(v);
      }
      return acc;
    }, '');

    if (codecString) {
      mimetype += `;codec=${codecString}`;
    }

    if (codecString && !codecs.audio) {
      codecs.audio = codecString;
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

        // TODO: can we parse the codec parameters here:
        if (handler === 'H264' || compression === 'H264') {
          codec = 'avc1';
        } else if (handler === 'HEVC' || compression === 'HEVC') {
          codec = 'hev1';
        } else if (handler === 'FMP4' || compression === 'FMP4') {
          codec = 'mp4v.20';
        } else if (handler === 'VP80' || compression === 'VP80') {
          codec = 'vp8';
        } else if (handler === 'VP90' || compression === 'VP90') {
          codec = 'vp9';
        } else if (handler === 'AV01' || compression === 'AV01') {
          codec = 'av01';
        } else if (handler === 'theo' || compression === 'theora') {
          codec = 'theora';
        } else {
          codec = handler || compression;
        }

        codecType = 'video';
      } else if (type === 'auds') {
        codecType = 'audio';
        const wFormatTag = Array.prototype.slice.call(strf, 0, 2).reverse();

        codecs.audio = wFormatTagCodec(wFormatTag);

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
          const esLength = ((packet[i + 3] & 0x0f) << 8 | (packet[i + 4]));
          const esInfo = packet.subarray(i + 5, i + 5 + esLength);

          // TODO: can we parse other the codec parameters here:
          if (type === 0x06 && bytesMatch(esInfo, [0x4F, 0x70, 0x75, 0x73], {offset: 2})) {
            codecs.audio = 'opus';
          } else if (type === 0x1B || type === 0x20) {
            codecs.video = 'avc1';
          } else if (type === 0x24) {
            codecs.video = 'hev1';
          } else if (type === 0x10) {
            codecs.video = 'mp4v.20';
          } else if (type === 0x0F) {
            codecs.audio = 'aac';
          } else if (type === 0x81) {
            codecs.audio = 'ac-3';
          } else if (type === 0x87) {
            codecs.audio = 'ec-3';
          } else if (type === 0x03 || type === 0x04) {
            codecs.audio = 'mp3';

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

      if ((/V_MPEG4\/ISO\/AVC/).test(codec)) {
        codec = `avc1.${getAvcCodec(codecPrivate)}`;
      } else if ((/V_MPEGH\/ISO\/HEVC/).test(codec)) {
        codec = `hev1.${getHvcCodec(codecPrivate)}`;
      } else if ((/V_MPEG4\/ISO\/ASP/).test(codec)) {
        if (codecPrivate) {
          codec = 'mp4v.20.' + codecPrivate[4].toString();
        } else {
          codec = 'mp4v.20.9';
        }
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
        if (codecPrivate) {
          codec = 'mp4a.40.' + (codecPrivate[0] >>> 3).toString();
        } else {
          codec = 'mp4a.40.2';
        }
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
    return {codecs: {audio: 'ac-3'}, mimetype: 'audio/vnd.dolby.dd-raw'};
  },
  mp3(bytes) {
    return {codecs: {audio: 'mp3'}, mimetype: 'audio/mpeg'};
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

