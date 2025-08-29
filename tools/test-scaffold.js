#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Funny name generator
const adjectives = [
  'bouncy', 'wiggly', 'sparkly', 'fuzzy', 'zippy', 'bubbly', 'snazzy', 'quirky',
  'wobbly', 'jiggly', 'zesty', 'peppy', 'sassy', 'cheeky', 'jazzy', 'snappy',
  'goofy', 'wacky', 'silly', 'dizzy', 'giggly', 'happy', 'jolly', 'merry',
  'crafty', 'sneaky', 'clever', 'witty', 'smart', 'swift', 'nimble', 'agile'
];

const nouns = [
  'penguin', 'hamster', 'robot', 'wizard', 'ninja', 'pirate', 'unicorn', 'dragon',
  'octopus', 'platypus', 'llama', 'alpaca', 'narwhal', 'dolphin', 'panda', 'koala',
  'otter', 'ferret', 'raccoon', 'squirrel', 'chipmunk', 'hedgehog', 'axolotl', 'quokka',
  'capybara', 'sloth', 'pangolin', 'armadillo', 'anteater', 'tapir', 'manatee', 'dugong'
];

function generateFunnyName() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 999) + 1;
  return `test-agentlet-${adjective}-${noun}-${number}`;
}

function runCommand(command, description) {
  console.log(`\n🔧 ${description}...`);
  console.log(`📝 Running: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✅ ${description} completed successfully`);
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    process.exit(1);
  }
}

function cleanupTestAgentlet(testDir) {
  if (fs.existsSync(testDir)) {
    console.log(`\n🧹 Cleaning up test agentlet at ${testDir}...`);
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log(`✅ Cleanup completed`);
    } catch (error) {
      console.warn(`⚠️  Cleanup warning:`, error.message);
    }
  }
}

async function main() {
  const testName = generateFunnyName();
  const testDir = path.join('..', testName);
  
  console.log(`🚀 Starting scaffold test with agentlet: ${testName}`);
  console.log(`📁 Test directory: ${testDir}`);

  // Cleanup any existing test directory
  cleanupTestAgentlet(testDir);

  try {
    // Step 1: Build the core
    runCommand('npm run build', 'Building agentlet-core');

    // Step 2: Scaffold the test agentlet with custom name using CLI parameters
    runCommand(
      `plop agentlet --name=${testName} --folder=../ --libs=jquery,html2canvas,xlsx`, 
      `Scaffolding test agentlet: ${testName}`
    );

    // Step 3: Install dependencies
    runCommand(`cd ${testDir} && npm install`, 'Installing dependencies');

    // Step 4: Run tests
    runCommand(`cd ${testDir} && npm test`, 'Running Playwright tests');

    console.log(`\n🎉 All tests passed! Test agentlet '${testName}' is working correctly.`);
    
    // Ask user if they want to keep the test directory
    const shouldCleanup = process.env.KEEP_TEST_AGENTLET !== 'true';
    if (shouldCleanup) {
      cleanupTestAgentlet(testDir);
    } else {
      console.log(`📁 Test agentlet preserved at: ${testDir}`);
      console.log(`💡 To remove it later: rm -rf ${testDir}`);
    }

  } catch (error) {
    console.error(`\n💥 Test failed:`, error.message);
    console.log(`📁 Test agentlet left at: ${testDir} for debugging`);
    process.exit(1);
  }
}

// Handle cleanup on process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Process interrupted. Cleaning up...');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Process terminated. Cleaning up...');
  process.exit(1);
});

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});