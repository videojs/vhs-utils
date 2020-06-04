import {bytesToString, toUint8, toHexString, bytesMatch} from './byte-helpers.js';
import {findBox} from './mp4-helpers.js';
import {findEbml, EBML_TAGS} from './ebml-helpers.js';
import {findFourCC} from './riff-helpers.js';
import {getPages} from './ogg-helpers.js';
import {detectContainerForBytes} from './containers.js';
// import {getId3Offset} from './id3-helpers.js';

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

      const trakType = bytesToString(hdlr.subarray(8, 12));
      let codecType;

      if (trakType === 'soun') {
        codecType = 'audio';
      } else if (trakType === 'vide') {
        codecType = 'video';
      } else {
        return;
      }

      // https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html
      const sampleDescriptions = stsd.subarray(8);
      let codec = bytesToString(sampleDescriptions.subarray(4, 8));
      const codecBox = findBox(sampleDescriptions, [codec])[0];

      if ((/^(avc|hvc|hev)[1-9]$/i).test(codec)) {
        const codecConfig = codecBox.subarray(78);
        const atomType = bytesToString(codecConfig.subarray(4, 8));
        const data = findBox(codecConfig, [atomType])[0];

        // AVCDecoderConfigurationRecord
        if (atomType === 'avcC') {
          // in hex
          // profile identifier + constraint flags (first 4 bits only) + level identifier
          codec += `.${toHexString(data[1])}${toHexString(data[2] & 0xF0)}${toHexString(data[3])}`;

        // HEVCDecoderConfigurationRecord
        } else if (atomType === 'hvcC') {
          // in decimal
          // Codec.Profile.Flags.TierLevel.Constraints
          codec += `.${data[1]}.${data[5]}.L${data[12]}.${toHexString(data[6])}`;
        }
      } else if ((/^mp4a$/i).test(codec)) {
        // TODO: mp3/mp2/vorbis audio is broken here
        // we do not need anything but the streamDescriptor of the mp4a codecBox
        // const codecConfig = codecBox.subarray(28);
        const esds = findBox(codecBox.subarray(28), ['esds'])[0];

        if (esds) {
          // object type indicator
          codec += '.' + toHexString(esds[17]);
          // audio object type see
          // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter#MPEG-4_audio

          // first 5 bits only for audio object type
          codec += '.' + (esds[35] >>> 3).toString();
        } else {
          codec += '.40.2';
        }
      }
      /* eslint-enable */
      // flac, ac-3, ec-3, opus
      codecs[codecType] = codec.toLowerCase();

      // codec has no sub parameters
    });

    return {codecs, mimetype: formatMimetype('mp4', codecs)};
  },
  '3gp'(bytes) {
    // TODO:
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
    // TODO: parse using riff-helper
    return {codecs: {}, mimetype: 'audio/wav'};
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

        if (handler === 'H264' || compression === 'H264') {
          codec = 'avc1.4d400d';
        } else if (handler === 'HEVC' || compression === 'HEVC') {
          codec = 'hevc';
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
        // TODO: opus, ac-3 dont have strf???

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

          if (type === 0x1B) {
            codecs.video = 'avc1.d400d';
          } else if (type === 0x24) {
            codecs.video = 'hvc1.2.4.L130.B0';
          } else if (type === 0x10) {
            codecs.video = 'mp4v.20.9';
          } else if (type === 0x0F) {
            // aac
            codecs.audio = 'aac';
          } else if (type === 0x81) {
            codecs.audio = 'ac-3';
          } else if (type === 0x87) {
            codecs.audio = 'ec-3';
          } else if (type === 0x03) {
            // mp3 or mp2
            codecs.audio = 'mpeg';

          }

          // TODO: alac, av01, flac, opus, speex, theora, vorbis, vp08, vp09

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

      // TODO: parse codec parameters in CodecPrivate?
      if ((/V_MPEG4\/ISO\/AVC/).test(codec)) {
        codec = 'avc1.4d400d';
      } else if ((/V_MPEGH\/ISO\/HEVC/).test(codec)) {
        codec = 'hvc1.2.4.L130.B0';
      } else if ((/V_MPEGH\/ISO\/ASP/).test(codec)) {
        codec = 'mp4v';
      } else if ((/^V_THEORA/).test(codec)) {
        codec = 'theora';
      } else if ((/^V_VP8/).test(codec)) {
        codec = 'vp08';
      } else if ((/^V_VP9/).test(codec)) {
        codec = 'vp09';
      } else if ((/^V_AV1/).test(codec)) {
        codec = 'av01';
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

