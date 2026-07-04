const Samuh = require('../models/Samuh');

// ─────────────────────────────────────────────
// @desc   Create a new Samuh (Associate only)
// @route  POST /api/v1/samuhs
// @access ASSOCIATE
// ─────────────────────────────────────────────
exports.createSamuh = async (req, res) => {
  try {
    const associate = req.user;

    if (associate.role !== 'ASSOCIATE' && associate.role !== 'BLOCK_COORDINATOR') {
      return res.status(403).json({ success: false, message: 'Only Associates and Block Coordinators can create a Samuh.' });
    }

    const {
      samuhName, address, block, district, pinCode,
      sachiv, adhyaksh,
      totalMembers, members,
    } = req.body;

    // Basic count check before Mongoose validation
    if (!members || members.length < 12 || members.length > 20) {
      return res.status(400).json({ success: false, message: 'Members array must have between 12 and 20 entries.' });
    }

    if (parseInt(totalMembers) !== members.length) {
      return res.status(400).json({ success: false, message: 'totalMembers count must match actual members array length.' });
    }

    const samuh = await Samuh.create({
      associateId:   associate._id,
      associateName: associate.name,
      epId:          associate.employeeId || '',
      samuhName,
      address,
      block,
      district,
      pinCode,
      sachiv,
      adhyaksh,
      totalMembers: parseInt(totalMembers),
      members,
      status:    'Pending',
      createdBy: associate._id,
      districtId: associate.districtId || null,
      blockId:    associate.blockId    || null,
    });

    res.status(201).json({ success: true, message: 'Samuh created successfully. Status: Pending.', data: samuh });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join('; ') });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Get Samuhs (role-scoped)
//         - ASSOCIATE: only own samuhs
//         - ADMIN (District Admin): all samuhs in their district
//         - SUPER_ADMIN: all samuhs
// @route  GET /api/v1/samuhs
// @access ASSOCIATE | ADMIN | SUPER_ADMIN
// ─────────────────────────────────────────────
exports.getSamuhs = async (req, res) => {
  try {
    const { role, _id, districtId } = req.user;
    const { status, block, search, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (role === 'ASSOCIATE' || role === 'BLOCK_COORDINATOR') {
      filter.associateId = _id;
    } else if (role === 'ADMIN') {
      if (districtId) filter.districtId = districtId;
      // District admin can also filter by block
      if (block) filter.block = { $regex: block, $options: 'i' };
    }
    // SUPER_ADMIN: no scope restriction

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { samuhName:      { $regex: search, $options: 'i' } },
        { associateName:  { $regex: search, $options: 'i' } },
        { epId:           { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Samuh.countDocuments(filter);
    const samuhs = await Samuh.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('approvedBy', 'name email');

    // Mask Aadhaar for non-Super Admin roles
    const maskedSamuhs = samuhs.map((s) => {
      const samuhObj = s.toObject();
      if (role !== 'SUPER_ADMIN') {
        samuhObj.members = samuhObj.members.map((m) => ({
          ...m,
          aadhaarNumber: `XXXX XXXX ${m.aadhaarNumber.slice(-4)}`,
        }));
      }
      return samuhObj;
    });
    res.status(200).json({
      success: true,
      count: maskedSamuhs.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: maskedSamuhs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Get single Samuh by ID
// @route  GET /api/v1/samuhs/:id
// @access ASSOCIATE (own) | ADMIN | SUPER_ADMIN
// ─────────────────────────────────────────────
exports.getSamuhById = async (req, res) => {
  try {
    const samuh = await Samuh.findById(req.params.id).populate('approvedBy', 'name email');
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    const { role, _id, districtId } = req.user;

    // Associates / Block Coordinators can only see their own
    if ((role === 'ASSOCIATE' || role === 'BLOCK_COORDINATOR') && samuh.associateId.toString() !== _id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // District Admin can only see their district
    if (role === 'ADMIN' && districtId && samuh.districtId?.toString() !== districtId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const samuhObj = samuh.toObject();

    // Mask Aadhaar for non-Super Admin roles
    if (role !== 'SUPER_ADMIN') {
      samuhObj.members = samuhObj.members.map((m) => ({
        ...m,
        aadhaarNumber: `XXXX XXXX ${m.aadhaarNumber.slice(-4)}`,
      }));
    }

    res.status(200).json({ success: true, data: samuhObj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Approve a Samuh (Super Admin only)
// @route  PUT /api/v1/samuhs/:id/approve
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.approveSamuh = async (req, res) => {
  try {
    const samuh = await Samuh.findById(req.params.id);
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    samuh.status     = 'Active';
    samuh.approvedBy = req.user._id;
    await samuh.save();

    res.status(200).json({ success: true, message: 'Samuh approved and activated.', data: samuh });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Reject a Samuh (Super Admin only)
// @route  PUT /api/v1/samuhs/:id/reject
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.rejectSamuh = async (req, res) => {
  try {
    const samuh = await Samuh.findById(req.params.id);
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    samuh.status = 'Rejected';
    await samuh.save();

    res.status(200).json({ success: true, message: 'Samuh rejected.', data: samuh });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Update bank details (Super Admin only)
// @route  PUT /api/v1/samuhs/:id/bank-details
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.updateBankDetails = async (req, res) => {
  try {
    const { bankAccountNumber, ifscCode, branchName, bankName } = req.body;

    const samuh = await Samuh.findById(req.params.id);
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    samuh.bankAccountNumber = bankAccountNumber || samuh.bankAccountNumber;
    samuh.ifscCode          = ifscCode          || samuh.ifscCode;
    samuh.branchName        = branchName        || samuh.branchName;
    samuh.bankName          = bankName          || samuh.bankName;
    await samuh.save();

    res.status(200).json({ success: true, message: 'Bank details updated.', data: samuh });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Edit Samuh (Super Admin only)
// @route  PUT /api/v1/samuhs/:id
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.editSamuh = async (req, res) => {
  try {
    const updates = req.body;
    // Prevent status change through this endpoint
    delete updates.status;
    delete updates.approvedBy;
    delete updates.createdBy;
    delete updates.associateId;
    // Prevent editing bank details here — use dedicated endpoint
    delete updates.bankAccountNumber;
    delete updates.ifscCode;
    delete updates.branchName;
    delete updates.bankName;

    const samuh = await Samuh.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    res.status(200).json({ success: true, message: 'Samuh updated.', data: samuh });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join('; ') });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Add members to a Samuh (Super Admin only)
// @route  POST /api/v1/samuhs/:id/members
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.addMembers = async (req, res) => {
  try {
    const { members: newMembers } = req.body;

    if (!newMembers || !Array.isArray(newMembers) || newMembers.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide at least one member to add.' });
    }

    const samuh = await Samuh.findById(req.params.id);
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    // Check for duplicate Aadhaar within the Samuh (existing + new)
    const existingAadhaar = samuh.members.map((m) => m.aadhaarNumber);
    const existingMobile  = samuh.members.map((m) => m.mobileNumber);
    const newAadhaar      = newMembers.map((m) => m.aadhaarNumber);
    const newMobile       = newMembers.map((m) => m.mobileNumber);

    const dupAadhaar = newAadhaar.find((a) => existingAadhaar.includes(a));
    if (dupAadhaar) {
      return res.status(400).json({ success: false, message: `Duplicate Aadhaar found: ${dupAadhaar}` });
    }

    const dupMobile = newMobile.find((m) => existingMobile.includes(m));
    if (dupMobile) {
      return res.status(400).json({ success: false, message: `Duplicate mobile number found: ${dupMobile}` });
    }

    // Also check duplicates within the new batch itself
    if (new Set(newAadhaar).size !== newAadhaar.length) {
      return res.status(400).json({ success: false, message: 'Duplicate Aadhaar numbers in the new members batch.' });
    }
    if (new Set(newMobile).size !== newMobile.length) {
      return res.status(400).json({ success: false, message: 'Duplicate mobile numbers in the new members batch.' });
    }

    // Validate format
    for (const m of newMembers) {
      if (!/^\d{12}$/.test(m.aadhaarNumber)) {
        return res.status(400).json({ success: false, message: `Aadhaar must be 12 digits for member: ${m.name}` });
      }
      if (!/^\d{10}$/.test(m.mobileNumber)) {
        return res.status(400).json({ success: false, message: `Mobile must be 10 digits for member: ${m.name}` });
      }
    }

    samuh.members.push(...newMembers.map((m) => ({ ...m, status: 'Active' })));
    samuh.totalMembers = samuh.members.length;
    await samuh.save();

    res.status(200).json({ success: true, message: `${newMembers.length} member(s) added.`, data: samuh });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Toggle a member's Active/Inactive status (Super Admin only)
// @route  PUT /api/v1/samuhs/:id/members/:memberId/toggle
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.toggleMemberStatus = async (req, res) => {
  try {
    const samuh = await Samuh.findById(req.params.id);
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    const member = samuh.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });

    member.status = member.status === 'Active' ? 'Inactive' : 'Active';
    await samuh.save();

    res.status(200).json({
      success: true,
      message: `Member status changed to ${member.status}.`,
      data: { memberId: member._id, status: member.status },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Edit individual member details (Super Admin only)
// @route  PUT /api/v1/samuhs/:id/members/:memberId
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.editMember = async (req, res) => {
  try {
    const { name, address, mobileNumber, aadhaarNumber, status } = req.body;

    const samuh = await Samuh.findById(req.params.id);
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    const member = samuh.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });

    // Validate Aadhaar format if being changed
    if (aadhaarNumber && aadhaarNumber !== member.aadhaarNumber) {
      if (!/^\d{12}$/.test(aadhaarNumber)) {
        return res.status(400).json({ success: false, message: 'Aadhaar number must be exactly 12 digits.' });
      }
      // Check for duplicate Aadhaar in the same Samuh
      const dupAadhaar = samuh.members.some(
        (m) => m._id.toString() !== req.params.memberId && m.aadhaarNumber === aadhaarNumber
      );
      if (dupAadhaar) {
        return res.status(400).json({ success: false, message: 'This Aadhaar number already exists in this Samuh.' });
      }
    }

    // Validate mobile format if being changed
    if (mobileNumber && mobileNumber !== member.mobileNumber) {
      if (!/^\d{10}$/.test(mobileNumber)) {
        return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits.' });
      }
      // Check for duplicate mobile in the same Samuh
      const dupMobile = samuh.members.some(
        (m) => m._id.toString() !== req.params.memberId && m.mobileNumber === mobileNumber
      );
      if (dupMobile) {
        return res.status(400).json({ success: false, message: 'This mobile number already exists in this Samuh.' });
      }
    }

    if (name)         member.name         = name;
    if (address)      member.address      = address;
    if (mobileNumber) member.mobileNumber = mobileNumber;
    if (aadhaarNumber) member.aadhaarNumber = aadhaarNumber;
    if (status && ['Active', 'Inactive'].includes(status)) member.status = status;

    await samuh.save();

    res.status(200).json({ success: true, message: 'Member updated successfully.', data: member });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc   Transfer Samuh to another Associate (Super Admin only)
// @route  PUT /api/v1/samuhs/:id/transfer
// @access SUPER_ADMIN
// ─────────────────────────────────────────────
exports.transferSamuh = async (req, res) => {
  try {
    const { newAssociateId } = req.body;
    if (!newAssociateId) {
      return res.status(400).json({ success: false, message: 'newAssociateId is required.' });
    }

    const User = require('../models/User');
    const newAssociate = await User.findById(newAssociateId);
    if (!newAssociate || (newAssociate.role !== 'ASSOCIATE' && newAssociate.role !== 'BLOCK_COORDINATOR')) {
      return res.status(400).json({ success: false, message: 'Target user must be an active Associate or Block Coordinator.' });
    }

    const samuh = await Samuh.findById(req.params.id);
    if (!samuh) return res.status(404).json({ success: false, message: 'Samuh not found.' });

    samuh.associateId   = newAssociate._id;
    samuh.associateName = newAssociate.name;
    samuh.epId          = newAssociate.employeeId || '';
    samuh.districtId    = newAssociate.districtId || samuh.districtId;
    samuh.blockId       = newAssociate.blockId    || samuh.blockId;
    await samuh.save();

    res.status(200).json({
      success: true,
      message: `Samuh transferred to ${newAssociate.name}.`,
      data: { associateId: newAssociate._id, associateName: newAssociate.name, epId: newAssociate.employeeId },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
