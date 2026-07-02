const Membership = require('../models/Membership');
const Delivery = require('../models/Delivery');

// ─── Shared core logic ────────────────────────────────────────────────────────
// Used by cron, manual trigger, and test endpoint.
// Pass simulatedDate to test a future/past month without touching system time.
async function runMonthlyCycle(simulatedDate) {
  const today        = simulatedDate || new Date();
  const currentMonth = today.getMonth();
  const currentYear  = today.getFullYear();

  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth   = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

  const activeSubscriptions = await Membership.find({
    serviceType:        'SUBSCRIPTION',
    paymentStatus:      'success',
    isStaticBatchOrder: { $ne: true },
    expiresAt:          { $gt: today },
  }).populate('serviceId memberId');

  let ticketsCreated  = 0;
  let skippedAccounts = 0;
  const details       = [];

  for (const sub of activeSubscriptions) {
    const memberName = sub.memberId?.name || String(sub.memberId);

    // Skip if member missing or inactive
    if (!sub.memberId || sub.memberId.status !== 'active') {
      skippedAccounts++;
      details.push({ member: memberName, result: 'skipped', reason: 'Member inactive or missing' });
      continue;
    }

    // Quota check: unitsClaimed (delivered) + active pending tickets
    const pendingTicketCount = await Delivery.countDocuments({
      memberId:             sub.memberId._id,
      'services.serviceId': sub.serviceId._id,
      status:               { $in: ['pending', 'on_the_way', 'emergency'] },
    });
    const effectiveUsed = sub.unitsClaimed + pendingTicketCount;
    if (effectiveUsed >= sub.totalUnitsEntitled) {
      skippedAccounts++;
      details.push({ member: memberName, result: 'skipped', reason: `Quota exhausted (${effectiveUsed}/${sub.totalUnitsEntitled})` });
      continue;
    }

    // Duplication guard: skip if a REGULAR ticket already exists this calendar month
    const existingTicket = await Delivery.findOne({
      memberId:             sub.memberId._id,
      'services.serviceId': sub.serviceId._id,
      deliveryType:         'REGULAR',
      createdAt:            { $gte: startOfMonth, $lte: endOfMonth },
    });
    if (existingTicket) {
      skippedAccounts++;
      details.push({ member: memberName, result: 'skipped', reason: 'Ticket already exists for this month' });
      continue;
    }

    // Create the monthly delivery ticket (unitsClaimed increments only on actual delivery)
    await Delivery.create({
      memberId:     sub.memberId._id,
      blockId:      sub.memberId.blockId,
      services:     [{ serviceId: sub.serviceId._id, quantity: 1 }],
      deliveryType: 'REGULAR',
      status:       'pending',
      notes:        `Automated monthly delivery for ${currentMonth + 1}/${currentYear}. Target: 25th-30th.`,
    });

    ticketsCreated++;
    details.push({ member: memberName, result: 'ticket_created', quota: `${effectiveUsed + 1}/${sub.totalUnitsEntitled}` });
  }

  return {
    forMonth:                  `${currentMonth + 1}/${currentYear}`,
    totalSubscriptionsScanned: activeSubscriptions.length,
    ticketsGenerated:          ticketsCreated,
    accountsSkipped:           skippedAccounts,
    details,
  };
}

// ─── ONE-TIME migration ───────────────────────────────────────────────────────
// Fixes existing memberships with missing/zero totalUnitsEntitled.
// @route POST /api/v1/scheduler/fix-membership-units
exports.fixMembershipUnits = async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    // Fix memberships with missing totalUnitsEntitled
    const broken = await Membership.find({
      serviceType:   'SUBSCRIPTION',
      paymentStatus: 'success',
      $or: [
        { totalUnitsEntitled: { $exists: false } },
        { totalUnitsEntitled: 0 },
        { totalUnitsEntitled: null },
      ],
    });

    let fixed = 0;
    for (const m of broken) {
      const deliveredCount = await Delivery.countDocuments({
        memberId:             m.memberId,
        'services.serviceId': m.serviceId,
        status:               'delivered',
      });
      m.totalUnitsEntitled = 12;
      m.unitsClaimed       = deliveredCount;
      await m.save();
      fixed++;
    }

    // Recalculate unitsClaimed for all subscriptions based on actual delivered count
    const allSubs = await Membership.find({
      serviceType:        'SUBSCRIPTION',
      paymentStatus:      'success',
      totalUnitsEntitled: 12,
    });

    let recalculated = 0;
    for (const m of allSubs) {
      const deliveredCount = await Delivery.countDocuments({
        memberId:             m.memberId,
        'services.serviceId': m.serviceId,
        status:               'delivered',
      });
      if (m.unitsClaimed !== deliveredCount) {
        m.unitsClaimed = deliveredCount;
        await m.save();
        recalculated++;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Membership units migration completed.',
      summary: { missingFieldsFixed: fixed, unitClaimsRecalculated: recalculated },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Production manual trigger ────────────────────────────────────────────────
// Runs cycle for the current month.
// @route POST /api/v1/scheduler/generate-monthly-cycle
exports.generateMonthlyCycleDeliveries = async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }
    const summary = await runMonthlyCycle();
    return res.status(200).json({ success: true, message: 'Monthly batch completed.', summary });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Test endpoint ────────────────────────────────────────────────────────────
// Simulate the cycle for any month by passing a date in the body.
// @route POST /api/v1/scheduler/test-monthly-cycle
// @body  { "simulateDate": "2026-07-01", "dryRun": true }
//   dryRun: true  → only shows what WOULD happen, no DB writes (safe for testing)
//   dryRun: false → actually creates tickets (default if omitted)
exports.testMonthlyCycle = async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const { simulateDate, dryRun = true } = req.body;
    if (!simulateDate) {
      return res.status(400).json({ success: false, message: 'Provide simulateDate. Example: "2026-07-01"' });
    }

    const date = new Date(simulateDate);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date. Use YYYY-MM-DD format.' });
    }

    // dryRun mode: preview only, no DB writes
    if (dryRun) {
      const today        = date;
      const currentMonth = today.getMonth();
      const currentYear  = today.getFullYear();
      const startOfMonth = new Date(currentYear, currentMonth, 1);
      const endOfMonth   = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

      const activeSubscriptions = await Membership.find({
        serviceType:        'SUBSCRIPTION',
        paymentStatus:      'success',
        isStaticBatchOrder: { $ne: true },
        expiresAt:          { $gt: today },
      }).populate('serviceId memberId');

      const preview = [];
      for (const sub of activeSubscriptions) {
        const memberName = sub.memberId?.name || String(sub.memberId);
        if (!sub.memberId || sub.memberId.status !== 'active') {
          preview.push({ member: memberName, result: 'would_skip', reason: 'Member inactive or missing' });
          continue;
        }
        const pendingCount = await Delivery.countDocuments({
          memberId:             sub.memberId._id,
          'services.serviceId': sub.serviceId._id,
          status:               { $in: ['pending', 'on_the_way', 'emergency'] },
        });
        const effectiveUsed = sub.unitsClaimed + pendingCount;
        if (effectiveUsed >= sub.totalUnitsEntitled) {
          preview.push({ member: memberName, result: 'would_skip', reason: `Quota exhausted (${effectiveUsed}/${sub.totalUnitsEntitled})` });
          continue;
        }
        const existingTicket = await Delivery.findOne({
          memberId:             sub.memberId._id,
          'services.serviceId': sub.serviceId._id,
          deliveryType:         'REGULAR',
          createdAt:            { $gte: startOfMonth, $lte: endOfMonth },
        });
        if (existingTicket) {
          preview.push({ member: memberName, result: 'would_skip', reason: 'Ticket already exists for this month' });
          continue;
        }
        preview.push({ member: memberName, result: 'would_create_ticket', quota: `${effectiveUsed + 1}/${sub.totalUnitsEntitled}` });
      }

      return res.status(200).json({
        success: true,
        mode: 'DRY RUN — no changes made to database',
        forMonth: `${currentMonth + 1}/${currentYear}`,
        wouldCreate: preview.filter(p => p.result === 'would_create_ticket').length,
        wouldSkip:   preview.filter(p => p.result === 'would_skip').length,
        preview,
      });
    }

    // Live mode: actually creates tickets
    const summary = await runMonthlyCycle(date);
    return res.status(200).json({
      success: true,
      mode: 'LIVE — tickets created in database',
      message: `Cycle executed for ${summary.forMonth}.`,
      summary,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Export for use in cronJobs.js
exports.runMonthlyCycle = runMonthlyCycle;
