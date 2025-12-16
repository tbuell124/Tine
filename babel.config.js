// babel.config.js
module.exports = function (api) {
  // Configure caching without blocking plugins that also use cache.using()
  api.cache.using(() => process.env.NODE_ENV ?? 'development');

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@components': './src/components',
            '@hooks': './src/hooks',
            '@native': './src/native',
            '@utils': './src/utils',
            '@state': './src/state',
          },
        },
      ],
      '@babel/plugin-proposal-export-namespace-from',
      'react-native-worklets/plugin', // must be last
    ],
  };
};
