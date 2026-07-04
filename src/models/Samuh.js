const mongoose = require('mongoose');

// Sub-schema for each member row
const memberSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  address:       { type: String, required: true, trim: true },
  mobileNumber:  {
    type: String,
    required: true,
    match: [/^\d{10}$/, 'Mobile number must be exactly 10 digits'],
  },
  aadhaarNumber: {
    type: String,
    required: true,
    match: [/^\d{12}$/, 'Aadhaar number must be exactly 12 digits'],
  },
  status:        { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { _id: true });

const samuhSchema = new mongoose.Schema({
  // Auto-filled from logged-in Associate
  associateId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  associateName: { type: String, required: true, trim: true },
  epId:          { type: String, required: true, trim: true }, // employeeId of associate

  // Samuh Information
  samuhName: { type: String, required: true, trim: true },
  address:   { type: String, required: true, trim: true },
  block:     { type: String, required: true, trim: true },
  district:  { type: String, required: true, trim: true },
  pinCode:   { type: String, required: true, trim: true },

  // Leadership
  sachiv:    { type: String, required: true, trim: true },
  adhyaksh:  { type: String, required: true, trim: true },

  // Members (12–20)
  totalMembers: {
    type: Number,
    required: true,
    min: [12, 'Minimum 12 members required'],
    max: [20, 'Maximum 20 members allowed'],
  },
  members: {
    type: [memberSchema],
    validate: [
      {
        // Validate only on creation (not after Super Admin additions)
        // Minimum 12 enforced in controller at create time
        validator: function (arr) {
          return arr.length >= 1;
        },
        message: 'At least one member is required',
      },
      {
        // No duplicate Aadhaar within the same Samuh
        validator: function (arr) {
          const aadhaarNums = arr.map((m) => m.aadhaarNumber);
          return aadhaarNums.length === new Set(aadhaarNums).size;
        },
        message: 'Duplicate Aadhaar numbers are not allowed within the same Samuh',
      },
      {
        // No duplicate mobile numbers within the same Samuh
        validator: function (arr) {
          const mobiles = arr.map((m) => m.mobileNumber);
          return mobiles.length === new Set(mobiles).size;
        },
        message: 'Duplicate mobile numbers are not allowed within the same Samuh',
      },
    ],
  },

  // Bank Details — only Super Admin can fill/edit
  bankAccountNumber: { type: String, default: '' },
  ifscCode:          { type: String, default: '' },
  branchName:        { type: String, default: '' },
  bankName:          { type: String, default: '' },

  // Workflow
  status:     { type: String, enum: ['Pending', 'Active', 'Rejected'], default: 'Pending' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // District/Block refs for scope filtering
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', default: null },
  blockId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Block',    default: null },
}, { timestamps: true });

// Index for common query patterns
samuhSchema.index({ associateId: 1, createdAt: -1 });
samuhSchema.index({ districtId: 1, status: 1 });
samuhSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Samuh', samuhSchema);
