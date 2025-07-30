// Simplified configuration with defaults
const config = {
  // Service configuration
  port: parseInt(process.env.PORT) || 8080,
  environment: process.env.NODE_ENV || 'development',

  // API Keys
  openaiKey: process.env.OPENAI_API_KEY,

  // GCP Configuration
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || 'evolutionsolver',
    location: process.env.GCP_LOCATION || 'us-central1',
    firestore: {
      database: process.env.FIRESTORE_DATABASE || '(default)',
      collection: process.env.FIRESTORE_COLLECTION || 'evolution-results'
    },
    tasks: {
      queue: process.env.CLOUD_TASKS_QUEUE || 'evolution-jobs',
      workerUrl: process.env.EVOLUTION_WORKER_URL
    }
  },

  // Evolution Algorithm Settings
  evolution: {
    generations: parseInt(process.env.EVOLUTION_GENERATIONS) || 10,
    populationSize: 5,
    topPerformerRatio: 0.3,
    offspringRatio: 0.7,
    model: 'o3',

    // Financial constraints (in millions USD)
    maxCapex: 100000,  // $100B (effectively no limit)
    minProfits: 0,     // No minimum NPV filter
    diversificationFactor: 0.05,  // $50K

    // Retry configuration
    maxRetries: parseInt(process.env.EVOLUTION_MAX_RETRIES) || 3,
    retryDelay: 1000,
    enableRetries: process.env.EVOLUTION_ENABLE_RETRIES === 'true'
  },

  // Timeouts (milliseconds)
  timeouts: {
    evolution: 14 * 60 * 1000, // 14 minutes
    llm: 5 * 60 * 1000         // 5 minutes
  }
};

export default config;
