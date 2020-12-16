#! /usr/bin/env node
/* eslint-disable no-console */
const {version} = require('../package.json');
const {parseFormatForBytes} = require('../dist/format-parser.js');
const {concatTypedArrays} = require('../dist/byte-helpers.js');
const fs = require('fs');
const path = require('path');

const showHelp = function() {
  console.log(`
  parse-format [...media-files]
  curl -s 'some-media-ulr' | parse-format
  wget -O - -o /dev/null 'some-media-url' | parse-format

  parse containers and codecs given a media file that contains that information.

  -h, --help      print help
  -v, --version   print the version
`);
};

const parseArgs = function(args) {
  const options = {files: []};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((/^--version|-v$/).test(arg)) {
      console.log(`parse-format v${version}`);
      process.exit(0);
    } else if ((/^--help|-h$/).test(arg)) {
      showHelp();
      process.exit(0);
    } else {
      options.files.push(arg);
    }
  }

  return options;
};

const cli = function(stdin) {
  const options = parseArgs(process.argv.slice(2));
  const streams = [];

  // if stdin was provided
  if (stdin) {
    streams.push({stream: process.stdin, file: 'stdin'});
  }

  options.files.forEach(function(file) {
    streams.push({stream: fs.createReadStream(path.resolve(file)), file});
  });

  return Promise.all(streams.map(({file, stream}) => new Promise(function(resolve, reject) {
    let allData;
    let lastResult;

    stream.on('data', (chunk) => {
      allData = concatTypedArrays(allData, chunk);
      lastResult = parseFormatForBytes(allData);

      if (lastResult && Object.keys(lastResult.codecs).length) {
        return stream.destroy();
      }
    });
    stream.on('error', reject);

    stream.on('close', () => {
      console.log(`Results for ${file}`);
      console.log(lastResult);
      if (lastResult && !Object.keys(lastResult.codecs).length) {
        console.warn('WARNING no codecs found');
      }
      console.log();
      resolve();
    });
  }))).then(function() {
    console.log('All files read!');
    console.log();
    process.exit(0);
  }).catch(function(e) {
    console.error(e);
    process.exit(1);
  });
};

// no stdin if isTTY is set
cli(!process.stdin.isTTY ? process.stdin : null);
