import { jsonrepair } from 'jsonrepair';
import logger from './logger.js';

/**
 * Optimized response parser for LLM outputs
 * Focuses on the actual response structure from o3 model
 */
export class ResponseParser {
  /**
   * Extract text content from various response formats
   */
  static extractContent(response) {
    // o3 model response format
    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === 'text' && item.content) {
          return item.content;
        }
        if (item.type === 'message' && item.content?.[0]?.text) {
          return item.content[0].text;
        }
      }
    }

    // Alternative o3 format
    if (response.output_text) {
      return response.output_text;
    }

    // OpenAI chat completion format
    if (response.choices?.[0]?.message?.content) {
      return response.choices[0].message.content;
    }

    // Direct content
    if (response.content) {
      return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    }

    throw new Error('No content found in response');
  }

  /**
   * Parse JSON with automatic repair
   */
  static parseJSON(content, context = 'unknown') {
    // Clean common LLM artifacts
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // Try direct parsing first
    try {
      const parsed = JSON.parse(cleaned);
      logger.info(`${context}: Direct JSON parsing successful`);
      return parsed;
    } catch (e) {
      // Use jsonrepair for automatic fixing
      try {
        const repaired = jsonrepair(cleaned);
        const parsed = JSON.parse(repaired);
        logger.info(`${context}: JSON repair successful`);
        return parsed;
      } catch (repairError) {
        logger.error(`${context}: JSON repair failed:`, repairError.message);
        logger.error(`${context}: Content preview:`, cleaned.substring(0, 500));
        throw new Error(`Failed to parse JSON: ${repairError.message}`);
      }
    }
  }

  /**
   * Parse and validate variator response
   */
  static parseVariatorResponse(response, generation = 1, jobId = null, topPerformerIds = null) {
    const content = this.extractContent(response);
    const parsed = this.parseJSON(content, 'variator');

    // Handle structured output format (object with ideas array)
    const ideas = Array.isArray(parsed) ? parsed : (parsed.ideas || [parsed]);

    // Add idea_ids programmatically - ALWAYS override any LLM-generated IDs
    const ideasWithIds = ideas.map((idea, index) => {
      // Generate new ID for all ideas
      const jobIdShort = jobId ? jobId.substring(0, 6) : 'unknown';
      const newId = `VAR_${jobIdShort}_G${generation}_${String(index).padStart(3, '0')}`;
      
      // Strip any existing idea_id from LLM
      const { idea_id: oldId, ...ideaWithoutId } = idea;
      
      if (oldId) {
        logger.info(`Variator: Overriding LLM-generated ID ${oldId} with ${newId} for idea: ${idea.title || 'untitled'}`);
      } else {
        logger.info(`Variator: Generated new idea_id ${newId} for idea: ${idea.title || 'untitled'}`);
      }
      
      return { ...ideaWithoutId, idea_id: newId };
    });

    // Validate required fields (now including title and is_offspring)
    const validIdeas = ideasWithIds.filter(idea => {
      if (!idea || typeof idea !== 'object') return false;
      if (!idea.idea_id || !idea.title || !idea.description || !idea.core_mechanism) {
        logger.warn('Variator: Invalid idea structure', idea);
        return false;
      }
      if (typeof idea.is_offspring !== 'boolean') {
        logger.warn('Variator: Missing is_offspring field', idea);
        return false;
      }
      return true;
    });

    if (validIdeas.length === 0) {
      throw new Error('No valid ideas found in variator response');
    }

    logger.info(`Variator: Parsed ${validIdeas.length} valid ideas`);
    return validIdeas;
  }

  /**
   * Parse and validate enricher response
   */
  static parseEnricherResponse(response) {
    const content = this.extractContent(response);
    const parsed = this.parseJSON(content, 'enricher');

    // Ensure it's an array
    const ideas = Array.isArray(parsed) ? parsed : (parsed.enriched_ideas || [parsed]);

    // Validate required fields
    const validIdeas = ideas.filter(idea => {
      if (!idea || typeof idea !== 'object') return false;
      if (!idea.idea_id || !idea.description) return false;

      const bc = idea.business_case;
      if (!bc || typeof bc !== 'object') {
        logger.warn(`Enricher: Missing business_case for ${idea.idea_id}`);
        return false;
      }

      // Check required business case fields
      const requiredFields = ['npv_success', 'capex_est', 'timeline_months', 'likelihood'];
      for (const field of requiredFields) {
        if (typeof bc[field] !== 'number') {
          logger.warn(`Enricher: Missing or invalid ${field} for ${idea.idea_id}`);
          return false;
        }
      }

      if (!Array.isArray(bc.risk_factors) || !Array.isArray(bc.yearly_cashflows)) {
        logger.warn(`Enricher: Missing arrays in business_case for ${idea.idea_id}`);
        return false;
      }

      return true;
    });

    if (validIdeas.length === 0) {
      throw new Error('No valid enriched ideas found in response');
    }

    logger.info(`Enricher: Parsed ${validIdeas.length} valid ideas`);
    return validIdeas;
  }

  /**
   * Parse OpenAI response format (for both variator and enricher)
   */
  static parseOpenAIResponse(response, phase, generation = 1, jobId = null, topPerformerIds = null) {
    if (phase === 'variator') {
      return this.parseVariatorResponse(response, generation, jobId, topPerformerIds);
    } else if (phase === 'enricher') {
      return this.parseEnricherResponse(response);
    } else {
      throw new Error(`Unknown phase: ${phase}`);
    }
  }
}
