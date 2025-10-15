// babel.config.js
module.exports = function (api) {
  // Configure caching without blocking plugins that also use cache.using()
  api.cache.using(() => process.env.NODE_ENV ?? 'development');

  return {
    presets: ['babel-preset-expo'],
    // No manual plugins; Expo will auto-inject Reanimated as needed.
  };
};
