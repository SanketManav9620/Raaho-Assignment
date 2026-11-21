const config = require('./config');
const { createApp } = require('./app');
const { prisma } = require('./db/prisma');

const server = createApp().listen(config.port, () => {
  console.log(`Trip API running on http://localhost:${config.port}`);
});

// Graceful shutdown: stop taking requests, finish current ones, close DB connections.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => prisma.$disconnect().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
