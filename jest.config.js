export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^src/(.*)': '<rootDir>/src/$1',
    '^cloud/(.*)': '<rootDir>/cloud/$1'
  },
  testMatch: [
    '**/test/**/*.test.js'
  ],
  testTimeout: 30000,
  setupFilesAfterEnv: ['./test/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    'cloud/**/*.js',
    '!src/server.js',
    '!cloud/run/worker.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};