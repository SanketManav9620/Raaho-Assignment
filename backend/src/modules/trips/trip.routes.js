const { Router } = require('express');
const validate = require('../../middleware/validate');
const controller = require('./trip.controller');
const {
  createTripSchema,
  listTripsQuerySchema,
  tripIdParamsSchema,
  updateStatusSchema,
} = require('./trip.validation');

const router = Router();

router.post('/', validate(createTripSchema, 'body'), controller.create);
router.get('/', validate(listTripsQuerySchema, 'query'), controller.list);
router.get('/:id', validate(tripIdParamsSchema, 'params'), controller.getById);
router.patch(
  '/:id/status',
  validate(tripIdParamsSchema, 'params'),
  validate(updateStatusSchema, 'body'),
  controller.updateStatus
);
router.delete('/:id', validate(tripIdParamsSchema, 'params'), controller.remove);

module.exports = router;
