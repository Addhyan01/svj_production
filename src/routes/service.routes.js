const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/service.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware'); // JWT auth middleware for protected routes and role-based access control

// Public endpoint: Taaki members/donors self-registration par catalog dekh sakein
router.get('/', serviceController.getAllServices);

// Strict Guard operations: Only Super Admin
router.post('/', protect, restrictTo('SUPER_ADMIN'), serviceController.createService);
router.put('/:id', protect, restrictTo('SUPER_ADMIN'), serviceController.updateService);

module.exports = router;