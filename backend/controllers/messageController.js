const { Message, Chat, User, FriendRequest } = require('../database');
const upload = require('../middleware/upload');

let io = null;

exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.sendMessage = async (req, res) => {
  try {
    const { chatId, content, type, replyTo, mediaDuration } = req.body;

    if (content && typeof content === 'string' && content.length > 5000) {
      return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
    }

    const chat = await Chat.findById(parseInt(chatId));
    if (!chat || !(await Chat.isParticipant(parseInt(chatId), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    let otherParticipantId = null;
    if (chat.type === 'private') {
      const other = chat.participants.find(p => parseInt(p._id || p.id) !== parseInt(req.user.id));
      if (other) {
        otherParticipantId = parseInt(other._id || other.id);
        if (other.isDeleted) {
          return res.status(400).json({ error: 'This account is no longer available' });
        }
      }
    }

    // 1. Strict Server-Side Blocking Check
    if (otherParticipantId) {
      const isBlocked = await User.isBlockedBetween(req.user.id, otherParticipantId);
      if (isBlocked) {
        return res.status(403).json({ error: 'You cannot send messages to this user' });
      }
    }

    // 2. Strict Server-Side Non-Friend / Message Request Check
    if (otherParticipantId) {
      const isFriend = await FriendRequest.isFriend(req.user.id, otherParticipantId);
      if (!isFriend) {
        // Messaging non-friends is unrestricted; replying to a non-friend still
        // auto-accepts the pending friend request below.
        const incomingFromOther = await Message.countPendingUnanswered(chat.id, otherParticipantId, req.user.id);
        if (incomingFromOther >= 1) {
          const { pool } = require('../database');
          const existing = await pool.query(
            `SELECT * FROM friend_requests
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
             LIMIT 1`,
            [req.user.id, otherParticipantId]
          );
          if (existing.rows.length > 0) {
            await pool.query(
              `UPDATE friend_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [existing.rows[0].id]
            );
          } else {
            await pool.query(
              `INSERT INTO friend_requests (sender_id, receiver_id, status)
               VALUES ($1, $2, 'accepted')`,
              [otherParticipantId, req.user.id]
            );
          }
          if (io) {
            const uMe = await User.findById(req.user.id);
            const uOther = await User.findById(otherParticipantId);
            io.to(`chat:${chat.id}`).emit('chat:request_accepted', { chatId: chat.id, acceptedBy: req.user.id });
            io.to(`user:${otherParticipantId}`).emit('friend:request_accepted', {
              user: User.toPublicJSON(uMe),
              chatId: chat.id
            });
            io.to(`user:${req.user.id}`).emit('friend:request_accepted', {
              user: User.toPublicJSON(uOther),
              chatId: chat.id
            });
          }
        }
      }
    }

    let mediaUrl = null;
    let messageType = type || 'text';
    if (req.file) {
      // Magic-byte verification: content must actually match the declared type
      if (!upload.validateUploadedFile(req.file.path, req.file.mimetype)) {
        try { require('fs').unlinkSync(req.file.path); } catch (e) {}
        return res.status(400).json({ error: 'File content does not match its declared type' });
      }
      let fileType = 'docs';
      if (req.file.mimetype.startsWith('image/')) {
        fileType = 'images';
        if (!type || type === 'text') messageType = 'image';
      } else if (req.file.mimetype.startsWith('audio/')) {
        fileType = 'audio';
        if (!type || type === 'text') messageType = 'voice';
      } else if (req.file.mimetype.startsWith('video/')) {
        fileType = 'videos';
        if (!type || type === 'text') messageType = 'video';
      } else {
        fileType = 'docs';
        if (!type || type === 'text') messageType = 'file';
      }
      mediaUrl = `/uploads/${fileType}/${req.file.filename}`;
    }

    const message = await Message.create(
      parseInt(chatId),
      req.user.id,
      messageType,
      content || (req.file ? req.file.originalname : ''),
      mediaUrl,
      mediaDuration ? parseFloat(mediaDuration) : null,
      replyTo ? parseInt(replyTo) : null
    );


    const messageJSON = Message.toJSON(message);

    if (io) {
      const chatIdNum = parseInt(chat.id);
      // Broadcast to the chat room only (all participants are joined) — avoids duplicate delivery
      io.to(`chat:${chatIdNum}`).emit('message:new', messageJSON);

      // Personal-room notifications for other participants (different event, no duplication)
      const seenPids = new Set();
      (chat.participants || []).forEach(participant => {
        const pid = parseInt(participant._id || participant.id);
        if (!pid || isNaN(pid) || seenPids.has(pid) || pid === parseInt(req.user.id)) return;
        seenPids.add(pid);

        const notifPayload = {
          message: messageJSON,
          chat: {
            _id: chat.id,
            participants: chat.participants
          }
        };
        io.to(`user:${pid}`).emit('message:notification', notifPayload);
      });
    }

    res.status(201).json({
      ...messageJSON,
      message: messageJSON
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Error sending message' });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await Message.findById(parseInt(messageId));

    if (!message || message.sender_id !== req.user.id || message.deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!(await Chat.isParticipant(parseInt(message.chat_id), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (typeof content !== 'string' || content.length === 0 || content.length > 5000) {
      return res.status(400).json({ error: 'Invalid message content' });
    }

    const updated = await Message.update(parseInt(messageId), content);
    const messageJSON = Message.toJSON(updated);

    if (io) {
      const chatIdNum = parseInt(message.chat_id);
      io.to(`chat:${chatIdNum}`).emit('message:edited', messageJSON);
      io.to(`chat:${String(chatIdNum)}`).emit('message:edited', messageJSON);
    }

    res.json({ message: messageJSON });
  } catch (error) {
    res.status(500).json({ error: 'Error editing message' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(parseInt(messageId));

    if (!message || message.sender_id !== req.user.id) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const createdAt = new Date(message.created_at).getTime();
    if (Date.now() - createdAt > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Messages older than 24 hours cannot be deleted for everyone' });
    }

    await Message.delete(parseInt(messageId));

    if (io) {
      const chatIdNum = parseInt(message.chat_id);
      const delPayload = {
        messageId: parseInt(messageId),
        chatId: chatIdNum,
        deletedForEveryone: true
      };
      io.to(`chat:${chatIdNum}`).emit('message:deleted', delPayload);
    }

    res.json({ message: 'Message deleted for everyone successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting message' });
  }
};

exports.deleteForMe = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(parseInt(messageId));
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!(await Chat.isParticipant(parseInt(message.chat_id), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    await Message.deleteForUser(parseInt(messageId), req.user.id);
    res.json({ success: true, messageId: parseInt(messageId) });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting message for self' });
  }
};

exports.deleteForMeBulk = async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'messageIds required' });
    }

    await Message.deleteForUserBulk(messageIds, req.user.id);
    res.json({ success: true, count: messageIds.length });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting messages for self' });
  }
};

exports.addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await Message.findById(parseInt(messageId));

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!(await Chat.isParticipant(parseInt(message.chat_id), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const reactions = await Message.addReaction(parseInt(messageId), req.user.id, emoji);

    res.json({ reactions });
  } catch (error) {
    res.status(500).json({ error: 'Error adding reaction' });
  }
};

exports.pinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(parseInt(messageId));

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!(await Chat.isParticipant(message.chat_id, req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const pinned = await Message.togglePin(parseInt(messageId));

    res.json({ pinned });
  } catch (error) {
    res.status(500).json({ error: 'Error pinning message' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'messageIds required' });
    }

    const first = await Message.findById(parseInt(messageIds[0]));
    if (!first || !(await Chat.isParticipant(parseInt(first.chat_id), req.user.id))) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await Message.markAsRead(messageIds.map(id => parseInt(id)), req.user.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error marking messages as read' });
  }
};
