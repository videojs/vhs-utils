const mpegurlRE = /^(audio|video|application)\/(x-|vnd\.apple\.)?mpegurl/i;
const dashRE = /^application\/dash\+xml/i;

/**
 * Returns a string that describes the type of source based on a video source object's
 * media type.
 *
 * @see {@link https://dev.w3.org/html5/pf-summary/video.html#dom-source-type|Source Type}
 *
 * @param {string} type
 *        Video source object media type
 * @return {('hls'|'dash'|'vhs-json'|null)}
 *         VHS source type string
 */
export const simpleTypeFromSourceType = (type) => {
  if (mpegurlRE.test(type)) {
    return 'hls';
  }

  if (dashRE.test(type)) {
    return 'dash';
  }

  // Denotes the special case of a pre-parsed manifest object passed in instead of the
  // traditional source URL.
  //
  // See https://en.wikipedia.org/wiki/Media_type for details on specifying media types.
  //
  // In this case, vnd is for vendor, VHS is for this project, and the +json suffix
  // identifies the structure of the media type.
  if (type === 'application/vnd.vhs+json') {
    return 'vhs-json';
  }

  return null;
};
