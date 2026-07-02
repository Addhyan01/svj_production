const District = require('../models/District');
const Block = require('../models/Block');
const User = require('../models/User');

// @desc    Naya District banana (Only Super Admin)
// @route   POST /api/v1/geo/districts
exports.createDistrict = async (req, res) => {
  try {
    const { name } = req.body;
    const districtExists = await District.findOne({ name: name.toUpperCase() });
    
    if (districtExists) {
      return res.status(400).json({ success: false, message: 'This district is already registered.' });
    }

    const district = await District.create({ name });
    res.status(201).json({ success: true, message: 'District created successfully.', data: district });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Naya Block banana kisi District ke andar (Only Super Admin)
// @route   POST /api/v1/geo/blocks
exports.createBlock = async (req, res) => {
  try {
    const { name, districtId } = req.body;
    
    const district = await District.findById(districtId);
    if (!district) {
      return res.status(404).json({ success: false, message: 'Target District not found.' });
    }

    const blockExists = await Block.findOne({ name: name.toUpperCase(), districtId });
    if (blockExists) {
      return res.status(400).json({ success: false, message: 'Block with this name already exists in this district.' });
    }

    const block = await Block.create({ name, districtId });
    res.status(201).json({ success: true, message: 'Block mapped successfully.', data: block });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Saare Districts ki list dekhna
// @route   GET /api/v1/geo/districts
exports.getAllDistricts = async (req, res) => {
  try {
    const districts = await District.find();
    res.status(200).json({ success: true, data: districts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Kisi District ke andar ke saare Blocks dekhna
// @route   GET /api/v1/geo/districts/:districtId/blocks
exports.getBlocksByDistrict = async (req, res) => {
  try {
    const blocks = await Block.find({ districtId: req.params.districtId });
    res.status(200).json({ success: true, data: blocks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Associate ko Multiple Blocks assign karna (Admin & Super Admin)
// @route   PUT /api/v1/geo/assign-associate/:associateId
exports.assignBlocksToAssociate = async (req, res) => {
  try {
    const { associateId } = req.params;
    const { blockIds } = req.body; // Array of Block ObjectIds

    const associate = await User.findOne({ _id: associateId, role: 'ASSOCIATE' });
    if (!associate) {
      return res.status(404).json({ success: false, message: 'Associate user not found.' });
    }

    // V1 Multi-block array assignment rule
    associate.assignedBlocks = blockIds;
    await associate.save();

    res.status(200).json({
      success: true,
      message: 'Blocks assigned to Associate dashboard successfully.',
      data: { associateId: associate._id, assignedBlocks: associate.assignedBlocks }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all associates assigned to a specific block
// @route   GET /api/v1/geo/blocks/:blockId/associates
exports.getAssociatesByBlock = async (req, res) => {
  try {
    const { blockId } = req.params;

    const associates = await User.find({
      role: 'ASSOCIATE',
      assignedBlocks: blockId,
    })
      .select('-password')
      .populate('districtId', 'name')
      .populate('blockId', 'name')
      .populate('assignedBlocks', 'name districtId');

    res.status(200).json({ success: true, data: associates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all blocks in the logged-in admin's district (with associate counts)
// @route   GET /api/v1/geo/admin/district-blocks
exports.getAdminDistrictBlocks = async (req, res) => {
  try {
    const adminDistrictId = req.user.districtId?._id || req.user.districtId;
    if (!adminDistrictId) {
      return res.status(403).json({ success: false, message: 'Admin account has no district assigned.' });
    }

    // All blocks in this district
    const blocks = await Block.find({ districtId: adminDistrictId })
      .populate('districtId', 'name')
      .sort({ name: 1 });

    // For each block, count how many associates are assigned to it
    const blocksWithCounts = await Promise.all(
      blocks.map(async (block) => {
        const associateCount = await User.countDocuments({
          role: 'ASSOCIATE',
          assignedBlocks: block._id,
        });
        return { ...block.toObject(), associateCount };
      })
    );

    res.status(200).json({ success: true, data: blocksWithCounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get the logged-in associate's own assigned blocks (with district populated)
// @route   GET /api/v1/geo/my-blocks
exports.getMyBlocks = async (req, res) => {
  try {
    const associate = await User.findById(req.user._id)
      .populate({
        path: 'assignedBlocks',
        populate: { path: 'districtId', select: 'name' },
      });

    if (!associate) {
      return res.status(404).json({ success: false, message: 'Associate not found.' });
    }

    res.status(200).json({ success: true, data: associate.assignedBlocks || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all associates with their assigned blocks populated
// @route   GET /api/v1/geo/assigned-associates
exports.getAssignedAssociates = async (req, res) => {
  try {
    const filter = { role: 'ASSOCIATE' };

    // District Admin can only see associates in their own district
    if (req.user && req.user.role === 'ADMIN') {
      const adminDistrictId = req.user.districtId?._id || req.user.districtId;
      if (adminDistrictId) filter.districtId = adminDistrictId;
    }

    const associates = await User.find(filter)
      .select('-password')
      .populate('assignedBlocks', 'name districtId')
      .populate('districtId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: associates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};