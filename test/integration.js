import fetch from 'node-fetch';

const API_URL = 'http://localhost:8080';

async function testHealthEndpoints() {
  console.log('Testing health endpoints...');

  try {
    // Test root endpoint
    const rootResponse = await fetch(`${API_URL}/`);
    const rootData = await rootResponse.json();
    console.log('✓ Root endpoint:', rootData.status);

    // Test health endpoint
    const healthResponse = await fetch(`${API_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✓ Health endpoint:', healthData.status);

    // Test ready endpoint
    const readyResponse = await fetch(`${API_URL}/ready`);
    const readyData = await readyResponse.json();
    console.log('✓ Ready endpoint:', readyData.status);

  } catch (error) {
    console.error('✗ Health check failed:', error.message);
  }
}

async function testEvolutionJobSubmission() {
  console.log('\nTesting job submission...');

  try {
    const jobData = {
      problemContext: 'Test problem: How to reduce supply chain costs by 20% in the automotive industry',
      parameters: {
        generations: 2,
        populationSize: 3,
        maxCapex: 50000,
        targetROI: 10
      }
    };

    const response = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(jobData)
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✓ Job submitted:', result.jobId);
      console.log('  Status:', result.status);
      console.log('  Message:', result.message);
      return result.jobId;
    } else {
      console.error('✗ Job submission failed:', result.error);
    }
  } catch (error) {
    console.error('✗ Job submission error:', error.message);
  }
}

async function testJobStatus(jobId) {
  console.log(`\nTesting job status for ${jobId}...`);

  try {
    const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
    const status = await response.json();

    if (response.ok) {
      console.log('✓ Job status retrieved:');
      console.log('  Status:', status.status);
      console.log('  Created:', status.createdAt);
      console.log('  Updated:', status.updatedAt);
    } else {
      console.error('✗ Status retrieval failed:', status.error);
    }
  } catch (error) {
    console.error('✗ Status retrieval error:', error.message);
  }
}

async function testListJobs() {
  console.log('\nTesting job listing...');

  try {
    const response = await fetch(`${API_URL}/api/evolution/jobs?limit=10`);
    const data = await response.json();

    if (response.ok) {
      console.log('✓ Jobs listed:');
      console.log('  Total:', data.total);
      console.log('  Count:', data.jobs.length);
      if (data.jobs.length > 0) {
        console.log('  First job:', data.jobs[0].jobId, '-', data.jobs[0].status);
      }
    } else {
      console.error('✗ Job listing failed:', data.error);
    }
  } catch (error) {
    console.error('✗ Job listing error:', error.message);
  }
}

async function testStats() {
  console.log('\nTesting statistics endpoint...');

  try {
    const response = await fetch(`${API_URL}/api/evolution/stats`);
    const stats = await response.json();

    if (response.ok) {
      console.log('✓ Statistics retrieved:');
      console.log('  Total jobs:', stats.jobs?.total || 0);
      console.log('  Completed:', stats.jobs?.completed || 0);
      console.log('  Queue state:', stats.queue?.state || 'unknown');
    } else {
      console.error('✗ Stats retrieval failed:', stats.error);
    }
  } catch (error) {
    console.error('✗ Stats retrieval error:', error.message);
  }
}

async function runIntegrationTests() {
  console.log('Starting Evolution Microservice Integration Tests\n');
  console.log('='.repeat(50));

  await testHealthEndpoints();
  const jobId = await testEvolutionJobSubmission();

  if (jobId) {
    // Wait a bit for job to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    await testJobStatus(jobId);
  }

  await testListJobs();
  await testStats();

  console.log('\n' + '='.repeat(50));
  console.log('Integration tests completed!');
}

// Check if server is running
fetch(`${API_URL}/health`)
  .then(() => runIntegrationTests())
  .catch(() => {
    console.error('Server is not running. Please start the server with: npm start');
    process.exit(1);
  });
