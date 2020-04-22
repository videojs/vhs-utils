const generate = require('videojs-generate-rollup-config');
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(BASE_DIR, 'src');

const files = fs.readdirSync(SRC_DIR);

const shared = {
  externals(defaults) {
    defaults.module.push('url-toolkit');
    return defaults;
  }
};
const builds = [];

files.forEach(function(file, i) {
  const config = generate(Object.assign({}, shared, {
    input: path.relative(BASE_DIR, path.join(SRC_DIR, file)),
    distName: path.basename(file, path.extname(file))
  }));

  // gaurd against test only builds
  if (config.builds.module) {
    const module = config.builds.module;

    module.output = module.output.filter((o) => o.format === 'cjs');
    module.output[0].file = module.output[0].file.replace('.cjs.js', '.js');
    builds.push(module);
  }

  // gaurd against production only builds
  // only add the last test bundle we generate as they are all the same
  if (i === (files.length - 1) && config.builds.test) {
    builds.push(config.builds.test);
    const testNode = config.makeBuild('test', {
      input: 'test/**/*.test.js',
      output: [{
        name: `${config.settings.exportName}Tests`,
        file: 'test/dist/bundle-node.js',
        format: 'cjs'
      }]
    });

    testNode.output[0].globals = {};
    testNode.external = [].concat(config.settings.externals.module).concat([
      'qunit',
      'sinon'
    ]);

    builds.push(testNode);
  }
});

// export the builds to rollup
export default builds;
