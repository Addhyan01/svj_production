const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meeting.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

const STAFF_ROLES = ['ASSOCIATE', 'BLOCK_COORDINATOR', 'ADMIN', 'SUPER_ADMIN'];

// Stats (before /:id to avoid route conflict)
router.get('/stats', protect, restrictTo(...STAFF_ROLES), meetingController.getMeetingStats);

// District associates with meeting counts (SUPER_ADMIN only, before /:id to avoid conflict)
router.get(
  '/district/:districtId/associates',
  protect,
  restrictTo('SUPER_ADMIN'),
  meetingController.getDistrictAssociates
);

// CRUD
router.post(
  '/',
  protect,
  restrictTo(...STAFF_ROLES),
  upload.array('photos', 10),
  meetingController.createMeeting
);

router.get('/', protect, restrictTo(...STAFF_ROLES), meetingController.getMeetings);

// BC: get meetings for a specific associate in their block (before /:id to avoid conflict)
router.get(
  '/bc/associate/:associateId',
  protect,
  restrictTo('BLOCK_COORDINATOR'),
  meetingController.getAssociateMeetingsForBC
);

router.get('/:id', protect, restrictTo(...STAFF_ROLES), meetingController.getMeetingById);

router.put(
  '/:id',
  protect,
  restrictTo(...STAFF_ROLES),
  upload.array('photos', 10),
  meetingController.updateMeeting
);

router.delete('/:id', protect, restrictTo(...STAFF_ROLES), meetingController.deleteMeeting);

module.exports = router;
