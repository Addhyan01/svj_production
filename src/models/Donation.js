const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema(
  {
    // Donor info
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    pan:   { type: String, trim: true, uppercase: true, default: '' },

    // Amount in INR (whole rupees)
    amount: { type: Number, required: true, min: 1 },

    // Razorpay identifiers
    razorpayOrderId:   { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },

    // Payment lifecycle
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Donation', donationSchema);
