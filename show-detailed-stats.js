#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function showDetailedStats(jobId) {
  try {
    // Fetch job data and analytics in parallel
    const [jobResponse, analyticsResponse] = await Promise.all([
      fetch(`${API_URL}/api/evolution/jobs/${jobId}`),
      fetch(`${API_URL}/api/evolution/jobs/${jobId}/analytics`)
    ]);
    
    const jobData = await jobResponse.json();
    const analytics = await analyticsResponse.json();
    
    console.log(`\n📊 Detailed Generation Statistics`);
    console.log('='.repeat(100));
    console.log(`Job ID: ${jobId}`);
    console.log(`Status: ${jobData.status}`);
    console.log(`Problem: ${jobData.problemContext?.substring(0, 80)}...`);
    console.log(`Created: ${new Date(jobData.createdAt).toLocaleString()}`);
    
    if (jobData.generations) {
      const genCount = Object.keys(jobData.generations).length;
      console.log(`\nGenerations: ${genCount} of ${jobData.evolutionConfig?.generations || 10}`);
      console.log('-'.repeat(100));
      console.log('Gen | Ideas | Avg Score  | Top Score  | API Calls | Duration | Status');
      console.log('-'.repeat(100));
      
      let totalIdeas = 0;
      let allScores = [];
      
      Object.entries(jobData.generations).forEach(([gen, info]) => {
        const genNum = gen.replace('generation_', '').padEnd(3);
        const ideas = info.ideas || [];
        totalIdeas += ideas.length;
        
        // Calculate scores
        const scores = ideas.map(i => i.score || 0).filter(s => s > 0);
        allScores.push(...scores);
        const avgScore = scores.length > 0 ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(4).padEnd(10) : '0.0000'.padEnd(10);
        const topScore = scores.length > 0 ? Math.max(...scores).toFixed(4).padEnd(10) : '0.0000'.padEnd(10);
        
        // Duration calculation
        let duration = '-';
        if (info.enricherCompletedAt && info.variatorCompletedAt) {
          const start = info.variatorCompletedAt._seconds || 0;
          const end = info.enricherCompletedAt._seconds || 0;
          duration = `${end - start}s`;
        }
        
        // Status
        const status = info.enricherError ? '❌ Error' : 
                      info.enricherComplete ? '✅ Complete' : 
                      info.variatorComplete ? '⏳ Enriching' : '🔄 Variating';
        
        console.log(`${genNum} | ${ideas.length.toString().padEnd(5)} | ${avgScore} | ${topScore} | ${('2').padEnd(9)} | ${duration.padEnd(8)} | ${status}`);
      });
      
      console.log('-'.repeat(100));
      const overallAvg = allScores.length > 0 ? (allScores.reduce((a,b) => a+b, 0) / allScores.length).toFixed(4) : '0';
      const overallTop = allScores.length > 0 ? Math.max(...allScores).toFixed(4) : '0';
      console.log(`Total: ${totalIdeas} ideas | Avg: ${overallAvg} | Top: ${overallTop}`);
    }
    
    // Token Usage
    if (analytics.tokenUsage) {
      console.log('\n💰 Token Usage Summary');
      console.log('-'.repeat(100));
      console.log(`Total Tokens: ${analytics.tokenUsage.total.input + analytics.tokenUsage.total.output}`);
      console.log(`  Input:  ${analytics.tokenUsage.total.input.toLocaleString()}`);
      console.log(`  Output: ${analytics.tokenUsage.total.output.toLocaleString()}`);
      
      if (analytics.tokenUsage.byPhase) {
        console.log('\nBy Phase:');
        Object.entries(analytics.tokenUsage.byPhase).forEach(([phase, tokens]) => {
          if (tokens.input > 0 || tokens.output > 0) {
            console.log(`  ${phase.padEnd(10)}: ${(tokens.input + tokens.output).toLocaleString().padStart(7)} (in: ${tokens.input.toLocaleString()}, out: ${tokens.output.toLocaleString()})`);
          }
        });
      }
    }
    
    // API Call efficiency
    if (analytics.apiCalls) {
      console.log('\n📞 API Call Efficiency');
      console.log('-'.repeat(100));
      const totalCalls = analytics.apiCalls.total || 0;
      const expectedCalls = Object.keys(jobData.generations || {}).length * 2;
      const efficiency = expectedCalls > 0 ? ((expectedCalls / totalCalls) * 100).toFixed(1) : '100';
      console.log(`Total API Calls: ${totalCalls}`);
      console.log(`Expected Calls: ${expectedCalls} (2 per generation)`);
      console.log(`Efficiency: ${efficiency}% ${totalCalls === expectedCalls ? '✅ PERFECT' : '⚠️ RETRIES OCCURRED'}`);
      
      if (analytics.apiCalls.byPhase) {
        console.log('\nBy Phase:');
        Object.entries(analytics.apiCalls.byPhase).forEach(([phase, count]) => {
          console.log(`  ${phase}: ${count}`);
        });
      }
    }
    
    // Show top solutions
    if (jobData.status === 'completed' && jobData.result?.topSolutions) {
      console.log('\n🏆 Top 3 Solutions');
      console.log('-'.repeat(100));
      jobData.result.topSolutions.slice(0, 3).forEach((solution, idx) => {
        console.log(`\n${idx + 1}. ${solution.idea_id} (Score: ${solution.score?.toFixed(4) || '0'})`);
        console.log(`   ${solution.description?.substring(0, 100)}...`);
        if (solution.business_case) {
          const bc = solution.business_case;
          console.log(`   NPV: $${bc.npv_success}M | CAPEX: $${bc.capex_est}M | Success: ${(bc.likelihood * 100).toFixed(0)}%`);
        }
      });
    }
    
    // Performance metrics
    if (analytics.performance) {
      console.log('\n⚡ Performance Metrics');
      console.log('-'.repeat(100));
      console.log(`Average Latency: ${(analytics.performance.avgLatencyMs / 1000).toFixed(1)}s`);
      console.log(`Total Duration: ${(analytics.performance.totalDurationMs / 1000 / 60).toFixed(1)} minutes`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get job ID from command line or use latest
const jobId = process.argv[2] || '4e059f3f-b18f-45d2-bcb9-f203d717a932';
showDetailedStats(jobId).catch(console.error);