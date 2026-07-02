const mongoose = require('mongoose');
const blockSchema = new mongoose.Schema({
  name: { type: String, required: true, uppercase: true, trim: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true }
}, { timestamps: true });
blockSchema.index({ name: 1, districtId: 1 }, { unique: true }); // Prevent duplicate block in same district
module.exports = mongoose.model('Block', blockSchema);