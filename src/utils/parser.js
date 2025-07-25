import { jsonrepair } from 'jsonrepair';
import logger from './logger.js';

/**
 * Consolidated parser for JSON and LLM responses
 */
class Parser {
  /**
   * Safe JSON parsing with multiple strategies
   * (from jsonParser.js)
   */
  static safeJsonParse(text) {
    return Parser.parse(text, 'json');
  }

  /**
   * Generic parse method with repair strategies
   * (merged from jsonParser.js)
   */
  static parse(content, context = 'unknown') {
    if (!content) {
      throw new Error('No content to parse');
    }

    // Strategy 1: Direct parsing
    try {
      const parsed = JSON.parse(content);
      logger.info(`${context}: Direct JSON parsing successful`);
      return parsed;
    } catch (e1) {
      logger.info(`${context}: Direct JSON parsing failed, trying repair`);
    }

    // Strategy 2: JSON repair
    try {
      const repaired = jsonrepair(content);
      const parsed = JSON.parse(repaired);
      logger.info(`${context}: JSON repair successful`);
      return parsed;
    } catch (e2) {
      logger.info(`${context}: JSON repair failed, trying extraction`);
    }

    // Strategy 3: Extract JSON from text
    try {
      let jsonContent = content;

      // Remove markdown code blocks
      jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Find JSON-like content
      const jsonMatch = jsonContent.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }

      // Clean common issues
      jsonContent = jsonContent
        .replace(/^[^[{]*/g, '')
        .replace(/[^}\]]*$/g, '')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*\]/g, ']');

      const parsed = JSON.parse(jsonContent);
      logger.info(`${context}: JSON extraction successful`);
      return parsed;
    } catch (e3) {
      logger.info(`${context}: JSON extraction failed, trying aggressive cleanup`);
    }

    // Strategy 4: Aggressive cleanup and repair
    try {
      let cleaned = content
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^[^[{]*/, '')
        .replace(/[^}\]]*$/, '')
        .replace(/\\'/g, "'")
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const repaired = jsonrepair(cleaned);
      const parsed = JSON.parse(repaired);
      logger.info(`${context}: Aggressive cleanup and repair successful`);
      return parsed;
    } catch (e4) {
      logger.error(`${context}: All parsing strategies failed`);
      logger.error(`${context}: Content preview:`, content.substring(0, 500));
      logger.error(`${context}: Final error:`, e4);
    }

    throw new Error('Failed to parse JSON after trying all strategies');
  }

  /**
   * Parse LLM response based on format
   * (from responseParser.js)
   */
  static parseLLMResponse(response, phase = 'unknown') {
    if (!response) {
      throw new Error('No response to parse');
    }

    // Handle OpenAI format
    if (response.choices && response.choices[0]) {
      return Parser.parseOpenAIResponse(response, phase);
    }

    // Handle direct content
    if (typeof response === 'string') {
      return Parser.parse(response, phase);
    }

    throw new Error('Unknown response format');
  }

  /**
   * Parse OpenAI-style response
   * (from responseParser.js)
   */
  static parseOpenAIResponse(response, phase = 'unknown') {
    logger.info(`Parsing OpenAI response for ${phase}`);

    if (!response.choices || !response.choices[0]) {
      throw new Error('Invalid OpenAI response structure');
    }

    const choice = response.choices[0];
    let content = '';

    // Extract content based on response structure
    if (choice.message && choice.message.content) {
      content = choice.message.content;
    } else if (choice.text) {
      content = choice.text;
    } else if (choice.delta && choice.delta.content) {
      content = choice.delta.content;
    }

    if (!content) {
      throw new Error('No content found in response');
    }

    // Clean and parse the content
    const cleaned = content.trim();

    try {
      const parsed = JSON.parse(cleaned);
      logger.info(`${phase}: Direct JSON parsing successful`);
      return parsed;
    } catch (e) {
      // Use jsonrepair for automatic fixing
      try {
        const repaired = jsonrepair(cleaned);
        const parsed = JSON.parse(repaired);
        logger.info(`${phase}: JSON repair successful`);
        return parsed;
      } catch (repairError) {
        logger.error(`${phase}: JSON repair failed:`, repairError.message);
        logger.error(`${phase}: Content preview:`, cleaned.substring(0, 500));
        throw new Error(`Failed to parse JSON: ${repairError.message}`);
      }
    }
  }

  /**
   * Parse variator response
   * (from responseParser.js)
   */
  static parseVariatorResponse(response) {
    const parsed = Parser.parseLLMResponse(response, 'variator');

    // Handle both single object and array responses
    if (!Array.isArray(parsed)) {
      // If it's a single idea, wrap it in an array
      if (parsed.idea_id || parsed.description) {
        return [parsed];
      }

      // If it has an 'ideas' property, extract that
      if (parsed.ideas && Array.isArray(parsed.ideas)) {
        return parsed.ideas;
      }

      // If it has a 'solutions' property, extract that
      if (parsed.solutions && Array.isArray(parsed.solutions)) {
        return parsed.solutions;
      }

      // Otherwise, try to extract array from object values
      const values = Object.values(parsed);
      const arrays = values.filter(v => Array.isArray(v));
      if (arrays.length > 0) {
        return arrays[0];
      }

      throw new Error('Response is not in expected format (array of ideas)');
    }

    return parsed;
  }

  /**
   * Parse enricher response
   * (from responseParser.js)
   */
  static parseEnricherResponse(response) {
    const parsed = Parser.parseLLMResponse(response, 'enricher');

    // Validate it has required enriched idea structure
    if (!parsed.business_case) {
      throw new Error('Enriched idea missing business_case');
    }

    return parsed;
  }

  /**
   * Clean LLM output - removes markdown, code blocks, etc
   * (from responseParser.js)
   */
  static cleanLLMOutput(text) {
    if (!text) return '';

    return text
      // Remove markdown code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove backticks
      .replace(/`/g, '')
      // Remove markdown formatting
      .replace(/[*_~]/g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Trim
      .trim();
  }

  /**
   * Validate and clean ideas array
   * (from both parsers)
   */
  static validateIdeas(ideas, requiredFields = ['idea_id', 'description']) {
    if (!Array.isArray(ideas)) {
      throw new Error('Ideas must be an array');
    }

    const validIdeas = ideas.filter(idea => {
      if (!idea || typeof idea !== 'object') return false;

      // Check required fields
      for (const field of requiredFields) {
        if (!idea[field]) {
          logger.warn(`Idea missing required field: ${field}`, idea);
          return false;
        }
      }

      return true;
    });

    if (validIdeas.length === 0) {
      throw new Error('No valid ideas found after parsing');
    }

    return validIdeas;
  }
}

export default Parser;
export { Parser };
