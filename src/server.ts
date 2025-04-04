// src/server.ts
// Application entry point

import { createServer } from 'node:http';
import { env } from './config';
import { logger } from './utils';

// Create the server
const server = createServer((req, res) => {
  // Basic health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Handle 404 for other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// Start the server
server.listen(env.PORT, env.HOST, () => {
  logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, 'MCP Host Server started');
  logger.info(`Server is running at http://${env.HOST}:${env.PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  logger.error({ error }, 'Server error occurred');
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Note: This is just a skeleton. WebSocket and the actual application
// components will be properly integrated in subsequent phases.
