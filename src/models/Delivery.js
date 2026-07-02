const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // PURANA: serviceId root par tha jo error de raha tha, ab use is bundle array me change karein:
  services: [{ 
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    quantity: { type: Number, default: 1 }
  }],
  
  associateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  blockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Block', required: true },
  
  status: {
    type: String,
    enum: ['pending', 'emergency', 'on_the_way', 'delivered', 'failed'],
    default: 'pending'
  },
  deliveryType: { type: String, enum: ['REGULAR', 'EMERGENCY'], default: 'REGULAR' },
  
  failReason: { type: String, default: null },
  notes: { type: String, default: null },
  
  dispatchedAt: { type: Date, default: null },
  claimedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  estimatedDeliveryDate: { 
  type: Date, 
  default: null // Starting me null rahega, Admin baad me set karega
},
}, { timestamps: true });

module.exports = mongoose.model('Delivery', deliverySchema);