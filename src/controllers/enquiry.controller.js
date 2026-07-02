const Enquiry = require('../models/Enquiry');

// ─── POST /api/v1/enquiries  (public) ────────────────────────────────────────
exports.createEnquiry = async (req, res) => {
  try {
    const {
      name, email, phone, subject, message,
      // Program application fields (optional)
      address, pinCode, district, programName, enquiryType,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'name and phone are required.',
      });
    }

    const enquiry = await Enquiry.create({
      name,
      email:       email       || '',
      phone,
      subject:     subject     || (enquiryType === 'PROGRAM_APPLICATION' ? 'Program Application' : 'General Enquiry'),
      message:     message     || '',
      address:     address     || '',
      pinCode:     pinCode     || '',
      district:    district    || '',
      programName: programName || '',
      enquiryType: enquiryType || 'CONTACT',
    });

    return res.status(201).json({
      success: true,
      message: 'Your application has been submitted successfully. We will get back to you shortly.',
      data: enquiry,
    });
  } catch (err) {
    console.error('createEnquiry error:', err);
    return res.status(500).json({ success: false, message: 'Could not submit enquiry.' });
  }
};

// ─── GET /api/v1/enquiries  (protected — SUPER_ADMIN, ADMIN) ─────────────────
exports.getAllEnquiries = async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const enquiries = await Enquiry.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 500))
      .lean();

    // Summary counts
    const [newCount, readCount, resolvedCount, total] = await Promise.all([
      Enquiry.countDocuments({ status: 'NEW' }),
      Enquiry.countDocuments({ status: 'READ' }),
      Enquiry.countDocuments({ status: 'RESOLVED' }),
      Enquiry.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        summary: { total, newCount, readCount, resolvedCount },
        enquiries,
      },
    });
  } catch (err) {
    console.error('getAllEnquiries error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch enquiries.' });
  }
};

// ─── PUT /api/v1/enquiries/:id/status  (protected) ───────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['NEW', 'READ', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found.' });
    }

    return res.status(200).json({ success: true, data: enquiry });
  } catch (err) {
    console.error('updateStatus error:', err);
    return res.status(500).json({ success: false, message: 'Could not update status.' });
  }
};
