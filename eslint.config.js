// Bridge configuration to support ESLint v9 flat config using the existing .eslintrc.js rules.
const { FlatCompat } = require('@eslint/eslintrc');
const path = require('path');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const sharedIgnores = [
  'dist/**',
  'dist/_expo/**',
  'node_modules/**',
  'coverage/**',
  'android/**',
  'ios/**',
];

const compatConfig = compat
  .config({ extends: [path.join(__dirname, '.eslintrc.js')] })
  .map((config) => ({
    ...config,
    ignores: [...sharedIgnores, ...(config.ignores ?? [])],
  }));

module.exports = [
  {
    languageOptions: {
      globals: {
        __dirname: 'readonly',
      },
    },
    ignores: sharedIgnores,
  },
  ...compatConfig,
  {
    languageOptions: {
      parserOptions: {
        project: path.join(__dirname, 'tsconfig.json'),
        tsconfigRootDir: __dirname,
      },
    },
    ignores: sharedIgnores,
  },
  {
    rules: {
      'node/handle-callback-err': 'off',
      'node/no-unsupported-features/es-syntax': 'off',
      'node/no-unsupported-features/es-builtins': 'off',
    },
  },
];
