import {toUint8, bytesMatch} from './byte-helpers.js';
const ID3 = toUint8([0x49, 0x44, 0x33]);

export const getId3Offset = function(bytes) {
  bytes = toUint8(bytes);

  if (bytes.length < 10 || !bytesMatch(bytes, ID3)) {
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

