import { jest } from '@jest/globals';
import { createMockLogger } from './helpers/index.js';

// Mock logger first to prevent console output during tests
const mockLogger = createMockLogger();

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger
}));