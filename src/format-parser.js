import {bytesToString, toUint8, toHexString, bytesMatch} from './byte-helpers.js';
import {findBox} from './mp4-helpers.js';
import {findEbml, EBML_TAGS} from './ebml-helpers.js';
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

  return `${(codecs.video ? 'video' : 'audio')}/${name};codecs="${codecString}"`;
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

      /* eslint-disable */
      const sampleDescriptions = stsd.subarray(8);
      let codec = bytesToString(sampleDescriptions.subarray(4, 8));
      const count = (bytes[12] << 24 | bytes[13] << 16 | bytes[14] << 8 | bytes[15]) >>> 0;
      const codecBox = findBox(sampleDescriptions, [codec])[0];
      debugger;

      if ((/^[a-z]vc[1-9]$/i).test(codec)) {
        // we don't need anything but the "config" parameter of the
        // avc1 codecBox
        const codecConfig = codecBox.subarray(78);

        if (codecConfigType === 'avcC' && codecConfig.length > 11) {
          codec += '.';

          // left padded with zeroes for single digit hex
          // profile idc
          codec += toHexString(codecConfig[9]);
          // the byte containing the constraint_set flags
          codec += toHexString(codecConfig[10]);
          // level idc
          codec += toHexString(codecConfig[11]);
        } else {
          codec += '.4d400d';
        }
      } else if ((/^mp4[a,v]$/i).test(codec)) {
        // we do not need anything but the streamDescriptor of the mp4a codecBox
        const codecConfig = codecBox.subarray(28);
        const esds = findBox(codecBox.subarray(28), ['esds'])[0];

        if (esds) {
          // object type indicator usually 0x40
          codec += '.' + toHexString(esds[17]);
          // audio object type see
          // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter#MPEG-4_audio

          // replace leading 0, as typically it isn't included, even
          // though things should work if it is used.
          codec += '.' + toHexString(esds[18] >> 3).replace(/^0/, '');
        } else {
          codec += '.40.2';
        }
      }
      /* eslint-enable */
      codecs[codecType] = codec;

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
      // Opus
      if (bytesMatch(page, [0x4F, 0x70, 0x75, 0x73], {offset: 28})) {
        codecs.audio = 'opus';
      // theora
      } else if (bytesMatch(page, [0x74, 0x68, 0x65, 0x6F, 0x72, 0x61], {offset: 29})) {
        codecs.video = 'theora';
      // FLAC
      } else if (bytesMatch(page, [0x46, 0x4C, 0x41, 0x43], {offset: 29})) {
        codecs.audio = 'flac';
      // Speex
      } else if (bytesMatch(page, [0x53, 0x70, 0x65, 0x65, 0x78], {offset: 28})) {
        codecs.audio = 'speex';
      } else if (bytesMatch(page, [0x76, 0x6F, 0x72, 0x62, 0x69, 0x73], {offset: 29})) {
        codecs.audio = 'vorbis';
      }
    });

    return {codecs, mimetype: formatMimetype('ogg', codecs)};
  },
  wav(bytes) {
    return {codecs: {}, mimetype: 'audio/wav'};
  },
  avi(bytes) {
    // TODO:
    return {codecs: {}, mimetype: 'video/avi'};
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
          const esInfo = packet.subarray(i + 5, i + esLength);

          if (type === 0x1B) {
            codecs.video = 'avc1.';
            if (esInfo.length >= 5) {
              codecs.video += toHexString(esInfo[2]) + toHexString(esInfo[3]) + toHexString(esInfo[4]);
            } else {
              codecs.video += '4d400d';
            }
          } else if (type === 0x0F) {
            codecs.audio = 'mp4a.';
            if (esInfo.length >= 30) {
              codecs.audio += toHexString(esInfo[17]) + '.' + toHexString(esInfo[30]);
            } else {
              codecs.audio += '40.2';
            }
          }

          offset += esLength + 5;
        }
      }

      startIndex += 188;
      endIndex += 188;
    }

    // use pmt.table and match against
    // https://en.wikipedia.org/wiki/Program-specific_information#Elementary_stream_types
    Object.keys(pmt.table || {}).forEach(function(pid) {
      const type = pmt.table[pid];

      switch (type) {
      case 0x1B:
        codecs.video = 'avc1';
        break;
      case 0x0F:
        codecs.audio = 'mp4a.40.2';
        break;
      }
    });

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
      if ((/^V_MPEG4/).test(codec)) {
        codec = 'avc1.4d400d';
      } else if ((/^V_THEORA/).test(codec)) {
        codec = 'theora';
      } else if ((/^V_VP8/).test(codec)) {
        codec = 'vp08';
      } else if ((/^V_VP9/).test(codec)) {
        codec = 'vp09';
      } else if ((/A_MPEG\/L3/).test(codec)) {
        codec = 'mp3';
      } else if ((/^A_AAC/).test(codec)) {
        codec = 'mp4a';
      } else if ((/^A_AC3/).test(codec)) {
        codec = 'ac-3';
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

/*
AAC-LC: 'mp4a.40.2'
HE-AACv1: 'mp4a.40.5'
HE-AACv2: 'mp4a.40.29'
mp3:      'mp4a.40.34'
*/

// https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter#AVC_profiles
// TODO: parse h264 level/profile
// format PPCCLL
// First two bytes = (PP) = Profile number
// 0x42 = 66 = 3.0 baseline
// 0x4D = 77 = 4.0 main
// 0x64 = 100 = 5.0 hight
// Second two bytes = (CC) = Contraint set flags
// Third two bytes = (LL) = level
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

