import {bytesToString, toUint8} from './byte-helpers.js';

export const getId3Offset = function(bytes) {
  bytes = toUint8(bytes);

  if (bytesToString(bytes.subarray(0, 3)) !== 'ID3') {
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
    return bytes.length >= 4 &&
      (bytes[0] & 0xFF) === 0x1A &&
      (bytes[1] & 0xFF) === 0x45 &&
      (bytes[2] & 0xFF) === 0xDF &&
      (bytes[3] & 0xFF) === 0xA3;
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
    return (bytes.length >= 189 && bytes[0] === 0x47 && bytes[188] === 0x47) ||
      (bytes.length >= 1 && bytes.length < 189 && bytes[0] === 0x47);
  },
  flac(bytes) {
    return bytes.length >= 4 && (/^fLaC$/).test(bytesToString(bytes.subarray(0, 4)));
  },
  ogg(bytes) {
    return bytes.length >= 4 && (/^OggS$/).test(bytesToString(bytes.subarray(0, 4)));
  }
};

const isLikelyTypes = Object.keys(isLikely);

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

export const requestAndDetectSegmentContainer = (uri, xhr, cb) => {
  const options = {
    responseType: 'arraybuffer',
    uri,
    headers: {Range: 'bytes=0-9'}
  };

  let request;

  const handleResponse = (err, response) => {
    const reqResponse = response.body || response.response;

    if (err) {
      return cb(err, request);
    }

    const bytes = toUint8(reqResponse);

    // we have an id3offset, download after that ends
    const id3Offset = getId3Offset(bytes);

    // we only need 2 bytes past the id3 offset for aac/mp3 data
    if (id3Offset) {
      options.headers = {Range: `bytes=${id3Offset}-${id3Offset + 1}`};

      request = xhr(options, handleResponse);
      return;
    }

    const type = detectContainerForBytes(bytes);

    // if we get "ts" back we need to check another single byte
    // to verify that the content is actually ts
    if (type === 'ts' && options.headers.Range === 'bytes=0-9') {
      options.headers = {Range: 'bytes=188-188'};
      request = xhr(options, handleResponse);
      return;
    }

    return cb(null, request, type);
  };

  request = xhr(options, handleResponse);

  return request;
};
