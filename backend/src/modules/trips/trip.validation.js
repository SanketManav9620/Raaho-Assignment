/**
 * Request validation rules (using the zod library).
 * If a request does not match, the API answers 400 with a list of problems.
 */
const { z } = require('zod');
const { TRIP_STATUSES } = require('./trip.status');

const text = (field, max) =>
  z
    .string({ required_error: `${field} is required`, invalid_type_error: `${field} must be a string` })
    .trim()
    .min(1, `${field} cannot be empty`)
    .max(max, `${field} must be at most ${max} characters`);

// POST /trips
// `.strict()` rejects unknown fields, e.g. a client cannot set "status" or "id" itself.
const createTripFields = z
  .object({
    tripNumber: text('tripNumber', 50).regex(
      /^[A-Za-z0-9_-]+$/,
      'tripNumber may only contain letters, numbers, "-" and "_"'
    ),
    source: text('source', 255),
    destination: text('destination', 255),
    driverName: text('driverName', 100).optional().nullable(),
  })
  .strict();

// Zod skips an object-level .refine() when any field fails, so a request with
// several problems would not hear about "source = destination" until the others
// were fixed. Running the field checks and the cross-field check side by side
// reports every problem in one response.
const createTripSchema = z.unknown().transform((input, ctx) => {
  const result = createTripFields.safeParse(input);
  const issues = result.success ? [] : [...result.error.issues];

  const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : null);
  const source = norm(input?.source);
  if (source && source === norm(input?.destination)) {
    issues.push({ code: z.ZodIssueCode.custom, message: 'source and destination must be different', path: ['destination'] });
  }

  if (issues.length === 0) return result.data;
  issues.forEach((issue) => ctx.addIssue(issue));
  return z.NEVER;
});

// GET /trips?page=1&limit=20&status=CREATED
const listTripsQuerySchema = z.object({
  page: z.coerce.number().int('page must be a whole number').min(1, 'page must be >= 1').default(1),
  limit: z.coerce
    .number()
    .int('limit must be a whole number')
    .min(1, 'limit must be >= 1')
    .max(100, 'limit must be <= 100')
    .default(20),
  status: z.enum(TRIP_STATUSES, { message: `status must be one of: ${TRIP_STATUSES.join(', ')}` }).optional(),
});

// :id in the URL
const tripIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// PATCH /trips/:id/status
const updateStatusSchema = z
  .object({
    status: z.enum(TRIP_STATUSES, { message: `status must be one of: ${TRIP_STATUSES.join(', ')}` }),
    driverName: text('driverName', 100).optional(),
  })
  .strict()
  .refine((d) => d.driverName === undefined || d.status === 'ASSIGNED', {
    message: 'driverName can only be sent when status is ASSIGNED',
    path: ['driverName'],
  });

module.exports = { createTripSchema, listTripsQuerySchema, tripIdParamsSchema, updateStatusSchema };
