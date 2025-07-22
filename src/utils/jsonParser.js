import { jsonrepair } from 'jsonrepair';
import logger from './logger.js';

/**
 * Robust JSON parser with multiple fallback strategies
 * Designed to handle malformed JSON from LLM responses
 */
export class RobustJsonParser {
  /**
   * Parse JSON with multiple fallback strategies
   * @param {string} content - The content to parse
   * @param {string} context - Context for logging (e.g., 'enricher', 'variator')
   * @returns {object|array} - Parsed JSON object or array
   * @throws {Error} - If all parsing strategies fail
   */
  static parse(content, context = 'unknown') {
    if (!content) {
      throw new Error('No content to parse');
    }

    // Strategy 1: Try direct JSON parsing
    try {
      const parsed = JSON.parse(content);
      logger.info(`${context}: Direct JSON parsing successful`);
      return parsed;
    } catch (e1) {
      logger.info(`${context}: Direct JSON parsing failed, trying repair`);
    }

    // Strategy 2: Use jsonrepair library
    try {
      const repaired = jsonrepair(content);
      const parsed = JSON.parse(repaired);
      logger.info(`${context}: JSON repair successful`);
      return parsed;
    } catch (e2) {
      logger.info(`${context}: JSON repair failed, trying extraction`);
    }

    // Strategy 3: Extract JSON from mixed content
    try {
      // Remove markdown code blocks
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Find JSON array or object
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);

      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0]);
        logger.info(`${context}: Extracted JSON array from mixed content`);
        return parsed;
      }

      if (objectMatch) {
        const parsed = JSON.parse(objectMatch[0]);
        logger.info(`${context}: Extracted JSON object from mixed content`);
        return parsed;
      }
    } catch (e3) {
      logger.info(`${context}: JSON extraction failed, trying aggressive cleanup`);
    }

    // Strategy 4: Aggressive cleanup and repair
    try {
      // Remove common LLM response artifacts
      let cleaned = content
        .replace(/^[^[{]*/s, '') // Remove any text before JSON
        .replace(/[^}\]]*$/s, '') // Remove any text after JSON
        .replace(/\\\\"/g, '"') // Fix escaped quotes
        .replace(/\\\\/g, '\\') // Fix double backslashes
        .trim();

      // Try to repair and parse
      const repaired = jsonrepair(cleaned);
      const parsed = JSON.parse(repaired);
      logger.info(`${context}: Aggressive cleanup and repair successful`);
      return parsed;
    } catch (e4) {
      logger.error(`${context}: All parsing strategies failed`);
      logger.error(`${context}: Content preview:`, content.substring(0, 500));
    }

    // All strategies failed
    throw new Error('Failed to parse JSON after trying all strategies');
  }

  /**
   * Validate that parsed content matches expected structure
   * @param {any} parsed - The parsed content
   * @param {object} options - Validation options
   * @returns {boolean} - True if valid
   */
  static validate(parsed, options = {}) {
    const {
      requireArray = false,
      requireObject = false,
      minLength = 0,
      requiredFields = []
    } = options;

    if (requireArray && !Array.isArray(parsed)) {
      return false;
    }

    if (requireObject && (typeof parsed !== 'object' || parsed === null)) {
      return false;
    }

    if (Array.isArray(parsed) && parsed.length < minLength) {
      return false;
    }

    if (requiredFields.length > 0) {
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.every(item =>
        requiredFields.every(field => Object.prototype.hasOwnProperty.call(item, field))
      );
    }

    return true;
  }

  /**
   * Parse and validate JSON for enricher responses
   * @param {string} content - The content to parse
   * @returns {array} - Array of enriched ideas
   * @throws {Error} - If parsing fails or validation fails
   */
  static parseEnricherResponse(content) {
    const parsed = this.parse(content, 'enricher');

    // Ensure it's an array
    const ideas = Array.isArray(parsed) ? parsed : [parsed];

    // Validate each idea has required fields
    const validIdeas = ideas.filter(idea => {
      if (!idea || typeof idea !== 'object') return false;
      if (!idea.idea_id || !idea.description) return false;
      if (!idea.business_case || typeof idea.business_case !== 'object') return false;

      // Check required business_case fields
      const bc = idea.business_case;
      const hasRequiredFields =
        typeof bc.npv_success === 'number' &&
        typeof bc.capex_est === 'number' &&
        typeof bc.timeline_months === 'number' &&
        typeof bc.likelihood === 'number' &&
        Array.isArray(bc.risk_factors) &&
        Array.isArray(bc.yearly_cashflows);

      if (!hasRequiredFields) {
        logger.warn(`Enricher: Idea ${idea.idea_id} missing required business_case fields`);
        return false;
      }

      return true;
    });

    if (validIdeas.length === 0) {
      throw new Error('No valid ideas found after parsing');
    }

    logger.info(`Enricher: Parsed ${validIdeas.length} valid ideas out of ${ideas.length} total`);
    return validIdeas;
  }

  /**
   * Parse and validate JSON for variator responses
   * @param {string} content - The content to parse
   * @returns {array} - Array of new ideas
   * @throws {Error} - If parsing fails or validation fails
   */
  static parseVariatorResponse(content) {
    const parsed = this.parse(content, 'variator');

    // Ensure it's an array
    const ideas = Array.isArray(parsed) ? parsed : [parsed];

    // Validate each idea has required fields
    const validIdeas = ideas.filter(idea => {
      if (!idea || typeof idea !== 'object') return false;
      if (!idea.idea_id || !idea.description || !idea.core_mechanism) return false;
      return true;
    });

    if (validIdeas.length === 0) {
      throw new Error('No valid ideas found after parsing');
    }

    logger.info(`Variator: Parsed ${validIdeas.length} valid ideas out of ${ideas.length} total`);
    return validIdeas;
  }
}

export default RobustJsonParser;
