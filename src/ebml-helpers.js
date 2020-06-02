import {
  toUint8,
  bytesToNumber,
  bytesMatch,
  numberToBytes
} from './byte-helpers';

// relevant specs for this parser:
// https://matroska-org.github.io/libebml/specs.html
// https://www.matroska.org/technical/elements.html
// https://www.webmproject.org/docs/container/

export const EBML_TAGS = {
  EBML: toUint8([0x1A, 0x45, 0xDF, 0xA3]),
  DocType: toUint8([0x42, 0x82]),
  Segment: toUint8([0x18, 0x53, 0x80, 0x67]),
  Tracks: toUint8([0x16, 0x54, 0xAE, 0x6B]),
  Track: toUint8([0xAE]),
  TrackEntry: toUint8([0xAE]),
  TrackType: toUint8([0x83]),
  CodecID: toUint8([0x86]),

  // Not used yet, but will be used for live webm/mkv
  // see https://www.matroska.org/technical/basics.html#block-structure
  // see https://www.matroska.org/technical/basics.html#simpleblock-structure
  Cluster: toUint8([0x1F, 0x43, 0xB6, 0x75]),
  BlockGroup: toUint8([0xA0]),
  SimpleBlocks: toUint8([0xA3])
};

/**
 * This is a simple table to determine the length
 * of things in ebml. The length is one based (starts at 1,
 * rather than zero) and for every zero bit before a one bit
 * we add one to length. We also need this table because in some
 * case we have to xor all the length bits from another value.
 */
const LENGTH_TABLE = [
  // 0b10000000
  128,
  // 0b01000000
  64,
  // 0b00100000
  32,
  // 0b00010000
  16,
  // 0b00001000
  8,
  // 0b00000100
  4,
  // 0b00000010
  2,
  // 0b00000001
  1
];

// TODO: support live streaming with all 1111s for getLength
// length in ebml is stored in the first 4 to 8 bits
// of the first byte. 4 for the id length and 8 for the
// data size length. Length is measured by converting the number to binary
// then 1 + the number of zeros before a 1 is encountered starting
// from the left.
const getLength = function(byte, maxLen) {
  let len = 1;

  for (let i = 0; i < LENGTH_TABLE.length; i++) {
    if (byte & LENGTH_TABLE[i]) {
      break;
    }

    len++;
  }

  return len;
};

const normalizePath = function(path) {
  if (typeof path === 'string') {
    return path.match(/.{1,2}/g).map((p) => normalizePath(p));
  }

  if (typeof path === 'number') {
    return numberToBytes(path);
  }

  return path;
};

const normalizePaths = function(paths) {
  if (!Array.isArray(paths)) {
    return [normalizePath(paths)];
  }

  return paths.map((p) => normalizePath(p));
};

export const findEbml = function(bytes, paths) {
  paths = normalizePaths(paths);
  bytes = toUint8(bytes);
  let results = [];

  if (!paths.length) {
    return results;
  }

  let i = 0;

  while (i < bytes.length) {
    // get the length of the id from the first byte of id
    const idLen = getLength(bytes[i], 4);
    // get the id using the length, note that tag ids **always**
    // contain their id length bits still, while data size does not.
    const id = bytes.subarray(i, i + idLen);

    // get the data size length, aka the number of bits
    // that the actually size of the data take to describe.
    // for instance lets say the data length byte is
    // 0x11 which is 00010001 in binary. That would have a length of
    // 4. From there we know that the dataSize takes up 4 bytes.
    const dataSizeLen = getLength(bytes[i + idLen], 8);

    // Grab the data size bytes,
    // NOTE that we do **not** subarray here because we need to copy these bytes
    // as they will be modified below to remove the dataSizeLen bits and we do not
    // want to modify the original data. normally we could just call slice on
    // uint8array but ie 11 does not support that...
    const dataSizeBytes = Array.prototype.slice.call(bytes, i + idLen, i + idLen + dataSizeLen);

    // remove dataSizeLen bits from dataSizeBytes. We do this because
    // unlike id these are not part of the dataSize.
    if (typeof dataSizeBytes[0] !== 'undefined') {
      dataSizeBytes[0] ^= LENGTH_TABLE[dataSizeLen - 1];
    }

    // TODO: should we support bigint?
    // Finally convert data size to a single decimal number.
    const dataSize = bytesToNumber(dataSizeBytes);

    const dataStart = i + idLen + dataSizeLen;
    const dataEnd = (dataStart + dataSize) > bytes.length ? bytes.length : (dataStart + dataSize);
    // Phew, almost done. Grab the data that this tag contains.
    const data = bytes.subarray(dataStart, dataEnd);

    if (bytesMatch(paths[0], id)) {
      if (paths.length === 1) {
        // this is the end of the paths and we've found the tag we were
        // looking for
        results.push(data);
      } else {
        // recursively search for the next tag inside of the data
        // of this one
        const subresults = findEbml(data, paths.slice(1));

        if (subresults.length) {
          results = results.concat(subresults);
        }
      }
    }

    const totalLength = data.length + dataSizeLen + id.length;

    // move past this tag entirely, we are not looking for it
    i += totalLength;
  }

  return results;
};
