const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, error: { message: 'Token expired or validation crash.' } });
    }
  }
  if (!token) return res.status(401).json({ success: false, error: { message: 'Unauthorized, no auth header.' } });
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { message: 'Access Denied: Role Unauthorized.' } });
    }
    return next();
  };
};

module.exports = { protect, restrictTo };