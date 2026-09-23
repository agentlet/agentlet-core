#!/usr/bin/env node

// Scaffolds a throwaway agentlet from plop-templates/agentlet for both the
// FULL and MINIMAL templates, installs its dependencies, starts its webpack
// dev server, and runs its generated Playwright specs against it - an
// end-to-end check that `npm run scaffold:agentlet` actually produces a
// working project, not just files that look right.
//
// plop-templates/agentlet/package.json pins "@playwright/test" to an exact
// version (currently 1.54.1, matching what this repo's own package-lock.json
// resolves - see `node -e "console.log(require('./node_modules/@playwright/test/package.json').version)"`)
// instead of a caret range. Left as "^1.54.1", a scaffolded project with no
// lockfile of its own resolves to whatever is newest at install time; at the
// time this was pinned, that was a version that had already dropped macOS 13
// support, so `npm test` inside the generated project failed to even launch
// browsers on that OS. Bump the pin deliberately (and re-run this script) if
// you need a newer Playwright, rather than letting it float.

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

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

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

function startDevServer(testDir) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔧 Starting webpack dev server...`);
    console.log(`📝 Running: cd ${testDir} && npm start`);

    const devServer = spawn('npm', ['start'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    let serverStarted = false;
    let output = '';

    devServer.stdout.on('data', (data) => {
      output += data.toString();
      if (data.toString().includes('compiled successfully') || data.toString().includes('Local:') || data.toString().includes('Loopback:')) {
        if (!serverStarted) {
          serverStarted = true;
          console.log(`✅ Webpack dev server started`);
          resolve(devServer);
        }
      }
    });

    devServer.stderr.on('data', (data) => {
      output += data.toString();
    });

    devServer.on('error', (error) => {
      if (!serverStarted) {
        reject(new Error(`Failed to start dev server: ${error.message}`));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!serverStarted) {
        devServer.kill();
        reject(new Error(`Dev server failed to start within 30 seconds. Output: ${output}`));
      }
    }, 30000);
  });
}

async function testTemplate(templateType, testName, testDir) {
  console.log(`\n🚀 Testing ${templateType.toUpperCase()} template with agentlet: ${testName}`);
  console.log(`📁 Test directory: ${testDir}`);

  // Cleanup any existing test directory
  cleanupTestAgentlet(testDir);

  let devServer = null;

  try {
    // Step 1: Check if port 8080 is available
    const portAvailable = await checkPortAvailable(8080);
    if (!portAvailable) {
      throw new Error(`Port 8080 is already in use. Please stop any running servers on port 8080 and try again.`);
    }

    // Step 2: Scaffold the test agentlet with template-specific parameters
    const scaffoldCommand = templateType === 'minimal'
      ? `plop agentlet --name=${testName} --folder=${path.dirname(testDir)}/ --minimal`
      : `plop agentlet --name=${testName} --folder=${path.dirname(testDir)}/ --libs=pdfjs-dist`;

    runCommand(scaffoldCommand, `Scaffolding ${templateType} agentlet: ${testName}`);

    // Step 2.5: Fix the agentlet-core path to use absolute path for test
    const currentDir = process.cwd();
    const packageJsonPath = path.join(testDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson.devDependencies['agentlet-core'] = `file:${currentDir}`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`✅ Fixed agentlet-core path to use absolute path: ${currentDir}`);
    }

    // Step 3: Install dependencies
    runCommand(`cd ${testDir} && npm install`, `Installing dependencies for ${templateType} template`);

    // Step 4: Start webpack dev server
    devServer = await startDevServer(testDir);

    // Step 5: Run tests
    runCommand(`cd ${testDir} && npm test`, `Running Playwright tests for ${templateType} template`);

    console.log(`\n🎉 ${templateType.toUpperCase()} template tests passed! Test agentlet '${testName}' is working correctly.`);

    return true;
  } catch (error) {
    console.error(`\n💥 ${templateType.toUpperCase()} template test failed:`, error.message);
    console.log(`📁 Test agentlet left at: ${testDir} for debugging`);
    return false;
  } finally {
    // Cleanup: Stop the dev server we started
    if (devServer) {
      console.log(`\n🛑 Stopping webpack dev server for ${templateType} template...`);
      try {
        devServer.kill('SIGTERM');
        // Give it a moment to shut down gracefully
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!devServer.killed) {
          devServer.kill('SIGKILL');
        }
        console.log(`✅ Webpack dev server stopped for ${templateType} template`);
      } catch (cleanupError) {
        console.warn(`⚠️  Dev server cleanup warning:`, cleanupError.message);
      }
    }
  }
}

async function main() {
  console.log(`🚀 Starting comprehensive scaffold tests for both FULL and MINIMAL templates`);

  // Step 1: Build the core once for both tests
  runCommand('npm run build', 'Building agentlet-core');

  const shouldCleanup = process.env.KEEP_TEST_AGENTLET !== 'true';
  const results = {};

  // Test both templates
  const templates = ['full', 'minimal'];

  for (const templateType of templates) {
    const testName = generateFunnyName();
    const testDir = path.join('/tmp', testName);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Testing ${templateType.toUpperCase()} Template`);
    console.log(`${'='.repeat(60)}`);

    const success = await testTemplate(templateType, testName, testDir);
    results[templateType] = { success, testName, testDir };

    // Cleanup after each test if requested
    if (shouldCleanup && success) {
      cleanupTestAgentlet(testDir);
    } else if (!shouldCleanup) {
      console.log(`📁 ${templateType.toUpperCase()} test agentlet preserved at: ${testDir}`);
    }

    // Don't continue if this template failed
    if (!success) {
      break;
    }
  }

  // Final results
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 FINAL RESULTS`);
  console.log(`${'='.repeat(60)}`);

  let allPassed = true;
  for (const [templateType, result] of Object.entries(results)) {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${templateType.toUpperCase().padEnd(8)} | ${status} | ${result.testName}`);
    if (!result.success) {
      allPassed = false;
      console.log(`         | Debug at: ${result.testDir}`);
    }
  }

  if (allPassed) {
    console.log(`\n🎉 All template tests passed! Both FULL and MINIMAL templates are working correctly.`);
    if (!shouldCleanup) {
      console.log(`💡 To remove preserved test directories:`);
      Object.values(results).forEach(result => {
        if (result.success) {
          console.log(`   rm -rf ${result.testDir}`);
        }
      });
    }
  } else {
    console.log(`\n💥 Some template tests failed. Check the debug directories above.`);
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