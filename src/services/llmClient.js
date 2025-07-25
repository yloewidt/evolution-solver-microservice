import OpenAI from 'openai';
import https from 'https';
import logger from '../utils/logger.js';
import Parser from '../utils/parser.js';

/**
 * JSON Schemas for OpenAI Structured Outputs
 * These schemas guarantee 100% compliant responses from the API
 */
const VariatorResponseSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'variator_response',
    schema: {
      type: 'object',
      properties: {
        ideas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              idea_id: {
                type: 'string',
                description: 'Unique identifier for the idea (e.g., VAR_GEN1_001)'
              },
              title: {
                type: 'string',
                description: 'Short, catchy title for the idea'
              },
              description: {
                type: 'string',
                description: '2-3 sentence description of the business idea'
              },
              core_mechanism: {
                type: 'string',
                description: '1-2 sentence explanation of how the idea works'
              },
              is_offspring: {
                type: 'boolean',
                description: 'Whether this idea is based on an existing top performer'
              }
            },
            required: ['idea_id', 'title', 'description', 'core_mechanism', 'is_offspring'],
            additionalProperties: false
          }
        }
      },
      required: ['ideas'],
      additionalProperties: false
    },
    strict: true
  }
};

/**
 * Unified LLM client that handles both OpenAI and Anthropic-style APIs
 * Updated to use structured outputs when available
 */
export class LLMClient {
  constructor(config = {}) {
    const model = config.model || 'o3';
    this.config = {
      model: model,
      temperature: config.temperature || (model === 'o3' ? 1 : 0.7),
      apiKey: config.apiKey || process.env.OPENAI_API_KEY
    };

    // Initialize OpenAI client with HTTP/1.1 for Cloud Run compatibility
    const agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 3000,
      maxSockets: 100,
      maxFreeSockets: 10,
      timeout: 60000,
      scheduling: 'lifo',
      ALPNProtocols: ['http/1.1']
    });

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      httpAgent: agent,
      timeout: 300000, // 5 minutes
      maxRetries: 0
    });
  }

  /**
   * Determine which API style to use based on model name
   */
  getApiStyle() {
    const model = this.config.model.toLowerCase();
    logger.info(`Getting API style for model: ${model}`);
    // All models use OpenAI API style since we're using the OpenAI SDK
    logger.info('Using openai API style');
    return 'openai';
  }

  /**
   * Create a variator request
   */
  async createVariatorRequest(prompt, systemPrompt = null, userPrompt = null) {
    const apiStyle = this.getApiStyle();

    // Use provided prompts or defaults
    const finalSystemPrompt = systemPrompt || 'You are an expert in creative business deal-making and solution generation. Generate innovative, low-risk, high-return solutions.';
    const finalUserPrompt = userPrompt || prompt;

    // OpenAI style with structured output
    return {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: finalSystemPrompt
        },
        {
          role: 'user',
          content: finalUserPrompt
        }
      ],
      response_format: VariatorResponseSchema,
      temperature: this.config.temperature,
      store: true
    };
  }

  // createEnricherRequest removed - enrichment now handled by singleIdeaEnricher

  /**
   * Execute the request with timeout protection
   */
  async executeRequest(request) {
    const apiStyle = this.getApiStyle();

    // Create an AbortController with timeout
    const controller = new AbortController();
    const timeoutMs = this.config.timeout || 300000; // 5 minutes default

    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.error(`API request timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    try {
      let response;
      if (apiStyle === 'openai') {
        // OpenAI doesn't support signal in the request, use client-level timeout
        response = await this.client.chat.completions.create(request);
      } else {
        // This branch should never be reached now
        throw new Error('Unexpected API style');
      }

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(`API request timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Parse the response based on API style
   */
  async parseResponse(response, context = 'unknown') {
    const apiStyle = this.getApiStyle();

    try {
      if (apiStyle === 'openai') {
        // Check for refusal first
        if (response.choices?.[0]?.message?.refusal) {
          throw new Error(`Model refused request: ${response.choices[0].message.refusal}`);
        }

        // Get content from response
        const content = response.choices?.[0]?.message?.content;
        if (!content) throw new Error('No content in OpenAI response');

        // Try to parse as JSON first (for structured outputs)
        try {
          const parsed = JSON.parse(content);

          // If using structured outputs, the response will be wrapped in an object
          if (parsed.ideas) {
            logger.info(`${context}: Structured output - extracted ${parsed.ideas.length} ideas`);
            return parsed.ideas;
          }
          if (parsed.enriched_ideas) {
            logger.info(`${context}: Structured output - extracted ${parsed.enriched_ideas.length} enriched ideas`);
            return parsed.enriched_ideas;
          }

          // If it's valid JSON but not structured output format, return it
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (jsonError) {
          // Not valid JSON, fallback to text parsing
          return await this.parseTextContent(content, context);
        }
      } else {
        // This branch should never be reached now
        throw new Error('Unexpected API style in response parsing');
      }
    } catch (error) {
      logger.error(`${context}: Failed to parse response:`, error);
      throw new Error(`Failed to parse ${context} response: ${error.message}`);
    }
  }

  /**
   * Parse text content to JSON
   */
  async parseTextContent(content, context) {
    // First try direct JSON parsing
    try {
      const parsed = JSON.parse(content);
      logger.info(`${context}: Direct JSON parsing successful`);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      logger.info(`${context}: Direct parsing failed, trying cleanup`);
    }

    // Clean up common issues
    let cleaned = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/^```\s*/i, '')
      .trim();

    // Try to find JSON array or object
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);

    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        logger.info(`${context}: Extracted JSON array`);
        return parsed;
      } catch (e) {
        logger.error(`${context}: Failed to parse extracted array`);
      }
    }

    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        logger.info(`${context}: Extracted JSON object`);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        logger.error(`${context}: Failed to parse extracted object`);
      }
    }

    // If all else fails, use the robust parser as last resort
    logger.warn(`${context}: Falling back to robust parser`);
    const RobustJsonParser = (await import('../utils/jsonParser.js')).default;
    return RobustJsonParser.parse(content, context);
  }
}
