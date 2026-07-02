const Membership = require('../models/Membership');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const Donation = require('../models/Donation');

// @desc    Get complete real-time dashboard business counters for Admins
// @route   GET /api/v1/analytics/dashboard
exports.getAdminDashboardMetrics = async (req, res) => {
  try {
    // ----------------------------------------------------
    // METRIC PANEL 1: USER REGISTRATIONS & ROLE GRID
    // ----------------------------------------------------
    const userStats = await User.aggregate([
      {
        $group: {
          _id: "$role",
          totalCount: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          }
        }
      }
    ]);

    // Format structure to safe fallback variables
    let totalMembers = 0, activeMembers = 0, pendingMembers = 0;
    let totalAssociates = 0, totalAdmins = 0;

    userStats.forEach(bucket => {
      if (bucket._id === 'MEMBER') {
        totalMembers = bucket.totalCount;
        activeMembers = bucket.activeCount;
        pendingMembers = bucket.pendingCount;
      } else if (bucket._id === 'ASSOCIATE') {
        totalAssociates = bucket.activeCount;
      } else if (bucket._id === 'ADMIN') {
        totalAdmins = bucket.activeCount;
      }
    });

    // ----------------------------------------------------
    // METRIC PANEL 2: REVENUE TRACKER ENGINE
    // ----------------------------------------------------
   // ----------------------------------------------------
    // METRIC PANEL 2: REVENUE TRACKER ENGINE (DYNAMIC GRID)
    // ----------------------------------------------------
   const revenueStats = await Membership.aggregate([
      { $match: { paymentStatus: 'success' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amountPaid" },
          subscriptionRevenue: {
            $sum: { $cond: [{ $eq: ["$serviceType", "SUBSCRIPTION"] }, "$amountPaid", 0] }
          },
          onDemandRevenue: {
            $sum: { $cond: [{ $eq: ["$serviceType", "ON_DEMAND"] }, "$amountPaid", 0] }
          }
        }
      }
    ]);

    const financialGrid = revenueStats[0] || { totalRevenue: 0, subscriptionRevenue: 0, onDemandRevenue: 0 };
    // ----------------------------------------------------
    // METRIC PANEL 3: GROUND LOGISTICS LOGS
    // ----------------------------------------------------
    const deliveryStats = await Delivery.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const logisticsMap = { pending: 0, emergency: 0, on_the_way: 0, delivered: 0, failed: 0 };
    deliveryStats.forEach(item => {
      if (logisticsMap[item._id] !== undefined) {
        logisticsMap[item._id] = item.count;
      }
    });

    // Success rate formula calculations
    const finalHandled = logisticsMap.delivered + logisticsMap.failed;
    const successRatePercentage = finalHandled > 0 
      ? Math.round((logisticsMap.delivered / finalHandled) * 100) 
      : 100;

    // ----------------------------------------------------
    // METRIC PANEL 4: CRITICAL OVERVIEW DISPATCH BUNDLE
    // ----------------------------------------------------
    return res.status(200).json({
      success: true,
      data: {
        financials: {
          totalRevenueCollected: financialGrid.totalRevenue,
          subscriptionRevenuePads: financialGrid.subscriptionRevenue,
          onDemandRevenueTrees: financialGrid.onDemandRevenue
        },
        userMetrics: {
          totalRegisteredMembers: totalMembers,
          activePremiumMembers: activeMembers,
          pendingVerificationMembers: pendingMembers,
          activeFieldAssociates: totalAssociates,
          districtAdminsCount: totalAdmins
        },
        logistics: {
          pendingInQueue: logisticsMap.pending,
          emergencyPriority: logisticsMap.emergency,
          dispatchedOnTheWay: logisticsMap.on_the_way,
          successfullyDelivered: logisticsMap.delivered,
          failedDeliveries: logisticsMap.failed,
          overallSuccessRate: `${successRatePercentage}%`
        }
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get donation summary stats + recent donations list
// @route   GET /api/v1/analytics/donations?limit=50
exports.getDonationStats = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    // Aggregate totals
    const [stats] = await Donation.aggregate([
      {
        $group: {
          _id: null,
          totalAmount:   { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$amount', 0] } },
          totalCount:    { $sum: 1 },
          successCount:  { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
          pendingCount:  { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          failedCount:   { $sum: { $cond: [{ $eq: ['$status', 'FAILED']  }, 1, 0] } },
        },
      },
    ]);

    // Recent donations list
    const recent = await Donation.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        summary: stats || {
          totalAmount: 0, totalCount: 0,
          successCount: 0, pendingCount: 0, failedCount: 0,
        },
        donations: recent,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
