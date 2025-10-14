module.exports = function (api) {
  api.cache(true);
  const isMetro = api.caller(c => c && (c.name === 'metro' || c.name === 'babel-transformer'));
  return {
    // Disable the preset’s auto-injection of reanimated:
    presets: [['babel-preset-expo', { reanimated: false }]],
    plugins: isMetro ? ['react-native-reanimated/plugin'] : [],
  };
};
