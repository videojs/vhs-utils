export const countBits = (x) => Math.ceil((Math.log2 ? Math.log2(x) : (Math.log(x) / Math.log(2))));
export const padStart = (b, len, str = ' ') => (str.repeat(len) + b.toString()).slice(-len);
export const isTypedArray = (obj) => ArrayBuffer.isView(obj);
export const toUint8 = function(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }

  if (!Array.isArray(bytes) && !isTypedArray(bytes) && !(bytes instanceof ArrayBuffer)) {
    // any non-number or NaN leads to emtpy uint8array
    // eslint-disable-next-line
    if (typeof bytes !== 'number' || (typeof bytes === 'number' && bytes !== bytes)) {
      bytes = [];
    } else {
      bytes = [bytes];
    }
  }

  return new Uint8Array(
    bytes && bytes.buffer || bytes,
    bytes && bytes.byteOffset || 0,
    bytes && bytes.byteLength || 0
  );
};

export const toHexString = function(bytes) {
  bytes = toUint8(bytes);

  return bytes.reduce(function(acc, b) {
    return acc + padStart(b.toString(16), 2, '0');
  }, '');
};

export const toBinaryString = function(bytes) {
  bytes = toUint8(bytes);

  return bytes.reduce(function(acc, b) {
    return acc + padStart(b.toString(2), 8, '0');
  }, '');
};

export const bytesToNumber = function(bytes, signed) {
  let number = parseInt(toHexString(bytes), 16);

  if (signed) {
    number -= Math.pow(2, bytes.length * 7 - 1) - 1;
  }

  return number;
};

export const numberToBytes = function(number) {
  // eslint-disable-next-line
  if (typeof number !== 'number' || (typeof number === 'number' && number !== number)) {
    return [0x00];
  }
  return number.toString(16).match(/.{1,2}/g).map((v) => parseInt(v, 16));
};
export const bytesToString = (bytes) => {
  if (!bytes) {
    return '';
  }

  bytes = Array.prototype.slice.call(bytes);

  const string = String.fromCharCode.apply(null, toUint8(bytes));

  try {
    return decodeURIComponent(escape(string));
  } catch (e) {
    // if decodeURIComponent/escape fails, we are dealing with partial
    // or full non string data. Just return the potentially garbled string.
  }

  return string;
};

export const stringToBytes = (string, stringIsBytes = false) => {
  const bytes = [];

  if (typeof string !== 'string' && string && typeof string.toString === 'function') {
    string = string.toString();
  }

  if (typeof string !== 'string') {
    return bytes;
  }

  // If the string already is bytes, we don't have to do this
  if (!stringIsBytes) {
    string = unescape(encodeURIComponent(string));
  }

  return string.split('').map((s) => s.charCodeAt(0) & 0xFF);
};

export const concatTypedArrays = (...buffers) => {
  buffers = buffers.filter((b) => b && (b.byteLength || b.length) && typeof b !== 'string');

  if (buffers.length <= 1) {
    // for 0 length we will return empty uint8
    // for 1 length we return the first uint8
    return toUint8(buffers[0]);
  }

  const totalLen = buffers.reduce((total, buf, i) => total + (buf.byteLength || buf.length), 0);
  const tempBuffer = new Uint8Array(totalLen);

  let offset = 0;

  buffers.forEach(function(buf) {
    buf = toUint8(buf);

    tempBuffer.set(buf, offset);
    offset += buf.byteLength;
  });

  return tempBuffer;
};

/**
 * Check if the bytes "b" are contained within bytes "a".
 *
 * @param {Uint8Array|Array} a
 *        Bytes to check in
 *
 * @param {Uint8Array|Array} b
 *        Bytes to check for
 *
 * @param {Object} options
 *        options
 *
 * @param {Array|Uint8Array} [offset=0]
 *        offset to use when looking at bytes in a
 *
 * @param {Array|Uint8Array} [mask=[]]
 *        mask to use on bytes before comparison.
 *
 * @return {boolean}
 *         If all bytes in b are inside of a, taking into account
 *         bit masks.
 */
export const bytesMatch = (a, b, {offset = 0, mask = []} = {}) => {
  a = toUint8(a);
  b = toUint8(b);

  return b.length &&
    a.length - offset >= b.length &&
    b.every((bByte, i) => {
      const aByte = (mask[i] ? (mask[i] & a[offset + i]) : a[offset + i]);

      return bByte === aByte;
    });
};
