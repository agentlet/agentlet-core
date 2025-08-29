module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Custom rules for agentlet-core
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation changes
        'style',    // Code style changes (formatting, etc)
        'refactor', // Refactoring existing code
        'perf',     // Performance improvements
        'test',     // Adding or updating tests
        'build',    // Build system changes
        'ci',       // CI/CD changes
        'chore',    // Maintenance tasks
        'revert',   // Reverting changes
        'disable',  // Disabling features/functionality
        'simplify', // Simplifying code/architecture
        'config',   // Configuration changes
      ],
    ],
    'subject-case': [
      2,
      'never',
      ['upper-case', 'pascal-case', 'start-case']
    ],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 72],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
};