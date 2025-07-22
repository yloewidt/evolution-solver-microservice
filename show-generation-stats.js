#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function showGenerationStats(jobId) {
  try {
    const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
    const data = await response.json();
    
    console.log(`\n📊 Generation Statistics for Job: ${jobId}`);
    console.log('='.repeat(80));
    console.log(`Status: ${data.status}`);
    console.log(`Created: ${new Date(data.createdAt).toLocaleString()}`);
    
    if (data.generations) {
      console.log(`\nGenerations Completed: ${Object.keys(data.generations).length}`);
      console.log('-'.repeat(80));
      console.log('Gen | Ideas | Avg Score | Top Score | API Calls | Tokens In | Tokens Out | Time');
      console.log('-'.repeat(80));
      
      let totalApiCalls = { variator: 0, enricher: 0 };
      let totalTokens = { input: 0, output: 0 };
      
      Object.entries(data.generations).forEach(([gen, info]) => {
        const genNum = gen.replace('generation_', '');
        const ideas = info.ideas || [];
        const scores = ideas.map(i => i.score || 0).filter(s => s > 0);
        const avgScore = scores.length > 0 ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(4) : '0';
        const topScore = scores.length > 0 ? Math.max(...scores).toFixed(4) : '0';
        
        // Extract timing
        let duration = '-';
        if (info.variatorCompletedAt && info.enricherCompletedAt) {
          const start = info.variatorCompletedAt._seconds || 0;
          const end = info.enricherCompletedAt._seconds || 0;
          duration = `${end - start}s`;
        }
        
        // Count API calls (2 per generation: 1 variator + 1 enricher)
        const apiCalls = 2;
        if (info.enricherComplete) {
          totalApiCalls.variator++;
          totalApiCalls.enricher++;
        }
        
        // Token data would come from telemetry if available
        const tokensIn = '-';
        const tokensOut = '-';
        
        console.log(`${genNum.padEnd(3)} | ${ideas.length.toString().padEnd(5)} | ${avgScore.padEnd(9)} | ${topScore.padEnd(9)} | ${apiCalls.toString().padEnd(9)} | ${tokensIn.padEnd(9)} | ${tokensOut.padEnd(10)} | ${duration}`);
      });
      
      console.log('-'.repeat(80));
      console.log(`Total API Calls: ${totalApiCalls.variator + totalApiCalls.enricher} (Variator: ${totalApiCalls.variator}, Enricher: ${totalApiCalls.enricher})`);
    }
    
    // Show final results if completed
    if (data.result) {
      console.log('\n📈 Final Results:');
      console.log('-'.repeat(80));
      console.log(`Total Solutions: ${data.result.totalSolutions}`);
      console.log(`Top Solutions: ${data.result.topSolutions?.length || 0}`);
      console.log(`API Call Counts: ${JSON.stringify(data.result.apiCallCounts || {})}`);
      
      if (data.result.topSolutions && data.result.topSolutions.length > 0) {
        console.log('\n🏆 Top 3 Solutions:');
        data.result.topSolutions.slice(0, 3).forEach((solution, idx) => {
          console.log(`\n${idx + 1}. ${solution.idea_id} (Score: ${solution.score?.toFixed(4) || '0'})`);
          console.log(`   ${solution.description?.substring(0, 100)}...`);
          if (solution.business_case) {
            console.log(`   NPV: $${solution.business_case.npv_success}M | CAPEX: $${solution.business_case.capex_est}M | Success: ${(solution.business_case.likelihood * 100).toFixed(0)}%`);
          }
        });
      }
    }
    
    // Get telemetry data if available
    if (data.telemetry && data.telemetry.length > 0) {
      console.log('\n📊 API Call Telemetry:');
      console.log('-'.repeat(80));
      console.log('Phase     | Gen | Model | Tokens In | Tokens Out | Latency | Success');
      console.log('-'.repeat(80));
      
      data.telemetry.forEach(t => {
        const phase = t.phase.padEnd(9);
        const gen = t.generation.toString().padEnd(3);
        const model = (t.model || 'o1').padEnd(5);
        const tokensIn = (t.tokens?.prompt_tokens || 0).toString().padEnd(9);
        const tokensOut = (t.tokens?.completion_tokens || 0).toString().padEnd(10);
        const latency = `${(t.latencyMs/1000).toFixed(1)}s`.padEnd(7);
        const success = t.success ? '✅' : '❌';
        
        console.log(`${phase} | ${gen} | ${model} | ${tokensIn} | ${tokensOut} | ${latency} | ${success}`);
      });
      
      const totalIn = data.telemetry.reduce((sum, t) => sum + (t.tokens?.prompt_tokens || 0), 0);
      const totalOut = data.telemetry.reduce((sum, t) => sum + (t.tokens?.completion_tokens || 0), 0);
      console.log('-'.repeat(80));
      console.log(`Total Tokens: ${totalIn + totalOut} (Input: ${totalIn}, Output: ${totalOut})`);
    }
    
  } catch (error) {
    console.error('Error fetching job data:', error.message);
  }
}

// Get job ID from command line or use latest
const jobId = process.argv[2] || '4e059f3f-b18f-45d2-bcb9-f203d717a932';
showGenerationStats(jobId).catch(console.error);