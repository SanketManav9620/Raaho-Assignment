const { PrismaClient } = require('@prisma/client');
const config = require('../config');

// One shared Prisma client (it manages its own connection pool) for the whole app.
const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });

module.exports = { prisma };
