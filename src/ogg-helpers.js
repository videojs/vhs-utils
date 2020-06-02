import {bytesToString, toUint8} from './byte-helpers';

export const getPages = function(bytes, start, end = Infinity) {
  bytes = toUint8(bytes);

  const pages = [];
  let i = 0;

  while (i < bytes.length && pages.length < end) {
    // we are unsynced,
    // find the next syncwork
    if (!(/^OggS$/).test(bytesToString(bytes.subarray(i, i + 4)))) {
      i++;
      continue;
    }

    const segmentLength = bytes[i + 27];

    pages.push(bytes.subarray(i, i + 28 + segmentLength));

    i += pages[pages.length - 1].length;
  }

  return pages.slice(start, end);
};
