const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const dbUrl = process.env.DATABASE_URL || 
  process.env.DATABASE_PUBLIC_URL || 
  process.env.DATABASE_PRIVATE_URL || 
  process.env.POSTGRES_URL || 
  process.env.POSTGRESQL_URL;

const isDisableSsl = !dbUrl || 
  dbUrl.includes('localhost') || 
  dbUrl.includes('127.0.0.1') || 
  dbUrl.includes('host.docker.internal') ||
  dbUrl.includes('railway.internal') ||
  dbUrl.includes('.railway') ||
  dbUrl.includes('railway') ||
  dbUrl.includes('sslmode=disable') ||
  process.env.DB_SSL === 'false';

const pool = new Pool({
  connectionString: dbUrl,
  ssl: (process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : (isDisableSsl ? false : { rejectUnauthorized: false }),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

async function initDatabase() {
  let client;
  try {
    client = await pool.connect();
    console.log('PostgreSQL database connected successfully');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    if (process.env.DATABASE_PUBLIC_URL && process.env.DATABASE_URL !== process.env.DATABASE_PUBLIC_URL) {
      console.warn('Railway Tip: If private networking DNS is unreachable, set DATABASE_URL variable in Railway to reference your DATABASE_PUBLIC_URL.');
    }
    return;
  }
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        avatar TEXT,
        display_name TEXT,
        bio TEXT DEFAULT 'Hey there! I am using Synch.',
        google_id TEXT UNIQUE,
        dob DATE,
        status TEXT DEFAULT 'offline',
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        settings TEXT DEFAULT '{}',
        blocked_users TEXT DEFAULT '[]',
        email_verified BOOLEAN DEFAULT FALSE,
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        profile_complete BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT DEFAULT 'signup',
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        device TEXT,
        ip TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        type TEXT DEFAULT 'private',
        name TEXT,
        avatar TEXT,
        admin_id INTEGER,
        last_message_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_participants (
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (chat_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT DEFAULT 'text',
        content TEXT DEFAULT '',
        media_url TEXT,
        media_duration REAL,
        reply_to_id INTEGER REFERENCES messages(id),
        edited BOOLEAN DEFAULT FALSE,
        edited_at TIMESTAMP,
        deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        pinned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS message_reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        emoji TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS message_reads (
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS friend_requests (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (sender_id, receiver_id)
      );

      CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id);
      CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO system_settings (key, value) VALUES
        ('maintenance_mode', 'false'),
        ('allow_signups', 'true'),
        ('allow_voice_notes', 'true'),
        ('allow_calls', 'true'),
        ('allow_file_uploads', 'true'),
        ('max_upload_size_mb', '10')
      ON CONFLICT (key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS ip_blacklist (
        id SERIAL PRIMARY KEY,
        ip TEXT UNIQUE NOT NULL,
        reason TEXT DEFAULT 'Violating terms of service',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS word_blacklist (
        id SERIAL PRIMARY KEY,
        word TEXT UNIQUE NOT NULL,
        action TEXT DEFAULT 'block',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        admin_username TEXT,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        ip TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_warnings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        moderator_username TEXT,
        reason TEXT NOT NULL,
        severity TEXT DEFAULT 'warning',
        acknowledged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_warnings_user ON user_warnings(user_id);

      CREATE TABLE IF NOT EXISTS user_reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reporter_username TEXT,
        reported_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        reported_username TEXT,
        chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
        message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT DEFAULT 'pending',
        resolution TEXT,
        resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);

      CREATE TABLE IF NOT EXISTS custom_badges (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        icon TEXT DEFAULT '🛡️',
        color TEXT DEFAULT '#0084FF',
        bg_color TEXT DEFAULT 'rgba(0, 132, 255, 0.15)',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_webhooks (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        events TEXT DEFAULT '["ban","warn","report","emergency"]',
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_ip_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ip TEXT NOT NULL,
        user_agent TEXT,
        device_fingerprint TEXT,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_ip_history_user ON user_ip_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_ip_history_ip ON user_ip_history(ip);

      CREATE TABLE IF NOT EXISTS ban_appeals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT,
        email TEXT,
        ban_reason TEXT,
        appeal_text TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_notes TEXT,
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ban_appeals_user ON ban_appeals(user_id);
      CREATE INDEX IF NOT EXISTS idx_ban_appeals_status ON ban_appeals(status);
    `);

    // Safe column migrations
    const safeQuery = async (sql) => {
      try {
        await client.query(sql);
      } catch (err) {
        console.log(`Migration step notice: ${err.message}`);
      }
    };

    await safeQuery(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL;`);
    await safeQuery(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT 'Hey there! I am using Synch.';`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT TRUE;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT 'Your account has been suspended for violating our terms of service.';`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP NULL;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP NULL;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by INTEGER NULL;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_shadowbanned BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS badge TEXT DEFAULT NULL;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes TEXT DEFAULT NULL;`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';`);
    await safeQuery(`UPDATE users SET role = 'superadmin' WHERE email = 'noreply.synch@gmail.com';`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);`);
    await safeQuery(`ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS ip TEXT;`);

    console.log('PostgreSQL database initialized');
  } catch (err) {
    console.error('Error during database initialization:', err.message);
  } finally {
    client.release();
  }
}

const VerificationCode = {
  create: async (email, userId = null, type = 'signup') => {
    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query('DELETE FROM verification_codes WHERE LOWER(TRIM(email)) = $1 AND type = $2 AND used = FALSE', [cleanEmail, type]);
    await pool.query(
      'INSERT INTO verification_codes (user_id, email, code, type, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [userId, cleanEmail, code, type, expiresAt]
    );
    return code;
  },

  verify: async (email, code, type = 'signup') => {
    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const cleanCode = code ? code.toString().trim() : '';

    const result = await pool.query(
      `SELECT * FROM verification_codes
       WHERE LOWER(TRIM(email)) = $1 AND TRIM(code) = $2 AND type = $3 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail, cleanCode, type]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const expiry = new Date(row.expires_at).getTime();
      if (expiry > Date.now() - 60000) {
        await pool.query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [row.id]);
        return true;
      } else {
        console.warn(`Verification code for ${cleanEmail} expired (expired at ${row.expires_at}, current: ${new Date().toISOString()})`);
      }
    } else {
      console.warn(`Verification code match failed for email: '${cleanEmail}', type: '${type}', code: '${cleanCode}'`);
    }
    return false;
  }
};

function generatePlaceholderUsername() {
  return 'user' + Math.floor(100000 + Math.random() * 900000);
}

function safeJsonParse(val, fallback = {}) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
}

const User = {
  create: async (username, email, password, emailVerified = false, googleId = null, avatar = null, profileComplete = true, role = 'user') => {
    const hashedPassword = password ? bcrypt.hashSync(password, 12) : null;
    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const finalUsername = username || generatePlaceholderUsername();
    const userRole = (cleanEmail && cleanEmail === 'noreply.synch@gmail.com') ? 'superadmin' : (role || 'user');
    const result = await pool.query(
      `INSERT INTO users (username, email, password, email_verified, google_id, avatar, profile_complete, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [finalUsername, cleanEmail, hashedPassword, emailVerified, googleId, avatar, profileComplete, userRole]
    );
    return User.findById(result.rows[0].id);
  },

  findByGoogleId: async (googleId) => {
    const result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    user.settings = safeJsonParse(user.settings, {});
    user.blocked_users = safeJsonParse(user.blocked_users, []);
    return user;
  },

  findByIdentifier: async (identifier) => {
    if (!identifier) return null;
    const cleanId = identifier.toLowerCase().trim();
    if (cleanId.includes('@')) {
      return User.findByEmail(cleanId);
    }
    const result = await pool.query('SELECT * FROM users WHERE LOWER(TRIM(username)) = $1 OR LOWER(TRIM(email)) = $1', [cleanId]);
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    user.settings = safeJsonParse(user.settings, {});
    user.blocked_users = safeJsonParse(user.blocked_users, []);
    return user;
  },

  setGoogleId: async (id, googleId) => {
    await pool.query('UPDATE users SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [googleId, id]);
  },

  removeGoogleId: async (id) => {
    await pool.query('UPDATE users SET google_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  },

  setDob: async (id, dob) => {
    await pool.query('UPDATE users SET dob = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [dob, id]);
  },

  markProfileComplete: async (id) => {
    await pool.query('UPDATE users SET profile_complete = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  },

  findById: async (id) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    user.settings = safeJsonParse(user.settings, {});
    user.blocked_users = safeJsonParse(user.blocked_users, []);
    return user;
  },

  findByEmail: async (email) => {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    const result = await pool.query('SELECT * FROM users WHERE LOWER(TRIM(email)) = $1', [cleanEmail]);
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    user.settings = safeJsonParse(user.settings, {});
    user.blocked_users = safeJsonParse(user.blocked_users, []);
    return user;
  },

  findByUsername: async (username) => {
    if (!username) return null;
    const cleanUsername = username.toLowerCase().trim();
    const result = await pool.query('SELECT * FROM users WHERE LOWER(TRIM(username)) = $1', [cleanUsername]);
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    user.settings = safeJsonParse(user.settings, {});
    user.blocked_users = safeJsonParse(user.blocked_users, []);
    return user;
  },

  findAll: async (excludeId, search = '') => {
    let result;
    if (search) {
      result = await pool.query(
        `SELECT id, username, display_name, avatar, status, last_seen
         FROM users WHERE id != $1 AND is_deleted = FALSE AND (username ILIKE $2 OR display_name ILIKE $2)
         LIMIT 50`,
        [excludeId, `%${search}%`]
      );
    } else {
      result = await pool.query(
        'SELECT id, username, display_name, avatar, status, last_seen FROM users WHERE id != $1 AND is_deleted = FALSE LIMIT 50',
        [excludeId]
      );
    }
    return result.rows;
  },

  findAllWithFriendStatus: async (currentUserId, search = '') => {
    const searchClause = search ? `AND (u.username ILIKE $2 OR u.display_name ILIKE $2)` : '';
    const params = search ? [currentUserId, `%${search}%`] : [currentUserId];
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.status, u.last_seen, u.badge,
              fr.id as request_id,
              fr.sender_id as request_sender_id,
              fr.receiver_id as request_receiver_id,
              fr.status as request_status,
              EXISTS(
                SELECT 1 FROM chat_participants cp1
                JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id AND cp2.user_id != cp1.user_id
                JOIN chats c ON cp1.chat_id = c.id AND c.type = 'private'
                WHERE cp1.user_id = u.id AND cp2.user_id = $1
              ) as is_friend
       FROM users u
       LEFT JOIN friend_requests fr ON 
         ((fr.sender_id = $1 AND fr.receiver_id = u.id) OR 
          (fr.receiver_id = $1 AND fr.sender_id = u.id))
         AND fr.status = 'pending'
       WHERE u.id != $1 AND u.is_deleted = FALSE ${searchClause}
       ORDER BY u.username ASC
       LIMIT 50`,
      params
    );
    return result.rows.map(u => {
      let friendStatus = 'none';
      if (u.is_friend || u.request_status === 'accepted') {
        friendStatus = 'friends';
      } else if (u.request_status === 'pending') {
        friendStatus = (u.request_sender_id === currentUserId) ? 'pending_outgoing' : 'pending_incoming';
      }
      return {
        _id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatar: u.avatar,
        status: u.status,
        lastSeen: u.last_seen,
        badge: u.badge || null,
        friendStatus,
        requestId: u.request_id
      };
    });
  },

  findByIdWithFriendStatus: async (targetUserId, currentUserId) => {
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.status, u.last_seen, u.is_deleted, u.badge,
              fr.id as request_id,
              fr.sender_id as request_sender_id,
              fr.receiver_id as request_receiver_id,
              fr.status as request_status,
              EXISTS(
                SELECT 1 FROM chat_participants cp1
                JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id AND cp2.user_id != cp1.user_id
                JOIN chats c ON cp1.chat_id = c.id AND c.type = 'private'
                WHERE cp1.user_id = u.id AND cp2.user_id = $2
              ) as is_friend
       FROM users u
       LEFT JOIN friend_requests fr ON 
         ((fr.sender_id = $2 AND fr.receiver_id = u.id) OR 
          (fr.receiver_id = $2 AND fr.sender_id = u.id))
         AND fr.status = 'pending'
       WHERE u.id = $1`,
      [targetUserId, currentUserId]
    );
    if (result.rows.length === 0) return null;
    const u = result.rows[0];
    let friendStatus = 'none';
    if (u.is_friend || u.request_status === 'accepted') {
      friendStatus = 'friends';
    } else if (u.request_status === 'pending') {
      friendStatus = (u.request_sender_id === currentUserId) ? 'pending_outgoing' : 'pending_incoming';
    }
    return {
      _id: u.id,
      username: u.is_deleted ? 'Account Unavailable' : u.username,
      displayName: u.display_name,
      avatar: u.is_deleted ? null : u.avatar,
      status: u.status,
      lastSeen: u.last_seen,
      isDeleted: !!u.is_deleted,
      badge: u.badge || null,
      friendStatus,
      requestId: u.request_id
    };
  },

  updateStatus: async (id, status) => {
    await pool.query(
      'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, id]
    );
  },

  updateSettings: async (id, settings) => {
    const user = await User.findById(id);
    const newSettings = { ...user.settings, ...settings };
    await pool.query(
      'UPDATE users SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(newSettings), id]
    );
  },

  updateUsername: async (id, username) => {
    await pool.query('UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [username, id]);
  },

  updatePassword: async (id, password) => {
    const hashedPassword = bcrypt.hashSync(password, 12);
    await pool.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, id]);
  },

  updateAvatar: async (id, avatar) => {
    await pool.query('UPDATE users SET avatar = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [avatar, id]);
  },

  verifyEmail: async (id) => {
    await pool.query('UPDATE users SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  },

  comparePassword: (user, password) => {
    if (!user.password) return false;
    return bcrypt.compareSync(password, user.password);
  },

  delete: async (id) => {
    await pool.query(
      `UPDATE users SET
        username = 'unavailable_' || id,
        email = 'deleted_' || id || '@synch.invalid',
        password = NULL,
        google_id = NULL,
        avatar = NULL,
        status = 'offline',
        settings = '{}',
        blocked_users = '[]',
        is_deleted = TRUE,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM verification_codes WHERE user_id = $1', [id]);
  },

  blockUser: async (userId, blockedId) => {
    const user = await User.findById(userId);
    if (!user.blocked_users.includes(blockedId)) {
      user.blocked_users.push(blockedId);
      await pool.query('UPDATE users SET blocked_users = $1 WHERE id = $2', [JSON.stringify(user.blocked_users), userId]);
    }
  },

  unblockUser: async (userId, blockedId) => {
    const user = await User.findById(userId);
    user.blocked_users = user.blocked_users.filter(id => id !== blockedId);
    await pool.query('UPDATE users SET blocked_users = $1 WHERE id = $2', [JSON.stringify(user.blocked_users), userId]);
  },

  getBlockedUsers: async (userId) => {
    const user = await User.findById(userId);
    if (!user.blocked_users.length) return [];
    const result = await pool.query(
      `SELECT id, username, avatar FROM users WHERE id = ANY($1)`,
      [user.blocked_users]
    );
    return result.rows;
  },

  update: async (id, fields = {}) => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return User.findById(id);

    const keyToCol = {
      isBanned: 'is_banned',
      is_banned: 'is_banned',
      banReason: 'ban_reason',
      ban_reason: 'ban_reason',
      bannedAt: 'banned_at',
      banned_at: 'banned_at',
      bannedUntil: 'banned_until',
      banned_until: 'banned_until',
      bannedBy: 'banned_by',
      banned_by: 'banned_by',
      isShadowbanned: 'is_shadowbanned',
      is_shadowbanned: 'is_shadowbanned',
      isFrozen: 'is_frozen',
      is_frozen: 'is_frozen',
      displayName: 'display_name',
      display_name: 'display_name',
      twoFactorEnabled: 'two_factor_enabled',
      two_factor_enabled: 'two_factor_enabled',
      profileComplete: 'profile_complete',
      profile_complete: 'profile_complete',
      isDeleted: 'is_deleted',
      is_deleted: 'is_deleted',
      adminNotes: 'admin_notes',
      admin_notes: 'admin_notes',
      status: 'status',
      badge: 'badge',
      role: 'role',
      username: 'username',
      email: 'email',
      bio: 'bio',
      avatar: 'avatar',
      dob: 'dob'
    };

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const key of keys) {
      const col = keyToCol[key] || key;
      setClauses.push(`${col} = $${idx++}`);
      values.push(fields[key]);
    }

    values.push(id);
    const query = `UPDATE users SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0] ? User.findById(id) : null;
  },

  setRole: async (id, role) => {
    await pool.query('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [role, id]);
  },

  toPublicJSON: (user) => {
    if (!user) return null;
    if (user.is_deleted) {
      return {
        _id: user.id,
        username: 'Account Unavailable',
        email: '',
        avatar: null,
        status: 'offline',
        badge: null,
        role: 'user',
        isDeleted: true
      };
    }
    return {
      _id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      avatar: user.avatar,
      status: user.status,
      lastSeen: user.last_seen,
      badge: user.badge || null,
      role: user.role || (user.email?.toLowerCase() === 'noreply.synch@gmail.com' ? 'superadmin' : 'user'),
      settings: user.settings,
      twoFactorEnabled: !!user.two_factor_enabled,
      dob: user.dob,
      googleLinked: !!user.google_id,
      hasPassword: !!user.password,
      profileComplete: !!user.profile_complete,
      isDeleted: false
    };
  },

  setTwoFactor: async (id, enabled) => {
    await pool.query('UPDATE users SET two_factor_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [enabled, id]);
  }
};


const Session = {
  create: async (userId, token, device, ip) => {
    const result = await pool.query(
      'INSERT INTO sessions (user_id, token, device, ip) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, token, device, ip]
    );
    return result.rows[0];
  },

  findByUserId: async (userId) => {
    const result = await pool.query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows;
  },

  findById: async (id) => {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
    return result.rows[0];
  },

  findByToken: async (token) => {
    const result = await pool.query('SELECT * FROM sessions WHERE token = $1', [token]);
    return result.rows[0];
  },

  deleteByToken: async (token) => {
    const result = await pool.query('DELETE FROM sessions WHERE token = $1 RETURNING *', [token]);
    return result.rows[0];
  },

  deleteById: async (id) => {
    const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }
};

const Chat = {
  create: async (type, name, adminId) => {
    const result = await pool.query(
      'INSERT INTO chats (type, name, admin_id) VALUES ($1, $2, $3) RETURNING id',
      [type, name, adminId]
    );
    return Chat.findById(result.rows[0].id);
  },

  findById: async (id) => {
    const result = await pool.query('SELECT * FROM chats WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    const chat = result.rows[0];
    chat.participants = await Chat.getParticipants(id);
    return chat;
  },

  findPrivateChat: async (user1Id, user2Id) => {
    const result = await pool.query(
      `SELECT c.* FROM chats c
       JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = $1
       JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = $2
       WHERE c.type = 'private'`,
      [user1Id, user2Id]
    );
    if (result.rows.length === 0) return null;
    const chat = result.rows[0];
    chat.participants = await Chat.getParticipants(chat.id);
    return chat;
  },

  findByUserId: async (userId) => {
    const result = await pool.query(
      `SELECT c.*, 
              m.content as last_message_content, 
              m.type as last_message_type, 
              m.created_at as last_message_time,
              m.sender_id as last_message_sender_id,
              (
                SELECT COUNT(*) 
                FROM messages msg
                WHERE msg.chat_id = c.id 
                  AND msg.sender_id != $1 
                  AND msg.deleted = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM message_reads mr 
                    WHERE mr.message_id = msg.id AND mr.user_id = $1
                  )
              )::int as unread_count
       FROM chats c
       JOIN chat_participants cp ON c.id = cp.chat_id
       LEFT JOIN messages m ON c.last_message_id = m.id
       WHERE cp.user_id = $1
       ORDER BY c.updated_at DESC`,
      [userId]
    );
    const chats = [];
    for (const chat of result.rows) {
      chat.participants = await Chat.getParticipants(chat.id);
      chat.unreadCount = parseInt(chat.unread_count) || 0;
      if (chat.last_message_id) {
        chat.lastMessage = {
          content: chat.last_message_content,
          type: chat.last_message_type,
          senderId: chat.last_message_sender_id,
          createdAt: chat.last_message_time
        };
      }
      chats.push(chat);
    }
    return chats;
  },

  addParticipant: async (chatId, userId) => {
    await pool.query(
      'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [chatId, userId]
    );
  },

  addParticipants: async (chatId, userIds) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    for (const uId of userIds) {
      await pool.query(
        'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [chatId, parseInt(uId)]
      );
    }
  },

  removeParticipant: async (chatId, userId) => {
    await pool.query(
      'DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
  },

  updateMetadata: async (chatId, { name, avatar }) => {
    const result = await pool.query(
      `UPDATE chats 
       SET name = COALESCE($1, name), avatar = COALESCE($2, avatar), updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING *`,
      [name || null, avatar || null, chatId]
    );
    return result.rows[0] ? Chat.findById(chatId) : null;
  },

  getParticipants: async (chatId) => {
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.status, u.last_seen, u.is_deleted, u.badge, u.role
       FROM users u
       JOIN chat_participants cp ON u.id = cp.user_id
       WHERE cp.chat_id = $1`,
      [chatId]
    );
    return result.rows.map(p => ({
      _id: p.id,
      username: p.is_deleted ? 'Account Unavailable' : p.username,
      displayName: p.display_name,
      avatar: p.is_deleted ? null : p.avatar,
      status: p.is_deleted ? 'offline' : p.status,
      lastSeen: p.is_deleted ? null : p.last_seen,
      badge: p.badge || null,
      role: p.role || 'user',
      isDeleted: !!p.is_deleted
    }));
  },

  updateLastMessage: async (chatId, messageId) => {
    await pool.query(
      'UPDATE chats SET last_message_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [messageId, chatId]
    );
  },

  delete: async (id) => {
    await pool.query('DELETE FROM chats WHERE id = $1', [id]);
  },

  isParticipant: async (chatId, userId) => {
    const result = await pool.query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
    return result.rows.length > 0;
  }
};

const Message = {
  create: async (chatId, senderId, type, content, mediaUrl, mediaDuration, replyToId) => {
    const result = await pool.query(
      `INSERT INTO messages (chat_id, sender_id, type, content, media_url, media_duration, reply_to_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [chatId, senderId, type, content, mediaUrl, mediaDuration, replyToId]
    );
    await Chat.updateLastMessage(chatId, result.rows[0].id);
    return Message.findById(result.rows[0].id);
  },

  findById: async (id) => {
    const result = await pool.query(
      `SELECT m.*, 
              u.username as sender_username, 
              u.display_name as sender_display_name,
              u.avatar as sender_avatar, 
              u.is_deleted as sender_is_deleted,
              u.badge as sender_badge,
              EXISTS(
                SELECT 1 FROM message_reads mr 
                WHERE mr.message_id = m.id AND mr.user_id != m.sender_id
              ) as is_read
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const msg = result.rows[0];
    msg.sender = {
      _id: msg.sender_id,
      username: msg.sender_is_deleted ? 'Account Unavailable' : msg.sender_username,
      displayName: msg.sender_display_name,
      avatar: msg.sender_is_deleted ? null : msg.sender_avatar,
      badge: msg.sender_badge || null,
      isDeleted: !!msg.sender_is_deleted
    };
    msg.reactions = await Message.getReactions(id);
    msg.read = !!msg.is_read;
    if (msg.reply_to_id) {
      msg.replyTo = await Message.findById(msg.reply_to_id);
    }
    return msg;
  },

  findByChatId: async (chatId, limit = 50, before = null) => {
    let query;
    let params;

    const baseSelect = `
      SELECT m.*, 
             u.username as sender_username, 
             u.display_name as sender_display_name,
             u.avatar as sender_avatar, 
             u.is_deleted as sender_is_deleted,
             u.badge as sender_badge,
             EXISTS(
               SELECT 1 FROM message_reads mr 
               WHERE mr.message_id = m.id AND mr.user_id != m.sender_id
             ) as is_read,
             COALESCE(
               (
                 SELECT json_agg(json_build_object(
                   'emoji', mr.emoji,
                   'user', json_build_object('_id', r_u.id, 'username', r_u.username)
                 ))
                 FROM message_reactions mr
                 JOIN users r_u ON mr.user_id = r_u.id
                 WHERE mr.message_id = m.id
               ),
               '[]'::json
             ) as reactions_json,
             (
               SELECT json_build_object(
                 '_id', rep.id,
                 'chat', rep.chat_id,
                 'content', rep.content,
                 'type', rep.type,
                 'mediaUrl', rep.media_url,
                 'sender', json_build_object(
                   '_id', rep_u.id,
                   'username', CASE WHEN rep_u.is_deleted THEN 'Account Unavailable' ELSE rep_u.username END,
                   'displayName', rep_u.display_name,
                   'avatar', CASE WHEN rep_u.is_deleted THEN null ELSE rep_u.avatar END
                 )
               )
               FROM messages rep
               JOIN users rep_u ON rep.sender_id = rep_u.id
               WHERE rep.id = m.reply_to_id
             ) as reply_json
      FROM messages m
      JOIN users u ON m.sender_id = u.id
    `;

    if (before) {
      query = `${baseSelect} WHERE m.chat_id = $1 AND m.created_at < $2 ORDER BY m.created_at DESC LIMIT $3`;
      params = [chatId, before, limit];
    } else {
      query = `${baseSelect} WHERE m.chat_id = $1 ORDER BY m.created_at DESC LIMIT $2`;
      params = [chatId, limit];
    }

    const result = await pool.query(query, params);
    const rows = result.rows.slice().reverse();

    return rows.map(msg => {
      msg.sender = {
        _id: msg.sender_id,
        username: msg.sender_is_deleted ? 'Account Unavailable' : msg.sender_username,
        displayName: msg.sender_display_name,
        avatar: msg.sender_is_deleted ? null : msg.sender_avatar,
        badge: msg.sender_badge || null,
        isDeleted: !!msg.sender_is_deleted
      };
      msg.reactions = msg.reactions_json || [];
      msg.read = !!msg.is_read;
      msg.replyTo = msg.reply_json || null;
      return msg;
    });
  },


  update: async (id, content) => {
    await pool.query(
      'UPDATE messages SET content = $1, edited = TRUE, edited_at = CURRENT_TIMESTAMP WHERE id = $2',
      [content, id]
    );
    return Message.findById(id);
  },

  delete: async (id) => {
    await pool.query(
      "UPDATE messages SET deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, content = '' WHERE id = $1",
      [id]
    );
  },

  togglePin: async (id) => {
    const msg = await Message.findById(id);
    await pool.query('UPDATE messages SET pinned = $1 WHERE id = $2', [!msg.pinned, id]);
    return !msg.pinned;
  },

  addReaction: async (messageId, userId, emoji) => {
    const existing = await pool.query(
      'SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [messageId, userId, emoji]
    );

    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM message_reactions WHERE id = $1', [existing.rows[0].id]);
    } else {
      await pool.query(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
        [messageId, userId, emoji]
      );
    }

    return Message.getReactions(messageId);
  },

  getReactions: async (messageId) => {
    const result = await pool.query(
      `SELECT mr.*, u.username
       FROM message_reactions mr
       JOIN users u ON mr.user_id = u.id
       WHERE mr.message_id = $1`,
      [messageId]
    );
    return result.rows.map(r => ({
      user: { _id: r.user_id, username: r.username },
      emoji: r.emoji
    }));
  },

  search: async (chatId, query) => {
    const result = await pool.query(
      `SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = $1 AND m.content ILIKE $2 AND m.deleted = FALSE
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [chatId, `%${query}%`]
    );
    return result.rows.map(msg => {
      msg.sender = { _id: msg.sender_id, username: msg.sender_username, avatar: msg.sender_avatar };
      return msg;
    });
  },

  markAsRead: async (messageIds, userId) => {
    for (const id of messageIds) {
      await pool.query(
        'INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userId]
      );
    }
  },

  toJSON: (msg) => ({
    _id: msg.id,
    chat: msg.chat_id,
    sender: msg.sender,
    type: msg.type,
    content: msg.content,
    mediaUrl: msg.media_url,
    mediaDuration: msg.media_duration,
    replyTo: msg.replyTo ? Message.toJSON(msg.replyTo) : null,
    reactions: msg.reactions || [],
    edited: !!msg.edited,
    editedAt: msg.edited_at,
    deleted: !!msg.deleted,
    deletedAt: msg.deleted_at,
    pinned: !!msg.pinned,
    read: !!msg.read || !!msg.is_read,
    createdAt: msg.created_at
  })
};

const FriendRequest = {
  send: async (senderId, receiverId) => {
    const result = await pool.query(
      `INSERT INTO friend_requests (sender_id, receiver_id, status, updated_at)
       VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT (sender_id, receiver_id)
       DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [senderId, receiverId]
    );
    return result.rows[0];
  },

  findById: async (id) => {
    const result = await pool.query(
      `SELECT fr.*, 
              s.username as sender_username, s.avatar as sender_avatar, s.status as sender_status,
              r.username as receiver_username, r.avatar as receiver_avatar, r.status as receiver_status
       FROM friend_requests fr
       JOIN users s ON fr.sender_id = s.id
       JOIN users r ON fr.receiver_id = r.id
       WHERE fr.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  getIncoming: async (userId) => {
    const result = await pool.query(
      `SELECT fr.id, fr.status, fr.created_at,
              u.id as user_id, u.username, u.avatar, u.status as user_status, u.last_seen
       FROM friend_requests fr
       JOIN users u ON fr.sender_id = u.id
       WHERE fr.receiver_id = $1 AND fr.status = 'pending' AND u.is_deleted = FALSE
       ORDER BY fr.created_at DESC`,
      [userId]
    );
    return result.rows.map(r => ({
      _id: r.id,
      status: r.status,
      createdAt: r.created_at,
      user: {
        _id: r.user_id,
        username: r.username,
        avatar: r.avatar,
        status: r.user_status,
        lastSeen: r.last_seen
      }
    }));
  },

  getOutgoing: async (userId) => {
    const result = await pool.query(
      `SELECT fr.id, fr.status, fr.created_at,
              u.id as user_id, u.username, u.avatar, u.status as user_status, u.last_seen
       FROM friend_requests fr
       JOIN users u ON fr.receiver_id = u.id
       WHERE fr.sender_id = $1 AND fr.status = 'pending' AND u.is_deleted = FALSE
       ORDER BY fr.created_at DESC`,
      [userId]
    );
    return result.rows.map(r => ({
      _id: r.id,
      status: r.status,
      createdAt: r.created_at,
      user: {
        _id: r.user_id,
        username: r.username,
        avatar: r.avatar,
        status: r.user_status,
        lastSeen: r.last_seen
      }
    }));
  },

  accept: async (requestId, userId) => {
    const result = await pool.query(
      `UPDATE friend_requests 
       SET status = 'accepted', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND receiver_id = $2 
       RETURNING *`,
      [requestId, userId]
    );
    if (result.rows.length === 0) return null;
    const fr = result.rows[0];

    let chat = await Chat.findPrivateChat(fr.sender_id, fr.receiver_id);
    if (!chat) {
      chat = await Chat.create('private', null, null);
      await Chat.addParticipant(chat.id, fr.sender_id);
      await Chat.addParticipant(chat.id, fr.receiver_id);
      chat = await Chat.findById(chat.id);
    }
    return { request: fr, chat };
  },

  decline: async (requestId, userId) => {
    const result = await pool.query(
      `DELETE FROM friend_requests WHERE id = $1 AND receiver_id = $2 RETURNING *`,
      [requestId, userId]
    );
    return result.rows[0] || null;
  },

  cancel: async (requestId, userId) => {
    const result = await pool.query(
      `DELETE FROM friend_requests WHERE id = $1 AND sender_id = $2 RETURNING *`,
      [requestId, userId]
    );
    return result.rows[0] || null;
  }
};

const AuditLog = {
  create: async (adminId, adminUsername, action, targetType, targetId, details = {}, ip = null) => {
    try {
      const result = await pool.query(
        `INSERT INTO admin_audit_logs (admin_id, admin_username, action, target_type, target_id, details, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [adminId, adminUsername, action, targetType, targetId, JSON.stringify(details), ip]
      );
      return result.rows[0];
    } catch (e) {
      console.error('Failed to create audit log:', e);
      return null;
    }
  },

  find: async ({ limit = 50, offset = 0, action = null, search = null }) => {
    let query = 'SELECT * FROM admin_audit_logs WHERE 1=1';
    const params = [];

    if (action) {
      params.push(action);
      query += ` AND action = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (admin_username ILIKE $${params.length} OR target_id ILIKE $${params.length} OR details::text ILIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC';
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    const countRes = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    return { logs: result.rows, total: parseInt(countRes.rows[0]?.count || 0) };
  }
};

const Warning = {
  create: async (userId, moderatorId, moderatorUsername, reason, severity = 'warning') => {
    const result = await pool.query(
      `INSERT INTO user_warnings (user_id, moderator_id, moderator_username, reason, severity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, moderatorId, moderatorUsername, reason, severity]
    );
    return result.rows[0];
  },

  findByUserId: async (userId) => {
    const result = await pool.query(
      'SELECT * FROM user_warnings WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  },

  delete: async (warningId) => {
    await pool.query('DELETE FROM user_warnings WHERE id = $1', [warningId]);
  }
};

const Report = {
  create: async (reporterId, reporterUsername, reportedId, reportedUsername, chatId, messageId, reason, details) => {
    let rId = reporterId;
    let rUser = reporterUsername;
    let tgtId = reportedId;
    let tgtUser = reportedUsername;
    let cId = chatId;
    let mId = messageId;
    let rsn = reason;
    let dtls = details;

    if (typeof reporterId === 'object' && reporterId !== null) {
      rId = reporterId.reporter_id || reporterId.reporterId;
      rUser = reporterId.reporter_username || reporterId.reporterUsername || null;
      tgtId = reporterId.reported_id || reporterId.reportedId || null;
      tgtUser = reporterId.reported_username || reporterId.reportedUsername || null;
      cId = reporterId.chat_id || reporterId.chatId || null;
      mId = reporterId.message_id || reporterId.messageId || null;
      rsn = reporterId.reason || 'Safety / Terms Violation';
      dtls = reporterId.details || '';
    }

    if (!rUser && rId) {
      const u = await pool.query('SELECT username FROM users WHERE id = $1', [rId]).catch(() => null);
      if (u && u.rows[0]) rUser = u.rows[0].username;
    }
    if (!tgtUser && tgtId) {
      const u = await pool.query('SELECT username FROM users WHERE id = $1', [tgtId]).catch(() => null);
      if (u && u.rows[0]) tgtUser = u.rows[0].username;
    }

    const result = await pool.query(
      `INSERT INTO user_reports (reporter_id, reporter_username, reported_id, reported_username, chat_id, message_id, reason, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [rId, rUser, tgtId, tgtUser, cId, mId, rsn, dtls]
    );
    return result.rows[0];
  },


  find: async (status = 'pending', limit = 50, offset = 0) => {
    let query = `
      SELECT r.*, 
             m.content as message_content, m.type as message_type, m.media_url as message_media,
             u.email as reported_email, u.status as reported_status, u.is_banned as reported_banned, u.avatar as reported_avatar
      FROM user_reports r
      LEFT JOIN messages m ON r.message_id = m.id
      LEFT JOIN users u ON r.reported_id = u.id
    `;
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      query += ` WHERE r.status = $1`;
    }
    query += ` ORDER BY r.created_at DESC`;
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    const countRes = await pool.query("SELECT COUNT(*) FROM user_reports WHERE status = 'pending'");
    return { reports: result.rows, pendingCount: parseInt(countRes.rows[0]?.count || 0) };
  },

  resolve: async (reportId, resolution, resolvedBy) => {
    const result = await pool.query(
      `UPDATE user_reports
       SET status = 'resolved', resolution = $1, resolved_by = $2, resolved_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [resolution, resolvedBy, reportId]
    );
    return result.rows[0];
  },

  dismiss: async (reportId, resolvedBy) => {
    const result = await pool.query(
      `UPDATE user_reports
       SET status = 'dismissed', resolution = 'Dismissed by moderator', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [resolvedBy, reportId]
    );
    return result.rows[0];
  }
};

const Badge = {
  getAll: async () => {
    const result = await pool.query('SELECT * FROM custom_badges ORDER BY created_at ASC');
    return result.rows;
  },

  create: async ({ name, slug, icon = '🛡️', color = '#0084FF', bg_color = 'rgba(0, 132, 255, 0.15)', description = '' }) => {
    const result = await pool.query(
      `INSERT INTO custom_badges (name, slug, icon, color, bg_color, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE 
       SET name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color, bg_color = EXCLUDED.bg_color, description = EXCLUDED.description
       RETURNING *`,
      [name, slug.toLowerCase(), icon, color, bg_color, description]
    );
    return result.rows[0];
  },

  delete: async (badgeId) => {
    await pool.query('DELETE FROM custom_badges WHERE id = $1', [badgeId]);
  }
};

const Webhook = {
  getAll: async () => {
    const result = await pool.query('SELECT * FROM admin_webhooks ORDER BY created_at DESC');
    return result.rows;
  },

  create: async ({ name, url, events = '["ban","warn","report","emergency"]', enabled = true }) => {
    const result = await pool.query(
      `INSERT INTO admin_webhooks (name, url, events, enabled)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, url, typeof events === 'string' ? events : JSON.stringify(events), enabled]
    );
    return result.rows[0];
  },

  delete: async (webhookId) => {
    await pool.query('DELETE FROM admin_webhooks WHERE id = $1', [webhookId]);
  },

  trigger: async (event, payload) => {
    try {
      const hooks = await pool.query('SELECT url, events FROM admin_webhooks WHERE enabled = TRUE');
      for (const hook of hooks.rows) {
        let events = [];
        try { events = JSON.parse(hook.events); } catch (e) {}
        if (events.includes(event) || events.includes('*')) {
          fetch(hook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: 'SYNCH Security Radar',
              avatar_url: 'https://synch.chat/favicon.svg',
              embeds: [{
                title: `🚨 Admin Alert: ${event.toUpperCase()}`,
                description: payload.message || payload.description || JSON.stringify(payload),
                color: event === 'ban' ? 15548997 : (event === 'emergency' ? 15158332 : 3447003),
                timestamp: new Date().toISOString()
              }]
            })
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Webhook trigger error:', e);
    }
  }
};

const IpHistory = {
  record: async (userId, ip, userAgent = null, fingerprint = null) => {
    if (!userId || !ip) return;
    try {
      await pool.query(
        `INSERT INTO user_ip_history (user_id, ip, user_agent, device_fingerprint)
         VALUES ($1, $2, $3, $4)`,
        [userId, ip, userAgent, fingerprint]
      );
    } catch (e) {}
  },

  getByUserId: async (userId) => {
    const result = await pool.query(
      `SELECT DISTINCT ip, user_agent, device_fingerprint, MAX(last_seen) as last_seen
       FROM user_ip_history
       WHERE user_id = $1
       GROUP BY ip, user_agent, device_fingerprint
       ORDER BY last_seen DESC LIMIT 25`,
      [userId]
    );
    return result.rows;
  },

  findAlts: async (userId) => {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.username, u.display_name, u.email, u.avatar, u.role, u.is_banned, u.created_at,
              h.ip, h.device_fingerprint
       FROM user_ip_history h
       JOIN users u ON h.user_id = u.id
       WHERE (
         h.ip IN (SELECT ip FROM user_ip_history WHERE user_id = $1)
         OR (h.device_fingerprint IS NOT NULL AND h.device_fingerprint IN (SELECT device_fingerprint FROM user_ip_history WHERE user_id = $1 AND device_fingerprint IS NOT NULL))
       )
       AND u.id != $1
       ORDER BY u.created_at DESC LIMIT 30`,
      [userId]
    );
    return result.rows;
  }
};

const IpBlacklist = {
  getAll: async () => {
    const result = await pool.query(
      `SELECT b.*, u.username as banned_by_username
       FROM ip_blacklist b
       LEFT JOIN users u ON b.created_by = u.id
       ORDER BY b.created_at DESC`
    );
    return result.rows;
  },

  add: async (ip, reason, createdBy) => {
    const result = await pool.query(
      `INSERT INTO ip_blacklist (ip, reason, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason
       RETURNING *`,
      [ip, reason, createdBy]
    );
    return result.rows[0];
  },

  remove: async (idOrIp) => {
    if (typeof idOrIp === 'number' || !isNaN(parseInt(idOrIp))) {
      await pool.query('DELETE FROM ip_blacklist WHERE id = $1', [parseInt(idOrIp)]);
    } else {
      await pool.query('DELETE FROM ip_blacklist WHERE ip = $1', [idOrIp]);
    }
  },

  isBlocked: async (ip) => {
    if (!ip) return false;
    const result = await pool.query('SELECT 1 FROM ip_blacklist WHERE ip = $1', [ip]);
    return (result.rows.length > 0);
  }
};

const BanAppeal = {
  create: async ({ userId, username, email, banReason, appealText }) => {
    const result = await pool.query(
      `INSERT INTO ban_appeals (user_id, username, email, ban_reason, appeal_text, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [userId, username, email, banReason, appealText]
    );
    return result.rows[0];
  },

  findLatestByUser: async (userId) => {
    const result = await pool.query(
      `SELECT * FROM ban_appeals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  },

  find: async (status = 'pending', limit = 50, offset = 0) => {
    let query = `
      SELECT a.*, 
             u.avatar as user_avatar, 
             u.is_banned as current_banned, 
             u.banned_until as current_banned_until,
             m.username as reviewer_username
      FROM ban_appeals a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN users m ON a.reviewed_by = m.id
    `;
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      query += ` WHERE a.status = $1`;
    }
    query += ` ORDER BY a.created_at DESC`;
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    const countRes = await pool.query("SELECT COUNT(*) FROM ban_appeals WHERE status = 'pending'");
    return { appeals: result.rows, pendingCount: parseInt(countRes.rows[0]?.count || 0) };
  },

  approve: async (appealId, reviewedBy, adminNotes) => {
    const res = await pool.query(
      `UPDATE ban_appeals 
       SET status = 'approved', reviewed_by = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [reviewedBy, adminNotes || 'Appeal approved by administrator', appealId]
    );
    return res.rows[0];
  },

  reject: async (appealId, reviewedBy, adminNotes) => {
    const res = await pool.query(
      `UPDATE ban_appeals 
       SET status = 'rejected', reviewed_by = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [reviewedBy, adminNotes || 'Appeal rejected by administrator', appealId]
    );
    return res.rows[0];
  }
};

module.exports = {
  pool,
  initDatabase,
  User,
  Session,
  Chat,
  Message,
  FriendRequest,
  VerificationCode,
  AuditLog,
  Warning,
  Report,
  Badge,
  Webhook,
  IpHistory,
  IpBlacklist,
  BanAppeal
};

