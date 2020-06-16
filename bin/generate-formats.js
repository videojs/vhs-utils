#!/usr/bin/env node
/* eslint-disable no-console */
const shelljs = require('shelljs');
const childProcess = require('child_process');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'formats');
const DURATION = '0.01s';
const INPUT_FILE = path.join(__dirname, 'big-buck-bunny.mp4');

shelljs.rm('-rf', baseDir);

const promiseSpawn = function(bin, args, options = {}) {
  process.setMaxListeners(1000);

  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(bin, args, options);

    let stdout = '';
    let stderr = '';
    let out = '';

    child.stdout.on('data', function(chunk) {
      stdout += chunk;
      out += chunk;
    });

    child.stderr.on('data', function(chunk) {
      stderr += chunk;
      out += chunk;
    });

    const kill = () => child.kill();

    process.on('SIGINT', kill);
    process.on('SIGQUIT', kill);
    process.on('exit', kill);

    child.on('close', (status) => resolve({
      cmd: [bin].concat(args),
      status,
      out: out.toString(),
      stderr: stderr.toString(),
      stdout: stdout.toString()
    }));
  });
};

const ffmpeg = (args) => promiseSpawn('ffmpeg', [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-i', INPUT_FILE,
  '-t', DURATION
].concat(args));

const audioCodecs = [
  {audioCodec: 'aac', args: ['-c:a', 'aac', '-metadata', 'title="Big Buck Bunny"']},
  {audioCodec: 'mp4a.40.2', args: ['-c:a', 'aac']},
  {audioCodec: 'mp4a.40.5', args: ['-c:a', 'aac', '-profile:a', 'aac_he']},
  {audioCodec: 'mp4a.40.29', args: ['-c:a', 'aac', '-profile:a', 'aac_he_v2']},
  {audioCodec: 'mp4a.40.34', args: ['-c:a', 'mp3']},
  {audioCodec: 'mp3', args: ['-c:a', 'mp3', '-metadata', 'title="Big Buck Bunny"']},
  {audioCodec: 'opus', args: ['-c:a', 'libopus']},
  {audioCodec: 'ac-3', args: ['-c:a', 'ac3']},
  {audioCodec: 'ec-3', args: ['-c:a', 'eac3']},
  {audioCodec: 'vorbis', args: ['-c:a', 'libvorbis']},
  {audioCodec: 'flac', args: ['-c:a', 'flac']},
  {audioCodec: 'alac', args: ['-c:a', 'alac']},
  {audioCodec: 'speex', args: ['-c:a', 'speex']}
];

const videoCodecs = [
  // TODO: use another encoder, ffmpeg does not support codecPrivate for vp09
  // TODO: generate more formats
  // profile.level.depth.chroma.[color-primary].[transferchar].[matrixco].[blacklevel]
  {videoCodec: 'vp09.01.00.00.00.00.00.20.00', args: ['-c:v', 'vp9']},
  {videoCodec: 'vp8', args: ['-c:v', 'vp8']},
  {videoCodec: 'theora', args: ['-c:v', 'theora']},
  {videoCodec: 'avc1.42c00d', args: ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '1.3']},
  {videoCodec: 'avc1.4d401e', args: ['-c:v', 'libx264', '-profile:v', 'main', '-level', '3.0']},
  {videoCodec: 'avc1.640028', args: ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0']},

  // https://trac.ffmpeg.org/ticket/2901
  // aka profile is first 4 bits, level is second 4 bits
  {videoCodec: 'mp4v.20.9', args: ['-c:v', 'mpeg4', '-profile:v', '0', '-level', '9']},
  {videoCodec: 'mp4v.20.240', args: ['-c:v', 'mpeg4', '-profile:v', '15', '-level', '0']},
  {videoCodec: 'hvc1.1.6.H120.90', args: ['-c:v', 'libx265', '-tag:v', 'hvc1', '-x265-params', 'profile=main12:level-idc=4.0']},
  {videoCodec: 'hev1.1.6.H150.90', args: ['-c:v', 'libx265', '-x265-params', 'profile=main12:level-idc=5.0']},
  {videoCodec: 'hev1.1.6.L60.90', args: ['-c:v', 'libx265', '-x265-params', 'profile=main12:level-idc=4.0:no-high-tier']},
  {videoCodec: 'hev1.1.6.H120.90', args: ['-c:v', 'libx265', '-x265-params', 'profile=main12:level-idc=4.0']},
  {videoCodec: 'hev1.4.10.H120.9c.8', args: ['-c:v', 'libx265', '-pix_fmt', 'yuv444p10', '-x265-params', 'profile=main12:level-idc=4.0']},

  // TODO: generate more av1 formats
  {videoCodec: 'av01.0.00M.08.0.110', args: ['-strict', 'experimental', '-c:v', 'av1', '-cpu-used', '8']}
];

const buildCodecs = (changeFn) => {
  const allCodecs = [];

  const find = ({audioCodec, videoCodec}) =>
    allCodecs.find((c) => c.audioCodec === audioCodec && c.videoCodec === videoCodec);

  videoCodecs.forEach(function({args, videoCodec}) {
    args = args.slice();
    args.unshift('-an');
    const changed = changeFn({args, videoCodec});

    if (changed && !find(changed)) {
      allCodecs.push(changed);
    }
  });

  audioCodecs.forEach(function({args, audioCodec}) {
    args = args.slice();
    args.unshift('-vn');
    const changed = changeFn({args, audioCodec});

    if (changed && !find(changed)) {
      allCodecs.push(changed);
    }
  });

  videoCodecs.forEach(function(video) {
    audioCodecs.forEach(function(audio) {
      const changed = changeFn({
        audioCodec: audio.audioCodec,
        videoCodec: video.videoCodec,
        args: video.args.slice().concat(audio.args.slice())
      });

      if (changed && !find(changed)) {
        allCodecs.push(changed);
      }
    });
  });

  return allCodecs;
};

const containerCodecs = {
  mp4: buildCodecs((c) => {
    if (c.audioCodec && (/^(alac|flac|opus|speex)/).test(c.audioCodec)) {
      return null;
    }

    if (c.videoCodec && (/^(vp8|theora)/).test(c.videoCodec)) {
      return null;
    }

    return c;
  }),
  mov: buildCodecs((c) => {
    if (c.audioCodec && (/^(flac|opus)/).test(c.audioCodec)) {
      return null;
    }

    if (c.videoCodec && (/^(vp8|vp9|vp09|av01)/.test(c.videoCodec))) {
      return null;
    }

    return c;
  }),
  mkv: buildCodecs((c) => {
    // hvc1 is an mp4 only codec designation
    if (c.videoCodec && (/^hvc1/).test(c.videoCodec)) {
      return null;
    }

    // ffmpeg does not support codecPrivate for vp9
    // so we can only use the base codec
    if (c.videoCodec && (/^vp09|vp9/).test(c.videoCodec)) {
      c.videoCodec = 'vp9';
    }

    return c;
  }),
  webm: buildCodecs((c) => {
    if (c.videoCodec && !(/^(av01|vp8|vp09|vp9)/).test(c.videoCodec)) {
      return null;
    }

    // ffmpeg does not support codecPrivate for vp9
    // so we can only use the base codec
    if (c.videoCodec && (/^vp09|vp9/).test(c.videoCodec)) {
      c.videoCodec = 'vp9';
    }

    if (c.audioCodec && !(/^(vorbis|opus)/).test(c.audioCodec)) {
      return null;
    }

    return c;
  }),
  avi: buildCodecs((c) => {
    if (c.videoCodec && (/^(hvc1)/).test(c.videoCodec)) {
      return null;
    }

    // verify that a correctly tagged avi file works
    // ffmpeg doesn't do this...
    if (c.videoCodec && c.videoCodec === 'hev1.4.10.H120.9c.8') {
      c.args.push('-tag:v', 'HEVC');
    }

    if (c.audioCodec && (/^(opus|alac)/).test(c.audioCodec)) {
      return null;
    }

    // avi does not support codec parameters
    const match = c.videoCodec && c.videoCodec.match(/^(av01|vp09|vp9)/);

    if (match && match[1]) {
      if (match[1] === 'vp09') {
        c.videoCodec = 'vp9';
      } else {
        c.videoCodec = match[1];
      }
    }

    return c;
  }),
  ts: buildCodecs((c) => {
    if (c.videoCodec && (/^(vp8|vp09|vp9|theora|hvc1|av01)/).test(c.videoCodec)) {
      return null;
    }

    if (c.audioCodec && (/^(mp4a.40.29|mp4a.40.5|alac|vorbis|flac|speex)/).test(c.audioCodec)) {
      return null;
    }

    // ts does not support codec parameters
    const match = c.videoCodec && c.videoCodec.match(/^(mp4v.20)/);

    if (match && match[1]) {
      c.videoCodec = match[1];
    }

    return c;
  }),
  ogg: buildCodecs((c) => {
    // ogg only supports theora/vp8 video
    if (c.videoCodec && !(/^(vp8|theora)/).test(c.videoCodec)) {
      return null;
    }

    // ogg only supports flac, opus, speex, vorbis audio
    if (c.audioCodec && !(/^(flac|opus|speex|vorbis)/).test(c.audioCodec)) {
      return null;
    }

    return c;
  }),
  wav: buildCodecs((c) => {
    // wav does not support video
    if (c.videoCodec || !c.audioCodec) {
      return null;
    }

    if ((/^(alac|opus)/).test(c.audioCodec)) {
      return null;
    }

    return c;

  }),
  aac: buildCodecs((c) => {
    // wav does not support video
    if (c.videoCodec || !c.audioCodec) {
      return null;
    }

    if (!(/^(aac|mp4a.40.2)$/).test(c.audioCodec)) {
      return null;
    }

    return c;
  }),
  mp3: buildCodecs((c) => {
    // wav does not support video
    if (c.videoCodec || !c.audioCodec) {
      return null;
    }

    if (!(/^(mp3|mp4a.40.34)$/).test(c.audioCodec)) {
      return null;
    }

    return c;
  }),
  ac3: [{audioCodec: 'ac-3', args: ['-vn', '-c:a', 'ac3']}],
  flac: [{audioCodec: 'flac', args: ['-vn', '-c:a', 'flac']}],
  h264: buildCodecs((c) => {
    // h264 only supports hevc video content
    if (c.audioCodec || !c.videoCodec) {
      return null;
    }

    if (!(/^avc1/).test(c.videoCodec)) {
      return null;
    }

    return c;
  }),
  h265: buildCodecs((c) => {
    // h265 only supports hevc video content
    if (c.audioCodec || !c.videoCodec) {
      return null;
    }

    if (!(/^hev1/).test(c.videoCodec)) {
      return null;
    }

    return c;
  })
};

let total = 0;

const promises = Object.keys(containerCodecs).map((container) => {
  const codecs = containerCodecs[container];
  const containerPath = path.join(baseDir, container);

  shelljs.mkdir('-p', containerPath);

  return Promise.all(codecs.map((codec) => new Promise((resolve, reject) => {
    const fileName = [codec.videoCodec, codec.audioCodec].filter(Boolean).join(',') + '.' + container;
    const filePath = path.join(containerPath, fileName);

    return resolve(ffmpeg([].concat(codec.args).concat([filePath])).then(function(result) {
      if (result.status !== 0) {
        console.log(result.cmd.join(' '));
        console.log(`FAIL: ${fileName} ${result.out}`);
        return;
      }
      total++;
    }));
  })));
});

Promise.all(promises).then(function(args) {
  console.log(`Wrote ${total} files!`);
});
