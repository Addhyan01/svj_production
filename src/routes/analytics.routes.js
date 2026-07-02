const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware'); // JWT auth middleware for protected routes and role-based access control

// Protect endpoint so only authorized hierarchy can view high level metrics data
router.get(
  '/dashboard',
  protect,
  restrictTo('SUPER_ADMIN', 'ADMIN'),
  analyticsController.getAdminDashboardMetrics
);

// Donation stats + recent list — accessible to SUPER_ADMIN and ADMIN
router.get(
  '/donations',
  protect,
  restrictTo('SUPER_ADMIN', 'ADMIN'),
  analyticsController.getDonationStats
);

module.exports = router;