const fs = require('fs');
const path = require('path');
const baseDir = path.join(__dirname, '..');
const formatDir = path.join(baseDir, 'formats');

const getFiles = () => (fs.readdirSync(formatDir) || []).reduce((acc, d) => {
  d = path.resolve(formatDir, d);

  const stat = fs.statSync(d);

  if (!stat.isDirectory()) {
    return acc;
  }

  const subfiles = fs.readdirSync(d).map((f) => path.resolve(d, f));

  return acc.concat(subfiles);
}, []);

const buildFormatsString = function() {
  const formatData = {};

  getFiles().forEach((file) => {
    // read the file directly as a buffer before converting to base64
    const base64 = fs.readFileSync(file).toString('base64');

    formatData[path.basename(file)] = base64;
  });

  const formatDataExportStrings = Object.keys(formatData).reduce((acc, key) => {
    // use a function since the segment may be cleared out on usage
    acc.push(`formatFiles['${key}'] = () => {
        cache['${key}'] = cache['${key}'] || base64ToUint8Array('${formatData[key]}');
        const dest = new Uint8Array(cache['${key}'].byteLength);
        dest.set(cache['${key}']);
        return dest;
      };`);
    return acc;
  }, []);

  const formatFile =
    '/* istanbul ignore file */\n' +
    '\n' +
    `import base64ToUint8Array from "${path.resolve(baseDir, 'src/decode-b64-to-uint8-array.js')}";\n` +
    'const cache = {};\n' +
    'const formatFiles = {};\n' +
    formatDataExportStrings.join('\n') +
    'export default formatFiles';

  return formatFile;
};

/* we refer to them as .js, so that babel and other plugins can work on them */
const formatsKey = 'create-test-data!formats.js';

module.exports = function() {
  return {
    name: 'createTestData',
    buildStart() {
      this.addWatchFile(formatDir);

      getFiles().forEach((file) => this.addWatchFile(file));
    },
    resolveId(importee, importer) {
      // if this is not an id we can resolve return
      if (importee.indexOf('create-test-data!') !== 0) {
        return;
      }

      const name = importee.split('!')[1];

      return (name.indexOf('formats') !== -1) ? formatsKey : null;
    },
    load(id) {
      if (id === formatsKey) {
        return buildFormatsString.call(this);
      }
    }
  };
};
