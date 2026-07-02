const mongoose = require('mongoose');

const openingSchema = new mongoose.Schema(
  {
    title:    { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true, default: 'Bihar (All Districts)' },
    type:     { type: String, enum: ['Full-Time', 'Volunteer', 'Contractual'], default: 'Full-Time' },
    desc:     { type: String, required: true, trim: true },
    status:   { type: String, enum: ['ONGOING', 'CLOSED'], default: 'ONGOING' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Opening', openingSchema);
