import logger from '../utils/logger.js';
import crypto from 'crypto';
import { SingleIdeaEnricherResponseSchema } from '../schemas/structuredSchemas.js';

class SingleIdeaEnricher {
  constructor(llmClient, cacheStore = null) {
    this.llmClient = llmClient;
    this.cacheStore = cacheStore;
    this.cachedPrefixes = new Map(); // In-memory cache for prefixes
  }

  /**
   * Create a job-specific enricher prefix that includes problem context
   * This maximizes prompt caching efficiency
   */
  createEnricherPrefix(problemContext) {
    // Check if we already have this prefix cached
    const prefixKey = crypto.createHash('md5').update(problemContext).digest('hex');
    if (this.cachedPrefixes.has(prefixKey)) {
      return this.cachedPrefixes.get(prefixKey);
    }

    // Build preference guidance based on problem context
    let preferenceGuidance = '';
    const maxCapex = 100; // Default, could be extracted from problemContext
    const minProfits = 0; // Default
    
    if (maxCapex < 100) {
      preferenceGuidance += `\n\nPREFERRED APPROACH: When analyzing this idea, note that capital-efficient solutions under $${maxCapex}M initial investment are preferred. Consider creative ways to reduce upfront costs through partnerships, phased rollouts, or asset-light models.`;
    }
    if (minProfits > 0) {
      preferenceGuidance += `\nTARGET RETURNS: The solution should ideally achieve 5-year NPV above $${minProfits}M. Look for high-impact, scalable opportunities.`;
    }

    // Create the static prefix - this will be cached by OpenAI
    const prefix = `You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases.

PROBLEM CONTEXT:
${problemContext}${preferenceGuidance}

INSTRUCTIONS:
Analyze the provided business idea and calculate key metrics:

Required fields in business_case object (ALL monetary values in millions USD):
- "npv_success": 5-year NPV if successful in $M (discounted at 10% annually)
- "capex_est": Initial capital required in $M (e.g., 0.075 = $75K)
- "timeline_months": Time to first revenue
- "likelihood": Success probability (0-1)
- "risk_factors": Array of key risks (technical, market, regulatory, execution)
- "yearly_cashflows": Array of 5 yearly cash flows in $M

IMPORTANT: All monetary values must be in millions. Examples:
- $50K = 0.05
- $100K = 0.1
- $1M = 1.0
- $50M = 50.0

Analysis steps:
1. Market size and growth potential
2. Revenue projections by year (in $M)
3. Cost structure and capital requirements (in $M)
4. Risk assessment across all dimensions
5. NPV calculation using 10% discount rate

You will return a JSON object with an "enriched_ideas" array containing exactly one enriched idea.`;

    // Cache the prefix for reuse
    this.cachedPrefixes.set(prefixKey, prefix);
    return prefix;
  }

  /**
   * Create a deterministic cache key for an idea
   */
  createIdeaCacheKey(idea) {
    const ideaString = `${idea.idea_id}|${idea.description}|${idea.core_mechanism || ''}`;
    return crypto.createHash('md5').update(ideaString).digest('hex');
  }

  /**
   * Enrich a single idea with caching support
   */
  async enrichSingleIdea(idea, problemContext, jobId, generation, resultStore = null) {
    const startTime = Date.now();
    const cacheKey = this.createIdeaCacheKey(idea);
    
    // Check cache first
    if (this.cacheStore) {
      try {
        const cached = await this.cacheStore.getEnrichedIdea(jobId, cacheKey);
        if (cached) {
          logger.info(`Cache hit for idea ${idea.idea_id} in job ${jobId}`);
          return cached;
        }
      } catch (error) {
        logger.warn('Cache lookup failed:', error);
        // Continue with API call if cache fails
      }
    }

    // Create the enricher prefix (will be cached by OpenAI) as system prompt
    const systemPrompt = this.createEnricherPrefix(problemContext);
    
    // User prompt is just the idea to analyze
    const userPrompt = `Analyze this idea:\n${JSON.stringify(idea, null, 2)}`;

    try {
      logger.info(`Enriching single idea: ${idea.idea_id}`);
      
      // Make API call using the llmClient
      const apiStyle = this.llmClient.getApiStyle();
      let response;
      
      if (apiStyle === 'openai') {
        // OpenAI style call with structured output
        response = await this.llmClient.client.chat.completions.create({
          model: this.llmClient.config.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: this.llmClient.config.model === 'o3' ? 1 : 0.7,
          response_format: SingleIdeaEnricherResponseSchema // Use single idea schema
        });
      } else {
        // Anthropic style call (for o3)
        response = await this.llmClient.client.chat.completions.create({
          model: this.llmClient.config.model,
          input: [
            {
              role: 'developer',
              content: [{ type: 'input_text', text: 'You are a business strategist expert in financial modeling and deal structuring.' }]
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
        });
      }

      // Parse the response
      const enrichedIdea = this.parseEnricherResponse(response, idea);
      
      // Save to cache
      if (this.cacheStore && enrichedIdea) {
        try {
          await this.cacheStore.saveEnrichedIdea(jobId, cacheKey, enrichedIdea);
        } catch (error) {
          logger.warn('Cache save failed:', error);
          // Continue even if cache save fails
        }
      }

      // Log metrics
      const duration = Date.now() - startTime;
      logger.info(`Enriched idea ${idea.idea_id} in ${duration}ms`, {
        tokensIn: response.usage?.prompt_tokens || 0,
        tokensOut: response.usage?.completion_tokens || 0,
        cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens || 0
      });

      // Track API call telemetry if resultStore is provided
      if (resultStore && resultStore.addApiCallTelemetry) {
        try {
          const telemetry = {
            timestamp: new Date().toISOString(),
            phase: 'enricher',
            generation: generation,
            model: this.llmClient.config.model || 'o3',
            attempt: 1,
            latencyMs: duration,
            tokens: response.usage || { prompt_tokens: 0, completion_tokens: 0 },
            success: true,
            ideaId: idea.idea_id  // Track which idea this was for
          };
          await resultStore.addApiCallTelemetry(jobId, telemetry);
        } catch (error) {
          logger.warn('Failed to track API call telemetry:', error);
        }
      }

      return enrichedIdea;

    } catch (error) {
      logger.error(`Failed to enrich idea ${idea.idea_id}:`, error);
      throw new Error(`Enrichment failed for idea ${idea.idea_id}: ${error.message}`);
    }
  }

  /**
   * Parse and validate enricher response
   */
  parseEnricherResponse(response, originalIdea) {
    try {
      let parsedResponse;
      
      // Extract content based on response structure
      if (response.choices?.[0]?.message?.content) {
        // OpenAI style response
        parsedResponse = JSON.parse(response.choices[0].message.content);
      } else if (response.output?.[0]?.content?.[0]?.text) {
        // Anthropic style response (o3)
        parsedResponse = JSON.parse(response.output[0].content[0].text);
      } else if (response.content?.[0]?.text) {
        // Alternative response structure
        parsedResponse = JSON.parse(response.content[0].text);
      } else {
        throw new Error('Unexpected response structure');
      }

      // Response is now a single enriched idea (not an array)
      let enrichedIdea = parsedResponse;

      // Ensure we have the title field from original idea if not in response
      if (!enrichedIdea.title && originalIdea.title) {
        enrichedIdea.title = originalIdea.title;
      }

      // Validate required fields
      if (!enrichedIdea.business_case) {
        throw new Error('Missing business_case in enriched idea');
      }

      const bc = enrichedIdea.business_case;
      const requiredFields = ['npv_success', 'capex_est', 'timeline_months', 'likelihood', 'risk_factors'];
      const missingFields = requiredFields.filter(field => bc[field] === undefined);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields in business_case: ${missingFields.join(', ')}`);
      }

      // Ensure capex is at least 0.05 (50K minimum)
      if (bc.capex_est < 0.05) {
        bc.capex_est = 0.05;
      }

      return enrichedIdea;

    } catch (error) {
      logger.error('Failed to parse enricher response:', error);
      throw error;
    }
  }

  /**
   * Enrich multiple ideas in parallel
   */
  async enrichIdeasParallel(ideas, problemContext, jobId, generation, maxConcurrency = 5, resultStore = null) {
    logger.info(`Enriching ${ideas.length} ideas in parallel (max concurrency: ${maxConcurrency})`);
    
    // TEMPORARY: Force error to verify new code is running
    throw new Error('PARALLEL_ENRICHMENT_TEST: This error confirms the new code is deployed');
    
    const results = [];
    const errors = [];
    
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < ideas.length; i += maxConcurrency) {
      const batch = ideas.slice(i, i + maxConcurrency);
      logger.info(`Processing batch of ${batch.length} ideas (batch ${Math.floor(i/maxConcurrency) + 1})`);
      
      const batchPromises = batch.map(async (idea) => {
        try {
          logger.info(`Starting enrichment for idea ${idea.idea_id}`);
          const enriched = await this.enrichSingleIdea(idea, problemContext, jobId, generation, resultStore);
          logger.info(`Completed enrichment for idea ${idea.idea_id}`);
          return { success: true, idea: enriched };
        } catch (error) {
          logger.error(`Failed to enrich idea ${idea.idea_id}:`, error);
          return { success: false, idea, error: error.message };
        }
      });

      logger.info(`Waiting for ${batchPromises.length} parallel API calls to complete...`);
      const batchResults = await Promise.all(batchPromises);
      logger.info(`Batch complete: ${batchResults.filter(r => r.success).length} successful, ${batchResults.filter(r => !r.success).length} failed`);
      
      batchResults.forEach(result => {
        if (result.success) {
          results.push(result.idea);
        } else {
          errors.push(result);
        }
      });
    }

    logger.info(`Enrichment complete: ${results.length} successful, ${errors.length} failed`);
    
    return {
      enrichedIdeas: results,
      failedIdeas: errors
    };
  }
}

export default SingleIdeaEnricher;