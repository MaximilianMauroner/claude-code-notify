const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = 3099;
const PID_FILE = '/tmp/claude-notify-server.pid';

// Store connected WebSocket clients
const clients = new Set();

// Create HTTP server for receiving notifications from Claude Code hooks
const httpServer = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/notify') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const notification = JSON.parse(body);

        // Add timestamp if not present
        if (!notification.timestamp) {
          notification.timestamp = new Date().toISOString();
        }

        // Validate notification type
        const validTypes = ['permission_prompt', 'idle_prompt', 'stop'];
        if (!validTypes.includes(notification.type)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid notification type' }));
          return;
        }

        // Broadcast to all connected WebSocket clients
        const message = JSON.stringify(notification);
        let sentCount = 0;

        clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
            sentCount++;
          }
        });

        console.log(`[${new Date().toISOString()}] Notification broadcast: ${notification.type} -> ${sentCount} clients`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, clientsNotified: sentCount }));
      } catch (error) {
        console.error('Error parsing notification:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    // Health check endpoint
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connectedClients: clients.size,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const clientId = `${req.socket.remoteAddress}:${Date.now()}`;
  clients.add(ws);

  console.log(`[${new Date().toISOString()}] Client connected: ${clientId} (total: ${clients.size})`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Claude Code notification server',
    timestamp: new Date().toISOString()
  }));

  // Handle ping/pong for keepalive
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      // Ignore invalid messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId} (total: ${clients.size})`);
  });

  ws.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] WebSocket error:`, error);
    clients.delete(ws);
  });
});

// Start server
httpServer.listen(PORT, () => {
  // Write PID file for process management
  fs.writeFileSync(PID_FILE, process.pid.toString());

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       Claude Code Notification Server                         ║
╠═══════════════════════════════════════════════════════════════╣
║  HTTP endpoint: http://localhost:${PORT}/notify                 ║
║  WebSocket:     ws://localhost:${PORT}                          ║
║  Health check:  http://localhost:${PORT}/health                 ║
║  PID file:      ${PID_FILE}                       ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Clean up PID file
function cleanupPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down server...');

  // Clean up PID file
  cleanupPidFile();

  // Close all WebSocket connections
  clients.forEach(client => {
    client.close(1000, 'Server shutting down');
  });

  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
