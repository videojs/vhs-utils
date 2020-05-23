import {bytesToString} from './byte-helpers.js';

export const findBox = function(bytes, path) {
  let results = [];

  if (!path.length) {
    // short-circuit the search for empty paths
    return null;
  }
  let i = 0;

  while (i < bytes.length) {
    const size = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const type = bytesToString(bytes.subarray(i + 4, i + 8));
    const end = size > 1 ? i + size : bytes.byteLength;

    if (type === path[0]) {
      if (path.length === 1) {
        // this is the end of the path and we've found the box we were
        // looking for
        results.push(bytes.subarray(i + 8, end));
      } else {
        // recursively search for the next box along the path
        const subresults = findBox(bytes.subarray(i + 8, end), path.slice(1));

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
