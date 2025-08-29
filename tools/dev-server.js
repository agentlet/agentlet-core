#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Enable CORS for cross-origin requests (important for bookmarklets)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Serve static files from project root
app.use(express.static(path.join(__dirname, '..')));

// Default route redirects to examples
app.get('/', (req, res) => {
    res.redirect('/examples/');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        agentletCore: checkAgentletCore()
    });
});

function checkAgentletCore() {
    const distPath = path.join(__dirname, '..', 'dist', 'agentlet-core.js');
    return {
        built: fs.existsSync(distPath),
        path: distPath
    };
}

function openBrowser(url) {
    const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(start, [url], { stdio: 'ignore', detached: true }).unref();
}

// Start server
const server = app.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    const examplesUrl = `${url}/examples/`;
    
    console.log('\n🚀 Agentlet Development Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Server running at: ${url}`);
    console.log(`📚 Examples available at: ${examplesUrl}`);
    console.log(`❤️  Health check: ${url}/health`);
    
    const coreStatus = checkAgentletCore();
    if (coreStatus.built) {
        console.log('✅ Agentlet Core library is built');
    } else {
        console.log('⚠️  Agentlet Core library not found - run `npm run build` first');
    }
    
    console.log('\n💡 Tips:');
    console.log('   • Press Ctrl+C to stop the server');
    console.log('   • Examples work best with browser dev tools open');
    console.log('   • Check console for agentlet logs and errors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Auto-open browser to examples page
    setTimeout(() => {
        console.log(`🌐 Opening browser to ${examplesUrl}`);
        openBrowser(examplesUrl);
    }, 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down development server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

// Error handling
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Try a different port:`);
        console.error(`   PORT=3001 npm run dev`);
    } else {
        console.error('❌ Server error:', err.message);
    }
    process.exit(1);
});