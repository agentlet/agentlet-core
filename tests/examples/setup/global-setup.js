/**
 * Global setup for Playwright tests
 * Ensures the agentlet-core.js is built before running tests
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

async function globalSetup() {
  console.log('🔨 Setting up Agentlet Core tests...');
  console.log('📁 Current working directory:', process.cwd());
  
  // Find the project root (should contain package.json)
  let projectRoot = process.cwd();
  while (projectRoot !== '/' && !fs.existsSync(path.join(projectRoot, 'package.json'))) {
    projectRoot = path.dirname(projectRoot);
  }
  
  console.log('📁 Project root found:', projectRoot);
  
  try {
    // Ensure the dist files are built
    console.log('📦 Building Agentlet Core...');
    execSync('npm run build', { 
      stdio: 'inherit',
      cwd: projectRoot
    });
    
    console.log('✅ Agentlet Core built successfully');
    console.log('🚀 Ready to run tests!');
    
  } catch (error) {
    console.error('❌ Failed to build Agentlet Core:', error.message);
    process.exit(1);
  }
}

export default globalSetup;