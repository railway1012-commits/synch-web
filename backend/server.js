require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const { initDatabase } = require('./database');
const { socketAuth, auth } = require('./middleware/auth');
const socketHandler = require('./sockets/socketHandler');
const { initEmailService } = require('./services/emailService');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const messageRoutes = require('./routes/message');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const authController = require('./controllers/authController');
const chatController = require('./controllers/chatController');
const messageController = require('./controllers/messageController');
const userController = require('./controllers/userController');
const adminController = require('./controllers/adminController');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'middleware', 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.post('/api/reports', auth, userController.submitReport);
app.post('/api/report', auth, userController.submitReport);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/auth.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/auth.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/auth.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/chat.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/settings.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
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
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
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
adminController.setIO(io);

const os = require('os');
const https = require('https');
const selfsigned = require('selfsigned');

// Generate SSL cert for secure context on LAN mobile devices
const pems = selfsigned.generate([{ name: 'commonName', value: 'synch.local' }], { days: 365 });
const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app);
io.attach(httpsServer);

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
  ║   LAN Access:     http://${localIp}:${PORT}               ║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
      `);
      initDatabase().catch(err => console.error('Database init error:', err));
    });

    if (process.env.ENABLE_LOCAL_HTTPS === 'true') {
      try {
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
