const User = require('../models/User');
const Membership = require('../models/Membership');
const jwt = require('jsonwebtoken');
const Service = require('../models/Service');
const Delivery = require('../models/Delivery');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '24h' });

// Dynamic ID Card Counter logic generator helper
const generateMembershipId = async () => {
  const count = await User.countDocuments({ role: 'MEMBER', status: 'active' });
  return `NGO-V1-${count + 1001}`; 
};

// Member ID — assigned at registration, format: MBR-00001
const generateMemberId = async () => {
  const count = await User.countDocuments({ role: 'MEMBER', memberId: { $exists: true, $ne: null } });
  return `MBR-${String(count + 1).padStart(5, '0')}`;
};

// Donor ID — assigned at registration, format: DNR-00001
const generateDonorId = async () => {
  const count = await User.countDocuments({ role: 'DONOR', donorId: { $exists: true, $ne: null } });
  return `DNR-${String(count + 1).padStart(5, '0')}`;
};

// Employee ID generator for staff roles (ASSOCIATE, ADMIN, SUPER_ADMIN)
const EMPLOYEE_ROLE_PREFIX = {
  ASSOCIATE:   'ASSOC',
  ADMIN:       'ADMIN',
  SUPER_ADMIN: 'SADM',
};

const generateEmployeeId = async (role) => {
  const prefix = EMPLOYEE_ROLE_PREFIX[role];
  if (!prefix) return null;
  const count = await User.countDocuments({ role, employeeId: { $exists: true, $ne: null } });
  const serial = String(count + 1).padStart(4, '0');
  return `EP-${prefix}-${serial}`;
};

// @desc    Self-Registration / Internal Hierarchy account provisioning
// @route   POST /api/v1/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role, districtId, blockId, associateId } = req.body;
    
    // Authorization Check for Creation Hierarchies
    if (req.user) {
      const actorRole = req.user.role;
      if (actorRole === 'ASSOCIATE' && (role === 'ADMIN' || role === 'ASSOCIATE')) {
        return res.status(403).json({ success: false, message: 'Associates can only spawn Members/Donors.' });
      }
      if (actorRole === 'ADMIN' && role === 'ADMIN') {
        return res.status(403).json({ success: false, message: 'District Admins cannot spawn other Admins.' });
      }
    } else {
      if (role !== 'MEMBER' && role !== 'DONOR') {
        return res.status(403).json({ success: false, message: 'Public registration limited to Members and Donors.' });
      }
    }

    // Resolve which associate this member belongs to:
    // - If actor is ASSOCIATE → they are the associate (auto-assign)
    // - If actor is ADMIN/SUPER_ADMIN and associateId is provided → use that
    // - Otherwise → null
    let resolvedAssociateId = null;
    if (req.user) {
      if (req.user.role === 'ASSOCIATE' && (role === 'MEMBER' || role === 'DONOR')) {
        resolvedAssociateId = req.user._id;
      } else if ((req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') && associateId) {
        // Validate the provided associateId is actually an ASSOCIATE
        const assoc = await User.findOne({ _id: associateId, role: 'ASSOCIATE' });
        if (!assoc) {
          return res.status(400).json({ success: false, message: 'Provided associateId does not belong to a valid Associate.' });
        }
        resolvedAssociateId = assoc._id;
      }
    }

    // Generate the right ID based on role
    const employeeId = await generateEmployeeId(role);
    const memberId   = role === 'MEMBER' ? await generateMemberId() : null;
    const donorId    = role === 'DONOR'  ? await generateDonorId()  : null;

    const newUser = await User.create({
      name, email, password, phone, role, districtId, blockId,
      createdBy: req.user ? req.user._id : null,
      associateId: resolvedAssociateId,
      status: (role === 'MEMBER' || role === 'DONOR') ? 'pending' : 'active',
      ...(employeeId && { employeeId }),
      ...(memberId   && { memberId }),
      ...(donorId    && { donorId }),
    });

    return res.status(201).json({
      success: true,
      message: 'Account provisioned successfully in status level.',
      data: { id: newUser._id, role: newUser.role, status: newUser.status, memberId: newUser.memberId, donorId: newUser.donorId }
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Mock Activation engine (Simulating post-payment hook logic)
// @route   POST /api/v1/auth/activate/:userId
exports.activateAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const { serviceId, txRef, amount, treeQuantity } = req.body; // treeQuantity sirf Tree wale me aayega

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User object not found.' });

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found in master catalog.' });

    // ==========================================
    // CASE 1: SANITARY PAD MODEL (SUBSCRIPTION)
    // ==========================================
    if (service.type === 'SUBSCRIPTION') {
      if (amount !== service.baseFee) {
        return res.status(400).json({ success: false, message: `Subscription fees demands exact INR ${service.baseFee}` });
      }

      // Determine joining date rule (Case A vs Case B)
      const joiningDate = new Date();
      const dayOfMonth = joiningDate.getDate();

      // Case A: joins 1st–24th  → 1 unit now, 2nd unit at 25th of same month (total 2 units in month 1)
      // Case B: joins 25th–end  → 2 units immediately (same delivery ticket)
      const isCaseB = dayOfMonth >= 25;
      const immediateQuantity = isCaseB ? 2 : 1;

      // NOTE: unitsClaimed starts at 0 — units are counted when the associate marks delivery as 'delivered',
      // not when tickets are created. This keeps "units left" accurate at all times.

      // Create Active Subscription Log
      const membership = await Membership.create({
        memberId: user._id,
        serviceId: service._id,
        serviceType: 'SUBSCRIPTION',
        amountPaid: amount,
        paymentStatus: 'success',
        paymentRef: txRef,
        totalUnitsEntitled: 12, // 1 year allocation
        unitsClaimed: 0,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      });

      // Status activation
      user.status = 'active';
      const count = await User.countDocuments({ role: 'MEMBER', status: 'active' });
      user.membershipId = `NGO-V1-${count + 1001}`;
      await user.save();

      // Delivery ticket: immediate dispatch
      const deliveryNote = isCaseB
        ? 'Case B joining (25th–end of month): 2 units delivered immediately on joining.'
        : 'Case A joining (1st–24th): 1st unit delivered immediately on joining.';

      await Delivery.create({
        memberId: user._id,
        blockId: user.blockId,
        services: [{ serviceId: service._id, quantity: immediateQuantity }],
        deliveryType: 'REGULAR',
        status: 'pending',
        notes: deliveryNote
      });

      // Case A: also schedule 2nd unit for the 25th–end of same month window
      if (!isCaseB) {
        const lastDay = new Date(joiningDate.getFullYear(), joiningDate.getMonth() + 1, 0);
        await Delivery.create({
          memberId: user._id,
          blockId: user.blockId,
          services: [{ serviceId: service._id, quantity: 1 }],
          deliveryType: 'REGULAR',
          status: 'pending',
          estimatedDeliveryDate: lastDay,
          notes: 'Case A joining: 2nd unit scheduled for 25th–end of joining month window.'
        });
        // NOTE: unitsClaimed is NOT incremented here. It will be counted when associate marks delivered.
      }

      return res.status(200).json({
        success: true,
        message: isCaseB
          ? 'Subscription activated. Case B: 2 units queued for immediate delivery.'
          : 'Subscription activated. Case A: 1st unit queued now, 2nd unit scheduled for month-end.',
        membershipId: user.membershipId,
        joiningCase: isCaseB ? 'B' : 'A'
      });
    }

    // ==========================================
    // CASE 2: TREE DISTRIBUTION (ON_DEMAND)
    // ==========================================
// ==========================================
    // CASE 2: TREE DISTRIBUTION (ON_DEMAND)
    // ==========================================
    if (service.type === 'ON_DEMAND') {
      if (!treeQuantity || treeQuantity < 1) {
        return res.status(400).json({ success: false, message: 'Tree distribution model requires a valid treeQuantity.' });
      }

      const expectedCost = service.baseFee + ((treeQuantity - 1) * service.subsequentFee);

      if (amount !== expectedCost) {
        return res.status(400).json({ 
          success: false, 
          message: `Pricing mismatch. For ${treeQuantity} trees, calculated total is INR ${expectedCost}. You provided INR ${amount}.` 
        });
      }

      await Membership.create({
        memberId: user._id,
        serviceId: service._id,
        serviceType: 'ON_DEMAND',
        amountPaid: amount,
        paymentStatus: 'success',
        paymentRef: txRef,
        totalUnitsEntitled: treeQuantity,
        unitsClaimed: treeQuantity, 
        isStaticBatchOrder: true,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) 
      });

      // === ADD THIS CONTROL GRID TO ACTIVATE USER CARD IF NOT ALREADY ACTIVE ===
      if (user.status !== 'active') {
        user.status = 'active';
        const count = await User.countDocuments({ role: 'MEMBER', status: 'active' });
        user.membershipId = `NGO-V1-${count + 1001}`;
        await user.save();
      }

      await Delivery.create({
        memberId: user._id,
        blockId: user.blockId,
        services: [{ 
          serviceId: service._id, 
          quantity: treeQuantity 
        }],
        deliveryType: 'REGULAR',
        status: 'pending',
        notes: `On-Demand Tree deployment order locked. Target total count: ${treeQuantity} units.`
      });

      return res.status(200).json({
        success: true,
        message: `Tree order booked securely. Delivery ticket raised for ${treeQuantity} trees.`,
        membershipId: user.membershipId // <--- dynamic pass logic
      });
    }

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
// @desc    Standard Login validation engine
// @route   POST /api/v1/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email })
      .populate('districtId', 'name')
      .populate('blockId', 'name')
      .populate('assignedBlocks', 'name')
      .populate('associateId', 'name phone employeeId');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials array input.' });
    }
    
    return res.status(200).json({
      success: true,
      token: signToken(user._id),
      user: { 
        id: user._id, 
        name: user.name, 
        role: user.role, 
        status: user.status, 
        membershipId: user.membershipId, 
        employeeId: user.employeeId, 
        memberId: user.memberId, 
        donorId: user.donorId,
        districtId: user.districtId,
        blockId: user.blockId,
        assignedBlocks: user.assignedBlocks,
        associateId: user.associateId,
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get Current Logged-In User Profile
// @route   GET /api/v1/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('districtId', 'name')
      .populate('blockId', 'name')
      .populate('associateId', 'name phone employeeId');
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Self Update Profile (Name & Phone Only)
// @route   PUT /api/v1/auth/update-profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    
    // Sirf name aur phone hi update karne dena hai
    const updatedData = {};
    if (name) updatedData.name = name;
    if (phone) updatedData.phone = phone;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updatedData },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: { name: updatedUser.name, phone: updatedUser.phone }
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Self Password Change (Requires Current Password)
// @route   PUT /api/v1/auth/change-password
exports.changeSelfPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide current and new password.' });
    }

    // User ko select karna password field ke sath (kyunki schema me select: false hota hai)
    const user = await User.findById(req.user.id).select('+password');
    
    // Check if current password matches
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password galat hai.' });
    }

    // Set new password (Aapka User model schema pre-save hook me baki hashing handle kar lega)
    user.password = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Hierarchical Password Reset by Admins (AIRTIGHT SECURITY SHIELD)
// @route   PUT /api/v1/auth/admin/reset-password/:targetUserId
exports.adminResetPassword = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const { newPassword } = req.body;

    // 1. Basic validation
    if (!newPassword) {
      return res.status(400).json({ success: false, message: 'Naya password dena zaroori hai.' });
    }

    // 2. Strict Authenticated User Check
    if (!req.user || !req.user.role) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User session missing.' });
    }

    const actorRole = req.user.role; // Jo reset kar raha hai
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Target user nahi mila.' });
    }

    // 🛑 HARD LOCK 1: Agar request karne wala MEMBER ya ASSOCIATE hai, toh instantly BLOCK!
    if (actorRole === 'MEMBER' || actorRole === 'ASSOCIATE') {
      return res.status(403).json({ 
        success: false, 
        message: `Security Alert: Aapka role [${actorRole}] hai. Aap kisi ka password reset nahi kar sakte!` 
      });
    }

    // 🛑 HARD LOCK 2: Agar request karne wala DISTRICT ADMIN hai
    if (actorRole === 'ADMIN') {
      // Admin sirf Associate ya Member ka badal sakta hai. Kisi Admin ya Super Admin ka nahi!
      if (targetUser.role === 'SUPER_ADMIN' || targetUser.role === 'ADMIN') {
        return res.status(403).json({ 
          success: false, 
          message: 'Unauthorized: District Admins dusre Admins ya Super Admins ka password reset nahi kar sakte.' 
        });
      }
      // District Admin can only reset passwords of users in their own district
      const adminDistrictId = String(req.user.districtId?._id || req.user.districtId);
      const targetDistrictId = String(targetUser.districtId?._id || targetUser.districtId);
      if (adminDistrictId !== targetDistrictId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: This user is not in your district.',
        });
      }
    }

    // 🚀 Safe Zone: Agar validations paas ho gayi (Super Admin sabka kar sakta hai, Admin targeted roles ka)
    targetUser.password = newPassword;
    await targetUser.save();

    return res.status(200).json({
      success: true,
      message: `Successfully reset password for user [${targetUser.name}] with role [${targetUser.role}].`
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};



// @desc    Get all users filtered by role (Admin & Super Admin only)
// @route   GET /api/v1/auth/users?role=MEMBER
exports.getUsers = async (req, res) => {
  try {
    const { role, status, blockId, associateId } = req.query;

    const filter = {};
    if (role)        filter.role        = role;
    if (status)      filter.status      = status;
    if (blockId)     filter.blockId     = blockId;
    if (associateId) filter.associateId = associateId;

    // ── DISTRICT ADMIN SCOPE LOCK ──────────────────────────────────────────
    // An ADMIN can only see users within their own district.
    // This is enforced server-side regardless of what the frontend sends.
    if (req.user.role === 'ADMIN') {
      const adminDistrictId = req.user.districtId?._id || req.user.districtId;
      if (!adminDistrictId) {
        return res.status(403).json({ success: false, message: 'Admin account has no district assigned.' });
      }
      filter.districtId = adminDistrictId;
    }

    // ── ASSOCIATE SCOPE LOCK ───────────────────────────────────────────────
    // An ASSOCIATE can only see their own members (associateId = their _id).
    if (req.user.role === 'ASSOCIATE') {
      filter.associateId = req.user._id;
    }

    const users = await User.find(filter)
      .select('-password')
      .populate('districtId', 'name')
      .populate('blockId', 'name')
      .populate('associateId', 'name phone employeeId')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Toggle user active/inactive status
// @route   PUT /api/v1/auth/users/:userId/toggle-status
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // District Admin can only toggle users in their own district
    if (req.user.role === 'ADMIN') {
      const adminDistrictId = String(req.user.districtId?._id || req.user.districtId);
      const targetDistrictId = String(user.districtId?._id || user.districtId);
      if (adminDistrictId !== targetDistrictId) {
        return res.status(403).json({ success: false, message: 'Unauthorized: This user is not in your district.' });
      }
    }

    user.status = user.status === 'active' ? 'inactive' : 'active';
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User status updated to ${user.status}.`,
      data: { id: user._id, status: user.status },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
