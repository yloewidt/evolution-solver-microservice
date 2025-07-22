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

// Mock the robust JSON parser
jest.unstable_mockModule('../src/utils/jsonParser.js', () => ({
  default: {
    parse: jest.fn().mockImplementation((content, context) => {
      throw new Error(`Failed to parse ${context} response: Invalid JSON`);
    })
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
      expect(client.config.temperature).toBe(0.7);
      expect(client.config.apiKey).toBeDefined();
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

    it('should default to anthropic for unknown models', () => {
      client.config.model = 'unknown-model';
      expect(client.getApiStyle()).toBe('anthropic');
    });
  });

  describe('createVariatorRequest', () => {
    it('should create Anthropic-style request for o3', async () => {
      client.config.model = 'o3';
      const prompt = 'Generate solutions for this problem';
      const request = await client.createVariatorRequest(prompt);
      
      expect(request.model).toBe('o3');
      expect(request.input).toBeDefined();
      expect(request.input[0].role).toBe('developer');
      expect(request.input[0].content[0].type).toBe('input_text');
      expect(request.input[1].role).toBe('user');
      expect(request.input[1].content[0].type).toBe('input_text');
      expect(request.input[1].content[0].text).toBe(prompt);
      expect(request.text.format.type).toBe('text');
      expect(request.reasoning.effort).toBe('medium');
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
    it('should create Anthropic-style enricher request', async () => {
      client.config.model = 'o3';
      const prompt = 'Enrich these ideas with business cases';
      const request = await client.createEnricherRequest(prompt);
      
      expect(request.model).toBe('o3');
      expect(request.input).toBeDefined();
      expect(request.input[0].role).toBe('developer');
      expect(request.input[1].role).toBe('user');
      expect(request.input[1].content[0].text).toBe(prompt);
      expect(request.reasoning.effort).toBe('high');
    });

    it('should create OpenAI-style enricher request', async () => {
      client.config.model = 'gpt-4';
      const prompt = 'Enrich these ideas with business cases';
      const request = await client.createEnricherRequest(prompt);
      
      expect(request.model).toBe('gpt-4');
      expect(request.messages).toBeDefined();
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toBe(prompt);
      expect(request.response_format).toBeDefined();
    });
  });

  describe('executeRequest', () => {
    it('should call OpenAI chat completions for gpt models', async () => {
      client.config.model = 'gpt-4';
      const request = { model: 'gpt-4', messages: [] };
      
      mockOpenAIInstance.chat.completions.create.mockResolvedValueOnce({ success: true });
      
      const result = await client.executeRequest(request);
      
      expect(result.success).toBe(true);
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(request);
      expect(mockOpenAIInstance.responses.create).not.toHaveBeenCalled();
    });

    it('should call responses.create for o3 models', async () => {
      client.config.model = 'o3';
      const request = { model: 'o3', input: [] };
      
      mockOpenAIInstance.responses.create.mockResolvedValueOnce({ success: true });
      
      const result = await client.executeRequest(request);
      
      expect(result.success).toBe(true);
      expect(mockOpenAIInstance.responses.create).toHaveBeenCalledWith(request);
      expect(mockOpenAIInstance.chat.completions.create).not.toHaveBeenCalled();
    });
  });

  describe('parseResponse', () => {
    it('should parse OpenAI structured output', async () => {
      client.config.model = 'gpt-4';
      const response = {
        choices: [
          {
            message: {
              parsed: {
                ideas: [
                  { idea_id: '1', description: 'Test 1' },
                  { idea_id: '2', description: 'Test 2' }
                ]
              }
            }
          }
        ]
      };
      
      const result = await client.parseResponse(response, 'test');
      
      expect(result).toHaveLength(2);
      expect(result[0].idea_id).toBe('1');
      expect(result[1].idea_id).toBe('2');
    });

    it('should parse Anthropic-style response with text output', async () => {
      const response = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              { idea_id: '1', description: 'Test 1' },
              { idea_id: '2', description: 'Test 2' }
            ])
          }
        ]
      };
      
      const result = await client.parseResponse(response, 'test');
      
      expect(result).toHaveLength(2);
      expect(result[0].idea_id).toBe('1');
      expect(result[1].idea_id).toBe('2');
    });

    it('should parse Anthropic-style response with message output', async () => {
      const response = {
        output: [
          {
            type: 'message',
            content: [
              {
                text: JSON.stringify([{"idea_id": "1", "description": "Test"}])
              }
            ]
          }
        ]
      };
      
      const result = await client.parseResponse(response, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });

    it('should parse OpenAI regular response', async () => {
      client.config.model = 'gpt-4';
      const response = {
        choices: [
          {
            message: {
              content: JSON.stringify([{"idea_id": "1", "description": "Test"}])
            }
          }
        ]
      };
      
      const result = await client.parseResponse(response, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });

    it('should parse response with output_text', async () => {
      const response = {
        output_text: JSON.stringify([{"idea_id": "1", "description": "Test"}])
      };
      
      const result = await client.parseResponse(response, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });

    it('should throw on unexpected response format', async () => {
      const response = { unexpected: 'format' };
      
      await expect(client.parseResponse(response, 'test')).rejects.toThrow('Failed to parse test response');
    });

    it('should handle JSON extraction from markdown', async () => {
      const response = {
        output: [
          {
            type: 'text',
            content: `Here is the response:
\`\`\`json
[{"idea_id": "1", "description": "Test"}]
\`\`\``
          }
        ]
      };
      
      const result = await client.parseResponse(response, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });

    it('should throw on invalid JSON content', async () => {
      const response = {
        output: [
          {
            type: 'text',
            content: 'This is not JSON'
          }
        ]
      };
      
      await expect(client.parseResponse(response, 'test')).rejects.toThrow('Failed to parse test response');
    });

    it('should handle structured output with enriched_ideas', async () => {
      client.config.model = 'gpt-4';
      const response = {
        choices: [
          {
            message: {
              parsed: {
                enriched_ideas: [
                  { idea_id: '1', description: 'Test' }
                ]
              }
            }
          }
        ]
      };
      
      const result = await client.parseResponse(response, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });
  });

  describe('parseTextContent', () => {
    it('should parse valid JSON directly', async () => {
      const content = JSON.stringify([
        { idea_id: '1', description: 'Test' }
      ]);
      
      const result = await client.parseTextContent(content, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });

    it('should extract JSON from markdown code blocks', async () => {
      const content = `\`\`\`json
[{"idea_id": "1", "description": "Test"}]
\`\`\``;
      
      const result = await client.parseTextContent(content, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });

    it('should handle text with extra content', async () => {
      const content = `Some text before
[{"idea_id": "1", "description": "Test"}]
Some text after`;
      
      const result = await client.parseTextContent(content, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });

    it('should convert single object to array', async () => {
      const content = JSON.stringify({ idea_id: '1', description: 'Test' });
      
      const result = await client.parseTextContent(content, 'test');
      
      expect(result).toHaveLength(1);
      expect(result[0].idea_id).toBe('1');
    });
  });
});