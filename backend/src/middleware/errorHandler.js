const AppError = require('../utils/AppError');

// Unknown routes -> 404 in the same error format.
function notFoundHandler(req, res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// Prisma reports a unique-index violation as P2002, with the columns in meta.target
// (field names, column names or the constraint name, depending on the query).
function isDuplicateTripNumber(err) {
  if (err.code !== 'P2002') return false;
  const target = [].concat(err.meta?.target ?? []).join(',');
  return /trip_?number/i.test(target);
}

// Prisma has no error code for CHECK constraints; Postgres' message names the constraint.
function checkConstraintName(err) {
  if (!err.name?.startsWith('PrismaClient')) return null;
  return /violates check constraint \\?"(\w+)\\?"/.exec(err.message)?.[1] ?? null;
}

// Every error in the app ends up here and is sent in ONE consistent shape.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (err.type === 'entity.parse.failed') {
    // Body was not valid JSON
    error = AppError.badRequest('Request body is not valid JSON');
  } else if (isDuplicateTripNumber(err)) {
    error = AppError.conflict('DUPLICATE_TRIP_NUMBER', 'A trip with this tripNumber already exists');
  } else if (checkConstraintName(err)) {
    error = AppError.unprocessable('CONSTRAINT_VIOLATION', `Data violates rule: ${checkConstraintName(err)}`);
  }

  if (!(error instanceof AppError)) {
    console.error(err);
    error = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
  }

  const body = { error: { code: error.code, message: error.message } };
  if (error.details) body.error.details = error.details;
  res.status(error.statusCode).json(body);
}

module.exports = { errorHandler, notFoundHandler };
