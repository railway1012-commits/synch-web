const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, Session } = require('../database');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Unbypassable Ban Check
    if (user.is_banned) {
      if (user.banned_until && new Date(user.banned_until) <= new Date()) {
        // Temporary ban expired, auto unban
        await User.update(user.id, { is_banned: false, ban_reason: null, banned_until: null, banned_at: null });
        user.is_banned = false;
      } else {
        // Ban is active: revoke session and return 403 Forbidden with ban details
        await Session.deleteByToken(token);
        return res.status(403).json({
          error: 'Account Suspended',
          banned: true,
          reason: user.ban_reason || 'Your account has been suspended for violating our terms of service.',
          bannedAt: user.banned_at,
          bannedUntil: user.banned_until,
          userId: user.id,
          username: user.username,
          email: user.email
        });
      }
    }

    // Frozen Account Check
    if (user.is_frozen && user.email?.toLowerCase() !== 'noreply.synch@gmail.com') {
      return res.status(403).json({
        error: 'Account Frozen',
        frozen: true,
        message: 'Your account has been temporarily frozen by an administrator.'
      });
    }

    // Maintenance Mode Check
    try {
      const { pool } = require('../database');
      const maintRes = await pool.query("SELECT value FROM system_settings WHERE key = 'maintenance_mode'");
      if (maintRes.rows[0]?.value === 'true' && user.email?.toLowerCase() !== 'noreply.synch@gmail.com') {
        return res.status(503).json({
          error: 'Maintenance Mode',
          maintenance: true,
          message: 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.'
        });
      }
    } catch (e) {}

    // Verify session exists in database (has not been revoked)
    const session = await Session.findByToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Session revoked', sessionRevoked: true });
    }

    req.user = user;
    req.token = token;
    req.session = session;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      // Allow guest socket connection for public system alerts and maintenance signals
      socket.user = null;
      return next();
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      socket.user = null;
      return next();
    }

    // Unbypassable Ban Check
    if (user.is_banned) {
      if (user.banned_until && new Date(user.banned_until) <= new Date()) {
        await User.update(user.id, { is_banned: false, ban_reason: null, banned_until: null, banned_at: null });
        user.is_banned = false;
      } else {
        await Session.deleteByToken(token);
        return next(new Error('Account Suspended: ' + (user.ban_reason || 'Banned')));
      }
    }

    // Verify session exists in database (has not been revoked)
    const session = await Session.findByToken(token);
    if (!session) {
      socket.user = null;
      return next();
    }

    socket.user = user;
    socket.session = session;
    socket.token = token;
    next();
  } catch (error) {
    socket.user = null;
    next();
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const session = await Session.findByToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Session revoked', sessionRevoked: true });
    }

    const isAdmin = user.role === 'admin' || user.role === 'superadmin' || user.email?.toLowerCase() === 'noreply.synch@gmail.com';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied: Admin only' });
    }

    req.user = user;
    req.token = token;
    req.session = session;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRole = req.user.role || 'user';
    const isSuperAdmin = userRole === 'superadmin' || req.user.email?.toLowerCase() === 'noreply.synch@gmail.com';
    if (isSuperAdmin || allowedRoles.includes(userRole)) {
      return next();
    }
    return res.status(403).json({ error: `Access denied: Requires ${allowedRoles.join(' or ')} permission` });
  };
};

module.exports = { auth, socketAuth, adminAuth, requireRole };

