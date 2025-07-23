#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';

async function validateFix() {
  console.log('🧪 Testing parameter fix with a small job...\n');
  
  // Create a test job with 2 generations and 8 ideas
  const response = await fetch(`${API_URL}/api/evolution/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problemContext: 'Create a simple test solution for urban farming',
      preferences: {
        max_capex: 1.0,
        target_return: 5,
        timeline_months: 12
      },
      parameters: {
        generations: 2,
        populationSize: 8
      }
    })
  });
  
  const job = await response.json();
  if (job.error) {
    console.error('❌ Error creating job:', job.error);
    return;
  }
  
  console.log('✅ Job created:', job.jobId);
  console.log('   Expected: 2 generations, 8 ideas per generation\n');
  
  // Wait a moment then check the job configuration
  console.log('⏳ Waiting 5 seconds for job to initialize...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check job status
  const statusResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}`);
  const jobData = await statusResponse.json();
  
  console.log('\n📋 Job Configuration Check:');
  console.log('   Actual config:', JSON.stringify(jobData.evolutionConfig, null, 2));
  
  const configCorrect = 
    jobData.evolutionConfig.generations === 2 && 
    jobData.evolutionConfig.populationSize === 8;
  
  if (configCorrect) {
    console.log('\n✅ SUCCESS: Configuration is correct!');
    console.log('   - Generations: ' + jobData.evolutionConfig.generations + ' (expected 2)');
    console.log('   - Population Size: ' + jobData.evolutionConfig.populationSize + ' (expected 8)');
  } else {
    console.log('\n❌ FAIL: Configuration is still wrong!');
    console.log('   - Generations: ' + jobData.evolutionConfig.generations + ' (expected 2)');
    console.log('   - Population Size: ' + jobData.evolutionConfig.populationSize + ' (expected 8)');
  }
  
  // Monitor for 30 seconds
  console.log('\n📊 Monitoring job for 30 seconds...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < 30000) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const checkResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}`);
    const checkData = await checkResponse.json();
    
    const genCount = Object.keys(checkData.generations || {}).length;
    let ideaCount = 0;
    
    Object.values(checkData.generations || {}).forEach(gen => {
      ideaCount += (gen.solutions || []).length;
    });
    
    console.log(`   Status: ${checkData.status}, Generations: ${genCount}, Total Ideas: ${ideaCount}`);
    
    if (checkData.status === 'completed' || checkData.status === 'failed') {
      console.log('\n📈 Final Results:');
      console.log(`   - Total Generations: ${genCount} (expected 2)`);
      console.log(`   - Total Ideas: ${ideaCount} (expected ~16)`);
      
      // Check first generation idea count
      const gen1 = checkData.generations?.generation_1;
      if (gen1) {
        console.log(`   - Generation 1 ideas: ${(gen1.solutions || []).length} (expected 8)`);
      }
      
      break;
    }
  }
  
  console.log('\n✅ Validation complete');
}

validateFix().catch(console.error);