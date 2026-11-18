import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

// Code-quality check: `npm run lint`. It reads the code only; it never runs the tests or touches the site.
export default tseslint.config(
  { ignores: ['node_modules/**', 'results/**', 'test-results/**', 'playwright-report/**', 'docs/**', '**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['modules/**/*.ts', 'core/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'playwright/no-wait-for-timeout': 'warn',
      'playwright/no-conditional-in-test': 'off',
      'playwright/no-conditional-expect': 'off',
      'playwright/expect-expect': 'off',
      'playwright/no-skipped-test': 'off',
      'playwright/valid-title': 'off',
      'playwright/no-standalone-expect': 'off',
      'playwright/no-element-handle': 'warn',
      'playwright/no-force-option': 'warn',
      'playwright/missing-playwright-await': 'error',
      'playwright/valid-describe-callback': 'off',
      'playwright/no-networkidle': 'warn',
      'playwright/prefer-web-first-assertions': 'warn',
      'playwright/prefer-locator': 'warn',
    },
  },
  { rules: { '@typescript-eslint/no-require-imports': 'off', 'no-useless-escape': 'warn', 'no-control-regex': 'off' } },
);
