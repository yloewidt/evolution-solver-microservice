#!/usr/bin/env node
import fetch from 'node-fetch';
import fs from 'fs/promises';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';

// Get job details
async function getJobDetails(jobId) {
  const [status, analytics] = await Promise.all([
    fetch(`${API_URL}/api/evolution/jobs/${jobId}`).then(r => r.json()),
    fetch(`${API_URL}/api/evolution/jobs/${jobId}/analytics`).then(r => r.json())
  ]);
  return { status, analytics };
}

// Create detailed generation breakdown
async function analyzeGenerationBreakdown() {
  try {
    const jobInfo = JSON.parse(await fs.readFile('parallel-jobs.json', 'utf8'));
    
    console.log('📊 Detailed Generation Score Breakdown');
    console.log('=====================================\n');
    
    // Get all job details
    const allJobs = await Promise.all(
      jobInfo.map(async job => ({
        ...job,
        details: await getJobDetails(job.jobId)
      }))
    );
    
    // Process each job
    for (const job of allJobs) {
      const { analytics, status } = job.details;
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📌 ${job.name} (Target: ${job.generations} generations × ${job.populationSize} ideas)`);
      console.log(`${'='.repeat(70)}`);
      
      // Get all solutions
      const solutions = analytics.solutions?.all || [];
      console.log(`Total Ideas Generated: ${solutions.length}`);
      
      // Check generation data from multiple sources
      // 1. From solutions
      const byGenFromSolutions = {};
      solutions.forEach(solution => {
        const gen = solution.generation || 'unknown';
        if (!byGenFromSolutions[gen]) {
          byGenFromSolutions[gen] = [];
        }
        byGenFromSolutions[gen].push(solution);
      });
      
      // 2. From generations field in status
      const generationsData = status.generations || {};
      
      // 3. From API calls
      const apiCalls = status.apiCalls || [];
      const apiCallsByGen = {};
      apiCalls.forEach(call => {
        if (call.generation !== undefined) {
          const gen = call.generation;
          if (!apiCallsByGen[gen]) {
            apiCallsByGen[gen] = { variator: 0, enricher: 0, ranker: 0 };
          }
          if (call.phase) {
            apiCallsByGen[gen][call.phase]++;
          }
        }
      });
      
      // Display generation data from status.generations
      if (Object.keys(generationsData).length > 0) {
        console.log('\n📊 Generation Data (from status.generations):');
        console.log('Gen | Phase     | Status    | Ideas | Start Time');
        console.log('----|-----------|-----------|-------|------------');
        
        Object.entries(generationsData).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([gen, data]) => {
          ['variator', 'enricher', 'ranker'].forEach(phase => {
            if (data[phase]) {
              const phaseData = data[phase];
              const ideasCount = phaseData.ideas?.length || 0;
              const startTime = phaseData.startTime ? new Date(phaseData.startTime).toTimeString().slice(0, 8) : 'N/A';
              console.log(
                `${gen.padEnd(3)} | ${phase.padEnd(9)} | ${(phaseData.status || 'N/A').padEnd(9)} | ${ideasCount.toString().padEnd(5)} | ${startTime}`
              );
            }
          });
        });
      }
      
      // Display API call breakdown
      console.log('\n📞 API Calls by Generation:');
      console.log('Gen | Variator | Enricher | Ranker | Total');
      console.log('----|----------|----------|--------|-------');
      
      Object.entries(apiCallsByGen).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([gen, calls]) => {
        const total = calls.variator + calls.enricher + calls.ranker;
        console.log(
          `${gen.padEnd(3)} | ${calls.variator.toString().padEnd(8)} | ${calls.enricher.toString().padEnd(8)} | ${calls.ranker.toString().padEnd(6)} | ${total}`
        );
      });
      
      // Display score analysis by generation
      console.log('\n📈 Score Analysis by Generation:');
      console.log('Gen | Ideas | Avg Score | Min Score | Max Score | Std Dev | Distribution');
      console.log('----|-------|-----------|-----------|-----------|---------|-------------');
      
      // Analyze solutions by generation
      const allGenerations = new Set([
        ...Object.keys(byGenFromSolutions),
        ...Object.keys(generationsData),
        ...Object.keys(apiCallsByGen)
      ]);
      
      allGenerations.forEach(gen => {
        if (gen === 'unknown') return;
        
        const genSolutions = byGenFromSolutions[gen] || [];
        if (genSolutions.length === 0) {
          console.log(`${gen.toString().padEnd(3)} | ${'0'.padEnd(5)} | No solutions generated`);
          return;
        }
        
        const scores = genSolutions.map(s => s.score || 0);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        
        // Calculate standard deviation
        const variance = scores.reduce((acc, score) => acc + Math.pow(score - avgScore, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);
        
        // Create simple distribution visualization
        const positiveCount = scores.filter(s => s > 0).length;
        const negativeCount = scores.filter(s => s < 0).length;
        const distribution = `+${positiveCount}/-${negativeCount}`;
        
        console.log(
          `${gen.toString().padEnd(3)} | ${genSolutions.length.toString().padEnd(5)} | ${avgScore.toFixed(3).padEnd(9)} | ${minScore.toFixed(3).padEnd(9)} | ${maxScore.toFixed(3).padEnd(9)} | ${stdDev.toFixed(3).padEnd(7)} | ${distribution}`
        );
      });
      
      // Show expected vs actual generations
      console.log(`\n⚠️  Expected Generations: ${job.generations}, Actual API Generations: ${Object.keys(apiCallsByGen).length}`);
      
      // If all solutions are in one generation, investigate why
      if (Object.keys(byGenFromSolutions).length === 1 && solutions.length > job.populationSize) {
        console.log('\n🔍 Investigation: All solutions marked as single generation');
        console.log('This suggests the generation tracking is not working properly.');
        console.log('Possible causes:');
        console.log('- Generation field not being properly set in enricher responses');
        console.log('- Workflow not passing generation number correctly');
        console.log('- Solutions from retries overwriting generation data');
      }
    }
    
    // Summary comparison
    console.log('\n\n📊 Summary: Generation Progression Across Jobs');
    console.log('==============================================\n');
    console.log('Job Config       | Gens Expected | Gens w/Data | Ideas Gen1 | Total Ideas | Avg Score Gen1');
    console.log('-----------------|---------------|-------------|------------|-------------|---------------');
    
    for (const job of allJobs) {
      const solutions = job.details.analytics.solutions?.all || [];
      const byGen = {};
      solutions.forEach(s => {
        const gen = s.generation || 1;
        if (!byGen[gen]) byGen[gen] = [];
        byGen[gen].push(s);
      });
      
      const gen1Ideas = byGen[1]?.length || 0;
      const gen1Avg = byGen[1] ? byGen[1].reduce((sum, s) => sum + (s.score || 0), 0) / byGen[1].length : 0;
      const gensWithData = Object.keys(byGen).length;
      
      console.log(
        `${job.name.padEnd(16)} | ${job.generations.toString().padEnd(13)} | ${gensWithData.toString().padEnd(11)} | ${gen1Ideas.toString().padEnd(10)} | ${solutions.length.toString().padEnd(11)} | ${gen1Avg.toFixed(3)}`
      );
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run analysis
analyzeGenerationBreakdown().catch(console.error);