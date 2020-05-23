import {toBinaryString, toUint8, toHexString} from './byte-helpers';

// TODO: export some common ebml tag ids

// TODO: support live streaming with all 1111s for getLength
// length in ebml is stored in the first 4 to 8 bits
// of the first byte. 4 for the id length and 8 for the
// data size length. Length is measured by converting the number to binary
// then 1 + the number of zeros before a 1 is encountered starting
// from the left.
export const getLength = function(byte, maxLen) {
  let len = 1;
  const binstr = toBinaryString(byte);

  for (let i = 0; i < binstr.length; i++) {
    if (binstr[i] === '1' || len === maxLen) {
      return len;
    }

    len++;
  }
};

export const findEbml = function(bytes, path) {
  bytes = toUint8(bytes);

  let i = 0;
  let results = [];

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

    // Grab the data size bytes
    const dataSizeBytes = Array.prototype.slice.call(bytes.subarray(i + idLen, i + idLen + dataSizeLen));

    // remove dataSizeLen bytes from dataSizeBytes. We do this because unlike id
    // these bytes are not part of the dataSize.
    dataSizeBytes[0] = parseInt(toBinaryString(dataSizeBytes[0]).slice(dataSizeLen) || '0', 2);

    // TODO: support bigint.
    // Finally convert data size to a single decimal number.
    const dataSize = parseInt(toHexString(dataSizeBytes), 16);

    const dataStart = i + idLen + dataSizeLen;
    const dataEnd = dataStart + dataSize;
    // Phew, almost done. Grab the data that this tag contains.
    const data = bytes.subarray(dataStart, dataEnd);

    if (path[0].toLowerCase() === toHexString(id)) {
      if (path.length === 1) {
        // this is the end of the path and we've found the tag we were
        // looking for
        results.push(data);
      } else {
        // recursively search for the next tag inside of the data
        // of this one
        const subresults = findEbml(data, path.slice(1));

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
