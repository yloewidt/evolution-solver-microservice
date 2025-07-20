import OpenAI from 'openai';
import https from 'https';
import http from 'http';
import logger from '../utils/logger.js';

class EvolutionarySolver {
  constructor() {
    // Create custom HTTP agent that forces HTTP/1.1
    // This is needed because Cloud Run's gVisor sandbox has issues with HTTP/2
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000, // Keep connection alive for 1 minute
      timeout: 900000, // 15 minute timeout
    });
    
    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000, // Keep connection alive for 1 minute
      timeout: 900000, // 15 minute timeout
      // Disable HTTP/2 by not including 'h2' in ALPN protocols
      ALPNProtocols: ['http/1.1'],
    });
    
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      timeout: 900000, // 15 minute timeout for o3 model operations
      maxRetries: 2,
    });
    
    this.config = {
      generations: process.env.EVOLUTION_GENERATIONS ? parseInt(process.env.EVOLUTION_GENERATIONS) : 10,
      populationSize: 5,
      topSelectCount: 3,
      maxCapex: 0.05,  // $50K in millions
      minProfits: 10,   // $10M in millions
      diversificationUnit: 0.05,  // $50K in millions
      model: 'o3',
      fallbackModel: 'gpt-4o',
      offspringRatio: 0.7,
      dealTypes: 'creative partnerships and business models'
    };
  }

  async variator(currentSolutions = [], targetCount = 5, problemContext = '', maxRetries = 3) {
    const numNeeded = targetCount - currentSolutions.length;
    if (numNeeded <= 0) return currentSolutions;

    // Get configuration
    const dealTypes = this.config.dealTypes || 'creative partnerships and business models';
    const maxCapex = this.config.maxCapex || 0.05;  // Default $50K in millions
    const offspringRatio = this.config.offspringRatio || 0.7;
    
    // Calculate offspring vs wildcard split
    const offspringCount = currentSolutions.length > 0 ? Math.floor(numNeeded * offspringRatio) : 0;
    const wildcardCount = numNeeded - offspringCount;

    const prompt = `Problem to solve: ${problemContext}

${currentSolutions.length > 0 ? `Top ${currentSolutions.length} performing solutions from previous generation:
${JSON.stringify(currentSolutions, null, 2)}

Generate ${numNeeded} new solutions as JSON array:
- ${offspringCount} OFFSPRING: Combine and evolve the top performers' best features. Mix their approaches, enhance strengths, fix weaknesses. Create true hybrids that build on what works.
- ${wildcardCount} WILDCARDS: Completely fresh approaches unrelated to previous solutions. Explore new angles, industries, or mechanisms.
` : `Generate ${numNeeded} new creative business solutions as JSON array.`}

Each solution must have:
- "idea_id": unique identifier (e.g., "he3_fusion_swap_v2")
- "description": Business model in plain terms. Focus on ${dealTypes} with upfront costs under $${maxCapex}M
- "core_mechanism": How value is created and captured

Requirements:
- Business models must be realistic and implementable
- Explain complex ideas simply (avoid jargon)
- Focus on partnerships that reduce capital requirements
- Consider timing advantages (why now?)`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Variator attempt ${attempt}/${maxRetries}`);
        
        const startTime = Date.now();
        const response = await this.client.responses.create({
          model: this.config.model,
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: "You are an expert in creative business deal-making and solution generation. Generate innovative, low-risk, high-return solutions." }]
            },
            {
              role: "user",
              content: [{ type: "input_text", text: prompt }]
            }
          ],
          text: { format: { type: "text" } },
          reasoning: { effort: "medium" },
          stream: false, // Avoid long SSE streams in Cloud Run
          store: true
        });

        logger.info('Variator response received');
        
        // Track API call telemetry
        if (this.progressTracker?.resultStore && this.progressTracker?.jobId && response) {
          const telemetry = {
            timestamp: new Date().toISOString(),
            phase: 'variator',
            generation: this.currentGeneration || 1,
            model: this.config.model,
            attempt: attempt,
            latencyMs: Date.now() - startTime,
            tokens: response.usage || { prompt_tokens: 0, completion_tokens: 0 },
            success: true
          };
          await this.progressTracker.resultStore.addApiCallTelemetry(this.progressTracker.jobId, telemetry);
        }
        
        const newIdeas = await this.parseResponse(response, prompt);
        
        logger.info('ParseResponse returned:', {
          type: typeof newIdeas,
          isArray: Array.isArray(newIdeas),
          length: Array.isArray(newIdeas) ? newIdeas.length : 'N/A',
          sample: Array.isArray(newIdeas) && newIdeas.length > 0 ? newIdeas[0] : newIdeas
        });
        
        const ideasArray = Array.isArray(newIdeas) ? newIdeas : [newIdeas];
        
        logger.info(`Working with ${ideasArray.length} new ideas`);
        return [...currentSolutions, ...ideasArray];
      } catch (error) {
        logger.error(`Variator attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          logger.error('All variator attempts failed, trying fallback model');
          // Try with fallback model
          try {
            const fallbackResponse = await this.client.chat.completions.create({
              model: this.config.fallbackModel,
              messages: [
                { role: 'system', content: 'You are an expert in creative business deal-making and solution generation. Generate innovative, low-risk, high-return solutions.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.8,
              max_tokens: 2000
            });
            
            const fallbackContent = fallbackResponse.choices[0].message.content;
            const fallbackIdeas = await this.parseResponse({ output: [{ type: 'text', content: fallbackContent }] }, prompt);
            const fallbackArray = Array.isArray(fallbackIdeas) ? fallbackIdeas : [fallbackIdeas];
            
            logger.info(`Fallback model generated ${fallbackArray.length} ideas`);
            return [...currentSolutions, ...fallbackArray];
          } catch (fallbackError) {
            logger.error('Fallback model also failed:', fallbackError);
            throw error;
          }
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async enricher(ideas) {
    logger.info('Enricher received ideas:', {
      count: ideas.length,
      firstIdea: ideas[0],
      allIds: ideas.map(i => i?.idea_id || 'NO_ID')
    });
    
    const enrichPrompt = `Analyze each business idea and calculate key metrics:

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

Ideas to analyze:
${JSON.stringify(ideas, null, 2)}

Return JSON array with original fields plus business_case object.`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`Enricher attempt ${attempt}/3`);
        
        const startTime = Date.now();
        const response = await this.client.responses.create({
          model: this.config.model,
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: "You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases." }]
            },
            {
              role: "user",
              content: [{ type: "input_text", text: enrichPrompt }]
            }
          ],
          text: { format: { type: "text" } },
          reasoning: { effort: "high" },
          stream: false, // Avoid long SSE streams in Cloud Run
          store: true
        });

        // Track API call telemetry
        if (this.progressTracker?.resultStore && this.progressTracker?.jobId && response) {
          const telemetry = {
            timestamp: new Date().toISOString(),
            phase: 'enricher',
            generation: this.currentGeneration || 1,
            model: this.config.model,
            attempt: attempt,
            latencyMs: Date.now() - startTime,
            tokens: response.usage || { prompt_tokens: 0, completion_tokens: 0 },
            success: true
          };
          await this.progressTracker.resultStore.addApiCallTelemetry(this.progressTracker.jobId, telemetry);
        }

        return await this.parseResponse(response, enrichPrompt);
      } catch (error) {
        logger.error(`Enricher attempt ${attempt} failed:`, error.message);
        
        if (attempt === 3) {
          logger.error('All enricher attempts failed, trying fallback model');
          try {
            const fallbackResponse = await this.client.chat.completions.create({
              model: this.config.fallbackModel,
              messages: [
                { role: 'system', content: 'You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases.' },
                { role: 'user', content: enrichPrompt }
              ],
              temperature: 0.3,
              max_tokens: 4000
            });
            
            const fallbackContent = fallbackResponse.choices[0].message.content;
            return await this.parseResponse({ output: [{ type: 'text', content: fallbackContent }] }, enrichPrompt);
          } catch (fallbackError) {
            logger.error('Fallback model also failed:', fallbackError);
            throw error;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async ranker(enrichedIdeas) {
    // Get config parameters (all in millions USD)
    const C0 = this.config.diversificationUnit || 0.05; // Default $50K in millions
    const maxCapex = this.config.maxCapex || Infinity;
    const minProfits = this.config.minProfits || 0;
    
    // Validate all ideas have required fields
    const validationErrors = [];
    enrichedIdeas.forEach((idea, index) => {
      if (!idea.business_case) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing business_case object`);
        return;
      }
      
      const bc = idea.business_case;
      
      // Check required fields exist
      if (bc.npv_success === undefined) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing npv_success`);
      }
      if (bc.capex_est === undefined) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing capex_est`);
      }
      if (bc.likelihood === undefined) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing likelihood`);
      }
      
      // Validate data types and ranges
      if (typeof bc.npv_success !== 'number' || isNaN(bc.npv_success)) {
        validationErrors.push(`Idea ${idea.idea_id || index}: npv_success must be a number`);
      }
      if (typeof bc.capex_est !== 'number' || isNaN(bc.capex_est) || bc.capex_est <= 0) {
        validationErrors.push(`Idea ${idea.idea_id || index}: capex_est must be a positive number`);
      }
      if (typeof bc.likelihood !== 'number' || isNaN(bc.likelihood) || bc.likelihood <= 0 || bc.likelihood > 1) {
        validationErrors.push(`Idea ${idea.idea_id || index}: likelihood must be between 0 and 1`);
      }
    });
    
    if (validationErrors.length > 0) {
      logger.error('Ranker validation errors:', validationErrors);
      throw new Error(`Data validation failed in ranker:\n${validationErrors.join('\n')}`);
    }
    
    // Score and filter ideas
    const scoredIdeas = enrichedIdeas.map(idea => {
      const bc = idea.business_case;
      const p = bc.likelihood;
      const npv = bc.npv_success;
      const capex = bc.capex_est;
      
      // Apply user-defined filters
      let filtered = false;
      let filterReason = null;
      
      if (capex > maxCapex) {
        filtered = true;
        filterReason = `CAPEX ($${capex}M) exceeds maximum ($${maxCapex}M)`;
      } else if (npv < minProfits) {
        filtered = true;
        filterReason = `NPV ($${npv}M) below minimum ($${minProfits}M)`;
      }
      
      // Calculate risk-adjusted score
      let score = -Infinity;
      let expectedValue = null;
      
      if (!filtered) {
        // Expected value: p * NPV_success - (1-p) * CAPEX
        // All values now in millions USD
        expectedValue = p * npv - (1 - p) * capex;
        
        // Diversification penalty: sqrt(CAPEX/C0)
        const diversificationPenalty = Math.sqrt(capex / C0);
        
        // Risk-Adjusted NPV
        score = expectedValue / diversificationPenalty;
      }
      
      return { 
        ...idea, 
        score, 
        filtered,
        filterReason,
        metrics: {
          npv: npv,
          capex: capex,
          likelihood: p,
          expectedValue: expectedValue
        }
      };
    });

    // Separate filtered and valid ideas
    const validIdeas = scoredIdeas.filter(idea => !idea.filtered);
    const filteredIdeas = scoredIdeas.filter(idea => idea.filtered);
    
    // Sort valid ideas by score
    validIdeas.sort((a, b) => b.score - a.score);
    
    // Assign ranks only to valid ideas
    validIdeas.forEach((idea, index) => {
      idea.rank = index + 1;
    });
    
    // Log filtering results
    if (filteredIdeas.length > 0) {
      logger.info(`Filtered ${filteredIdeas.length} ideas:`, 
        filteredIdeas.map(i => ({ id: i.idea_id, reason: i.filterReason }))
      );
    }

    return { 
      rankedIdeas: validIdeas,
      filteredIdeas: filteredIdeas
    };
  }


  async formatEnrichedData(enrichedIdeas) {
    try {
      logger.info('Formatting enriched data for consistency');
      
      const formatPrompt = `Ensure the following business ideas have correctly formatted metrics.
      
For each idea, validate and reformat the business_case object to have (ALL monetary values in millions USD):
- npv_success: number in millions (e.g., 125.5 = $125.5M)
- capex_est: number in millions (e.g., 0.075 = $75K)
- timeline_months: number
- likelihood: number between 0 and 1
- risk_factors: array of strings
- yearly_cashflows: array of 5 numbers in millions

Fix any formatting issues. Convert any values in thousands to millions (divide by 1000).
Examples: $50K = 0.05, $100K = 0.1, $1M = 1.0, $50M = 50.0

Return ONLY the JSON array with corrected data.

Data to format:
${JSON.stringify(enrichedIdeas, null, 2)}`;

      const response = await this.client.chat.completions.create({
        model: this.config.fallbackModel,
        messages: [
          {
            role: 'system',
            content: 'You are a data formatting assistant. Return only valid JSON with properly typed numeric fields.'
          },
          {
            role: 'user',
            content: formatPrompt
          }
        ],
        temperature: 0,
        max_tokens: 4000
      });

      const formattedContent = response.choices[0].message.content.trim();
      const formattedData = JSON.parse(formattedContent);
      
      logger.info('Successfully formatted enriched data');
      return formattedData;
      
    } catch (error) {
      logger.error('Data formatting failed:', error);
      // Return original data if formatting fails
      return enrichedIdeas;
    }
  }

  async evolve(problemContext, initialSolutions = [], customConfig = {}, progressTracker = null) {
    // Store custom config in this instance for use by other methods
    this.config = {
      ...this.config,
      ...customConfig
    };
    const config = this.config;
    
    logger.info('Starting evolution with:', {
      problemContext: problemContext.substring(0, 100) + '...',
      initialSolutionCount: initialSolutions.length,
      generations: config.generations,
      customConfig
    });
    
    // Store progressTracker for use in methods
    this.progressTracker = progressTracker;
    
    let currentGen = initialSolutions;
    let generationHistory = [];
    let allGenerationSolutions = [];

    for (let gen = 1; gen <= config.generations; gen++) {
      logger.info(`Generation ${gen}/${config.generations}`);
      
      // Store current generation for telemetry
      this.currentGeneration = gen;

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.updateGenerationProgress(
          progressTracker.jobId, gen, config.generations, 'variator'
        );
      }

      if (currentGen.length < config.populationSize) {
        currentGen = await this.variator(currentGen, config.populationSize, problemContext);
      }

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.updateGenerationProgress(
          progressTracker.jobId, gen, config.generations, 'enricher'
        );
      }

      const enriched = await this.enricher(currentGen);
      
      // Format enriched data to ensure consistency
      const formatted = await this.formatEnrichedData(enriched);
      
      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.updateGenerationProgress(
          progressTracker.jobId, gen, config.generations, 'ranker'
        );
      }

      const { rankedIdeas, filteredIdeas } = await this.ranker(formatted);
      
      // Log filtered ideas for visibility
      if (filteredIdeas && filteredIdeas.length > 0) {
        logger.info(`Generation ${gen}: Filtered ${filteredIdeas.length} ideas`, 
          filteredIdeas.map(i => ({ id: i.idea_id, reason: i.filterReason }))
        );
      }

      rankedIdeas.forEach(solution => {
        allGenerationSolutions.push({
          ...solution,
          generation: gen,
          last_generation: gen,
          total_generations: config.generations
        });
      });

      const generationData = {
        generation: gen,
        topScore: rankedIdeas[0]?.score || 0,
        avgScore: rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length,
        solutionCount: rankedIdeas.length,
        solutions: rankedIdeas
      };

      generationHistory.push(generationData);

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.savePartialResult(
          progressTracker.jobId, gen, generationData
        );
      }

      if (gen === config.generations) {
        return {
          topSolutions: rankedIdeas.slice(0, 5),
          allSolutions: allGenerationSolutions,
          generationHistory,
          totalEvaluations: gen * config.populationSize,
          totalSolutions: allGenerationSolutions.length
        };
      }

      // Select top performers for next generation
      const topPerformers = rankedIdeas.slice(0, config.topSelectCount);
      currentGen = topPerformers;
    }
  }

  async parseResponse(response, prompt = '') {
    try {
      let content = '';
      
      // Based on working example, check for response.output array first
      if (response.output && Array.isArray(response.output)) {
        logger.info('Response output types:', response.output.map(item => item.type));
        
        // Try different response formats
        const textOutput = response.output.find(item => item.type === 'text');
        const messageOutput = response.output.find(item => item.type === 'message');
        
        if (textOutput && textOutput.content) {
          content = textOutput.content;
        } else if (messageOutput && messageOutput.content && messageOutput.content[0] && messageOutput.content[0].text) {
          content = messageOutput.content[0].text;
        } else {
          logger.error('Available output items:', JSON.stringify(response.output, null, 2));
          throw new Error('No text or message content found in response');
        }
      } else if (response.output_text) {
        content = response.output_text;
      } else if (response.content) {
        if (Array.isArray(response.content)) {
          const textContent = response.content.find(c => c.type === 'text');
          content = textContent?.text || '';
        } else if (typeof response.content === 'string') {
          content = response.content;
        }
      } else if (response.text) {
        content = response.text;
      } else if (response.message?.content) {
        content = response.message.content;
      }
      
      if (!content) {
        logger.error('No content found in response:', JSON.stringify(response, null, 2));
        throw new Error('No content in response');
      }
      
      if (typeof content !== 'string') {
        content = JSON.stringify(content);
      }
      
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      content = content.replace(/\\\\"/g, '"');
      
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (parseError) {
          logger.warn('Failed to parse JSON, using GPT-4o to reformat');
          return await this.reformatWithGPT4o(content, prompt);
        }
      }
      
      try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (parseError) {
        logger.warn('Failed to parse JSON, using GPT-4o to reformat');
        return await this.reformatWithGPT4o(content, prompt);
      }
    } catch (error) {
      logger.error('Failed to parse response:', error);
      logger.error('Raw response:', JSON.stringify(response, null, 2));
      throw new Error('Failed to parse LLM response');
    }
  }

  async reformatWithGPT4o(content, originalPrompt) {
    try {
      logger.info('Using GPT-4o to reformat malformed JSON');
      
      const reformatPrompt = `The following text should be a JSON array but may have formatting issues. 
Please extract and return ONLY a valid JSON array with the same data structure.
Do not add any explanations or markdown formatting, just the JSON array.

Original request context: ${originalPrompt.substring(0, 200)}...

Text to reformat:
${content}`;

      const reformatResponse = await this.client.chat.completions.create({
        model: this.config.fallbackModel,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON formatting assistant. Return only valid JSON arrays without any markdown or explanations.'
          },
          {
            role: 'user',
            content: reformatPrompt
          }
        ],
        temperature: 0,
        max_tokens: 4000
      });

      const reformattedContent = reformatResponse.choices[0].message.content.trim();
      
      const jsonMatch = reformattedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        logger.info('Successfully reformatted JSON with GPT-4o');
        return Array.isArray(parsed) ? parsed : [parsed];
      }
      
      const parsed = JSON.parse(reformattedContent);
      return Array.isArray(parsed) ? parsed : [parsed];
      
    } catch (error) {
      logger.error('GPT-4o reformatting failed:', error);
      throw new Error('Failed to reformat response with GPT-4o');
    }
  }
}

export default EvolutionarySolver;