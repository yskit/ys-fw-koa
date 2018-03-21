const fs = require('fs');
const path = require('path');
module.exports = options => {
  if (!options.port) options.port = 8080;
  if (options.https) {
    if (!options.https.key) {
      throw new Error('detect error:', '`options.https.key` must be exists');
    }
    if (!options.https.cert) {
      throw new Error('detect error:', '`options.https.cert` must be exists');
    }
  }
  const appDir = path.resolve(options.baseDir, 'app');
  if (!fs.existsSync(appDir)) {
    throw new Error(`miss '${appDir}' dir when framework detecting`);
  }
}