const mongoose = require('mongoose');
const districtSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, uppercase: true, trim: true },
  state: { type: String, default: 'BIHAR' }
}, { timestamps: true });
module.exports = mongoose.model('District', districtSchema);