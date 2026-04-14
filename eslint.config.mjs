import eslint from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import jest from 'eslint-plugin-jest';

export default defineConfig([
  globalIgnores(['build', 'ecqm-content*']),
  eslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    files: ['test/**', '**/*.test.js'],
    plugins: { jest },
    languageOptions: {
      globals: jest.environments.globals.globals
    },
    rules: {
      ...jest.configs.recommended.rules,
      'jest/prefer-to-have-length': 'warn',
      'jest/expect-expect': ['error', { assertFunctionNames: ['expect', 'supertest.**.expect'] }]
    }
  }
]);
