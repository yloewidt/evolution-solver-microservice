import OpenAI from 'openai';
import logger from '../utils/logger.js';

class EvolutionarySolver {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.config = {
      generations: process.env.EVOLUTION_GENERATIONS ? parseInt(process.env.EVOLUTION_GENERATIONS) : 10,
      populationSize: 5,
      topSelectCount: 2,
      variationsPerTop: 3,
      maxCapex: 50000,
      targetTimeline: { min: 3, max: 6 },
      minDealValuePercent: 70,
      model: 'o3',
      fallbackModel: 'gpt-4o'
    };
  }

  async variator(currentSolutions = [], targetCount = 5, problemContext = '', feedback = '', maxRetries = 3) {
    const numNeeded = targetCount - currentSolutions.length;
    if (numNeeded <= 0) return currentSolutions;

    const basePrompt = `Given bottleneck: ${problemContext}
Existing ideas: ${JSON.stringify(currentSolutions, null, 2)}

Generate ${numNeeded} new non-straightforward variations as JSON array.
Each idea must have:
- "idea_id": unique string
- "description": creative deal-making focus (asymmetric partnerships for low CapEx <$50K, low risk)
- "core_mechanism": brief explanation of how it works
- Timely implementation (3-6 months)
- High potential (>10x ROI)

Mutate by combining/rewriting for novelty. Focus on IP licensing, equity swaps, revenue shares, strategic partnerships.`;

    const evolutionHint = feedback ? `\n\nEVOLVE THIS PROMPT based on feedback: ${feedback}` : '';
    const prompt = basePrompt + evolutionHint;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Variator attempt ${attempt}/${maxRetries}`);
        
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
          store: true
        });

        logger.info('Variator response received');
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
    
    const enrichPrompt = `For each idea below, build a detailed business case with these exact fields:
- "roi_proj": 5-year net profit in millions (float)
- "capex_est": Capital expenditure in thousands (must be <50K via deals)
- "risk_factors": Array of key risks
- "deal_value_percent": Percentage of value from deals/partnerships (>70%)
- "timeline_months": Implementation timeline (3-6 months)
- "likelihood": Success probability (0-1, considering technical/market/regulatory/execution)

Use chain-of-thought:
Step 1: Market analysis
Step 2: Deal structures (emphasize low-cost partnerships)
Step 3: Financial projections

Ideas to enrich:
${JSON.stringify(ideas, null, 2)}

Return as JSON array with original fields plus business_case object.`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`Enricher attempt ${attempt}/3`);
        
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
          store: true
        });

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
    const scores = enrichedIdeas.map(idea => {
      const bc = idea.business_case;
      const score = bc.likelihood * bc.roi_proj * Math.exp(-bc.capex_est / this.config.maxCapex);
      return { ...idea, score, rank: 0 };
    });

    scores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.business_case.deal_value_percent - a.business_case.deal_value_percent;
    });

    scores.forEach((idea, index) => {
      idea.rank = index + 1;
    });

    const avgScore = scores.reduce((sum, idea) => sum + idea.score, 0) / scores.length;
    const feedback = avgScore < 0.5 ? 
      'Boost low-risk filters, emphasize equity swaps and revenue shares over direct investment' : '';

    return { rankedIdeas: scores, feedback };
  }

  async refiner(topIdeas, genNum, priorFeedback = '') {
    const refinePrompt = `Refine these top 2 ideas by generating 3 variations each:
${JSON.stringify(topIdeas, null, 2)}

Generation ${genNum}/${this.config.generations}

Create variations that:
- Enhance deals for higher potential
- Lower CapEx/risk through creative partnerships
- Add timeliness improvements
- Explore IP licensing, equity swaps, cross-industry partnerships

${priorFeedback ? `Incorporate feedback: ${priorFeedback}` : ''}

Output exactly 5 best ideas (sub-rank by novelty and potential) as JSON array.
Ensure non-obvious evolutions that build on strengths while addressing weaknesses.`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`Refiner attempt ${attempt}/3`);
        
        const response = await this.client.responses.create({
          model: this.config.model,
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: "You are an innovation expert specializing in iterative improvement and creative mutation of business ideas." }]
            },
            {
              role: "user",
              content: [{ type: "input_text", text: refinePrompt }]
            }
          ],
          text: { format: { type: "text" } },
          reasoning: { effort: "medium" },
          store: true
        });

        const refined = await this.parseResponse(response, refinePrompt);
        return refined.slice(0, this.config.populationSize);
      } catch (error) {
        logger.error(`Refiner attempt ${attempt} failed:`, error.message);
        
        if (attempt === 3) {
          logger.error('All refiner attempts failed, trying fallback model');
          try {
            const fallbackResponse = await this.client.chat.completions.create({
              model: this.config.fallbackModel,
              messages: [
                { role: 'system', content: 'You are an innovation expert specializing in iterative improvement and creative mutation of business ideas.' },
                { role: 'user', content: refinePrompt }
              ],
              temperature: 0.7,
              max_tokens: 3000
            });
            
            const fallbackContent = fallbackResponse.choices[0].message.content;
            const refined = await this.parseResponse({ output: [{ type: 'text', content: fallbackContent }] }, refinePrompt);
            return refined.slice(0, this.config.populationSize);
          } catch (fallbackError) {
            logger.error('Fallback model also failed:', fallbackError);
            throw error;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async evolve(problemContext, initialSolutions = [], customConfig = {}) {
    const config = {
      ...this.config,
      ...customConfig
    };
    
    logger.info('Starting evolution with:', {
      problemContext: problemContext.substring(0, 100) + '...',
      initialSolutionCount: initialSolutions.length,
      generations: config.generations,
      customConfig
    });
    
    let currentGen = initialSolutions;
    let evolutionFeedback = '';
    let generationHistory = [];
    let allGenerationSolutions = [];

    for (let gen = 1; gen <= config.generations; gen++) {
      logger.info(`Generation ${gen}/${config.generations}`);

      if (currentGen.length < config.populationSize) {
        currentGen = await this.variator(currentGen, config.populationSize, problemContext, evolutionFeedback);
      }

      const enriched = await this.enricher(currentGen);
      const { rankedIdeas, feedback } = await this.ranker(enriched);
      evolutionFeedback = feedback;

      rankedIdeas.forEach(solution => {
        allGenerationSolutions.push({
          ...solution,
          generation: gen,
          last_generation: gen,
          total_generations: config.generations
        });
      });

      generationHistory.push({
        generation: gen,
        topScore: rankedIdeas[0]?.score || 0,
        avgScore: rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length,
        solutionCount: rankedIdeas.length
      });

      if (gen === config.generations) {
        return {
          topSolutions: rankedIdeas.slice(0, 5),
          allSolutions: allGenerationSolutions,
          generationHistory,
          totalEvaluations: gen * config.populationSize,
          totalSolutions: allGenerationSolutions.length
        };
      }

      const topTwo = rankedIdeas.slice(0, config.topSelectCount);
      currentGen = await this.refiner(topTwo, gen, evolutionFeedback);
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