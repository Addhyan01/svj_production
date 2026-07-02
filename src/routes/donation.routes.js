const express = require('express');
const router  = express.Router();
const donationController = require('../controllers/donation.controller');
const { protect } = require('../middleware/auth.middleware');

// ====================================================
// PUBLIC — anyone can initiate a donation
// ====================================================
router.post('/create-order', donationController.createOrder);
router.post('/verify',       donationController.verifyPayment);

// ====================================================
// PROTECTED — admin/super-admin can view all donations
// ====================================================
router.get('/', protect, donationController.getAllDonations);

module.exports = router;
