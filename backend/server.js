require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const { initDatabase, User, Session } = require('./database');
const jwt = require('jsonwebtoken');
const { socketAuth, auth } = require('./middleware/auth');
const socketHandler = require('./sockets/socketHandler');
const { initEmailService } = require('./services/emailService');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const messageRoutes = require('./routes/message');
const userRoutes = require('./routes/user');
const authController = require('./controllers/authController');
const chatController = require('./controllers/chatController');
const messageController = require('./controllers/messageController');
const userController = require('./controllers/userController');

const app = express();
app.set('trust proxy', 1);

// CORS allowlist: only the app origins may make browser requests
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://synchapp.dev,https://www.synchapp.dev,http://localhost:3000,http://localhost:5173,http://localhost:8081')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Clean URLs / Strip .html extensions from all GET requests ────────────────
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.endsWith('.html')) {
    const clean = req.path.slice(0, -5);
    const query = req.url.slice(req.path.length);
    if (clean === '/index') {
      return res.redirect(301, '/' + query);
    }
    if (clean === '/settings') {
      return res.redirect(301, '/chat' + (query ? `${query}&tab=settings` : '?tab=settings'));
    }
    if (clean === '/auth') {
      return res.redirect(301, '/login' + query);
    }
    return res.redirect(301, clean + query);
  }
  next();
});

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Android Release APK Download Route ─────────────────────────────────────────
app.get(['/downloads/synch.apk', '/downloads/synch-release.apk', '/synch.apk', '/download/app'], (req, res) => {
  // APK download removed: distribute the app through the Play Store / signed releases instead.
  res.status(410).json({ error: 'Download no longer available' });
});

app.use(express.static(path.join(__dirname, '../frontend'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes);
app.use('/api/friends', userRoutes);
app.post('/api/reports', auth, userController.submitReport);
app.post('/api/report', auth, userController.submitReport);


function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getAuthenticatedUser(req) {
  const token = getCookie(req, 'synch_token');
  if (!token || token === 'logged_out') return null;
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded || !decoded.userId) return null;
    // Cookie path must respect session revocation too
    const session = await Session.findByToken(token);
    if (!session) return null;
    const user = await User.findById(decoded.userId);
    return user || null;
  } catch (e) {
    return null;
  }
}

app.get('/', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (user && user.profile_complete !== false) {
    return res.redirect(302, '/chat');
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/login', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (user && user.profile_complete !== false) {
    return res.redirect(302, '/chat');
  }
  res.sendFile(path.join(__dirname, '../frontend/auth.html'));
});

app.get('/signup', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (user && user.profile_complete !== false) {
    return res.redirect(302, '/chat');
  }
  res.sendFile(path.join(__dirname, '../frontend/auth.html'));
});

app.get('/auth', (req, res) => {
  res.redirect(301, '/login');
});

app.get('/chat', async (req, res) => {
  const token = getCookie(req, 'synch_token');
  if (!token || token === 'logged_out') {
    return res.redirect(302, '/login');
  }
  const user = await getAuthenticatedUser(req);
  if (!user || user.profile_complete === false) {
    return res.redirect(302, '/login');
  }
  res.sendFile(path.join(__dirname, '../frontend/chat.html'));
});

app.get('/settings', (req, res) => {
  const query = req.url.slice(req.path.length);
  res.redirect(301, '/chat' + (query ? `${query}&tab=settings` : '?tab=settings'));
});

app.get('/admin', (req, res) => {
  // Admin has been removed from the main app (separate admin service: admin.synch.app)
  res.redirect(301, '/');
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/forgot-password.html'));
});

app.get('/401', (req, res) => {
  res.status(401).sendFile(path.join(__dirname, '../frontend/401.html'));
});

app.get('/unauthorized', (req, res) => {
  res.status(401).sendFile(path.join(__dirname, '../frontend/401.html'));
});

app.get('/404', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../frontend/404.html'));
});

// 404 Catch-All Handler for unmatched routes & pages
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '../frontend/404.html'));
});

// Global Express Error Handler (Handles Multer, validation, payload errors gracefully)
const multer = require('multer');
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum allowed size is 100MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    console.error('Express Error:', err.message || err);
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message || 'Request failed' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
  next();
});

// Process crash guards
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

io.use(socketAuth);
socketHandler(io);
authController.setIO(io);
chatController.setIO(io);
messageController.setIO(io);
userController.setIO(io);

const os = require('os');

async function startServer() {
  try {
    const PORT = process.env.PORT || config.PORT || 3000;
    const HOST = '0.0.0.0';

    server.listen(PORT, HOST, () => {
      console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║   SYNCH Server Running!                                    ║
  ║                                                            ║
  ║   Listen Address: http://${HOST}:${PORT}                   ║
  ║   Local Access:   http://localhost:${PORT}                 ║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
      `);
      initDatabase().catch(err => console.error('Database init error:', err));
    });

    if (process.env.ENABLE_LOCAL_HTTPS === 'true') {
      try {
        const https = require('https');
        const selfsigned = require('selfsigned');
        const pems = selfsigned.generate([{ name: 'commonName', value: 'synch.local' }], { days: 365 });
        const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app);
        io.attach(httpsServer);
        const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
        httpsServer.listen(HTTPS_PORT, HOST, () => {
          console.log(`LAN HTTPS Server running on https://${HOST}:${HTTPS_PORT}`);
        });
      } catch (e) {
        console.warn('Optional HTTPS server notice:', e.message);
      }
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io };
