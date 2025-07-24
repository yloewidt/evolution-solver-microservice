import { jest } from '@jest/globals';

// Mock logger first to prevent console output during tests
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger
}));