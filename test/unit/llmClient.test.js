import { jest } from '@jest/globals';

// Mock OpenAI before imports
jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn()
    },
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

// Mock https for agent
jest.unstable_mockModule('https', () => ({
  default: {
    Agent: jest.fn().mockImplementation(() => ({}))
  }
}));

// Import after mocking
import logger from '../../src/utils/logger.js';
const { LLMClient } = await import('../../src/services/llmClient.js');

describe('LLMClient', () => {
  let client;
  let mockOpenAIInstance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create client and get mock instance
    client = new LLMClient();
    mockOpenAIInstance = client.client;
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(client.config.model).toBe('o3');
      expect(client.config.temperature).toBe(1); // Default o3 uses temperature 1
      expect(client.config.apiKey).toEqual(process.env.OPENAI_API_KEY || undefined);
    });

    it('should use temperature 1 when o3 is explicitly set', () => {
      const o3Client = new LLMClient({ model: 'o3' });
      expect(o3Client.config.temperature).toBe(1);
    });

    it('should accept custom config', () => {
      const customClient = new LLMClient({
        model: 'gpt-4',
        temperature: 0.5,
        apiKey: 'custom-key'
      });

      expect(customClient.config.model).toBe('gpt-4');
      expect(customClient.config.temperature).toBe(0.5);
      expect(customClient.config.apiKey).toBe('custom-key');
    });

    it('should use temperature 0.7 for non-o3 models', () => {
      const gptClient = new LLMClient({ model: 'gpt-4' });
      expect(gptClient.config.temperature).toBe(0.7);
    });
  });

  describe('getApiStyle', () => {
    it('should return openai for o3 models', () => {
      client.config.model = 'o3';
      expect(client.getApiStyle()).toBe('openai');

      client.config.model = 'o3-mini';
      expect(client.getApiStyle()).toBe('openai');
    });

    it('should return openai for o1 models', () => {
      client.config.model = 'o1-preview';
      expect(client.getApiStyle()).toBe('openai');
    });

    it('should return openai for gpt models', () => {
      client.config.model = 'gpt-4';
      expect(client.getApiStyle()).toBe('openai');

      client.config.model = 'gpt-3.5-turbo';
      expect(client.getApiStyle()).toBe('openai');
    });

    it('should return openai for unknown models', () => {
      client.config.model = 'unknown-model';
      expect(client.getApiStyle()).toBe('openai');
    });
  });

  describe('createVariatorRequest', () => {
    it('should create OpenAI-style request for o3', async () => {
      client.config.model = 'o3';
      const prompt = 'Generate solutions for this problem';
      const request = await client.createVariatorRequest(prompt);

      expect(request.model).toBe('o3');
      expect(request.messages).toBeDefined();
      expect(request.messages).toHaveLength(2);
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toBe(prompt);
      expect(request.temperature).toBe(1); // o3 uses temperature=1
      expect(request.response_format).toBeDefined();
      expect(request.store).toBe(true);
    });

    it('should support parameterized prompts', async () => {
      const customSystem = 'Custom system prompt';
      const customUser = 'Custom user prompt';
      const request = await client.createVariatorRequest(null, customSystem, customUser);

      expect(request.messages[0].content).toBe(customSystem);
      expect(request.messages[1].content).toBe(customUser);
    });

    it('should create OpenAI-style request for gpt models', async () => {
      const gptClient = new LLMClient({ model: 'gpt-4' });
      const prompt = 'Generate solutions for this problem';
      const request = await gptClient.createVariatorRequest(prompt);

      expect(request.model).toBe('gpt-4');
      expect(request.messages).toBeDefined();
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toBe(prompt);
      expect(request.temperature).toBe(0.7);
      expect(request.response_format).toBeDefined();
    });
  });

  // createEnricherRequest method has been removed from LLMClient

  describe('executeRequest', () => {
    it('should call chat.completions.create for o3 models', async () => {
      client.config.model = 'o3';
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({ ideas: [{ idea_id: 'test-1', description: 'Test idea' }] })
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const request = await client.createVariatorRequest('Test prompt');
      const response = await client.executeRequest(request);

      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });

    it('should call chat.completions.create for gpt models', async () => {
      client.config.model = 'gpt-4';
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify([{ idea_id: 'test-1', description: 'Test idea' }])
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const request = await client.createVariatorRequest('Test prompt');
      const response = await client.executeRequest(request);

      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });
  });
});
