const generate = require('videojs-generate-rollup-config');
// see https://github.com/videojs/videojs-generate-rollup-config
// for options
const options = {
  input: 'src/index.js',
  exportName: 'vhsUtils',
  distName: 'vhs-utils'
};
const config = generate(options);

if (config.builds.module) {
  delete config.builds.module;
}

// Add additonal builds/customization here!

// export the builds to rollup
export default Object.values(config.builds);
