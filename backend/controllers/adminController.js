const bcrypt = require('bcryptjs');
const { pool, User, Session, Chat, Message } = require('../database');

let io = null;
exports.setIO = (socketIO) => {
  io = socketIO;
};

// 1. Dashboard Stats
exports.getStats = async (req, res) => {
  try {
    const totalUsersRes = await pool.query('SELECT COUNT(*) FROM users WHERE is_deleted = FALSE');
    const onlineUsersRes = await pool.query("SELECT COUNT(*) FROM users WHERE status = 'online' AND is_deleted = FALSE");
    const twoFactorRes = await pool.query('SELECT COUNT(*) FROM users WHERE two_factor_enabled = TRUE AND is_deleted = FALSE');
    const totalSessionsRes = await pool.query('SELECT COUNT(*) FROM sessions');
    const totalChatsRes = await pool.query('SELECT COUNT(*) FROM chats');
    const totalMessagesRes = await pool.query('SELECT COUNT(*) FROM messages WHERE deleted = FALSE');

    res.json({
      totalUsers: parseInt(totalUsersRes.rows[0].count, 10),
      onlineUsers: parseInt(onlineUsersRes.rows[0].count, 10),
      twoFactorUsers: parseInt(twoFactorRes.rows[0].count, 10),
      totalSessions: parseInt(totalSessionsRes.rows[0].count, 10),
      totalChats: parseInt(totalChatsRes.rows[0].count, 10),
      totalMessages: parseInt(totalMessagesRes.rows[0].count, 10)
    });
  } catch (error) {
    console.error('Admin getStats error:', error);
    res.status(500).json({ error: 'Failed to load statistics' });
  }
};

// 2. List All Users
exports.getUsers = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : '';
    let query = `
      SELECT u.id, u.username, u.email, u.display_name, u.avatar, u.status, u.last_seen,
             u.two_factor_enabled, (u.google_id IS NOT NULL) AS google_linked,
             u.profile_complete, u.is_deleted, u.is_banned, u.ban_reason, u.banned_at, u.banned_until,
             u.is_shadowbanned, u.is_frozen, u.badge, u.role, u.admin_notes, u.created_at,
             (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS session_count,
             (SELECT COUNT(*) FROM chat_participants cp WHERE cp.user_id = u.id) AS chat_count
      FROM users u

      WHERE 1=1
    `;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.username ILIKE $1 OR u.email ILIKE $1 OR u.display_name ILIKE $1 OR CAST(u.id AS TEXT) = $1)`;
    }
    query += ` ORDER BY u.id ASC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin getUsers error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
};

// 3. User Details Deep Inspection
exports.getUserDetails = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const sessionsRes = await pool.query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    const friendsRes = await pool.query(`
      SELECT DISTINCT u.id, u.username, u.display_name, u.email, u.avatar, u.status,
             c.id AS chat_id
      FROM users u
      LEFT JOIN chat_participants cp1 ON cp1.user_id = u.id
      LEFT JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id AND cp2.user_id = $1
      LEFT JOIN chats c ON cp1.chat_id = c.id AND c.type = 'private'
      WHERE u.id != $1 AND u.is_deleted = FALSE AND (
        EXISTS (
          SELECT 1 FROM friend_requests fr 
          WHERE ((fr.sender_id = $1 AND fr.receiver_id = u.id) OR (fr.sender_id = u.id AND fr.receiver_id = $1))
            AND fr.status = 'accepted'
        )
        OR c.id IS NOT NULL
      )
    `, [userId]);

    const incomingReqRes = await pool.query(`
      SELECT fr.id AS request_id, fr.id AS id, fr.created_at, fr.status,
             u.id AS user_id, u.username, u.display_name, u.avatar, u.email
      FROM friend_requests fr
      JOIN users u ON fr.sender_id = u.id
      WHERE fr.receiver_id = $1 AND fr.status = 'pending' AND u.is_deleted = FALSE
    `, [userId]);

    const outgoingReqRes = await pool.query(`
      SELECT fr.id AS request_id, fr.id AS id, fr.created_at, fr.status,
             u.id AS user_id, u.username, u.display_name, u.avatar, u.email
      FROM friend_requests fr
      JOIN users u ON fr.receiver_id = u.id
      WHERE fr.sender_id = $1 AND fr.status = 'pending' AND u.is_deleted = FALSE
    `, [userId]);

    const chatsRes = await pool.query(`
      SELECT c.id, c.type, (c.type = 'group') AS is_group, c.name, c.avatar, c.created_at,
             (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $1
    `, [userId]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        bio: user.bio,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.last_seen,
        twoFactorEnabled: user.two_factor_enabled,
        googleLinked: !!user.google_id,
        googleId: user.google_id,
        hasPassword: !!user.password,
        profileComplete: user.profile_complete,
        isDeleted: user.is_deleted,
        isBanned: user.is_banned,
        banReason: user.ban_reason,
        bannedAt: user.banned_at,
        bannedUntil: user.banned_until,
        isShadowbanned: user.is_shadowbanned,
        isFrozen: user.is_frozen,
        badge: user.badge,
        role: user.role || 'user',
        adminNotes: user.admin_notes,
        createdAt: user.created_at

      },
      sessions: sessionsRes.rows,
      friends: friendsRes.rows,
      incomingRequests: incomingReqRes.rows,
      outgoingRequests: outgoingReqRes.rows,
      chats: chatsRes.rows
    });
  } catch (error) {
    console.error('Admin getUserDetails error:', error);
    res.status(500).json({ error: 'Failed to load user details' });
  }
};

// 4. Update User Profile / Flags
exports.updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { username, email, displayName, bio, status, twoFactorEnabled, profileComplete, isDeleted } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (username !== undefined) {
      updates.push(`username = $${idx++}`);
      params.push(username.trim().toLowerCase());
    }
    if (email !== undefined) {
      updates.push(`email = $${idx++}`);
      params.push(email.trim().toLowerCase());
    }
    if (displayName !== undefined) {
      updates.push(`display_name = $${idx++}`);
      params.push(displayName.trim());
    }
    if (bio !== undefined) {
      updates.push(`bio = $${idx++}`);
      params.push(bio);
    }
    if (status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(status);
    }
    if (twoFactorEnabled !== undefined) {
      updates.push(`two_factor_enabled = $${idx++}`);
      params.push(!!twoFactorEnabled);
    }
    if (profileComplete !== undefined) {
      updates.push(`profile_complete = $${idx++}`);
      params.push(!!profileComplete);
    }
    if (isDeleted !== undefined) {
      updates.push(`is_deleted = $${idx++}`);
      params.push(!!isDeleted);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *`;

    const result = await pool.query(query, params);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (io) {
      io.emit('user:profile_updated', {
        userId,
        username: result.rows[0].username,
        displayName: result.rows[0].display_name,
        email: result.rows[0].email,
        avatar: result.rows[0].avatar,
        status: result.rows[0].status
      });
    }

    res.json({ success: true, message: 'User updated successfully', user: result.rows[0] });
  } catch (error) {
    console.error('Admin updateUser error:', error);
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
};

// 5. Disconnect Google Account
exports.disconnectGoogle = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    await pool.query('UPDATE users SET google_id = NULL WHERE id = $1', [userId]);
    res.json({ success: true, message: 'Google account disconnected' });
  } catch (error) {
    console.error('Admin disconnectGoogle error:', error);
    res.status(500).json({ error: 'Failed to disconnect Google account' });
  }
};

// 6. Force Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const hashed = bcrypt.hashSync(newPassword, 12);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Admin resetPassword error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// 7. Delete User Account
exports.deleteUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (userId === 9) {
      return res.status(400).json({ error: 'Cannot delete the Super Admin account' });
    }

    if (io) {
      io.to(`user:${userId}`).emit('session:revoked', {});
      io.emit('user:deleted', { userId });
    }

    // 1. Delete message reads and reactions
    await pool.query('DELETE FROM message_reads WHERE user_id = $1 OR message_id IN (SELECT id FROM messages WHERE sender_id = $1)', [userId]);
    await pool.query('DELETE FROM message_reactions WHERE user_id = $1 OR message_id IN (SELECT id FROM messages WHERE sender_id = $1)', [userId]);
    
    // 2. Unlink message replies and delete messages
    await pool.query('UPDATE messages SET reply_to_id = NULL WHERE reply_to_id IN (SELECT id FROM messages WHERE sender_id = $1)', [userId]);
    await pool.query('DELETE FROM messages WHERE sender_id = $1', [userId]);

    // 3. Delete codes, sessions, friend requests, participants
    await pool.query('DELETE FROM verification_codes WHERE user_id = $1', [userId]);
    try { await pool.query('DELETE FROM phone_verifications WHERE user_id = $1', [userId]); } catch (e) {}
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM friend_requests WHERE sender_id = $1 OR receiver_id = $1', [userId]);
    await pool.query('DELETE FROM chat_participants WHERE user_id = $1', [userId]);

    // 4. Unlink admin references if any
    await pool.query('UPDATE ip_blacklist SET created_by = NULL WHERE created_by = $1', [userId]);
    await pool.query('UPDATE admin_audit_logs SET admin_id = NULL WHERE admin_id = $1', [userId]);

    // 5. Delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ success: true, message: 'User deleted completely from database' });
  } catch (error) {
    console.error('Admin deleteUser error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// 8. Sessions Management
exports.getUserSessions = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const result = await pool.query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sessions' });
  }
};

exports.revokeUserSession = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const sessionId = parseInt(req.params.sessionId, 10);
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    if (io) {
      io.to(`user:${userId}`).emit('session:revoked', { sessionId });
    }
    res.json({ success: true, message: 'Session revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

exports.revokeAllUserSessions = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    if (io) {
      io.to(`user:${userId}`).emit('session:revoked', {});
    }
    res.json({ success: true, message: 'All sessions revoked for user' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
};

// 9. Friends Management
exports.addFriend = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { targetUserId, friendUserId } = req.body;
    const friendId = parseInt(targetUserId || friendUserId, 10);

    if (!friendId || isNaN(friendId) || isNaN(userId) || friendId === userId) {
      return res.status(400).json({ error: 'Invalid target user ID' });
    }

    // Check if target user exists
    const targetCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE', [friendId]);
    if (!targetCheck.rows[0]) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Check or create private chat
    let chatRes = await pool.query(
      `SELECT cp1.chat_id FROM chat_participants cp1
       JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id AND cp2.user_id = $2
       JOIN chats c ON cp1.chat_id = c.id AND c.type = 'private'
       WHERE cp1.user_id = $1`,
      [userId, friendId]
    );

    let chatId;
    if (chatRes.rows[0]) {
      chatId = chatRes.rows[0].chat_id;
    } else {
      const newChat = await pool.query("INSERT INTO chats (type) VALUES ('private') RETURNING id");
      chatId = newChat.rows[0].id;
      await pool.query('INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2), ($1, $3)', [chatId, userId, friendId]);
    }

    // Mark any friend request as accepted or insert new
    await pool.query(
      `INSERT INTO friend_requests (sender_id, receiver_id, status, updated_at)
       VALUES ($1, $2, 'accepted', CURRENT_TIMESTAMP)
       ON CONFLICT (sender_id, receiver_id) DO UPDATE SET status = 'accepted', updated_at = CURRENT_TIMESTAMP`,
      [userId, friendId]
    );

    if (io) {
      io.to(`user:${userId}`).emit('friend:updated', { userId, targetUserId: friendId, action: 'added', chatId });
      io.to(`user:${friendId}`).emit('friend:updated', { userId: friendId, targetUserId: userId, action: 'added', chatId });
      io.to(`user:${userId}`).emit('chat:new', { _id: chatId });
      io.to(`user:${friendId}`).emit('chat:new', { _id: chatId });
    }

    res.json({ success: true, message: 'Friend added successfully', chatId });
  } catch (error) {
    console.error('Admin addFriend error:', error);
    res.status(500).json({ error: 'Failed to add friend' });
  }
};

exports.removeFriend = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const friendUserId = parseInt(req.params.friendUserId, 10);

    if (isNaN(userId) || isNaN(friendUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Delete private chat between them
    const chatRes = await pool.query(
      `SELECT cp1.chat_id FROM chat_participants cp1
       JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id AND cp2.user_id = $2
       JOIN chats c ON cp1.chat_id = c.id AND c.type = 'private'
       WHERE cp1.user_id = $1`,
      [userId, friendUserId]
    );

    let deletedChatId = null;
    if (chatRes.rows[0]) {
      deletedChatId = chatRes.rows[0].chat_id;
      await pool.query('DELETE FROM chat_participants WHERE chat_id = $1', [deletedChatId]);
      await pool.query('DELETE FROM messages WHERE chat_id = $1', [deletedChatId]);
      await pool.query('DELETE FROM chats WHERE id = $1', [deletedChatId]);
    }

    // Delete friend requests
    await pool.query(
      'DELETE FROM friend_requests WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)',
      [userId, friendUserId]
    );

    if (io) {
      io.to(`user:${userId}`).emit('friend:updated', { userId, targetUserId: friendUserId, action: 'removed', chatId: deletedChatId });
      io.to(`user:${friendUserId}`).emit('friend:updated', { userId: friendUserId, targetUserId: userId, action: 'removed', chatId: deletedChatId });
      if (deletedChatId) {
        io.to(`user:${userId}`).emit('chat:deleted', { chatId: deletedChatId });
        io.to(`user:${friendUserId}`).emit('chat:deleted', { chatId: deletedChatId });
      }
    }

    res.json({ success: true, message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Admin removeFriend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
};

// 10. Friend Requests (Force Accept / Decline / Cancel)
exports.manageFriendRequest = async (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }
    const { action } = req.body; // 'accept', 'decline', 'cancel'

    const reqRes = await pool.query('SELECT * FROM friend_requests WHERE id = $1', [requestId]);
    if (!reqRes.rows[0]) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    const freq = reqRes.rows[0];

    if (action === 'accept') {
      await pool.query("UPDATE friend_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [requestId]);

      // Check or create private chat
      let chatRes = await pool.query(
        `SELECT cp1.chat_id FROM chat_participants cp1
         JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id AND cp2.user_id = $2
         JOIN chats c ON cp1.chat_id = c.id AND c.type = 'private'
         WHERE cp1.user_id = $1`,
        [freq.sender_id, freq.receiver_id]
      );

      let chatId;
      if (!chatRes.rows[0]) {
        const newChat = await pool.query("INSERT INTO chats (type) VALUES ('private') RETURNING id");
        chatId = newChat.rows[0].id;
        await pool.query('INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2), ($1, $3)', [chatId, freq.sender_id, freq.receiver_id]);
      } else {
        chatId = chatRes.rows[0].chat_id;
      }
      return res.json({ success: true, message: 'Friend request accepted', chatId });
    } else if (action === 'decline' || action === 'reject') {
      await pool.query("DELETE FROM friend_requests WHERE id = $1", [requestId]);
      return res.json({ success: true, message: 'Friend request declined' });
    } else if (action === 'cancel' || action === 'delete') {
      await pool.query('DELETE FROM friend_requests WHERE id = $1', [requestId]);
      return res.json({ success: true, message: 'Friend request cancelled' });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Admin manageFriendRequest error:', error);
    res.status(500).json({ error: 'Failed to manage friend request' });
  }
};

// 11. Chat Spy & Message Reading
exports.getChatMessages = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId, 10);
    const messagesRes = await pool.query(
      `SELECT m.*, u.username AS sender_username, u.display_name AS sender_name, u.avatar AS sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = $1
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [chatId]
    );

    const participantsRes = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.email, u.avatar
       FROM chat_participants cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.chat_id = $1`,
      [chatId]
    );

    res.json({
      chatId,
      participants: participantsRes.rows,
      messages: messagesRes.rows
    });
  } catch (error) {
    console.error('Admin getChatMessages error:', error);
    res.status(500).json({ error: 'Failed to load chat messages' });
  }
};

// 12. Impersonated Message Sending
exports.sendUserMessage = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId, 10);
    const { senderId, content, type } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const messageType = type || 'text';
    const sender = parseInt(senderId, 10) || req.user.id;

    const result = await pool.query(
      'INSERT INTO messages (chat_id, sender_id, type, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [chatId, sender, messageType, content.trim()]
    );

    const message = result.rows[0];
    await pool.query('UPDATE chats SET last_message_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [message.id, chatId]);

    if (io) {
      io.to(`chat:${chatId}`).emit('message:new', {
        ...message,
        sender: { id: sender }
      });
    }

    res.json({ success: true, message });
  } catch (error) {
    console.error('Admin sendUserMessage error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// 13. Delete Message
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Admin deleteMessage error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// 14. Ban User (Unbypassable Server-Enforced Ban with Live Kick)
exports.banUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { reason, durationHours } = req.body;

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot ban the Super Admin account' });
    }

    const banReason = reason?.trim() || 'Your account has been suspended for violating our terms of service.';
    let bannedUntil = null;
    if (durationHours && parseInt(durationHours, 10) > 0) {
      bannedUntil = new Date(Date.now() + parseInt(durationHours, 10) * 3600 * 1000);
    }

    // 1. Update database record
    await pool.query(
      `UPDATE users 
       SET is_banned = TRUE, ban_reason = $1, banned_at = CURRENT_TIMESTAMP, banned_until = $2, banned_by = $3 
       WHERE id = $4`,
      [banReason, bannedUntil, req.user.id, userId]
    );

    // 2. Revoke all active sessions in DB immediately
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

    // 3. Emit real-time live ban event to user's connected sockets
    if (io) {
      io.to(`user:${userId}`).emit('user_banned', {
        reason: banReason,
        bannedAt: new Date().toISOString(),
        bannedUntil: bannedUntil ? bannedUntil.toISOString() : null
      });

      // Allow 3 seconds for the client to smoothly render the suspension modal before terminating the transport
      setTimeout(() => {
        const room = io.sockets.adapter.rooms.get(`user:${userId}`);
        if (room) {
          for (const socketId of room) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.disconnect(true);
          }
        }
      }, 3000);
    }

    res.json({ success: true, message: `User #${userId} has been banned successfully.` });
  } catch (error) {
    console.error('Admin banUser error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
};

// 15. Unban User
exports.unbanUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    await pool.query(
      `UPDATE users 
       SET is_banned = FALSE, ban_reason = NULL, banned_at = NULL, banned_until = NULL, banned_by = NULL 
       WHERE id = $1`,
      [userId]
    );

    if (io) {
      io.to(`user:${userId}`).emit('user_unbanned', { userId });
    }

    res.json({ success: true, message: `User #${userId} has been unbanned successfully.` });
  } catch (error) {
    console.error('Admin unbanUser error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
};

// 16. Global System Broadcast Announcement
exports.broadcastAnnouncement = async (req, res) => {
  try {
    const { title, message, level } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Announcement message is required' });
    }

    const payload = {
      title: title?.trim() || 'System Announcement',
      message: message.trim(),
      level: level || 'info',
      timestamp: new Date().toISOString(),
      sender: req.user.username || 'System Admin'
    };

    if (io) {
      io.emit('system_announcement', payload);
    }

    await logAdminAction(req.user.id, req.user.username, 'BROADCAST_ANNOUNCEMENT', 'SYSTEM', null, payload);

    res.json({ success: true, message: 'Announcement broadcasted to all active clients' });
  } catch (error) {
    console.error('Admin broadcastAnnouncement error:', error);
    res.status(500).json({ error: 'Failed to broadcast announcement' });
  }
};

// 17. System Health & Infrastructure Diagnostics
const os = require('os');
const fs = require('fs');
const path = require('path');

exports.getHealth = async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptimeSec = process.uptime();
    const osUptimeSec = os.uptime();

    // Pool stats
    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };

    // Socket connections count
    const activeSockets = io ? io.engine.clientsCount : 0;

    // Table row counts
    const countsRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) AS users_count,
        (SELECT COUNT(*) FROM messages) AS messages_count,
        (SELECT COUNT(*) FROM chats) AS chats_count,
        (SELECT COUNT(*) FROM sessions) AS sessions_count,
        (SELECT COUNT(*) FROM ip_blacklist) AS ip_blacklist_count,
        (SELECT COUNT(*) FROM word_blacklist) AS word_blacklist_count
    `);

    // Maintenance mode
    const maintRes = await pool.query("SELECT value FROM system_settings WHERE key = 'maintenance_mode'");
    const maintenanceMode = maintRes.rows[0]?.value === 'true';

    res.json({
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'Unknown',
        loadAvg: os.loadavg()
      },
      memory: {
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        systemTotalMb: Math.round(totalMem / 1024 / 1024),
        systemFreeMb: Math.round(freeMem / 1024 / 1024)
      },
      uptime: {
        processUptimeSec: Math.round(uptimeSec),
        osUptimeSec: Math.round(osUptimeSec)
      },
      pool: poolStats,
      activeSockets,
      counts: countsRes.rows[0],
      maintenanceMode,
      nodeVersion: process.version,
      platform: process.platform
    });
  } catch (error) {
    console.error('Admin getHealth error:', error);
    res.status(500).json({ error: 'Failed to load system health' });
  }
};

// 18. Toggle Maintenance Mode
exports.setMaintenanceMode = async (req, res) => {
  try {
    const { enabled } = req.body;
    const isEnabled = enabled === true || enabled === 'true';
    const val = isEnabled ? 'true' : 'false';
    await pool.query(
      "INSERT INTO system_settings (key, value, updated_at) VALUES ('maintenance_mode', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP",
      [val]
    );

    if (io) {
      io.emit('system:maintenance', {
        enabled: isEnabled,
        message: 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.'
      });
      if (isEnabled) {
        io.emit('maintenance_mode_started', {
          message: 'SYNCH is entering maintenance mode. Please save your work.'
        });
      } else {
        io.emit('maintenance_mode_ended', {
          message: 'Maintenance mode has been disabled. System operational.'
        });
      }
    }

    await logAdminAction(req.user.id, req.user.username, 'SET_MAINTENANCE_MODE', 'SYSTEM', null, { enabled: isEnabled });

    res.json({ success: true, maintenanceMode: isEnabled });
  } catch (error) {
    console.error('Admin setMaintenanceMode error:', error);
    res.status(500).json({ error: 'Failed to update maintenance mode' });
  }
};

// 19. User Moderation: Shadowban Toggle
exports.shadowbanUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { shadowbanned } = req.body;
    await pool.query('UPDATE users SET is_shadowbanned = $1 WHERE id = $2', [!!shadowbanned, userId]);
    if (io) {
      io.to(`user:${userId}`).emit('user:shadowban_updated', { isShadowbanned: !!shadowbanned });
    }
    await logAdminAction(req.user.id, req.user.username, shadowbanned ? 'SHADOWBAN_USER' : 'UNSHADOWBAN_USER', 'USER', userId);
    res.json({ success: true, isShadowbanned: !!shadowbanned });
  } catch (error) {
    console.error('Admin shadowbanUser error:', error);
    res.status(500).json({ error: 'Failed to update shadowban status' });
  }
};

// 20. User Moderation: Freeze Account Toggle
exports.freezeUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { frozen } = req.body;
    await pool.query('UPDATE users SET is_frozen = $1 WHERE id = $2', [!!frozen, userId]);
    if (io) {
      io.to(`user:${userId}`).emit('user:frozen_updated', { isFrozen: !!frozen });
      if (frozen) {
        io.to(`user:${userId}`).emit('user_frozen', {
          reason: 'Your account has been temporarily frozen by an administrator.'
        });
      } else {
        io.to(`user:${userId}`).emit('user_unfrozen', {});
      }
    }
    await logAdminAction(req.user.id, req.user.username, frozen ? 'FREEZE_USER' : 'UNFREEZE_USER', 'USER', userId);
    res.json({ success: true, isFrozen: !!frozen });
  } catch (error) {
    console.error('Admin freezeUser error:', error);
    res.status(500).json({ error: 'Failed to update freeze status' });
  }
};

// 21. User Moderation: Custom Badge Assignment
exports.setUserBadge = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { badge } = req.body;
    const badgeVal = badge?.trim() || null;
    await pool.query('UPDATE users SET badge = $1 WHERE id = $2', [badgeVal, userId]);
    if (io) {
      io.emit('user:badge_updated', { userId, badge: badgeVal });
      io.to(`user:${userId}`).emit('user:badge_updated', { userId, badge: badgeVal });
    }
    await logAdminAction(req.user.id, req.user.username, 'SET_USER_BADGE', 'USER', userId, { badge: badgeVal });
    res.json({ success: true, badge: badgeVal });
  } catch (error) {
    console.error('Admin setUserBadge error:', error);
    res.status(500).json({ error: 'Failed to update user badge' });
  }
};

// 21b. User Moderation: Custom Role Assignment (RBAC)
exports.setUserRole = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { role } = req.body;
    const allowedRoles = ['user', 'moderator', 'admin', 'superadmin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    if (userId === req.user.id && role !== 'superadmin' && req.user.email?.toLowerCase() === 'noreply.synch@gmail.com') {
      return res.status(400).json({ error: 'Cannot demote the primary Super Admin account' });
    }

    await User.setRole(userId, role);
    if (io) {
      io.to(`user:${userId}`).emit('user:role_updated', { userId, role });
    }
    await logAdminAction(req.user.id, req.user.username, 'SET_USER_ROLE', 'USER', userId, { role });
    res.json({ success: true, role });
  } catch (error) {
    console.error('Admin setUserRole error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

// 22. User Moderation: Admin Internal Notes / Dossier
exports.setUserNotes = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { notes } = req.body;
    await pool.query('UPDATE users SET admin_notes = $1 WHERE id = $2', [notes || null, userId]);
    await logAdminAction(req.user.id, req.user.username, 'UPDATE_USER_NOTES', 'USER', userId);
    res.json({ success: true, notes });
  } catch (error) {
    console.error('Admin setUserNotes error:', error);
    res.status(500).json({ error: 'Failed to update notes' });
  }
};

// 23. User Moderation: Force Reset Avatar
exports.resetUserAvatar = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    await pool.query('UPDATE users SET avatar = NULL WHERE id = $1', [userId]);
    if (io) {
      io.emit('user:profile_updated', { userId, avatar: null });
      io.to(`user:${userId}`).emit('user:profile_updated', { userId, avatar: null });
    }
    await logAdminAction(req.user.id, req.user.username, 'RESET_USER_AVATAR', 'USER', userId);
    res.json({ success: true, message: 'Avatar reset to default' });
  } catch (error) {
    console.error('Admin resetUserAvatar error:', error);
    res.status(500).json({ error: 'Failed to reset avatar' });
  }
};

// 24. IP Blacklist Management
exports.getIpBlacklist = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ip_blacklist ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Admin getIpBlacklist error:', error);
    res.status(500).json({ error: 'Failed to load IP blacklist' });
  }
};

exports.addIpBlacklist = async (req, res) => {
  try {
    const { ip, reason } = req.body;
    if (!ip || !ip.trim()) return res.status(400).json({ error: 'IP address is required' });
    const result = await pool.query(
      'INSERT INTO ip_blacklist (ip, reason, created_by) VALUES ($1, $2, $3) RETURNING *',
      [ip.trim(), reason?.trim() || 'Violating terms of service', req.user.id]
    );
    await logAdminAction(req.user.id, req.user.username, 'ADD_IP_BLACKLIST', 'IP', ip.trim(), { reason });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin addIpBlacklist error:', error);
    res.status(500).json({ error: error.code === '23505' ? 'IP is already blacklisted' : 'Failed to add IP' });
  }
};

exports.removeIpBlacklist = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM ip_blacklist WHERE id = $1', [id]);
    await logAdminAction(req.user.id, req.user.username, 'REMOVE_IP_BLACKLIST', 'IP', id);
    res.json({ success: true, message: 'IP removed from blacklist' });
  } catch (error) {
    console.error('Admin removeIpBlacklist error:', error);
    res.status(500).json({ error: 'Failed to remove IP' });
  }
};

// 25. Word Blacklist & Auto-Moderation Filter
exports.getWordBlacklist = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM word_blacklist ORDER BY word ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Admin getWordBlacklist error:', error);
    res.status(500).json({ error: 'Failed to load word blacklist' });
  }
};

exports.addWordBlacklist = async (req, res) => {
  try {
    const { word, action } = req.body;
    if (!word || !word.trim()) return res.status(400).json({ error: 'Keyword is required' });
    const result = await pool.query(
      'INSERT INTO word_blacklist (word, action) VALUES ($1, $2) RETURNING *',
      [word.trim().toLowerCase(), action || 'block']
    );
    await logAdminAction(req.user.id, req.user.username, 'ADD_WORD_BLACKLIST', 'KEYWORD', word.trim());
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin addWordBlacklist error:', error);
    res.status(500).json({ error: error.code === '23505' ? 'Keyword is already in blacklist' : 'Failed to add keyword' });
  }
};

exports.removeWordBlacklist = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM word_blacklist WHERE id = $1', [id]);
    await logAdminAction(req.user.id, req.user.username, 'REMOVE_WORD_BLACKLIST', 'KEYWORD', id);
    res.json({ success: true, message: 'Keyword removed from blacklist' });
  } catch (error) {
    console.error('Admin removeWordBlacklist error:', error);
    res.status(500).json({ error: 'Failed to remove keyword' });
  }
};

// 26. Media Gallery & Storage Inspector
exports.getMediaFiles = async (req, res) => {
  try {
    const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsRoot)) {
      return res.json([]);
    }

    const subdirs = ['images', 'audio', 'videos', 'docs', ''];
    const mediaList = [];

    for (const sub of subdirs) {
      const dirPath = sub ? path.join(uploadsRoot, sub) : uploadsRoot;
      if (!fs.existsSync(dirPath)) continue;

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile()) {
          try {
            const filePath = path.join(dirPath, ent.name);
            const stats = fs.statSync(filePath);
            const relUrl = sub ? `/uploads/${sub}/${ent.name}` : `/uploads/${ent.name}`;
            mediaList.push({
              filename: ent.name,
              folder: sub || 'root',
              url: relUrl,
              sizeBytes: stats.size,
              sizeKb: Math.round(stats.size / 1024),
              createdAt: stats.birthtime,
              isImage: /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(ent.name),
              isVideo: /\.(mp4|webm|mov|mkv)$/i.test(ent.name),
              isAudio: /\.(mp3|wav|ogg|m4a|webm)$/i.test(ent.name),
              isDoc: /\.(pdf|docx?|xlsx?|txt|zip)$/i.test(ent.name)
            });
          } catch (e) {}
        }
      }
    }

    // Sort newest first
    mediaList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(mediaList);
  } catch (error) {
    console.error('Admin getMediaFiles error:', error);
    res.status(500).json({ error: 'Failed to load media files' });
  }
};

exports.deleteMediaFile = async (req, res) => {
  try {
    const filename = req.params.filename;
    const safeFilename = path.basename(filename);
    const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
    const subdirs = ['images', 'audio', 'videos', 'docs', ''];

    let deleted = false;
    for (const sub of subdirs) {
      const filePath = sub ? path.join(uploadsRoot, sub, safeFilename) : path.join(uploadsRoot, safeFilename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          deleted = true;
        } catch (e) {}
      }
    }

    await pool.query("UPDATE messages SET content = '[File removed by administrator]' WHERE content LIKE $1 OR media_url LIKE $1", [`%${safeFilename}%`]);
    await pool.query("UPDATE users SET avatar = NULL WHERE avatar LIKE $1", [`%${safeFilename}%`]);

    await logAdminAction(req.user.id, req.user.username, 'DELETE_MEDIA_FILE', 'FILE', safeFilename);
    res.json({ success: true, message: deleted ? 'File permanently deleted' : 'File not found on disk, records cleaned' });
  } catch (error) {
    console.error('Admin deleteMediaFile error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};


// 27. Feature Flags Manager
exports.getFeatureFlags = async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value, updated_at FROM system_settings ORDER BY key ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Admin getFeatureFlags error:', error);
    res.status(500).json({ error: 'Failed to load feature flags' });
  }
};

exports.updateFeatureFlag = async (req, res) => {
  try {
    const { key, value } = req.body;
    await pool.query(
      'INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
      [key, String(value)]
    );
    await logAdminAction(req.user.id, req.user.username, 'UPDATE_FEATURE_FLAG', 'SETTING', key, { value });
    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Admin updateFeatureFlag error:', error);
    res.status(500).json({ error: 'Failed to update feature flag' });
  }
};

// 28. Interactive PostgreSQL SQL Studio / Raw Query Console
exports.executeSQL = async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || !sql.trim()) {
      return res.status(400).json({ error: 'SQL query string is required' });
    }

    const startTime = Date.now();
    const result = await pool.query(sql.trim());
    const executionTimeMs = Date.now() - startTime;

    await logAdminAction(req.user.id, req.user.username, 'EXECUTE_SQL', 'DATABASE', null, { sql: sql.trim().substring(0, 200) });

    res.json({
      success: true,
      command: result.command,
      rowCount: result.rowCount,
      fields: result.fields ? result.fields.map(f => f.name) : [],
      rows: result.rows || [],
      executionTimeMs
    });
  } catch (error) {
    console.error('Admin executeSQL error:', error);
    res.status(400).json({ error: error.message });
  }
};

// 29. Admin Audit Logs
exports.getAuditLogs = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    console.error('Admin getAuditLogs error:', error);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
};

// 30. Chat Forensic Export
exports.exportChat = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId, 10);
    const chatRes = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (!chatRes.rows[0]) return res.status(404).json({ error: 'Chat not found' });

    const participantsRes = await pool.query(`
      SELECT u.id, u.username, u.display_name, u.email, u.status, u.created_at
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.chat_id = $1
    `, [chatId]);

    const messagesRes = await pool.query(`
      SELECT m.*, u.username AS sender_username, u.display_name AS sender_display_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = $1
      ORDER BY m.created_at ASC
    `, [chatId]);

    res.json({
      exportTimestamp: new Date().toISOString(),
      chat: chatRes.rows[0],
      participants: participantsRes.rows,
      messages: messagesRes.rows
    });
  } catch (error) {
    console.error('Admin exportChat error:', error);
    res.status(500).json({ error: 'Failed to export chat' });
  }
};

// 31. Alt-Account & Clustered Device Forensics
exports.getUserAltAccounts = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { IpHistory } = require('../database');
    const alts = await IpHistory.findAlts(userId);
    const ipHistory = await IpHistory.getByUserId(userId);
    res.json({ alts, ipHistory });
  } catch (error) {
    console.error('Admin getUserAltAccounts error:', error);
    res.status(500).json({ error: 'Failed to search alt accounts' });
  }
};

// 32. One-Click Poison Cascade Ban (User + IP + All Alts)
exports.poisonBanUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { reason } = req.body;
    const { IpHistory, IpBlacklist, Webhook } = require('../database');

    const banReason = reason || 'Permanent account termination due to critical policy violation.';

    // 1. Ban the target user
    await pool.query(
      `UPDATE users SET is_banned = TRUE, ban_reason = $1, banned_at = CURRENT_TIMESTAMP, banned_by = $2 WHERE id = $3`,
      [banReason, req.user.id, userId]
    );

    // 2. Kill sessions
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

    // 3. Find all IPs used by this user and add to IP blacklist
    const ips = await IpHistory.getByUserId(userId);
    for (const record of ips) {
      if (record.ip && record.ip !== '127.0.0.1' && record.ip !== '::1') {
        await IpBlacklist.add(record.ip, `Poison ban cascade from User #${userId}`, req.user.id);
      }
    }

    // 4. Find all alt accounts and ban them
    const alts = await IpHistory.findAlts(userId);
    for (const alt of alts) {
      await pool.query(
        `UPDATE users SET is_banned = TRUE, ban_reason = $1, banned_at = CURRENT_TIMESTAMP, banned_by = $2 WHERE id = $3`,
        [`Cascade poison ban linked to user #${userId}`, req.user.id, alt.id]
      );
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [alt.id]);
    }

    await logAdminAction(req.user.id, req.user.username, 'POISON_CASCADE_BAN', 'USER', userId, {
      altsBanned: alts.map(a => a.id),
      ipsBlacklisted: ips.map(i => i.ip)
    });

    Webhook.trigger('ban', {
      message: `🚨 **POISON BAN EXECUTED**: User #${userId} and ${alts.length} linked alt account(s) terminated by ${req.user.username}.`
    });

    res.json({
      success: true,
      message: `Poison ban complete. Banned target user #${userId}, blacklisted ${ips.length} IP(s), and terminated ${alts.length} alt account(s).`,
      altsCount: alts.length
    });
  } catch (error) {
    console.error('Admin poisonBanUser error:', error);
    res.status(500).json({ error: 'Failed to execute poison ban' });
  }
};

// 33. Warnings System
exports.getUserWarnings = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { Warning } = require('../database');
    const warnings = await Warning.findByUserId(userId);
    res.json(warnings);
  } catch (error) {
    console.error('Admin getUserWarnings error:', error);
    res.status(500).json({ error: 'Failed to load warnings' });
  }
};

exports.issueWarning = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { reason, severity } = req.body;
    const { Warning, Webhook } = require('../database');

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Warning reason is required' });
    }

    const warning = await Warning.create(userId, req.user.id, req.user.username, reason.trim(), severity || 'warning');
    await logAdminAction(req.user.id, req.user.username, 'ISSUE_WARNING', 'USER', userId, { reason, severity });

    Webhook.trigger('warn', {
      message: `⚠️ **Warning Issued**: User #${userId} was warned by ${req.user.username}. Reason: ${reason}`
    });

    res.json({ success: true, warning });
  } catch (error) {
    console.error('Admin issueWarning error:', error);
    res.status(500).json({ error: 'Failed to issue warning' });
  }
};

exports.deleteWarning = async (req, res) => {
  try {
    const warningId = parseInt(req.params.warningId, 10);
    const { Warning } = require('../database');
    await Warning.delete(warningId);
    await logAdminAction(req.user.id, req.user.username, 'DELETE_WARNING', 'WARNING', warningId);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin deleteWarning error:', error);
    res.status(500).json({ error: 'Failed to delete warning' });
  }
};

// 34. Reports Queue
exports.getReports = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const { Report } = require('../database');
    const data = await Report.find(status, limit, offset);
    res.json(data);
  } catch (error) {
    console.error('Admin getReports error:', error);
    res.status(500).json({ error: 'Failed to load reports' });
  }
};

exports.resolveReport = async (req, res) => {
  try {
    const reportId = parseInt(req.params.reportId, 10);
    const { resolution } = req.body;
    const { Report } = require('../database');
    const updated = await Report.resolve(reportId, resolution || 'Resolved by moderator', req.user.id);
    await logAdminAction(req.user.id, req.user.username, 'RESOLVE_REPORT', 'REPORT', reportId, { resolution });
    res.json({ success: true, report: updated });
  } catch (error) {
    console.error('Admin resolveReport error:', error);
    res.status(500).json({ error: 'Failed to resolve report' });
  }
};

exports.dismissReport = async (req, res) => {
  try {
    const reportId = parseInt(req.params.reportId, 10);
    const { Report } = require('../database');
    const updated = await Report.dismiss(reportId, req.user.id);
    await logAdminAction(req.user.id, req.user.username, 'DISMISS_REPORT', 'REPORT', reportId);
    res.json({ success: true, report: updated });
  } catch (error) {
    console.error('Admin dismissReport error:', error);
    res.status(500).json({ error: 'Failed to dismiss report' });
  }
};

// 35. Bulk Message Purge
exports.bulkPurgeMessages = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const hours = parseInt(req.body.hours, 10) || 24;

    let result;
    if (hours === -1) {
      result = await pool.query('DELETE FROM messages WHERE sender_id = $1 RETURNING id', [userId]);
    } else {
      result = await pool.query(
        `DELETE FROM messages 
         WHERE sender_id = $1 AND created_at >= NOW() - INTERVAL '${hours} hours'
         RETURNING id`,
        [userId]
      );
    }

    const deletedCount = result.rows.length;
    await logAdminAction(req.user.id, req.user.username, 'BULK_PURGE_MESSAGES', 'USER', userId, { hours, deletedCount });
    res.json({ success: true, message: `Successfully purged ${deletedCount} message(s)`, deletedCount });
  } catch (error) {
    console.error('Admin bulkPurgeMessages error:', error);
    res.status(500).json({ error: 'Failed to purge messages' });
  }
};

// 36. Live System Diagnostics & DevOps
exports.getSystemDiagnostics = async (req, res) => {
  try {
    const os = require('os');
    const fs = require('fs');

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = process.memoryUsage();

    const dbPoolStats = {
      totalCount: pool.totalCount || 0,
      idleCount: pool.idleCount || 0,
      waitingCount: pool.waitingCount || 0
    };

    const tableSizes = await pool.query(`
      SELECT relname as table_name,
             pg_size_pretty(pg_total_relation_size(relid)) as total_size,
             n_live_tup as live_rows,
             n_dead_tup as dead_rows
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC LIMIT 10
    `);

    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: `${os.type()} ${os.arch()}`,
      cpuCount: os.cpus().length,
      systemMemory: {
        totalMb: Math.round(totalMem / 1024 / 1024),
        usedMb: Math.round(usedMem / 1024 / 1024),
        freeMb: Math.round(freeMem / 1024 / 1024),
        percentUsed: Math.round((usedMem / totalMem) * 100)
      },
      processMemory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024)
      },
      dbPool: dbPoolStats,
      tables: tableSizes.rows
    });
  } catch (error) {
    console.error('Admin getSystemDiagnostics error:', error);
    res.status(500).json({ error: 'Failed to load system diagnostics' });
  }
};

exports.runDatabaseVacuum = async (req, res) => {
  try {
    await pool.query('VACUUM ANALYZE');
    await logAdminAction(req.user.id, req.user.username, 'DATABASE_VACUUM', 'DATABASE', null);
    res.json({ success: true, message: 'VACUUM ANALYZE completed successfully. Indexes updated and dead tuples collected.' });
  } catch (error) {
    console.error('Admin runDatabaseVacuum error:', error);
    res.status(500).json({ error: 'Database vacuum failed' });
  }
};

exports.cleanupOrphanedMedia = async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const uploadsDir = path.join(__dirname, '../../uploads');
    let removedFiles = 0;
    let freedBytes = 0;

    const subdirs = ['images', 'audio', 'videos', 'docs'];
    for (const sub of subdirs) {
      const dirPath = path.join(uploadsDir, sub);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const relativeUrl = `/uploads/${sub}/${file}`;
          const isMsgMedia = await pool.query('SELECT 1 FROM messages WHERE media_url = $1 LIMIT 1', [relativeUrl]);
          const isAvatar = await pool.query('SELECT 1 FROM users WHERE avatar = $1 LIMIT 1', [relativeUrl]);
          if (isMsgMedia.rows.length === 0 && isAvatar.rows.length === 0) {
            try {
              const fullPath = path.join(dirPath, file);
              const stats = fs.statSync(fullPath);
              freedBytes += stats.size;
              fs.unlinkSync(fullPath);
              removedFiles++;
            } catch (e) {}
          }
        }
      }
    }

    await logAdminAction(req.user.id, req.user.username, 'CLEANUP_ORPHANED_MEDIA', 'STORAGE', null, { removedFiles, freedBytes });
    res.json({ success: true, removedFiles, freedMb: (freedBytes / 1024 / 1024).toFixed(2) });
  } catch (error) {
    console.error('Admin cleanupOrphanedMedia error:', error);
    res.status(500).json({ error: 'Failed to clean orphaned media' });
  }
};

// 37. IP Blacklist Endpoints
exports.getIpBlacklist = async (req, res) => {
  try {
    const { IpBlacklist } = require('../database');
    const list = await IpBlacklist.getAll();
    res.json(list);
  } catch (error) {
    console.error('Admin getIpBlacklist error:', error);
    res.status(500).json({ error: 'Failed to load IP blacklist' });
  }
};

exports.addIpBlacklist = async (req, res) => {
  try {
    const { ip, reason } = req.body;
    if (!ip || !ip.trim()) return res.status(400).json({ error: 'IP address is required' });

    const { IpBlacklist } = require('../database');
    const entry = await IpBlacklist.add(ip.trim(), reason || 'Manual admin block', req.user.id);
    await logAdminAction(req.user.id, req.user.username, 'ADD_IP_BLACKLIST', 'IP', ip, { reason });
    res.json({ success: true, entry });
  } catch (error) {
    console.error('Admin addIpBlacklist error:', error);
    res.status(500).json({ error: 'Failed to add IP to blacklist' });
  }
};

exports.removeIpBlacklist = async (req, res) => {
  try {
    const { id } = req.params;
    const { IpBlacklist } = require('../database');
    await IpBlacklist.remove(id);
    await logAdminAction(req.user.id, req.user.username, 'REMOVE_IP_BLACKLIST', 'IP', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin removeIpBlacklist error:', error);
    res.status(500).json({ error: 'Failed to remove IP from blacklist' });
  }
};

// 38. Custom Badges
exports.getCustomBadges = async (req, res) => {
  try {
    const { Badge } = require('../database');
    const badges = await Badge.getAll();
    res.json(badges);
  } catch (error) {
    console.error('Admin getCustomBadges error:', error);
    res.status(500).json({ error: 'Failed to load custom badges' });
  }
};

exports.createCustomBadge = async (req, res) => {
  try {
    const { name, slug, icon, color, bg_color, description } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Badge name and slug are required' });

    const { Badge } = require('../database');
    const badge = await Badge.create({ name, slug, icon, color, bg_color, description });
    await logAdminAction(req.user.id, req.user.username, 'CREATE_CUSTOM_BADGE', 'BADGE', badge.slug, badge);
    res.json({ success: true, badge });
  } catch (error) {
    console.error('Admin createCustomBadge error:', error);
    res.status(500).json({ error: 'Failed to create custom badge' });
  }
};

exports.deleteCustomBadge = async (req, res) => {
  try {
    const { badgeId } = req.params;
    const { Badge } = require('../database');
    await Badge.delete(parseInt(badgeId, 10));
    await logAdminAction(req.user.id, req.user.username, 'DELETE_CUSTOM_BADGE', 'BADGE', badgeId);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin deleteCustomBadge error:', error);
    res.status(500).json({ error: 'Failed to delete custom badge' });
  }
};

// 39. Discord / Slack Webhooks
exports.getWebhooks = async (req, res) => {
  try {
    const { Webhook } = require('../database');
    const hooks = await Webhook.getAll();
    res.json(hooks);
  } catch (error) {
    console.error('Admin getWebhooks error:', error);
    res.status(500).json({ error: 'Failed to load webhooks' });
  }
};

exports.createWebhook = async (req, res) => {
  try {
    const { name, url, events, enabled } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Webhook name and URL are required' });

    const { Webhook } = require('../database');
    const hook = await Webhook.create({ name, url, events, enabled });
    await logAdminAction(req.user.id, req.user.username, 'CREATE_WEBHOOK', 'WEBHOOK', hook.id, { name, url });
    res.json({ success: true, webhook: hook });
  } catch (error) {
    console.error('Admin createWebhook error:', error);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
};

exports.deleteWebhook = async (req, res) => {
  try {
    const { webhookId } = req.params;
    const { Webhook } = require('../database');
    await Webhook.delete(parseInt(webhookId, 10));
    await logAdminAction(req.user.id, req.user.username, 'DELETE_WEBHOOK', 'WEBHOOK', webhookId);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin deleteWebhook error:', error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
};

exports.testWebhook = async (req, res) => {
  try {
    const { Webhook } = require('../database');
    await Webhook.trigger('emergency', {
      message: `🔔 **Test Alert from SYNCH Admin Panel**: Webhook successfully connected by ${req.user.username} at ${new Date().toLocaleTimeString()}!`
    });
    res.json({ success: true, message: 'Test signal dispatched to all enabled webhooks' });
  } catch (error) {
    console.error('Admin testWebhook error:', error);
    res.status(500).json({ error: 'Failed to trigger test webhook' });
  }
};

async function logAdminAction(adminId, adminUsername, action, targetType, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_username, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, adminUsername, action, targetType, targetId ? String(targetId) : null, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

