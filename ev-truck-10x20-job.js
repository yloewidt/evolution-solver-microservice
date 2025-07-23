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
  console.log('🚛⚡ Creating EV Truck Charging Infrastructure Job (Optimized)');
  console.log('===========================================================\n');
  console.log('Configuration: 20 generations × 10 ideas = 200 total ideas');
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
          populationSize: 10,  // Reduced from 25 to 10 for faster processing
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
      name: 'EV Truck Charging 10x20',
      generations: 20,
      populationSize: 10,
      focus: 'Deal-making and supply chain leverage',
      createdAt: new Date().toISOString()
    };
    
    await fs.writeFile('ev-truck-10x20-job.json', JSON.stringify(jobInfo, null, 2));
    console.log('\n📄 Job info saved to ev-truck-10x20-job.json');
    
    // Start monitoring
    console.log('\n📊 Starting real-time monitoring...\n');
    await monitorJob(job.jobId);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Monitor job progress with detailed generation tracking
async function monitorJob(jobId) {
  let lastGenCount = 0;
  let lastPhase = '';
  const startTime = Date.now();
  const generationTimes = [];
  
  while (true) {
    try {
      const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
      const jobData = await response.json();
      
      const generations = jobData.generations || {};
      const genCount = Object.keys(generations).length;
      
      // Calculate statistics
      let totalIdeas = 0;
      let validIdeas = 0;
      let totalScore = 0;
      let ideaCount = 0;
      
      Object.values(generations).forEach(gen => {
        const ideas = gen.solutions || [];
        totalIdeas += ideas.length;
        ideas.forEach(idea => {
          if (idea.idea_id && idea.idea_id !== 'N/A') {
            validIdeas++;
            if (idea.score) {
              totalScore += idea.score;
              ideaCount++;
            }
          }
        });
      });
      
      const avgScore = ideaCount > 0 ? totalScore / ideaCount : 0;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      // Determine current phase
      let currentPhase = 'waiting';
      if (genCount > 0) {
        const currentGen = generations[`generation_${genCount}`];
        if (!currentGen.rankerComplete) {
          if (currentGen.enricherComplete) currentPhase = 'ranking';
          else if (currentGen.variatorComplete) currentPhase = 'enriching';
          else currentPhase = 'generating';
        }
      }
      
      // Log progress
      if (genCount > lastGenCount || currentPhase !== lastPhase) {
        console.log(`[${minutes}m ${seconds}s] Gen ${genCount}/20 | Phase: ${currentPhase} | Ideas: ${totalIdeas} (${validIdeas} valid) | Avg Score: ${avgScore.toFixed(3)}`);
        
        // Track generation completion times
        if (genCount > lastGenCount && lastGenCount > 0) {
          const genTime = elapsed - (generationTimes[lastGenCount - 1] || 0);
          generationTimes.push(elapsed);
          console.log(`    → Generation ${lastGenCount} completed in ${Math.round(genTime)}s`);
        }
        
        lastGenCount = genCount;
        lastPhase = currentPhase;
      }
      
      // Check completion
      if (jobData.status === 'completed' || jobData.status === 'failed') {
        console.log('\n' + '='.repeat(70));
        console.log(`JOB ${jobData.status.toUpperCase()}`);
        console.log('='.repeat(70));
        
        // Final statistics
        console.log(`\n📈 Final Statistics:`);
        console.log(`  Total Generations: ${genCount}/20`);
        console.log(`  Total Ideas: ${totalIdeas} (Expected: ${genCount * 10})`);
        console.log(`  Valid Ideas: ${validIdeas}`);
        console.log(`  Invalid Ideas: ${totalIdeas - validIdeas}`);
        console.log(`  Average Score: ${avgScore.toFixed(3)}`);
        console.log(`  Total Time: ${minutes} minutes ${seconds} seconds`);
        console.log(`  Avg Time per Generation: ${genCount > 0 ? Math.round(elapsed / genCount) : 0}s`);
        
        // Get detailed analytics
        const analyticsResponse = await fetch(`${API_URL}/api/evolution/jobs/${jobId}/analytics`);
        const analytics = await analyticsResponse.json();
        
        // Show top deal-making ideas
        if (analytics.solutions?.topScores?.length > 0) {
          console.log('\n🏆 Top 10 Deal-Making Ideas for EV Truck Charging:');
          console.log('=' + '='.repeat(69));
          
          analytics.solutions.topScores.slice(0, 10).forEach((idea, idx) => {
            console.log(`\n${idx + 1}. [Score: ${idea.score.toFixed(3)}] ${idea.ideaId || 'Unnamed'}`);
            console.log(`   ${idea.description || 'No description'}`);
            console.log(`   💰 Investment: $${idea.capex}M | ROI: ${idea.roi}% | Success Probability: ${(idea.likelihood * 100).toFixed(0)}%`);
          });
        }
        
        // Save detailed results
        const results = {
          jobId,
          configuration: '10x20',
          summary: {
            generations: genCount,
            totalIdeas,
            validIdeas,
            avgScore: avgScore.toFixed(3),
            totalTime: `${minutes}m ${seconds}s`,
            topScore: analytics.solutions?.topScores?.[0]?.score || 0
          },
          topIdeas: analytics.solutions?.topScores || [],
          generationProgress: generationTimes
        };
        
        await fs.writeFile('ev-truck-10x20-results.json', JSON.stringify(results, null, 2));
        console.log('\n✅ Full results saved to ev-truck-10x20-results.json');
        
        if (jobData.error) {
          console.log(`\n❌ Error: ${jobData.error}`);
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