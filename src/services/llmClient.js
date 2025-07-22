import OpenAI from 'openai';
import https from 'https';
import logger from '../utils/logger.js';
import { VariatorResponseSchema, EnricherResponseSchema } from '../schemas/evolutionSchemas.js';

/**
 * Unified LLM client that handles both OpenAI and Anthropic-style APIs
 */
export class LLMClient {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'o3',
      temperature: config.temperature || 0.7,
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
      timeout: 120000,
      maxRetries: 0
    });
  }

  /**
   * Determine which API style to use based on model name
   */
  getApiStyle() {
    const model = this.config.model.toLowerCase();
    if (model.includes('o3')) {
      return 'anthropic'; // o3 uses Anthropic-style API
    } else if (model.includes('o1') || model.includes('gpt')) {
      return 'openai'; // o1 and GPT models use OpenAI API
    }
    return 'anthropic'; // Default to Anthropic style
  }

  /**
   * Create a variator request
   */
  async createVariatorRequest(prompt) {
    const apiStyle = this.getApiStyle();

    if (apiStyle === 'openai') {
      // OpenAI style with structured output
      return {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in creative business deal-making and solution generation. Generate innovative, low-risk, high-return solutions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: VariatorResponseSchema,
        temperature: this.config.temperature,
        store: true
      };
    } else {
      // Anthropic style for o3
      return {
        model: this.config.model,
        input: [
          {
            role: 'developer',
            content: [{
              type: 'input_text',
              text: 'You are an expert in creative business deal-making and solution generation. Generate innovative, low-risk, high-return solutions.'
            }]
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: prompt }]
          }
        ],
        text: { format: { type: 'text' } },
        reasoning: { effort: 'medium' },
        stream: false,
        store: true
      };
    }
  }

  /**
   * Create an enricher request
   */
  async createEnricherRequest(prompt) {
    const apiStyle = this.getApiStyle();

    if (apiStyle === 'openai') {
      // OpenAI style with structured output
      return {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: EnricherResponseSchema,
        temperature: 0.5, // Lower temperature for more consistent financial analysis
        store: true
      };
    } else {
      // Anthropic style for o3
      return {
        model: this.config.model,
        input: [
          {
            role: 'developer',
            content: [{
              type: 'input_text',
              text: 'You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases.'
            }]
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: prompt }]
          }
        ],
        text: { format: { type: 'text' } },
        reasoning: { effort: 'high' },
        stream: false,
        store: true
      };
    }
  }

  /**
   * Execute the request
   */
  async executeRequest(request) {
    const apiStyle = this.getApiStyle();

    if (apiStyle === 'openai') {
      return await this.client.chat.completions.create(request);
    } else {
      return await this.client.responses.create(request);
    }
  }

  /**
   * Parse the response based on API style
   */
  async parseResponse(response, context = 'unknown') {
    const apiStyle = this.getApiStyle();

    try {
      if (apiStyle === 'openai') {
        // Check for structured output first
        if (response.choices?.[0]?.message?.parsed) {
          logger.info(`${context}: Using structured output`);
          const parsed = response.choices[0].message.parsed;

          // Extract the array from the structured response
          if (parsed.ideas) return parsed.ideas;
          if (parsed.enriched_ideas) return parsed.enriched_ideas;

          return Array.isArray(parsed) ? parsed : [parsed];
        }

        // Fallback to content parsing
        const content = response.choices?.[0]?.message?.content;
        if (!content) throw new Error('No content in OpenAI response');

        return await this.parseTextContent(content, context);
      } else {
        // Anthropic style (o3)
        let content = '';

        if (response.output && Array.isArray(response.output)) {
          const textOutput = response.output.find(item => item.type === 'text');
          const messageOutput = response.output.find(item => item.type === 'message');

          if (textOutput?.content) {
            content = textOutput.content;
          } else if (messageOutput?.content?.[0]?.text) {
            content = messageOutput.content[0].text;
          } else {
            throw new Error('No text content found in Anthropic-style response');
          }
        } else if (response.output_text) {
          content = response.output_text;
        } else {
          throw new Error('Unexpected response format');
        }

        return await this.parseTextContent(content, context);
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
