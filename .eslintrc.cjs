module.exports = {
  root: true,
  extends: ['@electron-toolkit/eslint-config-ts/recommended'],
  parserOptions: {
    project: ['./tsconfig.node.json', './tsconfig.web.json'],
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
  ignorePatterns: ['out', 'dist', 'node_modules', 'plugins'],
}
