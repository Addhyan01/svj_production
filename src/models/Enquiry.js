const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, trim: true },
    email:   { type: String, default: '', trim: true, lowercase: true },
    phone:   { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, default: '', trim: true },

    // ── Program Application fields (optional — populated when type is 'PROGRAM_APPLICATION') ──
    address:     { type: String, default: '', trim: true },
    pinCode:     { type: String, default: '', trim: true },
    district:    { type: String, default: '', trim: true },
    programName: { type: String, default: '', trim: true },
    enquiryType: {
      type: String,
      enum: ['CONTACT', 'PROGRAM_APPLICATION'],
      default: 'CONTACT',
    },

    // Admin can mark as read / resolved
    status: {
      type: String,
      enum: ['NEW', 'READ', 'RESOLVED'],
      default: 'NEW',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Enquiry', enquirySchema);
