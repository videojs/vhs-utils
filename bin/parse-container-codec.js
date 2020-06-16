#!/usr/bin/env node

/* eslint-disable no-console */

const {parseFormatForBytes} = require('../dist/format-parser.js');
const {concatTypedArrays} = require('../dist/byte-helpers.js');
const fs = require('fs');
const path = require('path');

const stream = fs.createReadStream(path.resolve(process.argv[2]));
let allData;
let lastResult;

stream.on('data', (chunk) => {
  allData = concatTypedArrays(allData, chunk);

  lastResult = parseFormatForBytes(allData);

  if (!Object.keys(lastResult.codecs).length) {
    return;
  }

  console.log(lastResult);
  process.exit(0);
});

stream.on('close', () => {
  console.log('Error: codec(s) not found');
  console.log(lastResult);
  process.exit(1);
});

