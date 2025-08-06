const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withRenameNotificationSound(config) {
  return withDangerousMod(config, ['android', config => {
    // Determine the Android raw directory:
    const rawDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'raw');
    // Source asset location (assumes the file is in the assets folder):
    const sourceFile = path.join(config.modRequest.projectRoot, 'assets', 'notification-sound.wav');
    // Target file with a valid name:
    const targetFile = path.join(rawDir, 'notification.wav');
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, targetFile);
      console.log('Copied and renamed notification sound to notification.wav');
    }
    return config;
  }]);
};
