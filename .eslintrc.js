/**
 * ESLint configuration for the Tine project.
 * This enforces consistent code style across JavaScript and TypeScript files.
 */
module.exports = {
  root: true,
  extends: [
    '@react-native-community',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended'
  ],
  env: {
    es6: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx']
      }
    }
  },
  rules: {
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        trailingComma: 'all'
      }
    ]
  }
};
