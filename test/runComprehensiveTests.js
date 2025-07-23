#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test configuration
const TEST_SUITES = [
  {
    name: 'EvolutionarySolver Tests',
    file: 'evolutionarySolver.comprehensive.test.js',
    critical: true
  },
  {
    name: 'OrchestratorService Tests',
    file: 'orchestratorService.comprehensive.test.js',
    critical: true
  },
  {
    name: 'API Endpoint Tests',
    file: 'api.comprehensive.test.js',
    critical: true
  },
  {
    name: 'Cloud Integration Tests',
    file: 'cloudIntegration.comprehensive.test.js',
    critical: false // Can fail if no GCP credentials
  }
];

// Results tracking
const results = {
  passed: [],
  failed: [],
  skipped: [],
  coverage: {}
};

// Run a single test suite
async function runTestSuite(suite) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running ${suite.name}`);
  console.log(`${'='.repeat(60)}\n`);
  
  return new Promise((resolve) => {
    const testProcess = spawn('npm', ['test', '--', suite.file, '--coverage'], {
      cwd: join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_OPTIONS: '--experimental-vm-modules',
        FORCE_COLOR: '1'
      },
      stdio: 'pipe'
    });
    
    let output = '';
    let coverageData = '';
    
    testProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(data);
      
      // Capture coverage data
      if (text.includes('Statements') || text.includes('Branches')) {
        coverageData += text;
      }
    });
    
    testProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    testProcess.on('close', (code) => {
      const passed = code === 0;
      
      if (passed) {
        results.passed.push(suite.name);
      } else if (suite.critical) {
        results.failed.push(suite.name);
      } else {
        results.skipped.push(suite.name);
      }
      
      // Extract coverage metrics
      const coverageMatch = output.match(/Statements\s+:\s+([\d.]+)%/);
      if (coverageMatch) {
        results.coverage[suite.name] = parseFloat(coverageMatch[1]);
      }
      
      resolve(passed);
    });
  });
}

// Generate coverage report
function generateReport() {
  console.log('\n\n');
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE TEST REPORT');
  console.log('='.repeat(80));
  
  console.log(`\n✅ PASSED: ${results.passed.length}`);
  results.passed.forEach(name => console.log(`   - ${name}`));
  
  if (results.failed.length > 0) {
    console.log(`\n❌ FAILED: ${results.failed.length}`);
    results.failed.forEach(name => console.log(`   - ${name}`));
  }
  
  if (results.skipped.length > 0) {
    console.log(`\n⚠️  SKIPPED: ${results.skipped.length}`);
    results.skipped.forEach(name => console.log(`   - ${name}`));
  }
  
  console.log('\n📊 COVERAGE:');
  Object.entries(results.coverage).forEach(([name, coverage]) => {
    const emoji = coverage >= 80 ? '✅' : coverage >= 60 ? '⚠️' : '❌';
    console.log(`   ${emoji} ${name}: ${coverage.toFixed(1)}%`);
  });
  
  const avgCoverage = Object.values(results.coverage).reduce((a, b) => a + b, 0) / 
                     Object.values(results.coverage).length;
  
  console.log(`\n   Average Coverage: ${avgCoverage.toFixed(1)}%`);
  
  console.log('\n' + '='.repeat(80));
  
  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      total: TEST_SUITES.length,
      passed: results.passed.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      averageCoverage: avgCoverage
    }
  };
  
  writeFileSync(
    join(__dirname, '..', 'test-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log('\nReport saved to test-report.json');
}

// Main test runner
async function runAllTests() {
  console.log('🧪 EVOLUTION SOLVER - COMPREHENSIVE TEST SUITE');
  console.log('=' .repeat(60));
  console.log(`Running ${TEST_SUITES.length} test suites...`);
  
  const startTime = Date.now();
  
  // Set up test environment
  process.env.NODE_ENV = 'test';
  
  // Run tests sequentially to avoid conflicts
  for (const suite of TEST_SUITES) {
    await runTestSuite(suite);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  generateReport();
  
  console.log(`\nTotal time: ${duration}s`);
  
  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run tests
runAllTests();