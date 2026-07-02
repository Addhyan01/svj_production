const Service = require('../models/Service');

// @desc    Nayi Service register karna (Only Super Admin)
// @route   POST /api/v1/services
exports.createService = async (req, res) => {
  try {
    const { name, description, type, baseFee, subsequentFee, totalMonths, initialBonusUnits } = req.body;

    // Manual debugging log: check karne ke liye ki Postman se data aa kya raha hai
    console.log("Incoming Service Data:", req.body);

    const newService = await Service.create({
      name,
      description,
      type,
      baseFee,
      subsequentFee,
      totalMonths,
      initialBonusUnits
    });

    res.status(201).json({
      success: true,
      message: "New service added to global catalog successfully.",
      data: newService
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Saari active services ki list dekhna (Used by Member/Donor during registration)
// @route   GET /api/v1/services
exports.getAllServices = async (req, res) => {
  try {
    const services = await Service.find();
    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Service details ko update karna ya fees badalna (Only Super Admin)
// @route   PUT /api/v1/services/:id
exports.updateService = async (req, res) => {
  try {
    const { name, annualFee, description } = req.body;
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    service.name = name || service.name;
    service.annualFee = annualFee !== undefined ? annualFee : service.annualFee;
    service.description = description || service.description;

    await service.save();
    res.status(200).json({ success: true, message: 'Service package updated successfully.', data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};