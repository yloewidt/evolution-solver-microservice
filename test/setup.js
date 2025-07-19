import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.GCP_PROJECT_ID = 'test-project';
process.env.FIRESTORE_DATABASE = 'test-db';
process.env.FIRESTORE_COLLECTION = 'test-collection';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error
};