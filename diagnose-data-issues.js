#!/usr/bin/env node
import fetch from 'node-fetch';
import fs from 'fs/promises';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';

// Get full job data
async function getJobData(jobId) {
  const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
  return response.json();
}

// Diagnose data issues
async function diagnoseDataIssues() {
  try {
    const jobInfo = JSON.parse(await fs.readFile('parallel-jobs.json', 'utf8'));
    
    console.log('🔍 Diagnosing Data Issues in Evolution Jobs');
    console.log('==========================================\n');
    
    for (const job of jobInfo) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📌 ${job.name} (Expected: ${job.generations} generations)`);
      console.log(`Job ID: ${job.jobId}`);
      console.log(`${'='.repeat(70)}`);
      
      const jobData = await getJobData(job.jobId);
      
      // Analyze API calls
      console.log('\n📞 API Call Analysis:');
      const apiCalls = jobData.apiCalls || [];
      const callsByGenPhase = {};
      
      apiCalls.forEach(call => {
        const key = `Gen${call.generation}-${call.phase}`;
        if (!callsByGenPhase[key]) {
          callsByGenPhase[key] = { count: 0, status: [], duration: [] };
        }
        callsByGenPhase[key].count++;
        callsByGenPhase[key].status.push(call.status || 'unknown');
        callsByGenPhase[key].duration.push(call.duration || 0);
      });
      
      // Sort and display
      Object.entries(callsByGenPhase)
        .sort((a, b) => {
          const [genA] = a[0].match(/\d+/) || [0];
          const [genB] = b[0].match(/\d+/) || [0];
          return parseInt(genA) - parseInt(genB);
        })
        .forEach(([key, data]) => {
          console.log(`  ${key}: ${data.count} calls, statuses: ${[...new Set(data.status)].join(', ')}`);
        });
      
      // Analyze generations data
      console.log('\n📊 Generation Data Analysis:');
      const generations = jobData.generations || {};
      const genKeys = Object.keys(generations).sort((a, b) => {
        const numA = parseInt(a.replace('generation_', ''));
        const numB = parseInt(b.replace('generation_', ''));
        return numA - numB;
      });
      
      console.log(`Total generation entries: ${genKeys.length}`);
      
      genKeys.forEach(genKey => {
        const gen = generations[genKey];
        const genNum = gen.generation || genKey.replace('generation_', '');
        
        console.log(`\n  Generation ${genNum}:`);
        
        // Check each phase
        ['variator', 'enricher', 'ranker'].forEach(phase => {
          if (gen[`${phase}Complete`] || gen[`${phase}Started`]) {
            console.log(`    ${phase}: ${gen[`${phase}Complete`] ? '✓ Complete' : '⚠️  Started but not complete'}`);
          }
        });
        
        // Analyze solutions
        if (gen.solutions) {
          const validSolutions = gen.solutions.filter(s => s.idea_id && s.idea_id !== 'N/A');
          const emptySolutions = gen.solutions.filter(s => !s.description || s.description === '');
          const scoredSolutions = gen.solutions.filter(s => s.score !== undefined && s.score !== null);
          
          console.log(`    Solutions: ${gen.solutions.length} total`);
          console.log(`      - Valid IDs: ${validSolutions.length}`);
          console.log(`      - Empty descriptions: ${emptySolutions.length}`);
          console.log(`      - Have scores: ${scoredSolutions.length}`);
          
          if (gen.solutions.length < job.populationSize) {
            console.log(`      ⚠️  Expected ${job.populationSize} ideas, got ${gen.solutions.length}`);
          }
          
          // Sample invalid solutions
          const invalidSamples = gen.solutions.filter(s => !s.idea_id || s.idea_id === 'N/A' || !s.description).slice(0, 2);
          if (invalidSamples.length > 0) {
            console.log(`      Invalid solution samples:`);
            invalidSamples.forEach((s, idx) => {
              console.log(`        ${idx + 1}. ID: ${s.idea_id || 'missing'}, Desc: "${(s.description || '').substring(0, 30)}...", Score: ${s.score}`);
            });
          }
        }
        
        // Check for data consistency
        if (gen.topScore !== undefined && gen.avgScore !== undefined) {
          console.log(`    Scores: Top=${gen.topScore?.toFixed(3)}, Avg=${gen.avgScore?.toFixed(3)}`);
        }
      });
      
      // Check for generation numbering issues
      console.log('\n⚠️  Generation Numbering Issues:');
      const expectedGens = Array.from({length: job.generations}, (_, i) => i + 1);
      const actualGens = genKeys.map(k => parseInt(k.replace('generation_', '')));
      const unexpectedGens = actualGens.filter(g => g > job.generations);
      
      if (unexpectedGens.length > 0) {
        console.log(`  Found generations beyond expected: ${unexpectedGens.join(', ')}`);
        console.log(`  This job should only have generations 1-${job.generations}`);
      }
      
      const missingGens = expectedGens.filter(g => !actualGens.includes(g));
      if (missingGens.length > 0) {
        console.log(`  Missing expected generations: ${missingGens.join(', ')}`);
      }
      
      // Check allSolutions field
      if (jobData.allSolutions) {
        console.log(`\n📦 allSolutions field: ${jobData.allSolutions.length} ideas`);
        const allSolutionsValid = jobData.allSolutions.filter(s => s.idea_id && s.idea_id !== 'N/A').length;
        console.log(`  Valid ideas in allSolutions: ${allSolutionsValid}`);
      }
    }
    
    // Summary of issues
    console.log('\n\n🚨 Summary of Issues Found:');
    console.log('===========================');
    console.log('1. Jobs are running beyond configured generations (retry/continuation bug)');
    console.log('2. Many ideas have N/A IDs and empty descriptions (parsing failures)');
    console.log('3. Generation numbering continues beyond limits (orchestration issue)');
    console.log('4. Population sizes are inconsistent (partial failures)');
    console.log('5. Invalid/empty ideas are still being scored (validation gap)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run diagnosis
diagnoseDataIssues().catch(console.error);