const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// ====================================================
// PUBLIC ENDPOINTS
// ====================================================
router.post('/login', authController.login);
router.post('/public-register', authController.register); 
router.post('/activate/:userId', authController.activateAccount); 

// ====================================================
// PROTECTED REGISTER LAYER
// ====================================================
router.post('/admin-register', protect, authController.register); 

// ====================================================
// SECURED SELF-SERVICE USER PROFILE ROUTES
// ====================================================
router.get('/me', protect, authController.getMe);
router.put('/update-profile', protect, authController.updateProfile);
router.put('/change-password', protect, authController.changeSelfPassword);

// ====================================================
// HIERARCHICAL CONTROL ROUTES
// ====================================================
router.put('/admin/reset-password/:targetUserId', protect, authController.adminResetPassword);

// ====================================================
// USER LISTING & STATUS MANAGEMENT (Admin & Super Admin)
// ====================================================
router.get('/users', protect, authController.getUsers);
router.get('/block-associates', protect, restrictTo('BLOCK_COORDINATOR'), authController.getBlockAssociates);
router.put('/users/:userId/toggle-status', protect, authController.toggleUserStatus);

module.exports = router;

