#!/usr/bin/env node
import fetch from 'node-fetch';
import fs from 'fs/promises';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';

// Problem context focused on EV truck charging with deal-making and supply chain leverage
const PROBLEM_CONTEXT = `
Create innovative business models for EV truck charging infrastructure that focus on strategic deal-making and exploiting supply chain weak points as leverage.

Key focus areas:
1. Identify bottlenecks and pain points in the EV truck charging supply chain (hardware, installation, grid connections, permits)
2. Find opportunities to gain leverage through strategic partnerships, exclusive deals, or controlling scarce resources
3. Target underserved segments where incumbents have weak positions (rural routes, specific trucking sectors, cross-border corridors)
4. Exploit timing advantages (government incentives, utility programs, fleet transition deadlines)
5. Create lock-in effects through exclusive agreements with fleet operators, truck stops, or logistics hubs
6. Leverage data and routing insights to control strategic charging locations
7. Bundle charging with other trucking services (maintenance, driver amenities, cargo handling)
8. Take advantage of fragmented ownership (independent truck stops, small fleet operators)
9. Exploit regulatory arbitrage between states/regions
10. Create financial engineering plays (equipment leasing, energy arbitrage, carbon credits)

Consider deals with: truck manufacturers, fleet operators, logistics companies, truck stop chains, utilities, battery suppliers, grid operators, real estate owners, government agencies, and financial institutions.

Focus on business models that create strong competitive moats through deal structures rather than just technology.
`;

// Create the job
async function createEVTruckChargingJob() {
  console.log('🚛⚡ Creating EV Truck Charging Infrastructure Job');
  console.log('================================================\n');
  console.log('Configuration: 20 generations × 25 ideas = 500 total ideas');
  console.log('Focus: Deal-making and supply chain leverage\n');
  
  try {
    const response = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problemContext: PROBLEM_CONTEXT,
        preferences: {
          max_capex: 50.0,  // $50M max investment (larger for infrastructure)
          target_return: 15, // 15x return target (high value capture)
          timeline_months: 36 // 3 year timeline
        },
        parameters: {
          generations: 20,
          populationSize: 25,
          dealTypes: 'strategic partnerships, exclusive agreements, and supply chain control'
        }
      })
    });
    
    const job = await response.json();
    if (job.error) {
      console.error('❌ Error creating job:', job.error);
      return;
    }
    
    console.log('✅ Job created successfully!');
    console.log('   Job ID:', job.jobId);
    console.log('   Status:', job.status);
    console.log('   Created:', new Date().toISOString());
    
    // Save job info for monitoring
    const jobInfo = {
      jobId: job.jobId,
      name: 'EV Truck Charging - Deal Making',
      generations: 20,
      populationSize: 25,
      focus: 'Deal-making and supply chain leverage',
      createdAt: new Date().toISOString()
    };
    
    await fs.writeFile('ev-truck-job.json', JSON.stringify(jobInfo, null, 2));
    console.log('\n📄 Job info saved to ev-truck-job.json');
    
    // Start monitoring
    console.log('\n📊 Starting real-time monitoring...\n');
    await monitorJob(job.jobId);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Monitor job progress
async function monitorJob(jobId) {
  let lastGenCount = 0;
  let lastIdeaCount = 0;
  const startTime = Date.now();
  
  while (true) {
    try {
      const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
      const jobData = await response.json();
      
      const generations = Object.keys(jobData.generations || {});
      const genCount = generations.length;
      
      let totalIdeas = 0;
      let validIdeas = 0;
      
      generations.forEach(genKey => {
        const gen = jobData.generations[genKey];
        const ideas = gen.solutions || [];
        totalIdeas += ideas.length;
        validIdeas += ideas.filter(i => i.idea_id && i.idea_id !== 'N/A').length;
      });
      
      // Only log if there's a change
      if (genCount > lastGenCount || totalIdeas > lastIdeaCount) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        console.log(`[${minutes}m ${seconds}s] Generation ${genCount}/20 | Ideas: ${totalIdeas} (${validIdeas} valid) | Status: ${jobData.status}`);
        
        // Show latest generation details
        if (genCount > lastGenCount) {
          const latestGen = jobData.generations[`generation_${genCount}`];
          if (latestGen && latestGen.solutions) {
            const topScore = latestGen.topScore || 0;
            console.log(`    → Gen ${genCount}: ${latestGen.solutions.length} ideas, Top score: ${topScore.toFixed(3)}`);
          }
        }
        
        lastGenCount = genCount;
        lastIdeaCount = totalIdeas;
      }
      
      if (jobData.status === 'completed' || jobData.status === 'failed') {
        console.log('\n' + '='.repeat(50));
        console.log(`Job ${jobData.status.toUpperCase()}`);
        console.log('='.repeat(50));
        console.log(`Total Generations: ${genCount}`);
        console.log(`Total Ideas: ${totalIdeas} (${validIdeas} valid)`);
        console.log(`Invalid Ideas: ${totalIdeas - validIdeas}`);
        console.log(`Time Elapsed: ${Math.round((Date.now() - startTime) / 1000 / 60)} minutes`);
        
        if (jobData.status === 'failed' && jobData.error) {
          console.log(`Error: ${jobData.error}`);
        }
        
        // Get analytics
        console.log('\n📈 Fetching detailed analytics...');
        const analyticsResponse = await fetch(`${API_URL}/api/evolution/jobs/${jobId}/analytics`);
        const analytics = await analyticsResponse.json();
        
        if (analytics.solutions?.topScores) {
          console.log('\n🏆 Top 5 Ideas:');
          analytics.solutions.topScores.slice(0, 5).forEach((idea, idx) => {
            console.log(`\n${idx + 1}. Score: ${idea.score.toFixed(3)}`);
            console.log(`   ${idea.description}`);
            console.log(`   CAPEX: $${idea.capex}M | ROI: ${idea.roi}%`);
          });
        }
        
        break;
      }
      
      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.error('Error checking status:', error.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

// Run the job
createEVTruckChargingJob().catch(console.error);