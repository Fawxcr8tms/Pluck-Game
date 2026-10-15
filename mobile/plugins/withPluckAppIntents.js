const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const FILE = 'PluckAppIntents.swift';

/** Copies the App Intent into the iOS app target so Shortcuts can find "Cut Sticker with Pluck". */
module.exports = function withPluckAppIntents(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectName = cfg.modRequest.projectName;
      const dest = path.join(cfg.modRequest.platformProjectRoot, projectName, FILE);
      fs.copyFileSync(path.join(__dirname, 'app-intents', FILE), dest);
      return cfg;
    },
  ]);

  return withXcodeProject(config, (cfg) => {
    const projectName = cfg.modRequest.projectName;
    const filepath = `${projectName}/${FILE}`;
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: projectName, project: cfg.modResults });
    }
    return cfg;
  });
};
