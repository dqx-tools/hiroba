// @ts-check
/* Globals */
import globals from 'globals';

/* Plugins */
import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import vitest from '@vitest/eslint-plugin';

export default ts.config(
  {
    ignores: ['dist/', 'coverage/', '.wrangler/'],
  },

  js.configs.recommended,
  ...ts.configs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  prettierConfig,

  // Application files
  {
    plugins: {
      vitest,
    },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.nodejs,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          minimumDescriptionLength: 3,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      'import-x/no-absolute-path': 'error',
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'import-x/no-duplicates': [
        'error',
        {
          'prefer-inline': true,
          considerQueryString: true,
        },
      ],
    },
  },

  // Node-based config files
  {
    files: ['**/*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2015,
      sourceType: 'commonjs',
    },
  },
);
