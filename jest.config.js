const path = require('path');
const { defaults: tsjPreset } = require('ts-jest/presets');

const esModules = ['@agm', 'ngx-bootstrap'].join('|');

module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  // A set of global variables that need to be available in all test environments
  globals: {
    'ts-jest': {
      tsconfig: path.join(__dirname, './tsconfig.json'),
      isolatedModules: true,
      diagnostics: true,
    },
  },

  // An array of directory names to be searched recursively up from the requiring module's location
  moduleDirectories: [process.env.NODE_PATH || '<rootDir>/src', 'node_modules'],

  // A preset that is used as a base for Jest's configuration
  preset: 'ts-jest/presets/js-with-ts',

  // Automatically reset mock state between every test
  resetMocks: true,

  // Automatically restore mock state between every test
  restoreMocks: true,

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: [
    "/node_modules/",
    "/example/"
  ],
};
