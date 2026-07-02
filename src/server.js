const cyrpto = require('crypto');
global.crypto = cyrpto; // Fix for crypto.randomUUID() in Node 18+ without additional imports
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const connectDB = require('./config/db');

// Route configurations imports
const authRoutes = require('./routes/auth.routes');
const geoRoutes = require('./routes/geo.routes');
const serviceRoutes = require('./routes/service.routes');
const deliveryRoutes = require('./routes/delivery.routes');
const schedulerRoutes = require('./routes/scheduler.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const broadcastRoutes = require('./routes/broadcast.routes');
const meetingRoutes   = require('./routes/meeting.routes');
const donationRoutes  = require('./routes/donation.routes');
const enquiryRoutes   = require('./routes/enquiry.routes');
const openingRoutes   = require('./routes/opening.routes');

const app = express();

// Base Layers middlewares injections
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded meeting photos statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Main DB Trigger links
connectDB();

// Start background cron jobs (monthly subscription scheduler, etc.)
require('./services/cronJobs');

// Mapping APIs global mounts
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/geo', geoRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/deliveries', deliveryRoutes);
app.use('/api/v1/scheduler', schedulerRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/broadcasts', broadcastRoutes);
app.use('/api/v1/meetings',   meetingRoutes);
app.use('/api/v1/donations', donationRoutes);
app.use('/api/v1/enquiries', enquiryRoutes);
app.use('/api/v1/openings', openingRoutes);

// Simple Health Check
app.get('/health', (req, res) => {
  return res.status(200).json({ status: "alive", scope: "Sabka Vikas V1 Engine" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Scratch code compiling loop executed safely on base port ${PORT}`));