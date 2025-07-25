import EvolutionClient from './evolutionClient.js';

// Example usage of the Evolution Solver Microservice client

async function main() {
  // Initialize client
  const client = new EvolutionClient('http://localhost:8080');

  try {
    // Submit a new evolution job
    console.log('Submitting evolution job...');
    const job = await client.submitJob({
      problemContext: 'How to reduce food waste in urban restaurants while creating new revenue streams',
      evolutionConfig: {
        generations: 3,
        populationSize: 5,
        model: 'o3',
        maxCapex: 50,  // Max $50M initial investment
        minProfits: 10  // Min $10M NPV target
      }
    });

    console.log('Job submitted:', job.jobId);

    // Poll for results
    console.log('Waiting for results...');
    const results = await client.waitForResults(job.jobId, {
      pollingInterval: 5000,  // Check every 5 seconds
      timeout: 300000         // 5 minute timeout
    });

    // Display top solutions
    console.log('\nTop 3 Solutions:');
    results.topSolutions.slice(0, 3).forEach((solution, i) => {
      console.log(`\n${i + 1}. ${solution.title}`);
      console.log(`   Score: ${solution.score.toFixed(2)}`);
      console.log(`   NPV: $${solution.business_case.npv_success}M`);
      console.log(`   Initial Investment: $${solution.business_case.capex_est}M`);
      console.log(`   Description: ${solution.description}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the example
main();