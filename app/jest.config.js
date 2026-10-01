const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
  // Jest's 5s default is a cold-cache trap here: the heavier render suites
  // (money, cost, feed, terminal) transform a lot on first run and cascade
  // into dozens of timeout "failures" that look like real defects and have
  // repeatedly cost agents a diagnosis detour. Warm, these finish in
  // milliseconds; the ceiling only ever fires on a cold babel cache.
  testTimeout: 20000,
  // setupFiles replaces rather than merges with the preset's, so the preset's
  // own entries are re-listed ahead of our own setup.
  setupFiles: [
    ...expoPreset.setupFiles,
    '<rootDir>/jest.setup.js',
  ],
};
