import {stringToBytes, toUint8, bytesMatch} from './byte-helpers.js';

const normalizePath = function(path) {
  if (typeof path === 'string') {
    return stringToBytes(path, 16);
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
