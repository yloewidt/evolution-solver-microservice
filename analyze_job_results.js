import axios from 'axios';

const jobIds = [
  '58f402c5-1962-481b-ba54-5eb43868a247',
  'c8a0d153-7556-458d-b2f0-3a027ed8f877',
  'e992df43-629f-4b84-a56c-7ca4309f69ec',
  '97b331df-eeca-445b-b038-0b66f1a46eb5'
];

async function analyzeJobs() {
  console.log('=== EVOLUTION SOLVER JOB ANALYSIS REPORT ===\n');
  
  for (const jobId of jobIds) {
    try {
      // Fetch analytics
      const analyticsRes = await axios.get(`http://localhost:8080/api/evolution/jobs/${jobId}/analytics`);
      const analytics = analyticsRes.data;
      
      // Fetch job details
      const jobRes = await axios.get(`http://localhost:8080/api/evolution/jobs/${jobId}`);
      const job = jobRes.data;
      
      console.log(`\n### Job ID: ${jobId}`);
      console.log(`Status: ${analytics.status}`);
      console.log(`Created: ${new Date(analytics.timing.createdAt).toLocaleString()}`);
      console.log(`Completed: ${analytics.timing.completedAt ? new Date(analytics.timing.completedAt).toLocaleString() : 'Not completed'}`);
      console.log(`Elapsed Time: ${analytics.timing.elapsedMinutes?.toFixed(2) || 'N/A'} minutes`);
      
      console.log(`\nProblem Context:`);
      console.log(analytics.problemContext.trim().split('\n').slice(0, 3).join('\n'));
      console.log('...');
      
      console.log(`\nKey Metrics:`);
      console.log(`- Total Solutions: ${analytics.solutions.all.length}`);
      console.log(`- Distinct Solutions (with IDs): ${analytics.solutions.all.filter(s => s.ideaId).length}`);
      console.log(`- Top Score: ${analytics.solutions.topScores[0]?.score?.toFixed(2) || 'N/A'}`);
      console.log(`- Average Score: ${analytics.solutions.overallAverageScore?.toFixed(2) || 'N/A'}`);
      
      console.log(`\nAPI Usage:`);
      console.log(`- Total API Calls: ${analytics.o3Calls.actual}`);
      console.log(`  - Variator: ${analytics.o3Calls.breakdown.variator}`);
      console.log(`  - Enricher: ${analytics.o3Calls.breakdown.enricher}`);
      console.log(`  - Ranker: ${analytics.o3Calls.breakdown.ranker}`);
      
      console.log(`\nToken Usage:`);
      console.log(`- Total Tokens: ${analytics.tokenUsage.total.input + analytics.tokenUsage.total.output}`);
      console.log(`  - Input: ${analytics.tokenUsage.total.input}`);
      console.log(`  - Output: ${analytics.tokenUsage.total.output}`);
      
      console.log(`\nTop 3 Solutions:`);
      const topSolutions = analytics.solutions.topScores.slice(0, 3);
      topSolutions.forEach((solution, index) => {
        if (solution.ideaId) {
          console.log(`\n${index + 1}. ${solution.ideaId}`);
          console.log(`   Score: ${solution.score.toFixed(2)}`);
          console.log(`   CAPEX: $${solution.capex}M`);
          console.log(`   Likelihood: ${(solution.likelihood * 100).toFixed(0)}%`);
          if (solution.description) {
            console.log(`   Description: ${solution.description.substring(0, 100)}...`);
          }
        }
      });
      
      console.log('\n' + '='.repeat(80));
      
    } catch (error) {
      console.log(`\n### Job ID: ${jobId}`);
      console.log(`Error fetching job data: ${error.message}`);
      console.log('='.repeat(80));
    }
  }
  
  // Summary statistics
  console.log('\n### SUMMARY STATISTICS ###\n');
  
  let totalAPICalls = 0;
  let totalTokens = 0;
  let totalSolutions = 0;
  let totalTime = 0;
  let completedJobs = 0;
  
  for (const jobId of jobIds) {
    try {
      const analyticsRes = await axios.get(`http://localhost:8080/api/evolution/jobs/${jobId}/analytics`);
      const analytics = analyticsRes.data;
      
      if (analytics.status === 'completed') {
        completedJobs++;
        totalAPICalls += analytics.o3Calls.actual;
        totalTokens += analytics.tokenUsage.total.input + analytics.tokenUsage.total.output;
        totalSolutions += analytics.solutions.all.length;
        totalTime += analytics.timing.elapsedMinutes || 0;
      }
    } catch (error) {
      // Skip failed jobs
    }
  }
  
  console.log(`Total Jobs Analyzed: ${jobIds.length}`);
  console.log(`Completed Jobs: ${completedJobs}`);
  console.log(`Total API Calls: ${totalAPICalls}`);
  console.log(`Total Tokens Used: ${totalTokens}`);
  console.log(`Total Solutions Generated: ${totalSolutions}`);
  console.log(`Total Time: ${totalTime.toFixed(2)} minutes`);
  console.log(`Average Time per Job: ${(totalTime / completedJobs).toFixed(2)} minutes`);
  console.log(`Average API Calls per Job: ${(totalAPICalls / completedJobs).toFixed(1)}`);
  console.log(`Average Tokens per Job: ${Math.round(totalTokens / completedJobs)}`);
}

analyzeJobs().catch(console.error);