#!/usr/bin/env node

import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function checkRecentJobs() {
  console.log('🔍 Checking Recent Jobs Status...\n');
  
  const response = await fetch(`${API_URL}/api/evolution/jobs?limit=10`);
  const data = await response.json();
  
  const recentJobs = data.jobs.filter(job => 
    new Date(job.createdAt) > new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
  );
  
  console.log(`Found ${recentJobs.length} jobs in the last 30 minutes:\n`);
  
  for (const job of recentJobs) {
    console.log(`Job ${job.jobId}:`);
    console.log(`- Status: ${job.status}`);
    console.log(`- Created: ${new Date(job.createdAt).toLocaleTimeString()}`);
    
    if (job.status === 'completed' || job.status === 'pending') {
      const analyticsRes = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}/analytics`);
      if (analyticsRes.ok) {
        const analytics = await analyticsRes.json();
        console.log(`- Elapsed: ${analytics.timing?.elapsedMinutes?.toFixed(2) || 'N/A'} minutes`);
        console.log(`- API Calls: ${analytics.o3Calls?.actual || 0}`);
        console.log(`- Total Tokens: ${(analytics.tokenUsage?.total?.input || 0) + (analytics.tokenUsage?.total?.output || 0)}`);
        
        if (analytics.generationAnalytics?.length > 0) {
          console.log(`- Generations: ${analytics.generationAnalytics.length}`);
          console.log(`- Best Score: ${analytics.generationAnalytics[analytics.generationAnalytics.length - 1]?.topScore?.toFixed(3) || 'N/A'}`);
        }
      }
    }
    
    console.log();
  }
  
  // Summary
  const completed = recentJobs.filter(j => j.status === 'completed').length;
  const pending = recentJobs.filter(j => j.status === 'pending').length;
  const failed = recentJobs.filter(j => j.status === 'failed').length;
  
  console.log('📊 Summary:');
  console.log(`- Completed: ${completed}`);
  console.log(`- Pending: ${pending}`);
  console.log(`- Failed: ${failed}`);
  console.log(`- Success Rate: ${recentJobs.length > 0 ? (completed / recentJobs.length * 100).toFixed(1) : 0}%`);
}

async function checkSystemHealth() {
  console.log('\n\n🏥 System Health Check...\n');
  
  try {
    const healthRes = await fetch(`${API_URL}/health`);
    console.log(`API Health: ${healthRes.ok ? '✅ OK' : '❌ FAIL'} (${healthRes.status})`);
    
    const testJobRes = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problemContext: 'Quick test: Generate one innovative solution for reducing carbon emissions in urban transportation.',
        parameters: {
          generations: 1,
          populationSize: 3,
          topSelectCount: 1
        }
      })
    });
    
    if (testJobRes.ok) {
      const job = await testJobRes.json();
      console.log(`Job Creation: ✅ OK (Job ID: ${job.jobId})`);
      
      // Wait and check progress
      await new Promise(r => setTimeout(r, 5000));
      
      const statusRes = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}`);
      const status = await statusRes.json();
      console.log(`Job Processing: ${status.status === 'pending' || status.status === 'completed' ? '✅ OK' : '❌ FAIL'} (${status.status})`);
    } else {
      console.log(`Job Creation: ❌ FAIL (${testJobRes.status})`);
    }
    
  } catch (error) {
    console.error('Health check error:', error.message);
  }
}

async function main() {
  console.log('🧪 QUICK VERIFICATION TEST\n');
  console.log('=' .repeat(80));
  
  await checkRecentJobs();
  await checkSystemHealth();
  
  console.log('\n' + '=' .repeat(80));
  console.log('✅ Verification Complete');
}

main().catch(console.error);