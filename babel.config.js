module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
          alias: {
            '@components': './src/components',
            '@hooks': './src/hooks',
            '@native': './src/native',
            '@utils': './src/utils'
          }
        }
      ],
      'react-native-reanimated/plugin'
    ]
  };
};
