// Re-export from centralized helpers for backward compatibility
import { jest } from '@jest/globals';
import { createMockTaskHandler } from '../helpers/index.js';

export default jest.fn().mockImplementation(createMockTaskHandler);
