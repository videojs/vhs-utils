#! /usr/bin/env node
/* eslint-disable no-console */
const {version} = require('../package.json');
const {parseData} = require('../dist/ebml-helpers.js');
const {concatTypedArrays} = require('../dist/byte-helpers.js');
const fs = require('fs');
const path = require('path');

const showHelp = function() {
  console.log(`
  parse-blocks [...file.webm|file.mkv]

  parse blocks and output block counts for a ebml format (webm/mkv) files
  so that we can compare counts against a reference spec.

  Test files can be found at https://github.com/Matroska-Org/matroska-test-files

  -h, --help      print help
  -v, --version   print the version
`);
};

const parseArgs = function(args) {
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((/^--version|-v$/).test(arg)) {
      console.log(`parse-blocks v${version}`);
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

    stream.on('data', (chunk) => {
      allData = concatTypedArrays(allData, chunk);
    });

    stream.on('error', reject);

    stream.on('close', () => {
      const {blocks, tracks} = parseData(allData);

      console.log(`Results for ${file}`);
      console.log(`Tracks Found ${tracks.length}`);
      console.log(`Blocks Found ${blocks.length}`);
      if (blocks.length < 100) {
        console.warn('WARNING: possible parsing issue. less than 100 blocks in file.');
      }

      const noFrames = blocks.find((b) => !b.frames.length);

      if (noFrames) {
        console.warn(`WARNING: possible parsing issue ${noFrames.length} block have no frames!`);
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
