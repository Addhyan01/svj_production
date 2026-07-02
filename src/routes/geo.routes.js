const express = require('express');
const router = express.Router();
const geoController = require('../controllers/geo.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware'); // JWT auth middleware for protected routes and role-based access control

// Public views for dropdown registration selections
router.get('/districts', geoController.getAllDistricts);
router.get('/districts/:districtId/blocks', geoController.getBlocksByDistrict);
router.get('/blocks/:blockId/associates', geoController.getAssociatesByBlock);

// Associate: fetch own assigned blocks (with district populated)
router.get('/my-blocks', protect, restrictTo('ASSOCIATE'), geoController.getMyBlocks);

// Protected Management operations
router.post('/districts', protect, restrictTo('SUPER_ADMIN'), geoController.createDistrict);
router.post('/blocks', protect, restrictTo('SUPER_ADMIN'), geoController.createBlock);

// Associate tracking assignments
router.get('/assigned-associates', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), geoController.getAssignedAssociates);
router.put('/assign-associate/:associateId', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), geoController.assignBlocksToAssociate);

// Admin: get all blocks in own district with associate counts
router.get('/admin/district-blocks', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), geoController.getAdminDistrictBlocks);

module.exports = router;