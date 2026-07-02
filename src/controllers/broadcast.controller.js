const Broadcast = require('../models/Broadcast');

// @desc    Create a new broadcast
// @route   POST /api/v1/broadcasts
exports.createBroadcast = async (req, res) => {
  try {
    const { title, message, category, targetGroup } = req.body;

    if (!title || !message || !category || !targetGroup) {
      return res.status(400).json({ success: false, message: 'title, message, category and targetGroup are required.' });
    }

    const broadcast = await Broadcast.create({
      title,
      message,
      category,
      targetGroup,
      createdBy: req.user._id,
    });

    const populated = await broadcast.populate('createdBy', 'name role');

    return res.status(201).json({ success: true, message: 'Broadcast dispatched.', data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all broadcasts (with optional filters)
// @route   GET /api/v1/broadcasts?status=active&category=EMERGENCY_NOTICE&targetGroup=ALL
exports.getBroadcasts = async (req, res) => {
  try {
    const { status, category, targetGroup } = req.query;
    const filter = {};
    if (status)      filter.status      = status;
    if (category)    filter.category    = category;
    if (targetGroup) filter.targetGroup = targetGroup;

    const broadcasts = await Broadcast.find(filter)
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: broadcasts.length, data: broadcasts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Revoke (soft-delete) a broadcast
// @route   PUT /api/v1/broadcasts/:id/revoke
exports.revokeBroadcast = async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) return res.status(404).json({ success: false, message: 'Broadcast not found.' });

    broadcast.status = 'revoked';
    await broadcast.save();

    return res.status(200).json({ success: true, message: 'Broadcast revoked.', data: broadcast });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Permanently delete a broadcast
// @route   DELETE /api/v1/broadcasts/:id
exports.deleteBroadcast = async (req, res) => {
  try {
    const broadcast = await Broadcast.findByIdAndDelete(req.params.id);
    if (!broadcast) return res.status(404).json({ success: false, message: 'Broadcast not found.' });

    return res.status(200).json({ success: true, message: 'Broadcast permanently deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
