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

// Create detailed report
async function createDetailedReport() {
  try {
    const jobInfo = JSON.parse(await fs.readFile('parallel-jobs.json', 'utf8'));
    
    console.log('📊 Parallel Evolution Jobs - Detailed Report');
    console.log('==========================================');
    console.log(`Problem: Create innovative business models for sustainable urban farming`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    // Get all job details
    const allJobs = await Promise.all(
      jobInfo.map(async job => ({
        ...job,
        details: await getJobDetails(job.jobId)
      }))
    );
    
    // Table header
    console.log('Job Configuration | Status | Generations | Ideas | Best Score | Tokens | Duration | Cost');
    console.log('------------------|--------|-------------|-------|------------|--------|----------|------');
    
    let totalStats = {
      ideas: 0,
      tokensIn: 0,
      tokensOut: 0,
      duration: 0,
      completed: 0,
      failed: 0,
      cost: 0
    };
    
    // Print each job
    for (const job of allJobs) {
      const { analytics, status } = job.details;
      const ideas = analytics.solutions?.all?.length || 0;
      const tokensIn = analytics.tokenUsage?.total?.input || 0;
      const tokensOut = analytics.tokenUsage?.total?.output || 0;
      const totalTokens = tokensIn + tokensOut;
      const duration = Math.round(analytics.timing?.elapsedMinutes || 0);
      const bestScore = analytics.solutions?.topScores?.[0]?.score || 0;
      const cost = (totalTokens / 1000) * 0.015;
      
      totalStats.ideas += ideas;
      totalStats.tokensIn += tokensIn;
      totalStats.tokensOut += tokensOut;
      totalStats.duration = Math.max(totalStats.duration, duration);
      totalStats.cost += cost;
      
      if (status.status === 'completed') totalStats.completed++;
      if (status.status === 'failed') totalStats.failed++;
      
      console.log(
        `${job.name.padEnd(17)} | ${status.status.padEnd(6)} | ${analytics.generationAnalytics?.length || 0}/${job.generations} | ${ideas.toString().padEnd(5)} | ${bestScore.toFixed(2).padEnd(10)} | ${totalTokens.toString().padEnd(6)} | ${duration}m | $${cost.toFixed(2)}`
      );
    }
    
    console.log('\n📈 Summary Statistics:');
    console.log('=====================');
    console.log(`Total Ideas Generated: ${totalStats.ideas}`);
    console.log(`Total Tokens: ${totalStats.tokensIn + totalStats.tokensOut} (Input: ${totalStats.tokensIn}, Output: ${totalStats.tokensOut})`);
    console.log(`Total Cost: $${totalStats.cost.toFixed(2)}`);
    console.log(`Total Duration: ${totalStats.duration} minutes`);
    console.log(`Jobs Completed: ${totalStats.completed}/${allJobs.length}`);
    
    // Generation breakdown if available
    console.log('\n🔄 Generation Progress by Job:');
    for (const job of allJobs) {
      const { analytics } = job.details;
      if (analytics.generationAnalytics?.length > 0) {
        console.log(`\n${job.name}:`);
        for (const gen of analytics.generationAnalytics) {
          const phases = [];
          if (gen.variator) phases.push(`variator: ${gen.variator.status || 'done'}`);
          if (gen.enricher) phases.push(`enricher: ${gen.enricher.status || 'done'}`);
          if (gen.ranker) phases.push(`ranker: ${gen.ranker.status || 'done'}`);
          console.log(`  Gen ${gen.generation || '?'}: ${phases.join(', ')}`);
        }
      }
    }
    
    // Top ideas across all jobs
    console.log('\n🏆 Top Ideas Across All Jobs:');
    const allIdeas = [];
    for (const job of allJobs) {
      const ideas = job.details.analytics.solutions?.all || [];
      ideas.forEach(idea => {
        allIdeas.push({
          ...idea,
          jobName: job.name
        });
      });
    }
    
    allIdeas.sort((a, b) => (b.score || 0) - (a.score || 0));
    const top5 = allIdeas.slice(0, 5);
    
    top5.forEach((idea, i) => {
      console.log(`\n${i + 1}. Score: ${idea.score?.toFixed(2) || 'N/A'} (from ${idea.jobName})`);
      console.log(`   ${idea.description || 'No description'}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run report
createDetailedReport().catch(console.error);