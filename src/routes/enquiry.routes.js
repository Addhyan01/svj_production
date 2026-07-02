const express    = require('express');
const router     = express.Router();
const enquiryCtrl = require('../controllers/enquiry.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// Public — anyone can submit a contact enquiry
router.post('/', enquiryCtrl.createEnquiry);

// Protected — SUPER_ADMIN and ADMIN can view & manage
router.get(
  '/',
  protect,
  restrictTo('SUPER_ADMIN', 'ADMIN'),
  enquiryCtrl.getAllEnquiries
);

router.put(
  '/:id/status',
  protect,
  restrictTo('SUPER_ADMIN', 'ADMIN'),
  enquiryCtrl.updateStatus
);

module.exports = router;
