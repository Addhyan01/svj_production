const crypto   = require('crypto');
const Razorpay = require('razorpay');
const Donation = require('../models/Donation');

// Lazily create the Razorpay instance so env vars are guaranteed to be loaded
function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are not set in environment variables.');
  }
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// ─── POST /api/v1/donations/create-order ─────────────────────────────────────
// Creates a Razorpay order and saves a PENDING donation record.
exports.createOrder = async (req, res) => {
  try {
    const { name, email, phone, pan, amount } = req.body;

    // Basic validation
    if (!name || !email || !phone || !amount) {
      return res.status(400).json({ success: false, message: 'name, email, phone and amount are required.' });
    }

    const amountInPaise = Math.round(Number(amount)) * 100; // Razorpay expects paise
    if (amountInPaise < 100) {
      return res.status(400).json({ success: false, message: 'Minimum donation amount is ₹1.' });
    }

    const razorpay = getRazorpay();

    // Create order on Razorpay
    const order = await razorpay.orders.create({
      amount:   amountInPaise,
      currency: 'INR',
      receipt:  `rcpt_${Date.now()}`,
      notes: { name, email, phone },
    });

    // Persist a PENDING record
    const donation = await Donation.create({
      name,
      email,
      phone,
      pan: pan || '',
      amount: Number(amount),
      razorpayOrderId: order.id,
    });

    return res.status(201).json({
      success: true,
      orderId:   order.id,
      amount:    order.amount,   // paise
      currency:  order.currency,
      donationId: donation._id,
    });
  } catch (err) {
    console.error('createOrder error:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Could not create payment order.',
    });
  }
};

// ─── POST /api/v1/donations/verify ───────────────────────────────────────────
// Verifies Razorpay signature and marks donation SUCCESS / FAILED.
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields.' });
    }

    // HMAC-SHA256 signature check
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      // Mark donation as FAILED
      await Donation.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { status: 'FAILED', razorpayPaymentId: razorpay_payment_id }
      );
      return res.status(400).json({ success: false, message: 'Payment verification failed. Signature mismatch.' });
    }

    // Mark donation as SUCCESS
    const donation = await Donation.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status:             'SUCCESS',
        razorpayPaymentId:  razorpay_payment_id,
        razorpaySignature:  razorpay_signature,
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully. Thank you for your donation!',
      donation,
    });
  } catch (err) {
    console.error('verifyPayment error:', err);
    return res.status(500).json({ success: false, message: 'Payment verification error.' });
  }
};

// ─── GET /api/v1/donations ────────────────────────────────────────────────────
// Admin: list all donations (protected by auth middleware in route).
exports.getAllDonations = async (req, res) => {
  try {
    const donations = await Donation.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: donations });
  } catch (err) {
    console.error('getAllDonations error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch donations.' });
  }
};
