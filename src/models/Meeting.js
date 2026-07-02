const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  // Core details
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  meetingType: {
    type: String,
    enum: ['GENERAL', 'TRAINING', 'AWARENESS', 'REVIEW', 'EMERGENCY', 'OTHER'],
    required: true,
  },
  meetingDate: { type: Date, required: true },

  // Location
  address: {
    line1: { type: String, required: true },
    village: { type: String },
    block: { type: String },
    district: { type: String },
    state: { type: String },
    pincode: { type: String },
    fullAddress: { type: String }, // denormalized for quick display
  },
  gpsLocation: {
    lat: { type: Number },
    lng: { type: Number },
  },

  // Attendance
  totalMembersAttended: { type: Number, default: 0, min: 0 },

  // Notes
  notes: { type: String, trim: true },

  // Photos — stored as relative paths (served statically)
  photos: [{ type: String }],

  // Hierarchy references
  conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conductedByRole: {
    type: String,
    enum: ['ASSOCIATE', 'ADMIN', 'SUPER_ADMIN'],
    required: true,
  },

  // Scoping fields (denormalized for fast queries)
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', default: null },
  blockId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Block',    default: null },

  // Status
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
}, { timestamps: true });

// Indexes for common query patterns
meetingSchema.index({ conductedBy: 1, meetingDate: -1 });
meetingSchema.index({ districtId: 1, meetingDate: -1 });
meetingSchema.index({ conductedByRole: 1, meetingDate: -1 });

module.exports = mongoose.model('Meeting', meetingSchema);
