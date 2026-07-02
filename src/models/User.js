


const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  role: { 
    type: String, 
    enum: ['SUPER_ADMIN', 'ADMIN', 'ASSOCIATE', 'MEMBER', 'DONOR'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'active', 'inactive'], 
    default: 'pending' 
  },
  membershipId: { type: String, unique: true, sparse: true }, // assigned at payment activation
  memberId: { type: String, unique: true, sparse: true },    // assigned at registration (MEMBER)
  donorId: { type: String, unique: true, sparse: true },     // assigned at registration (DONOR)
  employeeId: { type: String, unique: true, sparse: true },  // assigned at registration (staff)
  
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', default: null },
  blockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Block', default: null },
  
  assignedBlocks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Block' }],
  
  // For MEMBER/DONOR: the ASSOCIATE they are assigned under
  associateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// MODERN ASYNC PRE-SAVE HOOK (Bina 'next' parameter ke)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  
  // Direct await karke password hash karein, next() call karne ki zarurat nahi hai
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);