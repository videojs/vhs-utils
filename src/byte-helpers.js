export const isTypedArray = (obj) => ArrayBuffer.isView(obj);
export const toUint8 = (bytes) => (bytes instanceof Uint8Array) ?
  bytes :
  new Uint8Array(
    bytes && bytes.buffer || bytes,
    bytes && bytes.byteOffset || 0,
    bytes && bytes.byteLength || 0
  );

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
