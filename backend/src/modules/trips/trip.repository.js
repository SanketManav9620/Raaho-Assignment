/**
 * Repository = the ONLY file that talks to the database for trips (via Prisma).
 * Every function takes an optional `db`: the shared client, or a transaction client `tx`.
 * Prisma parameterises every value, including in $queryRaw template literals,
 * which prevents SQL injection.
 */
const { prisma } = require('../../db/prisma');

// The fields the API returns. idempotencyKey is internal and never sent to clients.
const TRIP_FIELDS = {
  id: true,
  tripNumber: true,
  source: true,
  destination: true,
  driverName: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

function isUniqueViolation(err) {
  return err?.code === 'P2002';
}

/**
 * Inserts a trip. If the idempotency key was already used, inserts nothing and returns null.
 * A duplicate tripNumber (with no matching idempotency key) still throws P2002,
 * which the error handler turns into 409 DUPLICATE_TRIP_NUMBER.
 */
async function insert({ tripNumber, source, destination, driverName }, idempotencyKey, db = prisma) {
  try {
    return await db.trip.create({
      data: { tripNumber, source, destination, driverName: driverName ?? null, idempotencyKey: idempotencyKey ?? null },
      select: TRIP_FIELDS,
    });
  } catch (err) {
    // Two copies of the same request racing: the loser hits a unique index (idempotency_key,
    // or trip_number if that one is checked first). If a trip with this key exists, it's a
    // retry, so report "already created" (null) and let the service replay it.
    if (idempotencyKey && isUniqueViolation(err)) {
      const existing = await db.trip.findUnique({ where: { idempotencyKey }, select: { id: true } });
      if (existing) return null;
    }
    throw err;
  }
}

async function findByIdempotencyKey(idempotencyKey, db = prisma) {
  return db.trip.findUnique({ where: { idempotencyKey }, select: TRIP_FIELDS });
}

/**
 * @param {boolean} forUpdate  true = lock the row until the transaction ends
 *                             (other updates to the same trip must wait).
 *                             Must be called with a transaction client.
 */
async function findById(id, db = prisma, { forUpdate = false } = {}) {
  if (forUpdate) {
    // Prisma has no "SELECT ... FOR UPDATE" in its query API, so take the row lock with
    // raw SQL (still parameterised), then read the row normally inside the same transaction.
    await db.$queryRaw`SELECT 1 FROM trips WHERE id = ${id}::uuid FOR UPDATE`;
  }
  return db.trip.findUnique({ where: { id }, select: TRIP_FIELDS });
}

async function list({ status, limit, offset }, db = prisma) {
  const where = status ? { status } : {};
  const [trips, total] = await Promise.all([
    db.trip.findMany({
      where,
      select: TRIP_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    }),
    db.trip.count({ where }),
  ]);
  return { trips, total };
}

async function updateStatus(id, status, driverName, db = prisma) {
  return db.trip.update({
    where: { id },
    // driverName undefined = leave the current driver unchanged. updatedAt is set by @updatedAt.
    data: { status, driverName: driverName ?? undefined },
    select: TRIP_FIELDS,
  });
}

async function deleteById(id, db = prisma) {
  const { count } = await db.trip.deleteMany({ where: { id } });
  return count > 0;
}

module.exports = { insert, findByIdempotencyKey, findById, list, updateStatus, deleteById };
