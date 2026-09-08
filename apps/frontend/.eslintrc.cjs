// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs')

// Find the project root by looking for tsconfig.json
// This works even when Trunk copies files to temp directories
/**
 * @param {string} startDir
 * @returns {string}
 */
function findProjectRoot(startDir) {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    const tsconfigPath = path.join(dir, 'tsconfig.json')
    if (fs.existsSync(tsconfigPath)) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return startDir
}

// Use process.cwd() as fallback (should be project root when Trunk runs)
const projectRoot = findProjectRoot(process.cwd()) || findProjectRoot(__dirname)
const tsconfigPath = path.join(projectRoot, 'tsconfig.json')

/** @type {import("eslint").Linter.Config} */
const config = {
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parserOptions: {
        project: [tsconfigPath],
        tsconfigRootDir: projectRoot,
      },
    },
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: [tsconfigPath],
    tsconfigRootDir: projectRoot,
  },
  plugins: ['@typescript-eslint', 'tailwindcss'],
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    // v8 successor of no-empty-interface, disabled for the same reason
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    // typescript-eslint v8 escalates these to errors in `recommended`;
    // kept at the pre-v8 severity until the codebase is cleaned up.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-expressions': 'warn',
    // '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/consistent-type-imports': [
      'warn',
      {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      },
    ],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-ignore': 'allow-with-description',
        minimumDescriptionLength: 3,
      },
    ],
  },
}

module.exports = config
