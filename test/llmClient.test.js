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

// Mock logger
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Import after mocking
const { LLMClient } = await import('../src/services/llmClient.js');

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
      expect(client.config.temperature).toBe(0.7); // Default temperature when no config.model provided
      expect(client.config.apiKey).toBeDefined();
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
    it('should return anthropic for o3 models', () => {
      client.config.model = 'o3';
      expect(client.getApiStyle()).toBe('anthropic');
      
      client.config.model = 'o3-mini';
      expect(client.getApiStyle()).toBe('anthropic');
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
    it('should create Anthropic-style request for o3', async () => {
      client.config.model = 'o3';
      const prompt = 'Generate solutions for this problem';
      const request = await client.createVariatorRequest(prompt);
      
      expect(request.model).toBe('o3');
      expect(request.input).toBeDefined();
      expect(request.input).toHaveLength(2);
      expect(request.input[0].role).toBe('developer');
      expect(request.input[1].role).toBe('user');
      expect(request.input[1].content[0].text).toBe(prompt);
      expect(request.text).toEqual({ format: { type: 'text' } });
      expect(request.reasoning).toEqual({ effort: 'medium' });
      expect(request.stream).toBe(false);
      expect(request.store).toBe(true);
    });

    it('should create OpenAI-style request for gpt models', async () => {
      client.config.model = 'gpt-4';
      const prompt = 'Generate solutions for this problem';
      const request = await client.createVariatorRequest(prompt);
      
      expect(request.model).toBe('gpt-4');
      expect(request.messages).toBeDefined();
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toBe(prompt);
      expect(request.temperature).toBe(0.7);
      expect(request.response_format).toBeDefined();
    });
  });

  describe('createEnricherRequest', () => {
    it('should create Anthropic-style enricher request for o3', async () => {
      client.config.model = 'o3';
      const prompt = 'Enrich these ideas with business cases';
      const request = await client.createEnricherRequest(prompt);
      
      expect(request.model).toBe('o3');
      expect(request.input).toBeDefined();
      expect(request.input).toHaveLength(2);
      expect(request.input[0].role).toBe('developer');
      expect(request.input[1].role).toBe('user');
      expect(request.input[1].content[0].text).toBe(prompt);
      expect(request.text).toEqual({ format: { type: 'text' } });
      expect(request.reasoning).toEqual({ effort: 'high' }); // enricher uses high effort
      expect(request.stream).toBe(false);
      expect(request.store).toBe(true);
    });

    it('should create OpenAI-style enricher request for gpt models', async () => {
      client.config.model = 'gpt-4';
      const prompt = 'Enrich these ideas with business cases';
      const request = await client.createEnricherRequest(prompt);
      
      expect(request.model).toBe('gpt-4');
      expect(request.messages).toBeDefined();
      expect(request.messages).toHaveLength(2);
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toBe(prompt);
      expect(request.temperature).toBe(0.5); // enricher uses lower temperature
    });
  });

  describe('executeRequest', () => {
    it('should call responses.create for o3 models', async () => {
      client.config.model = 'o3';
      const mockResponse = {
        output: [{
          type: 'text',
          content: JSON.stringify([{ idea_id: 'test-1', description: 'Test idea' }])
        }],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };
      
      mockOpenAIInstance.responses.create.mockResolvedValueOnce(mockResponse);
      
      const request = await client.createVariatorRequest('Test prompt');
      const response = await mockOpenAIInstance.responses.create(request);
      
      expect(mockOpenAIInstance.responses.create).toHaveBeenCalledWith(request);
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
      const response = await mockOpenAIInstance.chat.completions.create(request);
      
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });
  });
});