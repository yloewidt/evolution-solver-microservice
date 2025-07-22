#!/usr/bin/env node

console.log('\n📊 JOB STATUS SUMMARY');
console.log('='.repeat(80));
console.log(`Time: ${new Date().toLocaleString()}\n`);

const jobs = [
  {
    name: '1x17',
    status: '✅ COMPLETED',
    progress: '1/1 generations (100%)',
    solutions: '17 solutions scored',
    avgScore: '1.501',
    topScore: '3.091',
    issue: 'Missing final aggregation'
  },
  {
    name: '1x34', 
    status: '❌ STUCK',
    progress: '0/1 generations (0%)',
    solutions: '0 solutions (enricher parse failure)',
    avgScore: 'N/A',
    topScore: 'N/A',
    issue: 'Generation 1 enricher failed to parse LLM response'
  },
  {
    name: '2x12',
    status: '✅ COMPLETED', 
    progress: '2/2 generations (100%)',
    solutions: '24 solutions scored',
    avgScore: '1.744',
    topScore: '5.049',
    issue: 'Missing final aggregation'
  },
  {
    name: '20x20',
    status: '❌ STUCK',
    progress: '1/20 generations (5%)', 
    solutions: '20 solutions from gen 1 only',
    avgScore: '2.048 (gen 1)',
    topScore: '4.924 (gen 1)',
    issue: 'Generation 2 enricher failed to parse LLM response'
  }
];

console.log('Config | Status      | Progress           | Solutions                  | Avg   | Top   ');
console.log('-'.repeat(86));

jobs.forEach(job => {
  console.log(
    `${job.name.padEnd(6)} | ${job.status.padEnd(11)} | ${job.progress.padEnd(18)} | ${job.solutions.padEnd(26)} | ${job.avgScore.padEnd(5)} | ${job.topScore}`
  );
});

console.log('\n\n🚨 ISSUES:');
console.log('-'.repeat(80));
jobs.forEach(job => {
  if (job.issue) {
    console.log(`${job.name}: ${job.issue}`);
  }
});

console.log('\n\n💡 KEY INSIGHTS:');
console.log('-'.repeat(80));
console.log('1. Enricher parsing failures are blocking 1x34 and 20x20 jobs');
console.log('2. The o3 model appears to be returning malformed JSON intermittently');
console.log('3. Completed jobs (1x17, 2x12) need final result aggregation');
console.log('4. Highest score so far: 5.049 (lab_revenue_guard from 2x12)');
console.log('5. Only 25% of requested work completed (1.5 of 6 total generations)');