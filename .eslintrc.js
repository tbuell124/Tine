module.exports = {
  root: true,
  extends: [
    'universe/native',
    'universe/shared/typescript-analysis',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
  },
  rules: {
    'prettier/prettier': ['error', { endOfLine: 'lf' }],
  },
};
