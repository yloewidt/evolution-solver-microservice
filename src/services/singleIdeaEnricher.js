import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Schema for single idea enrichment responses
 */
const SingleIdeaEnricherResponseSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'single_idea_enricher_response',
    schema: {
      type: 'object',
      properties: {
        idea_id: {
          type: 'string',
          description: 'Must match the input idea_id'
        },
        title: {
          type: 'string',
          description: 'Must match the input title'
        },
        description: {
          type: 'string',
          description: 'Must match the input description'
        },
        business_case: {
          type: 'object',
          properties: {
            npv_success: {
              type: 'number',
              description: 'NPV if successful, in millions USD (10% discount rate)'
            },
            capex_est: {
              type: 'number',
              minimum: 0.05,
              description: 'Estimated CAPEX in millions USD (minimum $50K)'
            },
            timeline_months: {
              type: 'integer',
              minimum: 1,
              description: 'Implementation timeline in months'
            },
            likelihood: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Probability of success (0-1)'
            },
            risk_factors: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Key risk factors for the idea'
            },
            yearly_cashflows: {
              type: 'array',
              items: { type: 'number' },
              minItems: 5,
              maxItems: 5,
              description: 'Expected cashflows for years 1-5 in millions USD'
            }
          },
          required: ['npv_success', 'capex_est', 'timeline_months', 'likelihood', 'risk_factors', 'yearly_cashflows'],
          additionalProperties: false
        }
      },
      required: ['idea_id', 'title', 'description', 'business_case'],
      additionalProperties: false
    },
    strict: true
  }
};

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
    // Based on product spec section 4.2 Enricher Prompts
    const prefix = `You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases.

Problem context: ${problemContext}${preferenceGuidance}

Required fields in business_case object (ALL monetary values in millions USD):
- "npv_success": 5-year NPV if successful in $M
- "capex_est": Initial capital required in $M
- "timeline_months": Time to first revenue
- "risk_factors": Array of key risks
- "likelihood": Success probability (0-1)
- "yearly_cashflows": Array of 5 yearly cash flows in $M

IMPORTANT: Return ONLY the raw JSON object.`;

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

    // DEBUG: Log every single idea enrichment
    logger.info(`[DEBUG] enrichSingleIdea called for idea ${idea.idea_id} in job ${jobId}`);
    logger.info('[ENRICH ENTRY] Starting enrichment:', {
      ideaId: idea.idea_id,
      jobId: jobId,
      generation: generation,
      hasResultStore: !!resultStore,
      timestamp: new Date().toISOString()
    });

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

    // User prompt per spec section 4.2
    const userPrompt = `Ideas to analyze:\n${JSON.stringify(idea, null, 2)}`;

    try {
      logger.info(`Enriching single idea: ${idea.idea_id}`);

      // Make API call using the llmClient
      if (!this.llmClient) {
        logger.error('[ENRICH DEBUG] LLMClient is null!');
        throw new Error('LLMClient not initialized');
      }

      const apiStyle = this.llmClient.getApiStyle();
      logger.info(`[ENRICH DEBUG] API style: ${apiStyle}, model: ${this.llmClient.config.model}`);
      logger.info('[ENRICH DEBUG] LLMClient details:', {
        hasClient: !!this.llmClient.client,
        clientType: this.llmClient.client?.constructor?.name,
        model: this.llmClient.config?.model,
        apiStyle: apiStyle
      });
      let response;

      if (apiStyle === 'openai') {
        // OpenAI style call with structured output
        logger.info(`[ENRICH DEBUG] Making OpenAI API call for idea ${idea.idea_id}`);
        const apiRequest = {
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
          response_format: SingleIdeaEnricherResponseSchema // Re-enabled structured output
        };

        logger.info('[ENRICH DEBUG] API request prepared, calling OpenAI...');
        logger.info('[ENRICH DEBUG] Request details:', {
          model: apiRequest.model,
          messageCount: apiRequest.messages.length,
          temperature: apiRequest.temperature,
          hasResponseFormat: !!apiRequest.response_format,
          responseFormatName: apiRequest.response_format?.json_schema?.name
        });

        try {
          logger.info('[ENRICH DEBUG] About to make OpenAI API call...');
          const apiStartTime = Date.now();

          if (!this.llmClient.client) {
            throw new Error('LLMClient.client is null');
          }

          logger.info('[ENRICH DEBUG] Calling client.chat.completions.create...');

          // Add timeout wrapper with better error handling
          const timeoutMs = 60000; // 60 seconds for o3 model
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              const timeoutError = new Error(`API call timeout after ${timeoutMs/1000} seconds`);
              timeoutError.code = 'TIMEOUT';
              reject(timeoutError);
            }, timeoutMs);
          });

          const apiCallPromise = this.llmClient.client.chat.completions.create(apiRequest);

          try {
            response = await Promise.race([apiCallPromise, timeoutPromise]);
          } catch (error) {
            if (error.code === 'TIMEOUT') {
              logger.error(`[ENRICH TIMEOUT] API call timed out for idea ${idea.idea_id} after ${timeoutMs/1000}s`);
            }
            logger.error('[ENRICH DEBUG] Promise.race failed:', error);
            throw error;
          }

          const apiDuration = Date.now() - apiStartTime;
          logger.info(`[ENRICH DEBUG] API call completed for idea ${idea.idea_id} in ${apiDuration}ms`);
          logger.info('[ENRICH DEBUG] Response received:', {
            hasResponse: !!response,
            hasChoices: !!response?.choices,
            hasUsage: !!response?.usage
          });
        } catch (apiError) {
          logger.error(`[ENRICH DEBUG] API call failed for idea ${idea.idea_id}:`, apiError);
          logger.error('[ENRICH DEBUG] Error details:', {
            name: apiError.name,
            message: apiError.message,
            status: apiError.status,
            code: apiError.code,
            type: apiError.type,
            stack: apiError.stack?.substring(0, 500)
          });
          throw apiError;
        }
      } else {
        // This branch should not be reached since we're using OpenAI API for all models
        logger.error('[ENRICH DEBUG] Unexpected API style - not openai');
        throw new Error('Unsupported API style: ' + apiStyle);
      }

      // Parse the response
      logger.info(`[ENRICH DEBUG] Parsing response for idea ${idea.idea_id}`);
      logger.info('[ENRICH DEBUG] Response structure:', {
        hasChoices: !!response?.choices,
        choicesLength: response?.choices?.length,
        hasMessage: !!response?.choices?.[0]?.message,
        hasContent: !!response?.choices?.[0]?.message?.content,
        contentLength: response?.choices?.[0]?.message?.content?.length,
        hasUsage: !!response?.usage,
        usage: response?.usage
      });

      const enrichedIdea = this.parseEnricherResponse(response, idea);
      logger.info(`[ENRICH DEBUG] Successfully parsed response for idea ${idea.idea_id}`);
      logger.info('[ENRICH DEBUG] Enriched idea details:', {
        hasBusinessCase: !!enrichedIdea?.business_case,
        hasNPV: enrichedIdea?.business_case?.npv_success !== undefined,
        npvValue: enrichedIdea?.business_case?.npv_success
      });

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

      logger.info(`[ENRICH SUCCESS] Completed enrichment for idea ${idea.idea_id} in ${Date.now() - startTime}ms`);
      return enrichedIdea;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[ENRICH DEBUG] Failed to enrich idea ${idea.idea_id} after ${duration}ms:`, error);
      logger.error('[ENRICH DEBUG] Full error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 1000),
        ideaId: idea.idea_id,
        duration: duration
      });
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
    logger.info(`[CRITICAL DEBUG] SingleIdeaEnricher.enrichIdeasParallel called with ${ideas.length} ideas (max concurrency: ${maxConcurrency})`);
    logger.info(`[CRITICAL DEBUG] Job: ${jobId}, Generation: ${generation}`);

    const results = [];
    const errors = [];

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < ideas.length; i += maxConcurrency) {
      const batch = ideas.slice(i, i + maxConcurrency);
      logger.info(`Processing batch of ${batch.length} ideas (batch ${Math.floor(i/maxConcurrency) + 1})`);

      const batchPromises = batch.map(async (idea) => {
        try {
          const startTime = Date.now();
          logger.info(`[PARALLEL] Starting enrichment for idea ${idea.idea_id} at ${new Date().toISOString()}`);
          const enriched = await this.enrichSingleIdea(idea, problemContext, jobId, generation, resultStore);
          const duration = Date.now() - startTime;
          logger.info(`[PARALLEL] Completed enrichment for idea ${idea.idea_id} in ${duration}ms`);
          return { success: true, idea: enriched };
        } catch (error) {
          logger.error(`[PARALLEL] Failed to enrich idea ${idea.idea_id}:`, error);
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
