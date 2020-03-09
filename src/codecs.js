import window from 'global/window';

const videoCodecRegex = RegExp('^(av1|avc0?[1234]|vp0?[89]|hvc1|hev1|theora|mp4v)');
const audioCodecRegex = RegExp('^(mp4a|flac|vorbis|opus|ac-[34]|ec-3|alac)');

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
  const result = {codecCount: 0};

  codecs.forEach(function(codec) {
    codec = codec.trim();

    const videoCodecMatch = videoCodecRegex.exec(codec);
    const audioCodecMatch = audioCodecRegex.exec(codec);

    if (videoCodecMatch && videoCodecMatch.length > 1) {
      result.videoCodec = videoCodecMatch[1];
      result.videoObjectTypeIndicator = codec.replace(result.videoCodec, '');
      result.codecCount++;
    }

    if (audioCodecMatch && audioCodecMatch.length > 1) {
      result.audioCodec = audioCodecMatch[1];
      result.audioProfile = codec.replace(result.audioCodec, '');
      result.codecCount++;
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

export const isVideoCodec = (codec) => videoCodecRegex.test(codec.trim().toLowerCase());
export const isAudioCodec = (codec) => audioCodecRegex.test(codec.trim().toLowerCase());
export const muxerSupportsCodec = (codecString) => codecString.split(',').every(function(codec) {
  codec = codec.trim().toLowerCase();

  if (muxerVideoRegex.test(codec) || muxerAudioRegex.test(codec)) {
    return true;
  }
});

export const browserSupportsCodec = (codecString) => window.MediaSource &&
  window.MediaSource.isTypeSupported &&
  window.MediaSource.isTypeSupported(`video/mp4; codecs="${mapLegacyAvcCodecs(codecString)}"`) || false;
export const isCodecSupported = (codecString) =>
  muxerSupportsCodec(codecString) && browserSupportsCodec(codecString);

export const DEFAULT_AUDIO_CODEC = 'mp4a.40.2';
export const DEFAULT_VIDEO_CODEC = 'avc1.4d400d';

