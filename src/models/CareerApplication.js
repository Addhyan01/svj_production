const mongoose = require('mongoose');

const careerApplicationSchema = new mongoose.Schema(
  {
    openingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Opening', required: true },
    name:       { type: String, required: true, trim: true },
    email:      { type: String, required: true, trim: true, lowercase: true },
    phone:      { type: String, required: true, trim: true },
    district:   { type: String, required: true, trim: true },
    block:      { type: String, required: true, trim: true },
    experience: { type: String, enum: ['Fresher', '1 Year', '2+ Years'], default: 'Fresher' },
    message:    { type: String, trim: true, default: '' },
    status:     { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CareerApplication', careerApplicationSchema);
