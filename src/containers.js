import {bytesToString, toUint8, toHexString} from './byte-helpers.js';
import {findBox} from './mp4-helpers.js';
import {findEbml} from './ebml-helpers.js';

export const getId3Offset = function(bytes) {
  bytes = toUint8(bytes);

  if (bytes.length < 10 || bytesToString(bytes.subarray(0, 3)) !== 'ID3') {
    return 0;
  }
  const returnSize = (bytes[6] << 21) |
                     (bytes[7] << 14) |
                     (bytes[8] << 7) |
                     (bytes[9]);
  const flags = bytes[5];
  const footerPresent = (flags & 16) >> 4;

  if (footerPresent) {
    return returnSize + 20;
  }
  return returnSize + 10;
};

export const isLikely = {
  aac(bytes) {
    const offset = getId3Offset(bytes);

    return bytes.length >= offset + 2 &&
      (bytes[offset] & 0xFF) === 0xFF &&
      (bytes[offset + 1] & 0xE0) === 0xE0 &&
      (bytes[offset + 1] & 0x16) === 0x10;
  },

  mp3(bytes) {
    const offset = getId3Offset(bytes);

    return bytes.length >= offset + 2 &&
      (bytes[offset] & 0xFF) === 0xFF &&
      (bytes[offset + 1] & 0xE0) === 0xE0 &&
      (bytes[offset + 1] & 0x06) === 0x02;
  },

  webm(bytes) {
    // check if DocType EBML tag is webm
    return (/^webm$/).test(bytesToString(findEbml(bytes, ['1A45DFA3', '4282'])[0]));
  },

  mkv(bytes) {
    // check if DocType EBML tag is matroska
    return (/^matroska/).test(bytesToString(findEbml(bytes, ['1A45DFA3', '4282'])[0]));
  },

  mp4(bytes) {
    return bytes.length >= 8 &&
      (/^(f|s)typ$/).test(bytesToString(bytes.subarray(4, 8))) &&
      // not 3gp data
      !(/^ftyp3g$/).test(bytesToString(bytes.subarray(4, 10)));
  },

  '3gp'(bytes) {
    return bytes.length >= 10 &&
      (/^ftyp3g$/).test(bytesToString(bytes.subarray(4, 10)));
  },

  ts(bytes) {
    if (bytes.length < 189 && bytes.length >= 1) {
      return bytes[0] === 0x47;
    }

    let i = 0;

    // check the first 376 bytes for two matching sync bytes
    while (i + 188 < bytes.length && i < 188) {
      if (bytes[i] === 0x47 && bytes[i + 188] === 0x47) {
        return true;
      }
      i += 1;
    }

    return false;
  },
  flac(bytes) {
    return bytes.length >= 4 &&
      (/^fLaC$/).test(bytesToString(bytes.subarray(0, 4)));
  },
  ogg(bytes) {
    return bytes.length >= 4 &&
      (/^OggS$/).test(bytesToString(bytes.subarray(0, 4)));
  }
};

// get all the isLikely functions
// but make sure 'ts' is at the bottom
// as it is the least specific
const isLikelyTypes = Object.keys(isLikely)
  // remove ts
  .filter((t) => t !== 'ts')
  // add it back to the bottom
  .concat('ts');

// make sure we are dealing with uint8 data.
isLikelyTypes.forEach(function(type) {
  const isLikelyFn = isLikely[type];

  isLikely[type] = (bytes) => isLikelyFn(toUint8(bytes));
});

// A useful list of file signatures can be found here
// https://en.wikipedia.org/wiki/List_of_file_signatures
export const detectContainerForBytes = (bytes) => {
  bytes = toUint8(bytes);

  for (let i = 0; i < isLikelyTypes.length; i++) {
    const type = isLikelyTypes[i];

    if (isLikely[type](bytes)) {
      return type;
    }
  }

  return '';
};

// fmp4 is not a container
export const isLikelyFmp4MediaSegment = (bytes) => {
  bytes = toUint8(bytes);
  let i = 0;

  while (i < bytes.length) {
    const size = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const type = bytesToString(bytes.subarray(i + 4, i + 8));

    if (type === 'moof') {
      return true;
    }

    if (size === 0 || (size + i) > bytes.length) {
      i = bytes.length;
    } else {
      i += size;
    }
  }

  return false;
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

    return codecs;
  },
  ogg(bytes) {

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

    return codecs;
  },
  webm(bytes) {
    const codecs = {};
    const trackTags = findEbml(bytes, ['18538067', '1654ae6b', 'ae']);

    // TODO: use https://www.matroska.org/technical/specs/codecid/index.html
    // and a switch to return common mime types for this codec
    trackTags.forEach((trackTag) => {
      const codecId = bytesToString(findEbml(trackTag, ['86'])[0]);
      const codecType = bytesToString(findEbml(trackTag, ['83'])[0]).toLowerCase();

      if ((/^video/).test(codecType)) {
        codecs.video = codecId;
      } else if ((/^audio/).test(codecType)) {
        codecs.audio = codecId;
      }
    });

    return codecs;
  },
  mkv(bytes) {
    // mkv and webm both use ebml to store code info
    return parseCodecFrom.webm(bytes);
  },
  aac(bytes) {
    // TODO: what about non low complexity aac?
    return {audio: 'mp4a.40.2'};
  },
  mp3(bytes) {
    // TODO: is there a better mime type?
    return {audio: 'mp4a.40.34'};
  },
  flac(bytes) {
    // TODO: is there a better mime type?
    return {audio: 'flac'};
  }
};

// https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter#AVC_profiles
// TODO: parse h264 level/profile
// format PPCCLL
// First two bytes = (PP) = Profile number
// 0x42 = 66 = 3.0 baseline
// 0x4D = 77 = 4.0 main
// 0x64 = 100 = 5.0 hight
// Second two bytes = (CC) = Contraint set flags
// Third two bytes = (LL) = level
export const detectCodecsAndContainerForBytes = (bytes) => {
  bytes = toUint8(bytes);

  const container = detectContainerForBytes(bytes);

  // TODO: include mime type

  return {
    container,
    codecs: (container && parseCodecFrom[container]) ? parseCodecFrom[container](bytes) : ''
  };
};
