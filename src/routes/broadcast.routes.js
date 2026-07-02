const express = require('express');
const router = express.Router();
const bc = require('../controllers/broadcast.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// All broadcast routes require authentication
router.use(protect);

// Read — any authenticated user can read broadcasts
router.get('/', bc.getBroadcasts);

// Write — Admin and Super Admin only
router.post('/',           restrictTo('ADMIN', 'SUPER_ADMIN'), bc.createBroadcast);
router.put('/:id/revoke',  restrictTo('ADMIN', 'SUPER_ADMIN'), bc.revokeBroadcast);
router.delete('/:id',      restrictTo('ADMIN', 'SUPER_ADMIN'), bc.deleteBroadcast);

module.exports = router;
