#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function countDistinctIdeas(jobId) {
  try {
    const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
    const data = await response.json();
    
    console.log(`\n🔍 Analyzing Distinct Ideas for Job: ${jobId}`);
    console.log('='.repeat(80));
    
    const allIdeas = new Map(); // idea_id -> idea details
    const ideaGenerations = new Map(); // idea_id -> array of generations it appeared in
    let totalIdeasGenerated = 0;
    
    if (data.generations) {
      // Process each generation
      Object.entries(data.generations).forEach(([gen, info]) => {
        const genNum = parseInt(gen.replace('generation_', ''));
        const ideas = info.ideas || [];
        
        ideas.forEach(idea => {
          totalIdeasGenerated++;
          
          if (idea.idea_id) {
            // Track unique ideas
            if (!allIdeas.has(idea.idea_id)) {
              allIdeas.set(idea.idea_id, {
                ...idea,
                firstSeen: genNum,
                lastSeen: genNum,
                appearances: 1
              });
              ideaGenerations.set(idea.idea_id, [genNum]);
            } else {
              // Update existing idea
              const existing = allIdeas.get(idea.idea_id);
              existing.lastSeen = genNum;
              existing.appearances++;
              // Update score if higher
              if (idea.score && (!existing.score || idea.score > existing.score)) {
                existing.score = idea.score;
              }
              ideaGenerations.get(idea.idea_id).push(genNum);
            }
          }
        });
      });
    }
    
    console.log(`Total Ideas Generated: ${totalIdeasGenerated}`);
    console.log(`Distinct Ideas: ${allIdeas.size}`);
    console.log(`Duplicate Ideas: ${totalIdeasGenerated - allIdeas.size}`);
    console.log(`Duplication Rate: ${((totalIdeasGenerated - allIdeas.size) / totalIdeasGenerated * 100).toFixed(1)}%`);
    
    // Analyze idea persistence
    const survivingIdeas = Array.from(allIdeas.values()).filter(idea => idea.appearances > 1);
    console.log(`\nIdeas that survived multiple generations: ${survivingIdeas.length}`);
    
    // Show ideas by generation span
    console.log('\n📈 Idea Longevity:');
    const longevityGroups = new Map();
    allIdeas.forEach(idea => {
      const span = idea.lastSeen - idea.firstSeen + 1;
      if (!longevityGroups.has(span)) {
        longevityGroups.set(span, 0);
      }
      longevityGroups.set(span, longevityGroups.get(span) + 1);
    });
    
    Array.from(longevityGroups.entries())
      .sort((a, b) => b[0] - a[0])
      .forEach(([span, count]) => {
        console.log(`  ${span} generation${span > 1 ? 's' : ''}: ${count} ideas`);
      });
    
    // Show top performers
    console.log('\n🏆 Top 5 Unique Ideas by Score:');
    Array.from(allIdeas.values())
      .filter(idea => idea.score > 0)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .forEach((idea, idx) => {
        console.log(`${idx + 1}. ${idea.idea_id} (Score: ${idea.score?.toFixed(4) || '0'})`);
        console.log(`   Generations: ${ideaGenerations.get(idea.idea_id).join(', ')}`);
        console.log(`   ${idea.description?.substring(0, 80)}...`);
      });
    
    // Show ideas that appeared most frequently
    console.log('\n🔄 Most Frequent Ideas:');
    Array.from(allIdeas.values())
      .filter(idea => idea.appearances > 1)
      .sort((a, b) => b.appearances - a.appearances)
      .slice(0, 5)
      .forEach((idea, idx) => {
        console.log(`${idx + 1}. ${idea.idea_id} (${idea.appearances} appearances)`);
        console.log(`   Generations: ${ideaGenerations.get(idea.idea_id).join(', ')}`);
      });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get job ID from command line or use default
const jobId = process.argv[2] || '4e059f3f-b18f-45d2-bcb9-f203d717a932';
countDistinctIdeas(jobId).catch(console.error);