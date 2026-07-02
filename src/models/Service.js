const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  
  // Model segregation types
  type: { 
    type: String, 
    enum: ['SUBSCRIPTION', 'ON_DEMAND'], 
    required: true 
  },
  
  // Pricing parameters matrix
  baseFee: { type: Number, required: true }, // Pad ke liye 300, Tree ke liye 625
  subsequentFee: { type: Number, default: 0 }, // Tree ke liye 300, Pad ke liye 0
  
  // Subscription cycle specific configs
  totalMonths: { type: Number, default: 0 }, // Pad ke liye 12 months
  initialBonusUnits: { type: Number, default: 0 } // Pad ke liye 2 units (First month)
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);