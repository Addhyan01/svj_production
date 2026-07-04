const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/delivery.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware'); // JWT auth middleware for protected routes and role-based access control

// All endpoints in this block require a valid active token session
router.use(protect);

// ASSOCIATE / BLOCK_COORDINATOR ONLY: Pendings dekhna, Dropdown status badalna, aur ticket grab karna
router.get('/pending', restrictTo('ASSOCIATE', 'BLOCK_COORDINATOR'), deliveryController.getPendingDeliveries);
router.get('/my-associate-deliveries', restrictTo('ASSOCIATE', 'BLOCK_COORDINATOR'), deliveryController.getAssociateDeliveries);
router.put('/:id/status', restrictTo('ASSOCIATE', 'BLOCK_COORDINATOR'), deliveryController.updateDeliveryStatus);
router.put('/:id/accept-emergency', restrictTo('ASSOCIATE', 'BLOCK_COORDINATOR'), deliveryController.acceptEmergencyRequest);

// MEMBER ONLY: Emergency request create karna + own history
router.get('/my',            restrictTo('MEMBER', 'DONOR'), deliveryController.getMyDeliveries);
router.get('/my-membership', restrictTo('MEMBER', 'DONOR'), deliveryController.getMyMembership);
router.post('/emergency', restrictTo('MEMBER'), deliveryController.raiseEmergencyRequest);

// ADMIN & SUPER_ADMIN ONLY: monitoring routes
router.get('/admin/escalations', restrictTo('ADMIN', 'SUPER_ADMIN'), deliveryController.getAdminEscalations);
router.get('/admin/all', restrictTo('ADMIN', 'SUPER_ADMIN'), deliveryController.getAllDeliveries);
router.get('/admin/district-orders', restrictTo('ADMIN', 'SUPER_ADMIN'), deliveryController.getDistrictOrders);

// ADMIN, SUPER_ADMIN, ASSOCIATE, BLOCK_COORDINATOR: view all orders for a specific member
router.get('/admin/member/:memberId/orders', restrictTo('ADMIN', 'SUPER_ADMIN', 'ASSOCIATE', 'BLOCK_COORDINATOR'), deliveryController.getMemberOrders);
router.put('/admin/schedule-bulk', protect, restrictTo('SUPER_ADMIN', 'ADMIN'), deliveryController.scheduleBulkDeliveries);

// BLOCK_COORDINATOR: view all deliveries for a specific associate in their block
router.get('/bc/associate/:associateId/deliveries', restrictTo('BLOCK_COORDINATOR'), deliveryController.getAssociateDeliveriesForBC);

// SUPER_ADMIN ONLY: raise emergency on behalf of member (toll-free helpline)
router.post('/admin/emergency-for-member', restrictTo('SUPER_ADMIN'), deliveryController.raiseEmergencyForMember);

// SUPER_ADMIN ONLY: system-wide orders & deliveries with full filters
router.get('/super/all-orders',     restrictTo('SUPER_ADMIN'), deliveryController.getSuperAdminOrders);
router.get('/super/all-deliveries', restrictTo('SUPER_ADMIN'), deliveryController.getSuperAdminDeliveries);

module.exports = router;