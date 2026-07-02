const Delivery = require('../models/Delivery');
const User = require('../models/User');
const Membership = require('../models/Membership');

// @desc    Member ka apna delivery history dekhna
// @route   GET /api/v1/deliveries/my
exports.getMyDeliveries = async (req, res) => {
  try {
    const deliveries = await Delivery.find({ memberId: req.user._id })
      .populate('services.serviceId', 'name type')
      .populate('blockId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: deliveries.length, data: deliveries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Member ki apni membership/subscription dekhna
// @route   GET /api/v1/deliveries/my-membership
exports.getMyMembership = async (req, res) => {
  try {
    const memberships = await Membership.find({ memberId: req.user._id, paymentStatus: 'success' })
      .populate('serviceId', 'name type baseFee subsequentFee totalMonths')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: memberships });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Is mahine ki pending deliveries dekhna (Associate Dashboard)
// @route   GET /api/v1/deliveries/pending
exports.getPendingDeliveries = async (req, res) => {
  try {
    const associateId    = req.user._id;
    const assignedBlocks = req.user.assignedBlocks || [];

    // RULE:
    //  REGULAR deliveries  → only members assigned under THIS associate (associateId on User)
    //  EMERGENCY deliveries → any in the associate's assigned blocks (first-come-first-serve)

    // 1. Get member IDs that belong to this associate
    const myMembers = await User.find({ associateId, role: 'MEMBER' }).select('_id');
    const myMemberIds = myMembers.map(m => m._id);

    const deliveries = await Delivery.find({
      status: { $in: ['pending', 'emergency', 'on_the_way'] },
      $or: [
        // Regular: only this associate's members, regardless of block
        {
          deliveryType: 'REGULAR',
          memberId: { $in: myMemberIds }
        },
        // Emergency: any unclaimed in assigned blocks (open for first-come-first-serve)
        {
          deliveryType: 'EMERGENCY',
          blockId: { $in: assignedBlocks }
        }
      ]
    })
      .populate('memberId', 'name phone memberId blockId associateId')
      .populate('services.serviceId', 'name type')
      .populate('blockId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: deliveries.length,
      data: deliveries
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Associate's full delivery history (pending + completed), scoped to their members
// @route   GET /api/v1/deliveries/my-associate-deliveries
exports.getAssociateDeliveries = async (req, res) => {
  try {
    const associateId    = req.user._id;
    const assignedBlocks = req.user.assignedBlocks || [];

    // Get member IDs under this associate
    const myMembers = await User.find({ associateId, role: 'MEMBER' }).select('_id');
    const myMemberIds = myMembers.map(m => m._id);

    const deliveries = await Delivery.find({
      $or: [
        // All statuses for this associate's members (REGULAR)
        {
          deliveryType: 'REGULAR',
          memberId: { $in: myMemberIds }
        },
        // Emergency — active/unclaimed: block-wide (anyone can see & claim)
        {
          deliveryType: 'EMERGENCY',
          status: { $in: ['pending', 'emergency', 'on_the_way'] },
          blockId: { $in: assignedBlocks }
        },
        // Emergency — completed (delivered/failed): only those claimed BY this associate
        {
          deliveryType: 'EMERGENCY',
          status: { $in: ['delivered', 'failed'] },
          associateId: associateId
        }
      ]
    })
      .populate('memberId', 'name phone memberId membershipId')
      .populate('associateId', 'name phone employeeId')
      .populate('services.serviceId', 'name type')
      .populate('blockId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: deliveries.length,
      data: deliveries
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Regular Delivery ka status dropdown se badalna aur notes dalna
// @route   PUT /api/v1/deliveries/:id/status
// exports.updateDeliveryStatus = async (req, res) => {
//   try {
//     const { status, failReason, notes } = req.body;
//     const delivery = await Delivery.findById(req.id || req.params.id);

//     if (!delivery) {
//       return res.status(404).json({ success: false, message: 'Delivery log record not found.' });
//     }

//     // Status mapping validation rules
//     if (!['delivered', 'failed'].includes(status)) {
//       return res.status(400).json({ success: false, message: 'Invalid status. Choose delivered or failed.' });
//     }

//     delivery.status = status;
//     delivery.notes = notes || null;
//     delivery.associateId = req.user._id; // Kis associate ne action liya use lock karein

//     if (status === 'delivered') {
//       delivery.deliveredAt = new Date();
//       delivery.failReason = null;
//     } else if (status === 'failed') {
//       delivery.failReason = failReason || 'Reason not specified'; // V1 text log input
//     }

//     await delivery.save();
//     res.status(200).json({
//       success: true,
//       message: `Delivery status updated to ${status} successfully.`,
//       data: delivery
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// };
// @desc    Associate ke liye delivery progress state badalna (On the Way / Delivered / Failed)
// @route   PUT /api/v1/deliveries/:id/status
exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { status, failReason, notes } = req.body;
    const deliveryId = req.params.id;

    // 1. Delivery record dhoondhein
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery record not found.' });
    }

    // 2. Security Check: Kya yeh wahi associate hai jisne ticket grab ki thi?
    // Only enforce if the delivery has already been claimed (associateId is set)
    if (delivery.associateId && delivery.associateId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized: Aap is ticket ke assigned associate nahi hain.' 
      });
    }

    // Auto-claim: if delivery is unclaimed and associate is in the assigned block, claim it now
    if (!delivery.associateId) {
      const inBlock = req.user.assignedBlocks?.some(
        b => b.toString() === delivery.blockId?.toString()
      );
      if (!inBlock) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: Aap is block ke assigned associate nahi hain.'
        });
      }
      delivery.associateId = req.user._id;
      delivery.claimedAt = new Date();
    }

    // 3. State Validation Guard
    const validStatuses = ['on_the_way', 'delivered', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status input. Allowed values: on_the_way, delivered, failed' 
      });
    }

    // 4. Business Rules Matrix Mapping
    const previousStatus = delivery.status;
    delivery.status = status;
    delivery.notes = notes || delivery.notes; // Optional textual feedback updates

    if (status === 'on_the_way') {
      // Dispatch time logger
      delivery.dispatchedAt = new Date();
      delivery.failReason = null; // Purane validation clear karein
    } 
    else if (status === 'delivered') {
      delivery.deliveredAt = new Date();
      delivery.failReason = null;
      delivery.status = 'delivered';

      // Deduct 1 unit from subscription quota on actual delivery (for both REGULAR and EMERGENCY),
      // and only if not already counted — i.e. previous status was not already 'delivered')
      if (['REGULAR', 'EMERGENCY'].includes(delivery.deliveryType) && previousStatus !== 'delivered') {
        const serviceId = delivery.services?.[0]?.serviceId;
        if (serviceId) {
          const membership = await Membership.findOne({
            memberId: delivery.memberId,
            serviceId: serviceId,
            paymentStatus: 'success',
          });
          if (membership) {
            membership.unitsClaimed = Math.min(
              membership.totalUnitsEntitled,
              membership.unitsClaimed + 1
            );
            await membership.save();
          }
        }
      }
    } 
    else if (status === 'failed') {
      // Strict rule: Agar status failed hai toh reason mandatory hai
      if (!failReason) {
        return res.status(400).json({ 
          success: false, 
          message: 'Delivery fail karne ke liye failReason (dropdown/text) dena mandatory hai.' 
        });
      }
      delivery.failReason = failReason;
      delivery.deliveredAt = null; // Timestamp invalidation
    }

    // 5. Database Save
    await delivery.save();

    res.status(200).json({
      success: true,
      message: `Delivery execution matrix updated to [${status.toUpperCase()}] successfully.`,
      data: delivery
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Beneficiary ka mobile web dashboard se ek click me emergency request dalna
// @route   POST /api/v1/deliveries/emergency
exports.raiseEmergencyRequest = async (req, res) => {
  try {
    const { serviceId } = req.body;

    // Check karein ki user active member hai ya nahi (Dynamic Paywall Guard)
    if (req.user.role !== 'MEMBER' || req.user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Only active members with paid subscriptions can request emergency items.' });
    }

    if (!req.user.blockId) {
      return res.status(400).json({ success: false, message: 'Your account has no block assigned. Contact your associate.' });
    }

    // Check active membership and remaining quota
    const membership = await Membership.findOne({
      memberId: req.user._id,
      serviceId,
      paymentStatus: 'success',
      expiresAt: { $gt: new Date() }
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'Is service ke liye aapki koi active membership nahi mili.' });
    }

    // Count pending emergency tickets not yet delivered (to avoid over-requesting)
    const pendingEmergencyCount = await Delivery.countDocuments({
      memberId: req.user._id,
      'services.serviceId': serviceId,
      deliveryType: 'EMERGENCY',
      status: { $in: ['emergency', 'on_the_way'] }
    });

    const effectiveUsed = membership.unitsClaimed + pendingEmergencyCount;
    if (effectiveUsed >= membership.totalUnitsEntitled) {
      return res.status(400).json({
        success: false,
        message: `Aapki annual limit (${membership.totalUnitsEntitled} units) reach ho chuki hai. Aur request nahi kar sakte.`
      });
    }

    const emergencyLog = await Delivery.create({
      memberId: req.user._id,
      services: [{ serviceId, quantity: 1 }],
      blockId: req.user.blockId,
      status: 'emergency',
      deliveryType: 'EMERGENCY',
      notes: 'Urgent emergency request raised by member via responsive web dashboard.'
    });

    res.status(201).json({
      success: true,
      message: 'Emergency request broadcasted safely to your block workers. Keep monitoring.',
      data: emergencyLog,
      remainingUnits: membership.totalUnitsEntitled - effectiveUsed - 1
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Associate ke liye emergency ticket ko sabse pahle click karke claim karna (The Grab Engine)
// @route   PUT /api/v1/deliveries/:id/accept-emergency
exports.acceptEmergencyRequest = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Emergency work ticket not found.' });
    }

    if (delivery.status !== 'emergency' || delivery.associateId !== null) {
      return res.status(400).json({ success: false, message: 'This emergency ticket has already been claimed by another associate.' });
    }

    // Verify karein ki Associate usi block me assigned hai jahan se request aayi hai
    const inBlock = req.user.assignedBlocks?.some(
      b => b.toString() === delivery.blockId?.toString()
    );
    if (!inBlock) {
      return res.status(403).json({ success: false, message: 'You are not assigned to operate in this block zone.' });
    }

    // Claim processing (Lock the ticket to this associate)
    delivery.associateId = req.user._id;
    delivery.claimedAt = new Date();
    await delivery.save();

    res.status(200).json({
      success: true,
      message: 'Emergency ticket claimed successfully. Proceed to deliver item to the member.',
      data: delivery
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    District Admin monitor engine for escalations (2-Hour Buffer Clock widget check)
// @route   GET /api/v1/deliveries/admin/escalations
exports.getAdminEscalations = async (req, res) => {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    // Unclaimed emergency requests that were created more than 2 hours ago
    const delayedRequests = await Delivery.find({
      status: 'emergency',
      associateId: null,
      createdAt: { $lte: twoHoursAgo }
    }).populate('memberId', 'name phone').populate('blockId', 'name');

    res.status(200).json({
      success: true,
      count: delayedRequests.length,
      message: "Unclaimed requests crossing 2-Hour SLA boundary retrieved.",
      data: delayedRequests
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    SuperAdmin raises emergency on behalf of member (via toll-free call)
// @route   POST /api/v1/deliveries/admin/emergency-for-member
exports.raiseEmergencyForMember = async (req, res) => {
  try {
    const { memberId, serviceId } = req.body;

    if (!memberId || !serviceId) {
      return res.status(400).json({ success: false, message: 'memberId aur serviceId dono mandatory hain.' });
    }

    // Verify member exists, is active, and has a valid subscription
    const member = await User.findById(memberId);
    if (!member || member.role !== 'MEMBER' || member.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Active member nahi mila.' });
    }

    if (!member.blockId) {
      return res.status(400).json({ success: false, message: 'Member ke account me block assign nahi hai.' });
    }

    // Check active subscription with remaining quota
    const membership = await Membership.findOne({
      memberId,
      serviceId,
      paymentStatus: 'success',
      expiresAt: { $gt: new Date() }
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'Is service ke liye member ki active membership nahi mili.' });
    }

    // Count already pending/in-progress emergency tickets to prevent over-requesting
    const pendingEmergencyCount = await Delivery.countDocuments({
      memberId,
      'services.serviceId': serviceId,
      deliveryType: 'EMERGENCY',
      status: { $in: ['emergency', 'on_the_way'] }
    });

    const effectiveUsed = membership.unitsClaimed + pendingEmergencyCount;
    if (effectiveUsed >= membership.totalUnitsEntitled) {
      return res.status(400).json({
        success: false,
        message: `Member ki annual limit (${membership.totalUnitsEntitled} units) exhaust ho chuki hai. Emergency raise nahi ho sakta.`
      });
    }

    // NOTE: unitsClaimed is NOT deducted here. It will be incremented when the
    // associate marks the emergency delivery as 'delivered' in updateDeliveryStatus.

    // Create emergency ticket
    const ticket = await Delivery.create({
      memberId,
      blockId: member.blockId,
      services: [{ serviceId, quantity: 1 }],
      deliveryType: 'EMERGENCY',
      status: 'emergency',
      notes: `Emergency request raised by Super Admin on behalf of member ${member.name} (${member.memberId}) via toll-free helpline.`
    });

    return res.status(201).json({
      success: true,
      message: `Emergency ticket raised for ${member.name}.`,
      data: ticket,
      remainingUnits: membership.totalUnitsEntitled - effectiveUsed - 1
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all orders (memberships + deliveries) for a specific member — Admin/Associate view
// @route   GET /api/v1/deliveries/admin/member/:memberId/orders
exports.getMemberOrders = async (req, res) => {
  try {
    const { memberId } = req.params;

    // Security: Associate can only view orders for their own members
    if (req.user.role === 'ASSOCIATE') {
      const member = await User.findById(memberId);
      if (!member || member.associateId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Unauthorized: This member is not under your account.' });
      }
    }

    // District Admin scope: member must be in admin's district
    if (req.user.role === 'ADMIN') {
      const member = await User.findById(memberId);
      if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });
      const adminDistrictId = String(req.user.districtId?._id || req.user.districtId);
      const memberDistrictId = String(member.districtId?._id || member.districtId);
      if (adminDistrictId !== memberDistrictId) {
        return res.status(403).json({ success: false, message: 'Unauthorized: This member is not in your district.' });
      }
    }

    const [memberships, deliveries] = await Promise.all([
      Membership.find({ memberId, paymentStatus: 'success' })
        .populate('serviceId', 'name type baseFee subsequentFee')
        .sort({ createdAt: -1 }),
      Delivery.find({ memberId })
        .populate('services.serviceId', 'name type')
        .populate('associateId', 'name phone employeeId')
        .populate('blockId', 'name')
        .sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      data: { memberships, deliveries },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all deliveries for admin monitoring
// @route   GET /api/v1/deliveries/admin/all
exports.getAllDeliveries = async (req, res) => {
  try {
    const { status, blockId, serviceId, deliveryType, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status)       filter.status = status;
    if (blockId)      filter.blockId = blockId;
    if (serviceId)    filter['services.serviceId'] = serviceId;
    if (deliveryType) filter.deliveryType = deliveryType;

    // District Admin scope lock
    if (req.user.role === 'ADMIN' && req.user.districtId) {
      // Get blocks in admin's district
      const Block = require('../models/Block');
      const blocks = await Block.find({ districtId: req.user.districtId }).select('_id');
      filter.blockId = { $in: blocks.map(b => b._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [deliveries, total] = await Promise.all([
      Delivery.find(filter)
        .populate('memberId', 'name phone memberId membershipId')
        .populate('associateId', 'name phone employeeId')
        .populate('blockId', 'name')
        .populate('services.serviceId', 'name type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Delivery.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      count: deliveries.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: deliveries
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.raiseEmergencyDelivery = async (req, res) => {
  try {
    const { serviceId } = req.body;
    const memberId = req.user._id;

    // Check active membership log
    const membership = await Membership.findOne({ memberId, serviceId, paymentStatus: 'success' });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Is service ke liye aapka koi active membership account nahi mila.' });
    }

    // Safety calculation check
    const remainingUnits = membership.totalUnitsEntitled - membership.unitsClaimed;
    if (remainingUnits <= 0) {
      return res.status(400).json({ success: false, message: 'Aapki annual distribution limit reach ho chuki hai. Emergency quota exhausted.' });
    }

    // [PENALTY ENGINE LOGIC]: Consume 1 month balance from subscription core matrix
    membership.unitsClaimed += 1; // 1 mahina balance se minus kar diya!
    await membership.save();

    // Create immediate emergency execution ticket
    const emergencyTicket = await Delivery.create({
      memberId,
      blockId: req.user.blockId,
      services: [{ serviceId, quantity: 1 }],
      deliveryType: 'EMERGENCY',
      status: 'emergency', // High priority visibility status
      notes: 'Emergency manual overwrite triggered. 1 month cycle deducted from dynamic user subscription.'
    });

    return res.status(201).json({
      success: true,
      message: 'Emergency request registered. 1 subscription item level penalized successfully.',
      data: emergencyTicket,
      remainingSubscriptionBalance: membership.totalUnitsEntitled - membership.unitsClaimed
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Admin dwara kisi specific Block ke saare pending Tree orders ko schedule karna
// @route   PUT /api/v1/deliveries/admin/schedule-bulk
exports.scheduleBulkDeliveries = async (req, res) => {
  try {
    const { blockId, serviceId, deliveryDate } = req.body;

    // 1. Validation Check
    if (!blockId || !serviceId || !deliveryDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed: blockId, serviceId, aur deliveryDate dena mandatory hai.' 
      });
    }

    // 2. Security Check: Kya request karne wala Super Admin ya District Admin hai?
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized: Sirf Admins hi deliveries schedule kar sakte hain.' 
      });
    }

    // 3. District Admin Restriction: Apne district ke bahaar schedule na kar sake
    if (req.user.role === 'ADMIN' && req.user.districtId) {
      // Is blockId ko verify karne ki strict verification dependency logic lagayi ja sakti hai
    }

    // 4. Update Query Matrix Execution
    // Un saare records ko dhoondho jo: us block ke hain, us tree service ke hain, aur status 'pending' hai
    const updatedRecords = await Delivery.updateMany(
      {
        blockId: blockId,
        'services.serviceId': serviceId,
        status: 'pending',
        deliveryType: 'REGULAR'
      },
      {
        $set: { 
          estimatedDeliveryDate: new Date(deliveryDate),
          notes: `Scheduled by Admin on ${new Date().toLocaleDateString()}. Ready for ground pickup.`
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: `Successfully scheduled ${updatedRecords.modifiedCount} delivery tickets for block [${blockId}].`,
      data: {
        matchedCount: updatedRecords.matchedCount,
        modifiedCount: updatedRecords.modifiedCount
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    District Admin — all member orders (memberships) in their district with date filter
// @route   GET /api/v1/deliveries/admin/district-orders
exports.getDistrictOrders = async (req, res) => {
  try {
    const { from, to } = req.query;

    // Build date range filter
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = toDate;
    }

    // Scope to admin's district — get all members in this district
    let memberFilter = { role: 'MEMBER' };
    if (req.user.role === 'ADMIN' && req.user.districtId) {
      memberFilter.districtId = req.user.districtId;
    }

    const districtMembers = await User.find(memberFilter).select('_id name memberId phone');
    const memberIds = districtMembers.map(m => m._id);

    const orderQuery = { memberId: { $in: memberIds }, paymentStatus: 'success' };
    if (Object.keys(dateFilter).length > 0) orderQuery.createdAt = dateFilter;

    const Membership = require('../models/Membership');
    const orders = await Membership.find(orderQuery)
      .populate({
        path: 'memberId',
        select: 'name memberId phone blockId districtId associateId',
        populate: { path: 'associateId', select: 'name employeeId phone' },
      })
      .populate('serviceId', 'name type baseFee subsequentFee')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    SuperAdmin — all orders (memberships) system-wide with filters
// @route   GET /api/v1/deliveries/super/all-orders
exports.getSuperAdminOrders = async (req, res) => {
  try {
    const { from, to, districtId, state, serviceType, page = 1, limit = 100 } = req.query;

    // Step 1: Resolve district IDs based on state/district filter
    const District = require('../models/District');
    let districtIds = null;

    if (districtId) {
      districtIds = [districtId];
    } else if (state) {
      const districts = await District.find({ state: state.toUpperCase() }).select('_id');
      districtIds = districts.map(d => d._id);
    }

    // Step 2: Get matching members
    const memberFilter = { role: 'MEMBER' };
    if (districtIds) memberFilter.districtId = { $in: districtIds };

    const members = await User.find(memberFilter)
      .select('_id name memberId phone districtId associateId')
      .populate('districtId', 'name state')
      .populate('associateId', 'name employeeId phone');

    const memberIds = members.map(m => m._id);
    const memberMap = {};
    members.forEach(m => { memberMap[String(m._id)] = m; });

    // Step 3: Build membership query
    const orderQuery = { memberId: { $in: memberIds }, paymentStatus: 'success' };
    if (serviceType) orderQuery.serviceType = serviceType;

    if (from || to) {
      orderQuery.createdAt = {};
      if (from) { orderQuery.createdAt.$gte = new Date(from); }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        orderQuery.createdAt.$lte = toDate;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const Membership = require('../models/Membership');
    const [orders, total] = await Promise.all([
      Membership.find(orderQuery)
        .populate({
          path: 'memberId',
          select: 'name memberId phone districtId associateId',
          populate: [
            { path: 'districtId', select: 'name state' },
            { path: 'associateId', select: 'name employeeId phone' },
          ],
        })
        .populate('serviceId', 'name type baseFee subsequentFee')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Membership.countDocuments(orderQuery),
    ]);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: orders,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    SuperAdmin — all deliveries system-wide with state/district/status/date filters
// @route   GET /api/v1/deliveries/super/all-deliveries
exports.getSuperAdminDeliveries = async (req, res) => {
  try {
    const { from, to, districtId, state, status, deliveryType, page = 1, limit = 100 } = req.query;

    // Resolve block IDs from state/district filter
    const District = require('../models/District');
    const Block = require('../models/Block');

    let blockIds = null;

    if (districtId) {
      const blocks = await Block.find({ districtId }).select('_id');
      blockIds = blocks.map(b => b._id);
    } else if (state) {
      const districts = await District.find({ state: state.toUpperCase() }).select('_id');
      const districtIdList = districts.map(d => d._id);
      const blocks = await Block.find({ districtId: { $in: districtIdList } }).select('_id');
      blockIds = blocks.map(b => b._id);
    }

    const filter = {};
    if (status)       filter.status = status;
    if (deliveryType) filter.deliveryType = deliveryType;
    if (blockIds)     filter.blockId = { $in: blockIds };

    if (from || to) {
      filter.createdAt = {};
      if (from) { filter.createdAt.$gte = new Date(from); }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [deliveries, total] = await Promise.all([
      Delivery.find(filter)
        .populate({
          path: 'memberId',
          select: 'name memberId phone districtId blockId',
          populate: { path: 'districtId', select: 'name state' },
        })
        .populate('associateId', 'name employeeId phone')
        .populate({
          path: 'blockId',
          select: 'name districtId',
          populate: { path: 'districtId', select: 'name state' },
        })
        .populate('services.serviceId', 'name type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Delivery.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: deliveries.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: deliveries,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
