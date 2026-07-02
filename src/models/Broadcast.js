const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },

  category: {
    type: String,
    enum: ['GENERAL_NOTICE', 'EMERGENCY_NOTICE', 'SCHEME_UPDATE'],
    required: true,
  },

  targetGroup: {
    type: String,
    enum: [
      'ALL',               // All people
      'ADMIN_ONLY',        // Only All Admin
      'ASSOCIATE_ONLY',    // Only All Associate
      'MEMBER_ONLY',       // Only All Members
      'ADMIN_ASSOCIATE',   // Only Admin and Associate
    ],
    required: true,
  },

  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active',
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Broadcast', broadcastSchema);
