const express = require('express');
const router = express.Router();
const schedulerController = require('../controllers/scheduler.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// Production manual trigger — runs cycle for current month
router.post(
  '/generate-monthly-cycle',
  protect,
  restrictTo('SUPER_ADMIN'),
  schedulerController.generateMonthlyCycleDeliveries
);

// Test endpoint — simulate cycle for any date (pass simulateDate in body)
router.post(
  '/test-monthly-cycle',
  protect,
  restrictTo('SUPER_ADMIN'),
  schedulerController.testMonthlyCycle
);

// One-time migration: fix existing membership documents with missing/wrong unit counts
router.post(
  '/fix-membership-units',
  protect,
  restrictTo('SUPER_ADMIN'),
  schedulerController.fixMembershipUnits
);

module.exports = router;