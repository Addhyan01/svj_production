const express = require('express');
const router  = express.Router();
const samuhController = require('../controllers/samuh.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(protect);

// List & Create
router.get(
  '/',
  restrictTo('SUPER_ADMIN', 'ADMIN', 'ASSOCIATE', 'BLOCK_COORDINATOR'),
  samuhController.getSamuhs
);

router.post(
  '/',
  restrictTo('ASSOCIATE', 'BLOCK_COORDINATOR'),
  samuhController.createSamuh
);

// Single Samuh detail
router.get(
  '/:id',
  restrictTo('SUPER_ADMIN', 'ADMIN', 'ASSOCIATE', 'BLOCK_COORDINATOR'),
  samuhController.getSamuhById
);

// Super Admin: edit samuh fields
router.put(
  '/:id',
  restrictTo('SUPER_ADMIN'),
  samuhController.editSamuh
);

// Super Admin: approve
router.put(
  '/:id/approve',
  restrictTo('SUPER_ADMIN'),
  samuhController.approveSamuh
);

// Super Admin: reject
router.put(
  '/:id/reject',
  restrictTo('SUPER_ADMIN'),
  samuhController.rejectSamuh
);

// Super Admin: bank details
router.put(
  '/:id/bank-details',
  restrictTo('SUPER_ADMIN'),
  samuhController.updateBankDetails
);

// Super Admin: add more members
router.post(
  '/:id/members',
  restrictTo('SUPER_ADMIN'),
  samuhController.addMembers
);

// Super Admin: toggle individual member Active/Inactive
router.put(
  '/:id/members/:memberId/toggle',
  restrictTo('SUPER_ADMIN'),
  samuhController.toggleMemberStatus
);

// Super Admin: edit individual member details
router.put(
  '/:id/members/:memberId',
  restrictTo('SUPER_ADMIN'),
  samuhController.editMember
);

// Super Admin: transfer Samuh to another associate
router.put(
  '/:id/transfer',
  restrictTo('SUPER_ADMIN'),
  samuhController.transferSamuh
);

module.exports = router;
