#!/usr/bin/env node

const {parseFormatForBytes} = require('../dist/format-parser.js');
const {concatTypedArrays} = require('../dist/byte-helpers.js');
const fs = require('fs');
const path = require('path');

const stream = fs.createReadStream(path.resolve(process.argv[2]));
let allData;

stream.on('data', (chunk) => {
  allData = concatTypedArrays(allData, chunk);

  const result = parseFormatForBytes(allData);

  if (!Object.keys(result.codecs).length) {
    return;
  }

  // eslint-disable-next-line
  console.log(result);
  process.exit(0);
});
