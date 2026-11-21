require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://trips:trips@localhost:5433/trips',
  // Comma-separated list of allowed browser origins (the React dev server).
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((o) => o.trim()),
};

module.exports = config;
