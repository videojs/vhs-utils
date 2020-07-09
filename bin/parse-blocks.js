#!/usr/bin/env node

/* eslint-disable no-console */

const {parseData} = require('../dist/ebml-helpers.js');
const {concatTypedArrays} = require('../dist/byte-helpers.js');
const fs = require('fs');
const path = require('path');

const stream = fs.createReadStream(path.resolve(process.argv[2]));
let allData;

stream.on('data', (chunk) => {
  allData = concatTypedArrays(allData, chunk);
});

stream.on('close', () => {
  const {blocks, tracks} = parseData(allData);

  console.log(tracks.length);
  console.log(blocks.length);
  if (blocks.length < 100) {
    console.log('block length failure');
  }

  const noFrames = blocks.find((b) => !b.frames.length);

  if (noFrames) {
    console.log('some blocks have no frames');
  }
  process.exit(0);
});

