const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool, User, Session, VerificationCode } = require('../database');
const config = require('../config');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

const googleClient = config.GOOGLE_CLIENT_ID ? new OAuth2Client(config.GOOGLE_CLIENT_ID) : null;

async function isMaintenanceModeActive(userEmail = null) {
  try {
    if (userEmail && userEmail.toLowerCase() === 'noreply.synch@gmail.com') return false;
    const res = await pool.query("SELECT value FROM system_settings WHERE key = 'maintenance_mode'");
    return res.rows[0]?.value === 'true';
  } catch (e) {
    return false;
  }
}

async function isSignupsAllowed() {
  try {
    const res = await pool.query("SELECT value FROM system_settings WHERE key = 'allow_signups'");
    return res.rows[0]?.value !== 'false';
  } catch (e) {
    return true;
  }
}

const generateToken = (userId) => {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
};

let io = null;
exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.getPublicConfig = async (req, res) => {
  const isMaint = await isMaintenanceModeActive();
  res.json({
    googleClientId: config.GOOGLE_CLIENT_ID || null,
    maintenanceMode: isMaint
  });
};

// Step 1 of the unified auth screen: user typed an email/username and hit Continue.
exports.checkIdentifier = async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Email or username is required' });

    if (await isMaintenanceModeActive(identifier.trim())) {
      return res.status(503).json({
        error: 'Maintenance Mode',
        maintenance: true,
        message: 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.'
      });
    }

    const user = await User.findByIdentifier(identifier.trim());

    if (!user) {
      return res.json({ exists: false });
    }

    // Ban check
    if (user.is_banned) {
      if (user.banned_until && new Date(user.banned_until) <= new Date()) {
        await User.update(user.id, { is_banned: false, ban_reason: null, banned_until: null, banned_at: null });
        user.is_banned = false;
      } else {
        return res.status(403).json({
          error: 'Account Suspended',
          banned: true,
          reason: user.ban_reason || 'Your account has been suspended for violating our terms of service.',
          bannedAt: user.banned_at,
          bannedUntil: user.banned_until
        });
      }
    }

    res.json({
      exists: true,
      hasPassword: !!user.password,
      hasGoogle: !!user.google_id,
      isEmail: identifier.includes('@')
    });
  } catch (error) {
    console.error('Check identifier error:', error);
    res.status(500).json({ error: 'Error checking account' });
  }
};

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user}***@${domain}`;
  return `${user.substring(0, 2)}***${user.substring(user.length - 1)}@${domain}`;
}

const pendingSignups = new Map();

exports.sendSignupCode = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (await isMaintenanceModeActive(cleanEmail)) {
      return res.status(503).json({
        error: 'Maintenance Mode',
        maintenance: true,
        message: 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.'
      });
    }

    if (!(await isSignupsAllowed())) {
      return res.status(403).json({
        error: 'Signups Disabled',
        message: 'New user registrations are currently disabled by the administrator.'
      });
    }

    const existingEmail = await User.findByEmail(cleanEmail);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered. Please sign in instead.' });
    }

    if (username) {
      const existingUsername = await User.findByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const cooldownRemaining = checkEmailCooldown(cleanEmail, 60);
    if (cooldownRemaining > 0) {
      return res.status(429).json({
        error: `Please wait ${cooldownRemaining} seconds before requesting another code.`
      });
    }

    const code = await VerificationCode.create(cleanEmail, null, 'signup');
    pendingSignups.set(cleanEmail, {
      username: username || null,
      password,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const emailSent = await sendVerificationEmail(cleanEmail, code);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email. Please check your address and try again.' });
    }

    res.json({
      success: true,
      message: `Verification code sent to ${maskEmail(cleanEmail)}`,
      email: cleanEmail,
      maskedEmail: maskEmail(cleanEmail)
    });
  } catch (error) {
    console.error('Send signup code error:', error);
    res.status(500).json({ error: 'Error sending verification code' });
  }
};

exports.verifySignupCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const pendingData = pendingSignups.get(cleanEmail);

    if (!pendingData || pendingData.expiresAt < Date.now()) {
      pendingSignups.delete(cleanEmail);
      return res.status(400).json({ error: 'Signup session expired. Please request a new verification code.' });
    }

    const isValid = await VerificationCode.verify(cleanEmail, code.trim(), 'signup');

    if (!isValid) {
      return res.status(400).json({ error: 'Incorrect or expired verification code' });
    }

    const { username, password } = pendingData;
    pendingSignups.delete(cleanEmail);

    const user = await User.create(username || null, cleanEmail, password, true, null, null, true);
    const token = generateToken(user.id);

    await Session.create(user.id, token, req.headers['user-agent'] || 'Unknown', req.ip);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: User.toPublicJSON(user)
    });
  } catch (error) {
    console.error('Verify signup code error:', error);
    res.status(500).json({ error: 'Error verifying code and creating account' });
  }
};

exports.resendCode = async (req, res) => {
  try {
    const { email, type = 'signup' } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.toLowerCase().trim();

    if (type === 'signup') {
      const pendingData = pendingSignups.get(cleanEmail);
      if (!pendingData) {
        return res.status(400).json({ error: 'No pending signup session found for this email. Please re-enter your details.' });
      }
    } else if (type === 'reset' || type === 'login') {
      const user = await User.findByEmail(cleanEmail);
      if (!user) {
        return res.status(404).json({ error: 'No account found with this email' });
      }
    }

    const cooldownRemaining = checkEmailCooldown(cleanEmail, 60);
    if (cooldownRemaining > 0) {
      return res.status(429).json({
        error: `Please wait ${cooldownRemaining} seconds before requesting another code.`
      });
    }

    const code = await VerificationCode.create(cleanEmail, null, type);
    const emailSent = await sendVerificationEmail(cleanEmail, code);

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to resend verification email' });
    }

    res.json({ success: true, message: `Verification code resent to ${maskEmail(cleanEmail)}` });
  } catch (error) {
    console.error('Resend code error:', error);
    res.status(500).json({ error: 'Error resending verification code' });
  }
};

exports.signup = async (req, res) => {
  try {
    const { email, password, username, code } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (code) {
      return exports.verifySignupCode(req, res);
    }

    return exports.sendSignupCode(req, res);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Error processing signup request' });
  }
};

const pending2FA = new Map();
const deviceChallenges = new Map();

function parseDeviceName(userAgent) {
  if (!userAgent) return 'Unknown Device';
  let browser = 'Browser';
  if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Edg/')) browser = 'Edge';
  else if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Safari')) browser = 'Safari';

  let os = 'Device';
  if (userAgent.includes('Windows')) os = 'Windows PC';
  else if (userAgent.includes('Android')) os = 'Android Phone';
  else if (userAgent.includes('iPhone')) os = 'iPhone';
  else if (userAgent.includes('iPad')) os = 'iPad';
  else if (userAgent.includes('Macintosh')) os = 'Mac';
  else if (userAgent.includes('Linux')) os = 'Linux PC';

  return `${browser} on ${os}`;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

async function getIpLocation(ip) {
  const cleanIp = (ip || '').replace(/^.*:/, '').trim();

  if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.')) {
    return {
      city: 'Local Network',
      region: '',
      country: 'Local Network',
      lat: 37.7749,
      lon: -122.4194,
      isLocal: true,
      display: 'Local Network'
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,regionName,city,lat,lon`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 'success') {
        return {
          city: data.city || 'Unknown City',
          region: data.regionName || '',
          country: data.country || '',
          lat: data.lat || 37.7749,
          lon: data.lon || -122.4194,
          isLocal: false,
          display: [data.city, data.regionName, data.country].filter(Boolean).join(', ')
        };
      }
    }
  } catch (e) {}

  return {
    city: 'Approximate Location',
    region: '',
    country: '',
    lat: 37.7749,
    lon: -122.4194,
    isLocal: false,
    display: 'Approximate Location'
  };
}

// Login accepts an email OR a username in `identifier`.
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (await isMaintenanceModeActive(identifier)) {
      return res.status(503).json({
        error: 'Maintenance Mode',
        maintenance: true,
        message: 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.'
      });
    }

    const user = await User.findByIdentifier((identifier || '').trim());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Ban check
    if (user.is_banned) {
      if (user.banned_until && new Date(user.banned_until) <= new Date()) {
        await User.update(user.id, { is_banned: false, ban_reason: null, banned_until: null, banned_at: null });
        user.is_banned = false;
      } else {
        return res.status(403).json({
          error: 'Account Suspended',
          banned: true,
          reason: user.ban_reason || 'Your account has been suspended for violating our terms of service.',
          bannedAt: user.banned_at,
          bannedUntil: user.banned_until
        });
      }
    }

    if (!user.password) {
      return res.status(401).json({ error: 'GOOGLE_ONLY_ACCOUNT' });
    }

    if (!User.comparePassword(user, password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.two_factor_enabled) {
      const activeSessions = await Session.findByUserId(user.id);
      const hasOtherDevices = activeSessions && activeSessions.length > 0;

      // Always prepare email 2FA code in background so it's ready if chosen
      const code = await VerificationCode.create(user.email, user.id, 'login');
      pending2FA.set(user.email, { userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 });

      let defaultMethod = hasOtherDevices ? 'device' : 'email';
      let challenge = null;

      if (defaultMethod === 'device') {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || 'Unknown Browser';
        const geo = await getIpLocation(clientIp);

        const challengeId = 'dp_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        challenge = {
          id: challengeId,
          userId: user.id,
          email: user.email,
          device: parseDeviceName(userAgent),
          ip: clientIp,
          location: geo,
          createdAt: new Date().toISOString(),
          expiresAt,
          status: 'pending'
        };
        deviceChallenges.set(challengeId, challenge);

        const socketIO = req.app?.get('io') || io;
        if (socketIO) {
          socketIO.to(`user:${user.id}`).emit('auth:device_prompt', {
            challengeId,
            device: challenge.device,
            ip: challenge.ip,
            location: challenge.location,
            createdAt: challenge.createdAt,
            expiresAt: challenge.expiresAt
          });
        }
      } else {
        // Send email code by default if no active signed-in devices
        await sendVerificationEmail(user.email, code);
      }

      return res.json({
        requires2FA: true,
        email: user.email,
        maskedEmail: maskEmail(user.email),
        hasOtherDevices,
        defaultMethod,
        challengeId: challenge?.id || null,
        expiresAt: challenge?.expiresAt || null
      });
    }

    const token = generateToken(user.id);

    await Session.create(user.id, token, req.headers['user-agent'] || 'Unknown', req.ip);
    await User.updateStatus(user.id, 'online');

    const socketIO = req.app?.get('io') || io;
    if (socketIO) {
      socketIO.to(`user:${user.id}`).emit('session:updated', { type: 'created' });
    }

    const updatedUser = await User.findById(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: User.toPublicJSON(updatedUser)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error logging in' });
  }
};

async function verifyGoogleCredential(credential) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || config.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) throw new Error('Google Sign-In is not configured on this server');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId
  });
  return ticket.getPayload();
}

// Handles both "sign in with Google" and "sign up with Google" — one endpoint,
// the frontend branches on `isNewUser` in the response.
exports.googleAuth = async (req, res) => {
  try {
    const { credential, expectedEmail } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    const payload = await verifyGoogleCredential(credential);
    const { sub: googleId, email, name, picture } = payload;

    if (await isMaintenanceModeActive(email)) {
      return res.status(503).json({
        error: 'Maintenance Mode',
        maintenance: true,
        message: 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.'
      });
    }

    const expected = (req.body.expectedIdentifier || expectedEmail || '').trim();
    if (expected) {
      const targetUser = await User.findByIdentifier(expected);
      if (targetUser) {
        const matchesGoogleId = targetUser.google_id && targetUser.google_id === googleId;
        const matchesEmail = targetUser.email && targetUser.email.toLowerCase() === email.toLowerCase();
        if (!matchesGoogleId && !matchesEmail) {
          return res.status(400).json({ error: 'GOOGLE_EMAIL_MISMATCH' });
        }
      } else {
        if (expected.includes('@') && email.toLowerCase() !== expected.toLowerCase()) {
          return res.status(400).json({ error: 'GOOGLE_EMAIL_MISMATCH' });
        }
      }
    }

    let user = await User.findByGoogleId(googleId);

    if (user) {
      // Ban check
      if (user.is_banned) {
        if (user.banned_until && new Date(user.banned_until) <= new Date()) {
          await User.update(user.id, { is_banned: false, ban_reason: null, banned_until: null, banned_at: null });
          user.is_banned = false;
        } else {
          return res.status(403).json({
            error: 'Account Suspended',
            banned: true,
            reason: user.ban_reason || 'Your account has been suspended for violating our terms of service.',
            bannedAt: user.banned_at,
            bannedUntil: user.banned_until
          });
        }
      }

      if (user.two_factor_enabled) {
        const activeSessions = await Session.findByUserId(user.id);
        const hasOtherDevices = activeSessions && activeSessions.length > 0;

        const code = await VerificationCode.create(user.email, user.id, 'login');
        pending2FA.set(user.email, { userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 });

        let defaultMethod = hasOtherDevices ? 'device' : 'email';
        let challenge = null;

        if (defaultMethod === 'device') {
          const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
          const userAgent = req.headers['user-agent'] || 'Unknown Browser';
          const geo = await getIpLocation(clientIp);

          const challengeId = 'dp_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
          const expiresAt = Date.now() + 5 * 60 * 1000;

          challenge = {
            id: challengeId,
            userId: user.id,
            email: user.email,
            device: parseDeviceName(userAgent),
            ip: clientIp,
            location: geo,
            createdAt: new Date().toISOString(),
            expiresAt,
            status: 'pending'
          };
          deviceChallenges.set(challengeId, challenge);

          const socketIO = req.app?.get('io') || io;
          if (socketIO) {
            socketIO.to(`user:${user.id}`).emit('auth:device_prompt', {
              challengeId,
              device: challenge.device,
              ip: challenge.ip,
              location: challenge.location,
              createdAt: challenge.createdAt,
              expiresAt: challenge.expiresAt
            });
          }
        } else {
          await sendVerificationEmail(user.email, code);
        }

        return res.json({
          requires2FA: true,
          email: user.email,
          maskedEmail: maskEmail(user.email),
          hasOtherDevices,
          defaultMethod,
          challengeId: challenge?.id || null,
          expiresAt: challenge?.expiresAt || null
        });
      }

      const token = generateToken(user.id);
      await Session.create(user.id, token, req.headers['user-agent'] || 'Unknown', req.ip);
      await User.updateStatus(user.id, 'online');
      const socketIO = req.app?.get('io') || io;
      if (socketIO) socketIO.to(`user:${user.id}`).emit('session:updated', { type: 'created' });
      const updated = await User.findById(user.id);
      return res.json({ message: 'Login successful', token, user: User.toPublicJSON(updated), isNewUser: false });
    }

    const byEmail = await User.findByEmail(email);
    if (byEmail) {
      // Ban check
      if (byEmail.is_banned) {
        if (byEmail.banned_until && new Date(byEmail.banned_until) <= new Date()) {
          await User.update(byEmail.id, { is_banned: false, ban_reason: null, banned_until: null, banned_at: null });
          byEmail.is_banned = false;
        } else {
          return res.status(403).json({
            error: 'Account Suspended',
            banned: true,
            reason: byEmail.ban_reason || 'Your account has been suspended for violating our terms of service.',
            bannedAt: byEmail.banned_at,
            bannedUntil: byEmail.banned_until
          });
        }
      }

      // Google has already verified this email belongs to this person —
      // safe to link automatically and log them in.
      await User.setGoogleId(byEmail.id, googleId);

      if (byEmail.two_factor_enabled) {
        const activeSessions = await Session.findByUserId(byEmail.id);
        const hasOtherDevices = activeSessions && activeSessions.length > 0;

        const code = await VerificationCode.create(byEmail.email, byEmail.id, 'login');
        pending2FA.set(byEmail.email, { userId: byEmail.id, expiresAt: Date.now() + 10 * 60 * 1000 });

        let defaultMethod = hasOtherDevices ? 'device' : 'email';
        let challenge = null;

        if (defaultMethod === 'device') {
          const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
          const userAgent = req.headers['user-agent'] || 'Unknown Browser';
          const geo = await getIpLocation(clientIp);

          const challengeId = 'dp_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
          const expiresAt = Date.now() + 5 * 60 * 1000;

          challenge = {
            id: challengeId,
            userId: byEmail.id,
            email: byEmail.email,
            device: parseDeviceName(userAgent),
            ip: clientIp,
            location: geo,
            createdAt: new Date().toISOString(),
            expiresAt,
            status: 'pending'
          };
          deviceChallenges.set(challengeId, challenge);

          const socketIO = req.app?.get('io') || io;
          if (socketIO) {
            socketIO.to(`user:${byEmail.id}`).emit('auth:device_prompt', {
              challengeId,
              device: challenge.device,
              ip: challenge.ip,
              location: challenge.location,
              createdAt: challenge.createdAt,
              expiresAt: challenge.expiresAt
            });
          }
        } else {
          await sendVerificationEmail(byEmail.email, code);
        }

        return res.json({
          requires2FA: true,
          email: byEmail.email,
          maskedEmail: maskEmail(byEmail.email),
          hasOtherDevices,
          defaultMethod,
          challengeId: challenge?.id || null,
          expiresAt: challenge?.expiresAt || null
        });
      }

      const token = generateToken(byEmail.id);
      await Session.create(byEmail.id, token, req.headers['user-agent'] || 'Unknown', req.ip);
      await User.updateStatus(byEmail.id, 'online');
      const socketIO = req.app?.get('io') || io;
      if (socketIO) socketIO.to(`user:${byEmail.id}`).emit('session:updated', { type: 'created' });
      const updated = await User.findById(byEmail.id);
      return res.json({ message: 'Login successful', token, user: User.toPublicJSON(updated), isNewUser: false, justLinked: true });
    }

    // Brand new account via Google.
    const newUser = await User.create(null, email, null, true, googleId, picture || null, false);
    const token = generateToken(newUser.id);
    await Session.create(newUser.id, token, req.headers['user-agent'] || 'Unknown', req.ip);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: User.toPublicJSON(newUser),
      isNewUser: true,
      googleProfile: { name: name || null, picture: picture || null }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Could not verify Google account. Please try again.' });
  }
};

// Link Google to an already-logged-in account (from Settings).
exports.linkGoogle = async (req, res) => {
  try {
    const { credential, password } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    if (req.user.password) {
      if (!password || !User.comparePassword(req.user, password)) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }
    }

    const payload = await verifyGoogleCredential(credential);
    const { sub: googleId, email } = payload;

    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(400).json({ error: 'GOOGLE_EMAIL_MISMATCH' });
    }

    const existing = await User.findByGoogleId(googleId);
    if (existing && existing.id !== req.user.id) {
      return res.status(400).json({ error: 'This Google account is already linked to another user' });
    }

    await User.setGoogleId(req.user.id, googleId);
    const updated = await User.findById(req.user.id);

    res.json({ message: 'Google account connected', user: User.toPublicJSON(updated) });
  } catch (error) {
    console.error('Link Google error:', error);
    res.status(500).json({ error: 'Error connecting Google account' });
  }
};

exports.unlinkGoogle = async (req, res) => {
  try {
    const { password } = req.body;

    if (!req.user.password) {
      return res.status(400).json({ error: 'Set a password before disconnecting Google' });
    }

    if (!password || !User.comparePassword(req.user, password)) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    await User.removeGoogleId(req.user.id);
    const updated = await User.findById(req.user.id);

    res.json({ message: 'Google account disconnected', user: User.toPublicJSON(updated) });
  } catch (error) {
    console.error('Unlink Google error:', error);
    res.status(500).json({ error: 'Error disconnecting Google account' });
  }
};

// For Google-only accounts that want to add a password (optional step after
// Google signup, or required before they can disconnect Google later).
exports.setPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (req.user.password) {
      return res.status(400).json({ error: 'A password is already set. Use change password instead.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    await User.updatePassword(req.user.id, password);
    const updated = await User.findById(req.user.id);

    res.json({ message: 'Password set successfully', user: User.toPublicJSON(updated) });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Error setting password' });
  }
};

// Final step of profile setup (username + DOB), used by both email and
// Google signup flows.
exports.completeProfile = async (req, res) => {
  try {
    const { username, dob } = req.body;

    if (username) {
      const existing = await User.findByUsername(username);
      if (existing && existing.id !== req.user.id) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      await User.updateUsername(req.user.id, username);
    }

    if (dob) {
      await User.setDob(req.user.id, dob);
    }

    await User.markProfileComplete(req.user.id);
    const updated = await User.findById(req.user.id);

    res.json({ message: 'Profile completed', user: User.toPublicJSON(updated) });
  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({ error: 'Error completing profile' });
  }
};

exports.verifyLogin2FA = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (await isMaintenanceModeActive(email)) {
      return res.status(503).json({
        error: 'Maintenance Mode',
        maintenance: true,
        message: 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.'
      });
    }

    const pendingData = pending2FA.get(email);
    if (!pendingData || pendingData.expiresAt < Date.now()) {
      pending2FA.delete(email);
      return res.status(400).json({ error: 'Session expired. Please login again.' });
    }

    const isValid = await VerificationCode.verify(email, code, 'login');
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    pending2FA.delete(email);
    const user = await User.findById(pendingData.userId);
    const token = generateToken(user.id);

    await Session.create(user.id, token, req.headers['user-agent'] || 'Unknown', req.ip);
    await User.updateStatus(user.id, 'online');

    const socketIO = req.app?.get('io') || io;
    if (socketIO) socketIO.to(`user:${user.id}`).emit('session:updated', { type: 'created' });

    res.json({
      message: 'Login successful',
      token,
      user: User.toPublicJSON(user)
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ error: 'Error verifying code' });
  }
};

exports.logout = async (req, res) => {
  try {
    await Session.deleteByToken(req.token);
    await User.updateStatus(req.user.id, 'offline');

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error logging out' });
  }
};

exports.getMe = async (req, res) => {
  try {
    res.json({ user: User.toPublicJSON(req.user) });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (req.user.password) {
      if (!currentPassword || !User.comparePassword(req.user, currentPassword)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    await User.updatePassword(req.user.id, newPassword);
    const updatedUser = await User.findById(req.user.id);

    res.json({
      message: req.user.password ? 'Password changed successfully' : 'Password set successfully',
      user: User.toPublicJSON(updatedUser)
    });
  } catch (error) {
    res.status(500).json({ error: 'Error changing password' });
  }
};

exports.changeUsername = async (req, res) => {
  try {
    const { username } = req.body;

    const existing = await User.findByUsername(username);
    if (existing && existing.id !== req.user.id) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    await User.updateUsername(req.user.id, username);
    const updatedUser = await User.findById(req.user.id);

    if (io) {
      io.emit('user:profile_updated', {
        userId: req.user.id,
        username: updatedUser.username,
        avatar: updatedUser.avatar
      });
    }

    res.json({ message: 'Username changed successfully', user: User.toPublicJSON(updatedUser) });
  } catch (error) {
    res.status(500).json({ error: 'Error changing username' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const { password, credential } = req.body;

    if (req.user.password) {
      if (!password || !User.comparePassword(req.user, password)) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }
    } else if (req.user.google_id) {
      if (!credential) {
        return res.status(400).json({ error: 'Please verify your Google account to confirm deletion' });
      }
      const payload = await verifyGoogleCredential(credential);
      if (payload.sub !== req.user.google_id && payload.email?.toLowerCase() !== req.user.email?.toLowerCase()) {
        return res.status(401).json({ error: 'Google account does not match this user' });
      }
    } else {
      if (password && !User.comparePassword(req.user, password)) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }
    }

    await User.delete(req.user.id);

    if (io) {
      io.emit('user:deleted', {
        userId: req.user.id
      });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Error deleting account' });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const sessions = (await Session.findByUserId(req.user.id)).map(session => ({
      id: session.id,
      device: session.device,
      ip: session.ip,
      createdAt: session.created_at,
      current: session.token === req.token
    }));

    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching sessions' });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const targetSession = await Session.findById(parseInt(sessionId));
    if (!targetSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (targetSession.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to revoke this session' });
    }

    await Session.deleteById(parseInt(sessionId));

    const socketIO = req.app?.get('io') || io;
    if (socketIO) {
      // 1. Broadcast active session list refresh to all user's open devices
      socketIO.to(`user:${req.user.id}`).emit('session:updated', {
        type: 'revoked',
        sessionId: parseInt(sessionId)
      });

      // 2. Broadcast targeted auth:session_revoked event
      socketIO.to(`user:${req.user.id}`).emit('auth:session_revoked', {
        sessionId: parseInt(sessionId),
        token: targetSession.token
      });

      // 3. Disconnect any active sockets matching the revoked token
      try {
        const sockets = await socketIO.in(`user:${req.user.id}`).fetchSockets();
        for (const s of sockets) {
          if (s.token === targetSession.token || s.handshake?.auth?.token === targetSession.token) {
            s.emit('auth:session_revoked', { sessionId: parseInt(sessionId), token: targetSession.token });
            s.disconnect(true);
          }
        }
      } catch (e) {
        console.error('Socket disconnect error on session revoke:', e);
      }
    }

    res.json({ message: 'Session revoked successfully' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Error revoking session' });
  }
};

const lastEmailSentTimes = new Map();

function checkEmailCooldown(email, cooldownSeconds = 60) {
  const cleanEmail = email ? email.toLowerCase().trim() : '';
  if (!cleanEmail) return 0;
  const lastSent = lastEmailSentTimes.get(cleanEmail);
  const now = Date.now();
  if (lastSent && (now - lastSent) < cooldownSeconds * 1000) {
    const remaining = Math.ceil((cooldownSeconds * 1000 - (now - lastSent)) / 1000);
    return remaining;
  }
  lastEmailSentTimes.set(cleanEmail, now);
  return 0;
}

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const remaining = checkEmailCooldown(email, 60);
    if (remaining > 0) {
      return res.status(429).json({ error: `Please wait ${remaining} seconds before requesting another code.` });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.json({ message: 'If an account exists, a reset code has been sent' });
    }

    const code = await VerificationCode.create(email, user.id, 'reset');
    await sendPasswordResetEmail(email, code);

    res.json({ message: 'If an account exists, a reset code has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Error processing request' });
  }
};

const verifiedResetEmails = new Map();

exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const isValid = await VerificationCode.verify(email, code, 'reset');
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    verifiedResetEmails.set(email, { verifiedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 });

    res.json({ message: 'Code verified', verified: true });
  } catch (error) {
    console.error('Verify reset code error:', error);
    res.status(500).json({ error: 'Error verifying code' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    const verified = verifiedResetEmails.get(email);
    if (!verified || verified.expiresAt < Date.now()) {
      verifiedResetEmails.delete(email);
      return res.status(400).json({ error: 'Session expired. Please start over.' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await User.updatePassword(user.id, newPassword);
    verifiedResetEmails.delete(email);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Error resetting password' });
  }
};

exports.toggle2FA = async (req, res) => {
  try {
    const { enabled, password } = req.body;

    if (password && req.user.password) {
      if (!User.comparePassword(req.user, password)) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }
    }

    await User.setTwoFactor(req.user.id, !!enabled);
    const updatedUser = await User.findById(req.user.id);

    res.json({
      message: enabled ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled',
      twoFactorEnabled: !!enabled,
      user: User.toPublicJSON(updatedUser)
    });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ error: 'Error updating 2FA settings' });
  }
};

exports.verifyPasswordFor2FA = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.password) {
      return res.json({ verified: true, googleOnly: true });
    }

    if (!password || !User.comparePassword(user, password)) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    res.json({ verified: true });
  } catch (error) {
    console.error('Verify password for 2FA error:', error);
    res.status(500).json({ error: 'Error verifying password' });
  }
};

exports.sendDevicePrompt = async (req, res) => {
  try {
    const { identifier, email } = req.body;
    const searchId = (identifier || email || '').trim();
    if (!searchId) return res.status(400).json({ error: 'Identifier is required' });

    const user = await User.findByIdentifier(searchId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';
    const geo = await getIpLocation(clientIp);

    const challengeId = 'dp_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    const challenge = {
      id: challengeId,
      userId: user.id,
      email: user.email,
      device: parseDeviceName(userAgent),
      ip: clientIp,
      location: geo,
      createdAt: new Date().toISOString(),
      expiresAt,
      status: 'pending'
    };
    deviceChallenges.set(challengeId, challenge);

    const socketIO = req.app?.get('io') || io;
    if (socketIO) {
      socketIO.to(`user:${user.id}`).emit('auth:device_prompt', {
        challengeId,
        device: challenge.device,
        ip: challenge.ip,
        location: challenge.location,
        createdAt: challenge.createdAt,
        expiresAt: challenge.expiresAt
      });
    }

    res.json({
      challengeId,
      expiresAt,
      device: challenge.device,
      location: challenge.location
    });
  } catch (error) {
    console.error('Send device prompt error:', error);
    res.status(500).json({ error: 'Error sending device prompt' });
  }
};

exports.checkDevicePrompt = async (req, res) => {
  try {
    const { challengeId } = req.params;
    const challenge = deviceChallenges.get(challengeId);

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found', status: 'not_found' });
    }

    if (Date.now() > challenge.expiresAt) {
      challenge.status = 'expired';
      return res.json({ status: 'expired', error: 'This sign-in request has expired.' });
    }

    if (challenge.status === 'approved') {
      return res.json({
        status: 'approved',
        token: challenge.token,
        user: challenge.user
      });
    }

    if (challenge.status === 'declined') {
      return res.json({
        status: 'declined',
        error: 'Sign-in request was declined from your active device.'
      });
    }

    res.json({ status: 'pending', expiresAt: challenge.expiresAt });
  } catch (error) {
    console.error('Check device prompt error:', error);
    res.status(500).json({ error: 'Error checking prompt status' });
  }
};

exports.getPendingDevicePrompts = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = Date.now();
    const activePrompts = [];

    for (const [challengeId, challenge] of deviceChallenges.entries()) {
      if (challenge.userId === userId && challenge.status === 'pending') {
        if (now > challenge.expiresAt) {
          challenge.status = 'expired';
        } else {
          activePrompts.push({
            challengeId: challenge.id,
            device: challenge.device,
            ip: challenge.ip,
            location: challenge.location,
            createdAt: challenge.createdAt,
            expiresAt: challenge.expiresAt
          });
        }
      }
    }

    res.json({ prompts: activePrompts });
  } catch (error) {
    console.error('Get pending device prompts error:', error);
    res.status(500).json({ error: 'Error fetching pending prompts' });
  }
};

exports.respondDevicePrompt = async (req, res) => {
  try {
    const { challengeId, action } = req.body;
    const challenge = deviceChallenges.get(challengeId);

    if (!challenge) {
      return res.status(404).json({ error: 'Sign-in request not found or already completed.' });
    }

    if (Date.now() > challenge.expiresAt) {
      challenge.status = 'expired';
      return res.status(400).json({ error: 'EXPIRED', message: 'This sign-in request has expired.' });
    }

    if (challenge.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to respond to this request.' });
    }

    const socketIO = req.app?.get('io') || io;

    if (action === 'approve') {
      challenge.status = 'approved';
      const user = await User.findById(challenge.userId);
      const token = generateToken(user.id);

      await Session.create(user.id, token, challenge.device || 'Unknown device', challenge.ip || req.ip);
      await User.updateStatus(user.id, 'online');

      if (socketIO) {
        socketIO.to(`user:${user.id}`).emit('session:updated', { type: 'created' });
        socketIO.to(`user:${user.id}`).emit('auth:device_prompt_resolved', {
          challengeId,
          status: 'approved'
        });
      }

      challenge.token = token;
      challenge.user = User.toPublicJSON(user);

      return res.json({ success: true, message: 'Sign-in request approved!' });
    } else {
      challenge.status = 'declined';

      if (socketIO) {
        socketIO.to(`user:${challenge.userId}`).emit('auth:device_prompt_resolved', {
          challengeId,
          status: 'declined'
        });
      }

      return res.json({ success: true, message: 'Sign-in request declined.' });
    }
  } catch (error) {
    console.error('Respond device prompt error:', error);
    res.status(500).json({ error: 'Error responding to device prompt' });
  }
};

exports.send2FAEmailCode = async (req, res) => {
  try {
    const { identifier, email } = req.body;
    const searchId = (identifier || email || '').trim();
    if (!searchId) return res.status(400).json({ error: 'Identifier is required' });

    const user = await User.findByIdentifier(searchId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const code = await VerificationCode.create(user.email, user.id, 'login');
    pending2FA.set(user.email, { userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 });

    const emailSent = await sendVerificationEmail(user.email, code);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.json({
      success: true,
      message: `Verification code sent to ${maskEmail(user.email)}`,
      email: user.email,
      maskedEmail: maskEmail(user.email)
    });
  } catch (error) {
    console.error('Send 2FA email code error:', error);
    res.status(500).json({ error: 'Error sending verification code' });
  }
};


