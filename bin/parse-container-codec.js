#!/usr/bin/env node

const {detectCodecsAndContainerForBytes} = require('../dist/containers.js');
const fs = require('fs');
const path = require('path');

const stream = fs.createReadStream(path.resolve(process.argv[2]));

stream.on('data', (chunk) => {
  const result = detectCodecsAndContainerForBytes(chunk);

  if (result.container) {
    // eslint-disable-next-line
    console.log(result);
    process.exit(0);
  }
});
