const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const { cloudinary } = require('../middleware/upload.middleware');

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Build a scope filter based on the requesting user's role.
 * ASSOCIATE   → only their own meetings
 * ADMIN       → all meetings in their district
 * SUPER_ADMIN → all meetings
 */
const buildScopeFilter = (user) => {
  if (user.role === 'ASSOCIATE') {
    return { conductedBy: user._id };
  }
  if (user.role === 'ADMIN') {
    // districtId on req.user is a raw ObjectId (auth middleware does not populate it)
    const districtId = user.districtId?._id || user.districtId;
    if (!districtId) return { _id: null }; // no district → return nothing
    return { districtId: new mongoose.Types.ObjectId(String(districtId)) };
  }
  return {}; // SUPER_ADMIN — no filter
};

/**
 * Extract the Cloudinary public_id from a stored URL so we can destroy it.
 * Cloudinary URLs look like:
 *   https://res.cloudinary.com/<cloud>/image/upload/v123456/svj/meetings/abc123.jpg
 * public_id = "svj/meetings/abc123"  (no extension)
 */
const extractPublicId = (url) => {
  try {
    const parts = url.split('/');
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx === -1) return null;
    // skip the version segment (v123456) if present
    const afterUpload = parts.slice(uploadIdx + 1);
    const start = afterUpload[0]?.startsWith('v') && /^v\d+$/.test(afterUpload[0]) ? 1 : 0;
    const withExt = afterUpload.slice(start).join('/');
    return withExt.replace(/\.[^/.]+$/, ''); // strip extension
  } catch {
    return null;
  }
};

// ─── CREATE ──────────────────────────────────────────────────────────────────

// @desc    Create a new meeting
// @route   POST /api/v1/meetings
// @access  ASSOCIATE, ADMIN, SUPER_ADMIN
exports.createMeeting = async (req, res) => {
  try {
    const {
      title, description, meetingType, meetingDate,
      addressLine1, addressVillage, addressBlock, addressDistrict,
      addressState, addressPincode, fullAddress,
      gpsLat, gpsLng,
      totalMembersAttended, notes,
    } = req.body;

    // Cloudinary returns the secure_url on each uploaded file
    const photos = (req.files || []).map((f) => f.path); // multer-storage-cloudinary sets f.path = secure_url

    // Resolve district/block from the conducting user
    const districtId = req.user.districtId?._id || req.user.districtId || null;
    const blockId    = req.user.blockId?._id    || req.user.blockId    || null;

    const meeting = await Meeting.create({
      title,
      description,
      meetingType,
      meetingDate: new Date(meetingDate),
      address: {
        line1:       addressLine1,
        village:     addressVillage,
        block:       addressBlock,
        district:    addressDistrict,
        state:       addressState,
        pincode:     addressPincode,
        fullAddress: fullAddress ||
          [addressLine1, addressVillage, addressBlock, addressDistrict, addressState]
            .filter(Boolean).join(', '),
      },
      gpsLocation: (gpsLat && gpsLng)
        ? { lat: parseFloat(gpsLat), lng: parseFloat(gpsLng) }
        : undefined,
      totalMembersAttended: parseInt(totalMembersAttended) || 0,
      notes,
      photos,
      conductedBy:     req.user._id,
      conductedByRole: req.user.role,
      districtId,
      blockId,
    });

    const populated = await Meeting.findById(meeting._id)
      .populate('conductedBy', 'name employeeId role')
      .populate('districtId', 'name')
      .populate('blockId', 'name');

    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// ─── LIST ─────────────────────────────────────────────────────────────────────

// @desc    Get meetings (scoped by role)
// @route   GET /api/v1/meetings
// @access  ASSOCIATE, ADMIN, SUPER_ADMIN
exports.getMeetings = async (req, res) => {
  try {
    const { page = 1, limit = 15, meetingType, conductedBy, districtId, month, year } = req.query;

    const filter = buildScopeFilter(req.user);

    if (meetingType) filter.meetingType = meetingType;
    if (conductedBy && req.user.role !== 'ASSOCIATE') {
      filter.conductedBy = new mongoose.Types.ObjectId(conductedBy);
    }
    if (districtId && req.user.role === 'SUPER_ADMIN') {
      filter.districtId = new mongoose.Types.ObjectId(districtId);
    }

    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end   = new Date(parseInt(year), parseInt(month), 1);
      filter.meetingDate = { $gte: start, $lt: end };
    } else if (year) {
      const start = new Date(parseInt(year), 0, 1);
      const end   = new Date(parseInt(year) + 1, 0, 1);
      filter.meetingDate = { $gte: start, $lt: end };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [meetings, total] = await Promise.all([
      Meeting.find(filter)
        .populate('conductedBy', 'name employeeId role')
        .populate('districtId', 'name')
        .populate('blockId', 'name')
        .sort({ meetingDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Meeting.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: meetings.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: meetings,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── SINGLE ───────────────────────────────────────────────────────────────────

// @desc    Get single meeting by ID
// @route   GET /api/v1/meetings/:id
// @access  ASSOCIATE (own), ADMIN (district), SUPER_ADMIN (all)
exports.getMeetingById = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('conductedBy', 'name employeeId role phone')
      .populate('districtId', 'name')
      .populate('blockId', 'name');

    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found.' });
    }

    if (req.user.role === 'ASSOCIATE') {
      if (meeting.conductedBy._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    } else if (req.user.role === 'ADMIN') {
      const adminDistrict   = String(req.user.districtId?._id || req.user.districtId);
      const meetingDistrict = String(meeting.districtId?._id  || meeting.districtId);
      if (adminDistrict !== meetingDistrict) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    return res.status(200).json({ success: true, data: meeting });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

// @desc    Update a meeting (only by creator or SUPER_ADMIN)
// @route   PUT /api/v1/meetings/:id
// @access  Creator or SUPER_ADMIN
exports.updateMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found.' });
    }

    if (
      req.user.role !== 'SUPER_ADMIN' &&
      meeting.conductedBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only the creator or Super Admin can update this meeting.',
      });
    }

    const {
      title, description, meetingType, meetingDate,
      addressLine1, addressVillage, addressBlock, addressDistrict,
      addressState, addressPincode, fullAddress,
      gpsLat, gpsLng,
      totalMembersAttended, notes,
      removePhotos,
    } = req.body;

    // Delete removed photos from Cloudinary
    let currentPhotos = [...meeting.photos];
    if (removePhotos) {
      const toRemove = JSON.parse(removePhotos);
      await Promise.all(
        toRemove.map((url) => {
          const pid = extractPublicId(url);
          return pid ? cloudinary.uploader.destroy(pid) : Promise.resolve();
        })
      );
      currentPhotos = currentPhotos.filter((p) => !toRemove.includes(p));
    }

    // New photos uploaded to Cloudinary
    const newPhotos = (req.files || []).map((f) => f.path);
    const allPhotos = [...currentPhotos, ...newPhotos];

    const updates = {
      ...(title       && { title }),
      ...(description !== undefined && { description }),
      ...(meetingType && { meetingType }),
      ...(meetingDate && { meetingDate: new Date(meetingDate) }),
      address: {
        line1:       addressLine1    || meeting.address.line1,
        village:     addressVillage  !== undefined ? addressVillage  : meeting.address.village,
        block:       addressBlock    !== undefined ? addressBlock    : meeting.address.block,
        district:    addressDistrict !== undefined ? addressDistrict : meeting.address.district,
        state:       addressState    !== undefined ? addressState    : meeting.address.state,
        pincode:     addressPincode  !== undefined ? addressPincode  : meeting.address.pincode,
        fullAddress: fullAddress     || meeting.address.fullAddress,
      },
      ...(gpsLat && gpsLng && { gpsLocation: { lat: parseFloat(gpsLat), lng: parseFloat(gpsLng) } }),
      ...(totalMembersAttended !== undefined && { totalMembersAttended: parseInt(totalMembersAttended) }),
      ...(notes !== undefined && { notes }),
      photos: allPhotos,
    };

    const updated = await Meeting.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    })
      .populate('conductedBy', 'name employeeId role')
      .populate('districtId', 'name')
      .populate('blockId', 'name');

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

// @desc    Delete a meeting (only creator or SUPER_ADMIN)
// @route   DELETE /api/v1/meetings/:id
// @access  Creator or SUPER_ADMIN
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found.' });
    }

    if (
      req.user.role !== 'SUPER_ADMIN' &&
      meeting.conductedBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only the creator or Super Admin can delete this meeting.',
      });
    }

    // Delete all photos from Cloudinary
    await Promise.all(
      meeting.photos.map((url) => {
        const pid = extractPublicId(url);
        return pid ? cloudinary.uploader.destroy(pid) : Promise.resolve();
      })
    );

    await meeting.deleteOne();
    return res.status(200).json({ success: true, message: 'Meeting deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── DISTRICT ASSOCIATES ─────────────────────────────────────────────────────

// @desc    Get all associates in a district with their meeting counts (SUPER_ADMIN only)
// @route   GET /api/v1/meetings/district/:districtId/associates
// @access  SUPER_ADMIN
exports.getDistrictAssociates = async (req, res) => {
  try {
    const { districtId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(districtId)) {
      return res.status(400).json({ success: false, message: 'Invalid district ID.' });
    }

    const districtObjId = new mongoose.Types.ObjectId(districtId);

    // Aggregate meetings in this district grouped by conductedBy
    const associateStats = await Meeting.aggregate([
      { $match: { districtId: districtObjId } },
      {
        $group: {
          _id:      '$conductedBy',
          count:    { $sum: 1 },
          attended: { $sum: '$totalMembersAttended' },
          lastMeeting: { $max: '$meetingDate' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $sort: { count: -1 } },
    ]);

    return res.status(200).json({ success: true, data: associateStats });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── STATS ────────────────────────────────────────────────────────────────────

// @desc    Get meeting statistics (scoped by role)
// @route   GET /api/v1/meetings/stats
// @access  ASSOCIATE, ADMIN, SUPER_ADMIN
exports.getMeetingStats = async (req, res) => {
  try {
    const scopeFilter = buildScopeFilter(req.user);

    const total = await Meeting.countDocuments(scopeFilter);

    const attendanceAgg = await Meeting.aggregate([
      { $match: scopeFilter },
      { $group: { _id: null, totalAttended: { $sum: '$totalMembersAttended' } } },
    ]);
    const totalAttended = attendanceAgg[0]?.totalAttended || 0;

    // Monthly breakdown — last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyAgg = await Meeting.aggregate([
      { $match: { ...scopeFilter, meetingDate: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id:      { year: { $year: '$meetingDate' }, month: { $month: '$meetingDate' } },
          count:    { $sum: 1 },
          attended: { $sum: '$totalMembersAttended' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Meeting type breakdown
    const typeAgg = await Meeting.aggregate([
      { $match: scopeFilter },
      { $group: { _id: '$meetingType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // District-wise (SUPER_ADMIN only)
    let districtStats = [];
    if (req.user.role === 'SUPER_ADMIN') {
      districtStats = await Meeting.aggregate([
        { $match: scopeFilter },
        {
          $group: {
            _id:      '$districtId',
            count:    { $sum: 1 },
            attended: { $sum: '$totalMembersAttended' },
          },
        },
        {
          $lookup: {
            from: 'districts', localField: '_id', foreignField: '_id', as: 'district',
          },
        },
        { $unwind: { path: '$district', preserveNullAndEmptyArrays: true } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]);
    }

    // Associate-wise (ADMIN only)
    let associateStats = [];
    if (req.user.role === 'ADMIN') {
      associateStats = await Meeting.aggregate([
        { $match: scopeFilter },
        {
          $group: {
            _id:      '$conductedBy',
            count:    { $sum: 1 },
            attended: { $sum: '$totalMembersAttended' },
          },
        },
        {
          $lookup: {
            from: 'users', localField: '_id', foreignField: '_id', as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]);
    }

    // Recent 5 meetings
    const recent = await Meeting.find(scopeFilter)
      .populate('conductedBy', 'name employeeId role')
      .populate('districtId', 'name')
      .sort({ meetingDate: -1 })
      .limit(5);

    return res.status(200).json({
      success: true,
      data: { total, totalAttended, monthly: monthlyAgg, byType: typeAgg, districtStats, associateStats, recent },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
