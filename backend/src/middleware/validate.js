const AppError = require('../utils/AppError');

/**
 * Validates req[part] ("body", "query" or "params") against a zod schema.
 * On success, the cleaned/converted value is saved to req.validated[part].
 * On failure, responds 400 with a list of what is wrong.
 */
const validate = (schema, part = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || part,
      message: issue.message,
    }));
    return next(AppError.badRequest('Request validation failed', details));
  }
  req.validated = { ...(req.validated || {}), [part]: result.data };
  next();
};

module.exports = validate;
