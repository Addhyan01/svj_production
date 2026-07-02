const Opening           = require('../models/Opening');
const CareerApplication = require('../models/CareerApplication');

// ─── SUPER_ADMIN: Create a new opening ──────────────────────────────────────
exports.createOpening = async (req, res) => {
  try {
    const { title, location, type, desc } = req.body;
    if (!title || !desc) {
      return res.status(400).json({ success: false, message: 'Title and description are required.' });
    }
    const opening = await Opening.create({
      title,
      location: location || 'Bihar (All Districts)',
      type:     type     || 'Full-Time',
      desc,
      createdBy: req.user._id,
    });
    return res.status(201).json({ success: true, data: opening });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SUPER_ADMIN: Get all openings (any status) ──────────────────────────────
exports.getAllOpenings = async (req, res) => {
  try {
    const openings = await Opening.find().sort({ createdAt: -1 });

    // Attach application count to each opening
    const withCounts = await Promise.all(
      openings.map(async (o) => {
        const appCount = await CareerApplication.countDocuments({ openingId: o._id });
        return { ...o.toObject(), appCount };
      })
    );

    return res.status(200).json({ success: true, data: withCounts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUBLIC: Get only ONGOING openings ───────────────────────────────────────
exports.getPublicOpenings = async (req, res) => {
  try {
    const openings = await Opening.find({ status: 'ONGOING' }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: openings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SUPER_ADMIN: Toggle opening status ONGOING ↔ CLOSED ────────────────────
exports.toggleStatus = async (req, res) => {
  try {
    const opening = await Opening.findById(req.params.id);
    if (!opening) {
      return res.status(404).json({ success: false, message: 'Opening not found.' });
    }
    opening.status = opening.status === 'ONGOING' ? 'CLOSED' : 'ONGOING';
    await opening.save();
    return res.status(200).json({ success: true, data: opening });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SUPER_ADMIN: Delete an opening ─────────────────────────────────────────
exports.deleteOpening = async (req, res) => {
  try {
    const opening = await Opening.findByIdAndDelete(req.params.id);
    if (!opening) {
      return res.status(404).json({ success: false, message: 'Opening not found.' });
    }
    // Also delete related applications
    await CareerApplication.deleteMany({ openingId: req.params.id });
    return res.status(200).json({ success: true, message: 'Opening deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUBLIC: Submit a career application ─────────────────────────────────────
exports.submitApplication = async (req, res) => {
  try {
    const { openingId, name, email, phone, district, block, experience, message } = req.body;

    if (!openingId || !name || !email || !phone || !district || !block) {
      return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
    }

    // Ensure the opening exists and is still open
    const opening = await Opening.findById(openingId);
    if (!opening) {
      return res.status(404).json({ success: false, message: 'This position does not exist.' });
    }
    if (opening.status === 'CLOSED') {
      return res.status(400).json({ success: false, message: 'This position is no longer accepting applications.' });
    }

    // Prevent duplicate applications (same email + same opening)
    const duplicate = await CareerApplication.findOne({ openingId, email });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'You have already applied for this position.' });
    }

    const application = await CareerApplication.create({
      openingId, name, email, phone, district, block,
      experience: experience || 'Fresher',
      message:    message    || '',
    });

    return res.status(201).json({ success: true, message: 'Application submitted successfully!', data: application });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SUPER_ADMIN: Get all applications for a specific opening ─────────────────
exports.getApplications = async (req, res) => {
  try {
    const applications = await CareerApplication
      .find({ openingId: req.params.id })
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: applications });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SUPER_ADMIN: Update application status (ACCEPTED / REJECTED) ─────────────
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ACCEPTED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    const application = await CareerApplication.findByIdAndUpdate(
      req.params.appId,
      { status },
      { new: true }
    );
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    return res.status(200).json({ success: true, data: application });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
