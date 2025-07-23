import logger from '../../src/utils/logger.js';
import * as workerHandlers from './workerHandlers.js';
import * as workerHandlersV2 from './workerHandlersV2.js';

/**
 * Select which worker handlers to use based on configuration
 */
export function getWorkerHandlers(config = {}) {
  // Check if V2 (single-idea enricher) is enabled
  const useV2 = config.useSingleIdeaEnricher || 
                process.env.USE_SINGLE_IDEA_ENRICHER === 'true' ||
                false;

  if (useV2) {
    logger.info('Using V2 worker handlers with single-idea enricher');
    return workerHandlersV2;
  } else {
    logger.info('Using V1 worker handlers with batch enricher');
    return workerHandlers;
  }
}

/**
 * Process variator task using selected handlers
 */
export async function processVariator(payload, resultStore) {
  const handlers = getWorkerHandlers(payload.evolutionConfig);
  return handlers.processVariator(payload, resultStore);
}

/**
 * Process enricher task using selected handlers
 */
export async function processEnricher(payload, resultStore) {
  const handlers = getWorkerHandlers(payload.evolutionConfig);
  return handlers.processEnricher(payload, resultStore);
}

/**
 * Process ranker task using selected handlers
 */
export async function processRanker(payload, resultStore) {
  const handlers = getWorkerHandlers(payload.evolutionConfig);
  return handlers.processRanker(payload, resultStore);
}