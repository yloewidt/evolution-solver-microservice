import OpenAI from 'openai';
import https from 'https';
import logger from '../utils/logger.js';
import { VariatorResponseSchema, EnricherResponseSchema } from '../schemas/structuredSchemas.js';

/**
 * Simplified LLM client using OpenAI Structured Outputs
 * No parsing needed - responses are guaranteed to match schema
 */
export class StructuredLLMClient {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'gpt-4o-2024-08-06', // Must use model that supports structured outputs
      temperature: config.temperature || 0.7,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY
    };

    // Validate model supports structured outputs
    const supportedModels = ['o3', 'gpt-4o-2024-08-06', 'gpt-4o-mini'];
    if (!supportedModels.some(m => this.config.model.includes(m))) {
      logger.warn(`Model ${this.config.model} may not support structured outputs. Consider using ${supportedModels.join(' or ')}`);
    }

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
   * Generate ideas using variator with structured output
   */
  async generateVariatorIdeas(prompt, generation = 1) {
    const startTime = Date.now();
    logger.info(`Variator: Starting generation ${generation} with structured outputs`);

    try {
      const response = await this.client.chat.completions.create({
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
        store: true // Store for debugging
      });

      // Check for refusal
      if (response.choices[0].message.refusal) {
        throw new Error(`Model refused request: ${response.choices[0].message.refusal}`);
      }

      // Parse the structured response - guaranteed to be valid JSON matching schema
      const result = JSON.parse(response.choices[0].message.content);
      const ideas = result.ideas; // Extract array from wrapper object
      
      const duration = Date.now() - startTime;
      logger.info(`Variator: Generated ${ideas.length} ideas in ${duration}ms`);

      // Track API usage
      return {
        ideas,
        usage: response.usage,
        model: response.model,
        duration
      };

    } catch (error) {
      logger.error('Variator error:', error);
      throw error;
    }
  }

  /**
   * Enrich ideas with business case analysis using structured output
   */
  async enrichIdeas(ideas, prompt) {
    const startTime = Date.now();
    const batchSize = ideas.length;
    logger.info(`Enricher: Starting enrichment of ${batchSize} ideas with structured outputs`);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a financial analyst expert. Analyze business ideas and provide detailed financial projections.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: EnricherResponseSchema,
        temperature: 0.3, // Lower temperature for financial analysis
        store: true
      });

      // Check for refusal
      if (response.choices[0].message.refusal) {
        throw new Error(`Model refused request: ${response.choices[0].message.refusal}`);
      }

      // Parse the structured response
      const result = JSON.parse(response.choices[0].message.content);
      const enrichedIdeas = result.enriched_ideas; // Extract array from wrapper object
      
      const duration = Date.now() - startTime;
      logger.info(`Enricher: Enriched ${enrichedIdeas.length} ideas in ${duration}ms`);

      // Validate idea_ids match
      const inputIds = new Set(ideas.map(i => i.idea_id));
      const outputIds = new Set(enrichedIdeas.map(i => i.idea_id));
      
      if (inputIds.size !== outputIds.size) {
        logger.warn(`Enricher: ID mismatch - input: ${inputIds.size}, output: ${outputIds.size}`);
      }

      return {
        ideas: enrichedIdeas,
        usage: response.usage,
        model: response.model,
        duration
      };

    } catch (error) {
      logger.error('Enricher error:', error);
      throw error;
    }
  }

  /**
   * Create a variator prompt
   */
  createVariatorPrompt({ generation, existingIdeas, context }) {
    const offspringCount = Math.floor(144 * 0.7); // 70% offspring
    const wildcardCount = 144 - offspringCount; // 30% wildcards

    let prompt = `Generate exactly 144 innovative business ideas for the following context:\n\n`;
    prompt += `${context}\n\n`;

    if (existingIdeas && existingIdeas.length > 0) {
      prompt += `IMPORTANT: Generate ${offspringCount} offspring ideas (evolved from the top performers below) `;
      prompt += `and ${wildcardCount} wildcard ideas (completely new).\n\n`;
      prompt += `TOP PERFORMERS TO EVOLVE:\n`;
      existingIdeas.forEach((idea, idx) => {
        prompt += `${idx + 1}. ${idea.description} (Score: ${idea.score?.toFixed(2) || 'N/A'})\n`;
      });
      prompt += `\n`;
    }

    prompt += `Requirements:\n`;
    prompt += `- Return a JSON object with a single key "ideas" containing an array of exactly 144 ideas\n`;
    prompt += `- Each idea must have idea_id in format: VAR_GEN${generation}_XXX (001-144)\n`;
    prompt += `- Focus on capital-efficient solutions\n`;
    prompt += `- Target 10x returns within 2 years\n`;
    prompt += `- expected_gain should be in millions USD (e.g., 2.5 = $2.5M)\n`;
    prompt += `- Set is_offspring=true for ideas based on top performers, false for wildcards\n`;

    return prompt;
  }

  /**
   * Create an enricher prompt
   */
  createEnricherPrompt(ideas, context) {
    let prompt = `Analyze these ${ideas.length} business ideas and provide detailed financial projections.\n\n`;
    prompt += `Context: ${context}\n\n`;
    prompt += `IDEAS TO ANALYZE:\n`;
    
    ideas.forEach((idea, idx) => {
      prompt += `${idx + 1}. ID: ${idea.idea_id}\n`;
      prompt += `   Description: ${idea.description}\n`;
      prompt += `   Mechanism: ${idea.core_mechanism}\n\n`;
    });

    prompt += `For each idea, calculate:\n`;
    prompt += `- NPV using 10% discount rate over 5 years\n`;
    prompt += `- CAPEX estimate (minimum $50K = 0.05M)\n`;
    prompt += `- Implementation timeline in months\n`;
    prompt += `- Success likelihood (0-1)\n`;
    prompt += `- Key risk factors (at least 1)\n`;
    prompt += `- Yearly cashflows for 5 years\n\n`;
    prompt += `All monetary values must be in millions USD.\n`;
    prompt += `Return a JSON object with a single key "enriched_ideas" containing an array of all enriched ideas.`;

    return prompt;
  }
}