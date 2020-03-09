import window from 'global/window';

const mp4Regex = RegExp('^(av0?1|avc0?[1234]|vp0?9|flac|opus|mp3|mp4a|mp4v)');
const webmRegex = RegExp('^(vp0?[89]|av0?1|opus|vorbis)');
const oggRegex = RegExp('^(vp0?[89]|theora|flac|opus|vorbis)');

const videoCodecRegex = RegExp('^(av0?1|avc0?[1234]|vp0?[89]|hvc1|hev1|theora|mp4v)');
const audioCodecRegex = RegExp('^(mp4a|flac|vorbis|opus|ac-[34]|ec-3|alac|mp3)');

const muxerVideoRegex = RegExp('^(avc0?1)');
const muxerAudioRegex = RegExp('^(mp4a)');

/**
 * Replace the old apple-style `avc1.<dd>.<dd>` codec string with the standard
 * `avc1.<hhhhhh>`
 *
 * @param {string} codec
 *        Codec string to translate
 * @return {string}
 *         The translated codec string
 */
export const translateLegacyCodec = function(codec) {
  if (!codec) {
    return codec;
  }

  return codec.replace(/avc1\.(\d+)\.(\d+)/i, function(orig, profile, avcLevel) {
    const profileHex = ('00' + Number(profile).toString(16)).slice(-2);
    const avcLevelHex = ('00' + Number(avcLevel).toString(16)).slice(-2);

    return 'avc1.' + profileHex + '00' + avcLevelHex;
  });
};

/**
 * Replace the old apple-style `avc1.<dd>.<dd>` codec strings with the standard
 * `avc1.<hhhhhh>`
 *
 * @param {string[]} codecs
 *        An array of codec strings to translate
 * @return {string[]}
 *         The translated array of codec strings
 */
export const translateLegacyCodecs = function(codecs) {
  return codecs.map(translateLegacyCodec);
};

/**
 * Replace codecs in the codec string with the old apple-style `avc1.<dd>.<dd>` to the
 * standard `avc1.<hhhhhh>`.
 *
 * @param {string} codecString
 *        The codec string
 * @return {string}
 *         The codec string with old apple-style codecs replaced
 *
 * @private
 */
export const mapLegacyAvcCodecs = function(codecString) {
  return codecString.replace(/avc1\.(\d+)\.(\d+)/i, (match) => {
    return translateLegacyCodecs([match])[0];
  });
};

/**
 * @typedef {Object} ParsedCodecInfo
 * @property {number} codecCount
 *           Number of codecs parsed
 * @property {string} [videoCodec]
 *           Parsed video codec (if found)
 * @property {string} [videoObjectTypeIndicator]
 *           Video object type indicator (if found)
 * @property {string|null} audioProfile
 *           Audio profile
 */

/**
 * Parses a codec string to retrieve the number of codecs specified, the video codec and
 * object type indicator, and the audio profile.
 *
 * @param {string} [codecString]
 *        The codec string to parse
 * @return {ParsedCodecInfo}
 *         Parsed codec info
 */
export const parseCodecs = function(codecString = '') {
  const codecs = codecString.toLowerCase().split(',');
  const result = {};

  codecs.forEach(function(codec) {
    codec = translateLegacyCodec(codec.trim());

    const videoCodecMatch = videoCodecRegex.exec(codec);
    const audioCodecMatch = audioCodecRegex.exec(codec);

    if (videoCodecMatch && videoCodecMatch.length > 1) {
      result.video = {
        type: videoCodecMatch[1],
        details: codec.replace(videoCodecMatch[1], '')
      };
    }

    if (audioCodecMatch && audioCodecMatch.length > 1) {
      result.audio = {
        type: audioCodecMatch[1],
        details: codec.replace(audioCodecMatch[1], '')
      };
    }
  });

  return result;
};

/**
 * Returns a ParsedCodecInfo object for the default alternate audio playlist if there is
 * a default alternate audio playlist for the provided audio group.
 *
 * @param {Object} master
 *        The master playlist
 * @param {string} audioGroupId
 *        ID of the audio group for which to find the default codec info
 * @return {ParsedCodecInfo}
 *         Parsed codec info
 */
export const codecsFromDefault = (master, audioGroupId) => {
  if (!master.mediaGroups.AUDIO || !audioGroupId) {
    return null;
  }

  const audioGroup = master.mediaGroups.AUDIO[audioGroupId];

  if (!audioGroup) {
    return null;
  }

  for (const name in audioGroup) {
    const audioType = audioGroup[name];

    if (audioType.default && audioType.playlists) {
      // codec should be the same for all playlists within the audio type
      return parseCodecs(audioType.playlists[0].attributes.CODECS);
    }
  }

  return null;
};

export const isVideoCodec = (codec = '') => videoCodecRegex.test(codec.trim().toLowerCase());
export const isAudioCodec = (codec = '') => audioCodecRegex.test(codec.trim().toLowerCase());
export const muxerSupportsCodec = (codecString = '') => codecString.split(',').every(function(codec) {
  codec = codec.trim().toLowerCase();

  if (muxerVideoRegex.test(codec) || muxerAudioRegex.test(codec)) {
    return true;
  }
});

export const getMimeForCodec = (codecString) => {
  if (!codecString || typeof codecString !== 'string') {
    return;
  }
  const codecs = codecString
    .toLowerCase()
    .split(',')
    .map((c) => translateLegacyCodec(c.trim()));

  // default to video type
  let type = 'video';

  // only change to audio type if the only codec we have is
  // audio
  if (codecs.length === 1 && isAudioCodec(codecs[0])) {
    type = 'audio';
  }

  // default the container to mp4
  let container = 'mp4';

  // every codec must be able to go into the container
  // for that container to be the correct one
  if (codecs.every((c) => mp4Regex.test(c))) {
    container = 'mp4';
  } else if (codecs.every((c) => webmRegex.test(c))) {
    container = 'webm';
  } else if (codecs.every((c) => oggRegex.test(c))) {
    container = 'ogg';
  }

  return `${type}/${container};codecs="${codecs.join(',')}"`;
};

export const browserSupportsCodec = (codecString = '') => window.MediaSource &&
  window.MediaSource.isTypeSupported &&
  window.MediaSource.isTypeSupported(getMimeForCodec(codecString)) || false;
export const isCodecSupported = (codecString) =>
  muxerSupportsCodec(codecString) && browserSupportsCodec(codecString);

export const DEFAULT_AUDIO_CODEC = 'mp4a.40.2';
export const DEFAULT_VIDEO_CODEC = 'avc1.4d400d';

