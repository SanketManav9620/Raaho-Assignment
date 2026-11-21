const express = require('express');
const cors = require('cors');
const config = require('./config');
const { prisma } = require('./db/prisma');
const tripRoutes = require('./modules/trips/trip.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ['Location', 'Idempotent-Replayed'] }));
  app.use(express.json({ limit: '100kb' }));

  // Health check: is the API up and can it reach the database?
  app.get('/health', async (req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  app.use('/trips', tripRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
