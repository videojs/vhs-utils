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

  parse containers and codecs given a media file that contains that information.

  -h, --help      print help
  -v, --version   print the version
`);
};

const parseArgs = function(args) {
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((/^--version|-v$/).test(arg)) {
      console.log(`parse-format v${version}`);
      process.exit(0);
    } else if ((/^--help|-h$/).test(arg)) {
      showHelp();
      process.exit(0);
    } else {
      options.files = options.files || [];
      options.files.push(arg);
    }
  }

  return options;
};

const options = parseArgs(process.argv.slice(2));

console.log();

Promise.all(options.files.map(function(file) {
  return new Promise(function(resolve, reject) {
    const stream = fs.createReadStream(path.resolve(file));
    let allData;
    let lastResult;

    stream.on('data', (chunk) => {
      allData = concatTypedArrays(allData, chunk);

      lastResult = parseFormatForBytes(allData);

      if (!Object.keys(lastResult.codecs).length) {
        return;
      }

      stream.destroy();
    });
    stream.on('error', reject);

    stream.on('close', () => {
      console.log(`Results for ${file}`);
      console.log(lastResult);
      if (!Object.keys(lastResult.codecs).length) {
        console.warn('WARNING no codecs found');
      }
      console.log();
      resolve();
    });
  });
})).then(function() {
  console.log('All files read!');
  console.log();
  process.exit(0);
}).catch(function(e) {
  console.error(e);
  process.exit(1);
});
