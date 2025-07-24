export default {
  timeout: {
    evolve: 14 * 60 * 1000, // 14 minutes
    llm: 300000, // 5 minutes
  },
  evolution: {
    generations: process.env.EVOLUTION_GENERATIONS ? parseInt(process.env.EVOLUTION_GENERATIONS) : 10,
    populationSize: 5,
    topPerformerRatio: 0.3,  // Top 30% of solutions
    maxCapex: 100000,  // $100B in millions (effectively no limit)
    minProfits: 0,     // No minimum NPV filter
    diversificationFactor: 0.05,  // $50K in millions
    model: 'o3',
    offspringRatio: 0.7,
    dealTypes: 'creative partnerships and business models',
    maxRetries: process.env.EVOLUTION_MAX_RETRIES ? parseInt(process.env.EVOLUTION_MAX_RETRIES) : 3,
    retryDelay: 1000,
    enableRetries: process.env.EVOLUTION_ENABLE_RETRIES === 'true' || false,
    enableGracefulDegradation: process.env.EVOLUTION_GRACEFUL_DEGRADATION === 'true' || false,
  }
};