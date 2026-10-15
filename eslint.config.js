// ESLint (`npm run lint`): fanger udefinerte variabler, skrivefeil og død kode. Ingen stilregler.
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'tools/out/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-self-assign': 'warn',
    },
  },
  {
    files: ['tools/**/*.mjs'],
    // Scenariene kjører kode både i Node og i nettleseren (page.evaluate)
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
];
