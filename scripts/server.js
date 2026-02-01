#!/usr/bin/env node

/**
 * Mission Control Dashboard Server
 * 
 * Serves the web UI and provides API access to mission control data
 * 
 * Usage: node server.js [port]
 * Default port: 3333
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 3333;
const MC_DIR = path.join(__dirname, '..', '.mission-control');
const UI_DIR = path.join(__dirname, '..', 'ui');

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// Load JSON data
function loadData(file) {
  const filepath = path.join(MC_DIR, file);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  }
  return null;
}

// API handlers
const api = {
  '/api/agents': () => loadData('agents.json'),
  '/api/tasks': () => loadData('tasks.json'),
  '/api/activity': () => loadData('activity.json'),
  '/api/notifications': () => loadData('notifications.json'),
  '/api/documents': () => loadData('documents.json'),
  '/api/all': () => ({
    agents: loadData('agents.json'),
    tasks: loadData('tasks.json'),
    activity: loadData('activity.json'),
    documents: loadData('documents.json')
  })
};

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];
  
  // API routes
  if (api[url]) {
    const data = api[url]();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
    return;
  }
  
  // Static files
  let filePath = url === '/' ? '/index.html' : url;
  filePath = path.join(UI_DIR, filePath);
  
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';
  
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`
🐉 Ember Mission Control Dashboard

   Dashboard: http://localhost:${PORT}
   
   API Endpoints:
   - /api/agents
   - /api/tasks
   - /api/activity
   - /api/documents
   - /api/all

   Press Ctrl+C to stop
  `);
});
