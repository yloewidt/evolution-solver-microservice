import logger from '../utils/logger.js';

class EnricherCacheStore {
  constructor(resultStore) {
    this.resultStore = resultStore;
    this.memoryCache = new Map(); // In-memory cache for current session
  }

  /**
   * Get cached enriched idea
   */
  async getEnrichedIdea(jobId, cacheKey) {
    // Check memory cache first
    const memKey = `${jobId}:${cacheKey}`;
    if (this.memoryCache.has(memKey)) {
      logger.debug(`Memory cache hit for idea ${cacheKey}`);
      return this.memoryCache.get(memKey);
    }

    // Check Firestore
    try {
      const doc = await this.resultStore.getCollection()
        .doc(jobId)
        .collection('enrichedIdeas')
        .doc(cacheKey)
        .get();

      if (doc.exists) {
        const data = doc.data();
        // Cache in memory for future requests
        this.memoryCache.set(memKey, data.enrichedIdea);
        logger.debug(`Firestore cache hit for idea ${cacheKey}`);
        return data.enrichedIdea;
      }
    } catch (error) {
      logger.error('Error retrieving cached idea:', error);
    }

    return null;
  }

  /**
   * Save enriched idea to cache
   */
  async saveEnrichedIdea(jobId, cacheKey, enrichedIdea) {
    const memKey = `${jobId}:${cacheKey}`;
    
    // Save to memory cache immediately
    this.memoryCache.set(memKey, enrichedIdea);

    // Save to Firestore
    try {
      await this.resultStore.getCollection()
        .doc(jobId)
        .collection('enrichedIdeas')
        .doc(cacheKey)
        .set({
          enrichedIdea,
          ideaId: enrichedIdea.idea_id,
          cachedAt: new Date(),
          businessCase: enrichedIdea.business_case
        });
      
      logger.debug(`Cached enriched idea ${enrichedIdea.idea_id}`);
    } catch (error) {
      logger.error('Error saving cached idea:', error);
      // Don't throw - caching is best effort
    }
  }

  /**
   * Get all cached ideas for a job
   */
  async getCachedIdeasForJob(jobId) {
    try {
      const snapshot = await this.resultStore.getCollection()
        .doc(jobId)
        .collection('enrichedIdeas')
        .get();

      const cachedIdeas = [];
      snapshot.forEach(doc => {
        cachedIdeas.push({
          cacheKey: doc.id,
          ...doc.data()
        });
      });

      logger.info(`Found ${cachedIdeas.length} cached ideas for job ${jobId}`);
      return cachedIdeas;
    } catch (error) {
      logger.error('Error retrieving cached ideas:', error);
      return [];
    }
  }

  /**
   * Clear memory cache (useful for testing)
   */
  clearMemoryCache() {
    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      memoryCacheKeys: Array.from(this.memoryCache.keys())
    };
  }
}

export default EnricherCacheStore;