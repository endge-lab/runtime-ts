import antfu from '@antfu/eslint-config'

export default antfu({ markdown: false, typescript: true }, {
  ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/test/fixtures/**'],
}, {
  files: ['src/**/*.ts'],
  rules: {
    'curly': ['error', 'all'],
    'style/max-statements-per-line': 'off',
    '@typescript-eslint/consistent-type-imports': 'error',
  },
}, {
  files: ['src/**/*Module.ts', 'src/**/*_Module.ts', 'src/**/*Federation.ts'],
  rules: {
    '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
  },
})
