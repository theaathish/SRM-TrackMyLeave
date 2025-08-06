module.exports = ({ config }) => {
  return {
    ...config,
    plugins: [
      './plugins/renameNotificationSound.plugin.js',
      // ...other plugins if any...
    ],
  };
};
