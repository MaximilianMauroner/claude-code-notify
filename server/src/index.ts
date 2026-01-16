import http from 'node:http';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, ServerResponse } from 'node:http';

const PORT = 3099;
const PID_FILE = '/tmp/claude-notify-server.pid';
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;

type NotificationType = 'permission_prompt' | 'idle_prompt' | 'stop';

interface Notification {
  type: NotificationType;
  message?: string;
  timestamp?: string;
}

interface HealthResponse {
  status: 'ok';
  connectedClients: number;
  uptime: number;
}

interface NotifyResponse {
  success: boolean;
  clientsNotified: number;
}

interface ErrorResponse {
  error: string;
}

interface PingMessage {
  type: 'ping';
}

interface WelcomeMessage {
  type: 'connected';
  message: string;
  timestamp: string;
}

interface PongMessage {
  type: 'pong';
  timestamp: string;
}

// Store connected WebSocket clients
const clients = new Set<WebSocket>();
let idleShutdownTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

const VALID_TYPES: NotificationType[] = ['permission_prompt', 'idle_prompt', 'stop'];

// Create HTTP server for receiving notifications from Claude Code hooks
const httpServer = http.createServer(
  (req: IncomingMessage, res: ServerResponse): void => {
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

      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const notification = JSON.parse(body) as Notification;

          // Add timestamp if not present
          if (!notification.timestamp) {
            notification.timestamp = new Date().toISOString();
          }

          // Validate notification type
          if (!VALID_TYPES.includes(notification.type)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            const errorResponse: ErrorResponse = { error: 'Invalid notification type' };
            res.end(JSON.stringify(errorResponse));
            return;
          }

          // Broadcast to all connected WebSocket clients
          const message = JSON.stringify(notification);
          let sentCount = 0;

          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
              sentCount++;
            }
          });

          console.log(
            `[${new Date().toISOString()}] Notification broadcast: ${notification.type} -> ${sentCount} clients`
          );

          res.writeHead(200, { 'Content-Type': 'application/json' });
          const response: NotifyResponse = { success: true, clientsNotified: sentCount };
          res.end(JSON.stringify(response));
        } catch (error) {
          console.error('Error parsing notification:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          const errorResponse: ErrorResponse = { error: 'Invalid JSON payload' };
          res.end(JSON.stringify(errorResponse));
        }
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      // Health check endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const response: HealthResponse = {
        status: 'ok',
        connectedClients: clients.size,
        uptime: process.uptime(),
      };
      res.end(JSON.stringify(response));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      const errorResponse: ErrorResponse = { error: 'Not found' };
      res.end(JSON.stringify(errorResponse));
    }
  }
);

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server: httpServer });

function clearIdleShutdown(): void {
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
}

function scheduleIdleShutdown(): void {
  if (idleShutdownTimer || isShuttingDown) {
    return;
  }
  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;
    if (clients.size === 0 && !isShuttingDown) {
      console.log(`[${new Date().toISOString()}] No active clients, shutting down.`);
      shutdown();
    }
  }, IDLE_SHUTDOWN_MS);
}

wss.on('connection', (ws: WebSocket, req: IncomingMessage): void => {
  const clientId = `${req.socket.remoteAddress}:${Date.now()}`;
  clients.add(ws);
  clearIdleShutdown();

  console.log(`[${new Date().toISOString()}] Client connected: ${clientId} (total: ${clients.size})`);

  // Send welcome message
  const welcomeMessage: WelcomeMessage = {
    type: 'connected',
    message: 'Connected to Claude Code notification server',
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(welcomeMessage));

  // Handle ping/pong for keepalive
  ws.on('message', (data: Buffer): void => {
    try {
      const message = JSON.parse(data.toString()) as PingMessage;
      if (message.type === 'ping') {
        const pongMessage: PongMessage = { type: 'pong', timestamp: new Date().toISOString() };
        ws.send(JSON.stringify(pongMessage));
      }
    } catch {
      // Ignore invalid messages
    }
  });

  ws.on('close', (): void => {
    clients.delete(ws);
    console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId} (total: ${clients.size})`);
    if (clients.size === 0) {
      scheduleIdleShutdown();
    }
  });

  ws.on('error', (error: Error): void => {
    console.error(`[${new Date().toISOString()}] WebSocket error:`, error);
    clients.delete(ws);
    if (clients.size === 0) {
      scheduleIdleShutdown();
    }
  });
});

// Start server
httpServer.listen(PORT, (): void => {
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

  if (clients.size === 0) {
    scheduleIdleShutdown();
  }
});

// Clean up PID file
function cleanupPidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// Graceful shutdown
function shutdown(): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log('\nShutting down server...');

  // Clean up PID file
  cleanupPidFile();

  // Close all WebSocket connections
  clients.forEach((client) => {
    client.close(1000, 'Server shutting down');
  });

  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
