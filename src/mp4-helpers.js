import {
  stringToBytes,
  toUint8,
  bytesMatch,
  bytesToString,
  toHexString,
  padStart
} from './byte-helpers.js';
import {getAvcCodec, getHvcCodec, getAv1Codec} from './codec-helpers.js';

const normalizePath = function(path) {
  if (typeof path === 'string') {
    return stringToBytes(path);
  }

  if (typeof path === 'number') {
    return path;
  }

  return path;
};

const normalizePaths = function(paths) {
  if (!Array.isArray(paths)) {
    return [normalizePath(paths)];
  }

  return paths.map((p) => normalizePath(p));
};

let DESCRIPTORS;

export const parseDescriptors = function(bytes) {
  bytes = toUint8(bytes);
  const results = [];
  let i = 0;

  while (bytes.length > i) {
    const tag = bytes[i];
    let size = 0;
    let headerSize = 0;

    // tag
    headerSize++;

    let byte = bytes[headerSize];

    // first byte
    headerSize++;

    while (byte & 0x80) {
      size = (byte & 0x7F) << 7;
      byte = bytes[headerSize];
      headerSize++;
    }

    size += byte & 0x7F;

    for (let z = 0; z < DESCRIPTORS.length; z++) {
      const {id, parser} = DESCRIPTORS[z];

      if (tag === id) {
        results.push(parser(bytes.subarray(headerSize, headerSize + size)));
        break;
      }
    }

    i += size + headerSize;
  }

  return results;

};

DESCRIPTORS = [
  {id: 0x03, parser(bytes) {
    const desc = {
      tag: 0x03,
      id: bytes[0] << 8 | bytes[1],
      flags: bytes[2],
      size: 3,
      dependsOnEsId: 0,
      ocrEsId: 0,
      descriptors: [],
      url: ''
    };

    // depends on es id
    if (desc.flags & 0x80) {
      desc.dependsOnEsId = bytes[desc.size] << 8 | bytes[desc.size + 1];
      desc.size += 2;
    }

    // url
    if (desc.flags & 0x40) {
      const len = bytes[desc.size];

      desc.url = bytesToString(bytes.subarray(desc.size + 1, desc.size + 1 + len));

      desc.size += len;
    }

    // ocr es id
    if (desc.flags & 0x20) {
      desc.ocrEsId = bytes[desc.size] << 8 | bytes[desc.size + 1];
      desc.size += 2;
    }

    desc.descriptors = parseDescriptors(bytes.subarray(desc.size)) || [];

    return desc;
  }},
  {id: 0x04, parser(bytes) {
    // DecoderConfigDescriptor
    const desc = {
      tag: 0x04,
      oti: bytes[0],
      streamType: bytes[1],
      bufferSize: bytes[2] << 16 | bytes [3] << 8 | bytes[4],
      maxBitrate: bytes[5] << 24 | bytes[6] << 16 | bytes [7] << 8 | bytes[8],
      avgBitrate: bytes[9] << 24 | bytes[10] << 16 | bytes [11] << 8 | bytes[12],
      descriptors: parseDescriptors(bytes.subarray(13))
    };

    return desc;
  }},
  {id: 0x05, parser(bytes) {
    // DecoderSpecificInfo

    return {tag: 0x05, bytes};
  }},
  {id: 0x06, parser(bytes) {
    // SLConfigDescriptor

    return {tag: 0x06, bytes};
  }}
];

export const findBox = function(bytes, paths) {
  paths = normalizePaths(paths);
  bytes = toUint8(bytes);

  let results = [];

  if (!paths.length) {
    // short-circuit the search for empty paths
    return results;
  }
  let i = 0;

  while (i < bytes.length) {
    const size = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const type = bytes.subarray(i + 4, i + 8);
    const end = size > 1 ? i + size : bytes.byteLength;

    if (bytesMatch(type, paths[0])) {
      if (paths.length === 1) {
        // this is the end of the path and we've found the box we were
        // looking for
        results.push(bytes.subarray(i + 8, end));
      } else {
        // recursively search for the next box along the path
        const subresults = findBox(bytes.subarray(i + 8, end), paths.slice(1));

        if (subresults.length) {
          results = results.concat(subresults);
        }
      }
    }

    i = end;
  }

  // we've finished searching all of bytes
  return results;
};

export const findNamedBox = function(bytes, path) {
  path = normalizePath(path);

  if (!path.length) {
    // short-circuit the search for empty paths
    return [];
  }

  let i = 0;

  while (i < bytes.length) {
    if (bytesMatch(bytes.subarray(i, i + path.length), path)) {
      const size = (bytes[i - 4] << 24 | bytes[i - 3] << 16 | bytes[i - 2] << 8 | bytes[i - 1]) >>> 0;
      const end = size > 1 ? i + size : bytes.byteLength;

      return bytes.subarray(i + 4, end);
    }

    i++;
  }

  // we've finished searching all of bytes
  return [];

};

export const parseTracks = function(bytes) {
  bytes = toUint8(bytes);

  const traks = findBox(bytes, ['moov', 'trak']);
  const tracks = [];

  traks.forEach(function(trak) {
    const track = {

    };
    const mdia = findBox(trak, ['mdia'])[0];
    const hdlr = findBox(mdia, ['hdlr'])[0];
    const stsd = findBox(mdia, ['minf', 'stbl', 'stsd'])[0];

    const trakType = bytesToString(hdlr.subarray(8, 12));

    if (trakType === 'soun') {
      track.type = 'audio';
    } else if (trakType === 'vide') {
      track.type = 'video';
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

      codec += `.${padStart(profile, 2, '0')}`;
      codec += `.${padStart(level, 2, '0')}`;
      codec += `.${padStart(bitDepth, 2, '0')}`;
      codec += `.${padStart(chromaSubsampling, 2, '0')}`;
      codec += `.${padStart(colourPrimaries, 2, '0')}`;
      codec += `.${padStart(transferCharacteristics, 2, '0')}`;
      codec += `.${padStart(matrixCoefficients, 2, '0')}`;
      codec += `.${padStart(videoFullRangeFlag, 2, '0')}`;
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
    track.codec = codec;

    // codec has no sub parameters
    tracks.push(track);
  });

  return tracks;
};
