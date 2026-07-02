const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/opening.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// ──────────────────────────────────────────────────────────────────────────────
// PUBLIC  — No auth required
// ──────────────────────────────────────────────────────────────────────────────

/** GET /openings/public  — fetch only ONGOING openings for Career page */
router.get('/public', ctrl.getPublicOpenings);

/** POST /openings/apply  — submit a job application (public) */
router.post('/apply', ctrl.submitApplication);

// ──────────────────────────────────────────────────────────────────────────────
// SUPER_ADMIN only
// ──────────────────────────────────────────────────────────────────────────────

/** GET /openings  — all openings with application counts */
router.get(
  '/',
  protect,
  restrictTo('SUPER_ADMIN'),
  ctrl.getAllOpenings
);

/** POST /openings  — create new opening */
router.post(
  '/',
  protect,
  restrictTo('SUPER_ADMIN'),
  ctrl.createOpening
);

/** PUT /openings/:id/toggle  — toggle ONGOING ↔ CLOSED */
router.put(
  '/:id/toggle',
  protect,
  restrictTo('SUPER_ADMIN'),
  ctrl.toggleStatus
);

/** DELETE /openings/:id  — remove opening */
router.delete(
  '/:id',
  protect,
  restrictTo('SUPER_ADMIN'),
  ctrl.deleteOpening
);

/** GET /openings/:id/applications  — list all applicants for an opening */
router.get(
  '/:id/applications',
  protect,
  restrictTo('SUPER_ADMIN'),
  ctrl.getApplications
);

/** PUT /openings/:id/applications/:appId/status  — accept or reject an applicant */
router.put(
  '/:id/applications/:appId/status',
  protect,
  restrictTo('SUPER_ADMIN'),
  ctrl.updateApplicationStatus
);

module.exports = router;
