const { Chat, Message, User, FriendRequest, pool } = require('../database');
const config = require('../config');


let io = null;
exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.getChats = async (req, res) => {
  try {
    const rawChats = await Chat.findByUserId(req.user.id);
    const myBlocked = (req.user.blocked_users || []).map(Number);

    const chats = await Promise.all(rawChats.map(async chat => {
      let isBlocked = false;
      let isBlockedByMe = false;
      let isFriend = true;
      let pendingUnanswered = 0;
      let incomingPendingUnanswered = 0;
      let hasPendingIncomingFriendRequest = false;
      let hasPendingOutgoingFriendRequest = false;

      if (chat.type === 'private' && chat.participants?.length) {
        const other = chat.participants.find(p => parseInt(p.id || p._id) !== parseInt(req.user.id));
        if (other) {
          const otherId = parseInt(other.id || other._id);
          isBlockedByMe = myBlocked.includes(otherId);
          isBlocked = await User.isBlockedBetween(req.user.id, otherId);
          isFriend = await FriendRequest.isFriend(req.user.id, otherId);
          if (!isFriend) {
            pendingUnanswered = await Message.countPendingUnanswered(chat.id, req.user.id, otherId);
            incomingPendingUnanswered = await Message.countPendingUnanswered(chat.id, otherId, req.user.id);
            try {
              const frCheck = await pool.query(
                `SELECT sender_id, receiver_id, status FROM friend_requests
                 WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
                   AND status = 'pending'
                 LIMIT 1`,
                [req.user.id, otherId]
              );
              if (frCheck.rows.length > 0) {
                if (frCheck.rows[0].sender_id === otherId) {
                  hasPendingIncomingFriendRequest = true;
                } else {
                  hasPendingOutgoingFriendRequest = true;
                }
              }
            } catch (e) {}

            if (!chat.lastMessage) {
              if (hasPendingIncomingFriendRequest) {
                chat.lastMessage = {
                  id: 'fr_' + chat.id,
                  _id: 'fr_' + chat.id,
                  content: 'Sent you a friend request',
                  type: 'text',
                  senderId: otherId,
                  createdAt: chat.updated_at
                };
              } else if (hasPendingOutgoingFriendRequest) {
                chat.lastMessage = {
                  id: 'fr_' + chat.id,
                  _id: 'fr_' + chat.id,
                  content: 'Friend request sent',
                  type: 'text',
                  senderId: req.user.id,
                  createdAt: chat.updated_at
                };
              }
            }
          }
        }
      }

      return {
        _id: chat.id,
        id: chat.id,
        type: chat.type,
        name: chat.name,
        participants: chat.participants,
        lastMessage: chat.lastMessage,
        unreadCount: chat.unreadCount || 0,
        updatedAt: chat.updated_at,
        isBlocked,
        isBlockedByMe,
        isFriend,
        pendingUnanswered,
        incomingPendingUnanswered,
        hasPendingIncomingFriendRequest,
        hasPendingOutgoingFriendRequest
      };
    }));

    // Filter out 1-on-1 chats that have zero messages sent or received AND no pending requests AND are not friends
    const activeChats = chats.filter(c => 
      c.type === 'group' || 
      !!c.lastMessage || 
      c.isFriend ||
      (!c.isFriend && ((c.incomingPendingUnanswered || 0) > 0 || (c.pendingUnanswered || 0) > 0 || c.hasPendingIncomingFriendRequest))
    );
    res.json({ chats: activeChats });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Error fetching chats' });
  }
};

exports.getChat = async (req, res) => {
  try {
    const chat = await Chat.findById(parseInt(req.params.chatId));

    if (!chat || !(await Chat.isParticipant(chat.id, req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    let isBlocked = false;
    let isBlockedByMe = false;
    let isFriend = true;
    let pendingUnanswered = 0;
    let incomingPendingUnanswered = 0;

    if (chat.type === 'private' && chat.participants?.length) {
      const myBlocked = (req.user.blocked_users || []).map(Number);
      const other = chat.participants.find(p => parseInt(p.id || p._id) !== parseInt(req.user.id));
      if (other) {
        const otherId = parseInt(other.id || other._id);
        isBlockedByMe = myBlocked.includes(otherId);
        isBlocked = await User.isBlockedBetween(req.user.id, otherId);
        isFriend = await FriendRequest.isFriend(req.user.id, otherId);
        if (!isFriend) {
          pendingUnanswered = await Message.countPendingUnanswered(chat.id, req.user.id, otherId);
          incomingPendingUnanswered = await Message.countPendingUnanswered(chat.id, otherId, req.user.id);
        }
      }
    }

    res.json({
      chat: {
        _id: chat.id,
        id: chat.id,
        type: chat.type,
        name: chat.name,
        participants: chat.participants,
        updatedAt: chat.updated_at,
        isBlocked,
        isBlockedByMe,
        isFriend,
        pendingUnanswered,
        incomingPendingUnanswered
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chat' });
  }
};

exports.createChat = async (req, res) => {
  try {
    const targetUserId = parseInt(req.body.participantId || req.body.userId);
    const { type, name } = req.body;

    const myBlocked = (req.user.blocked_users || []).map(Number);

    if (type === 'private' || !type) {
      if (!targetUserId || isNaN(targetUserId)) {
        return res.status(400).json({ error: 'Valid participantId or userId is required' });
      }

      if (targetUserId === parseInt(req.user.id)) {
        return res.status(400).json({ error: 'You cannot create a chat with yourself' });
      }
      const targetExists = await User.findById(targetUserId);
      if (!targetExists || targetExists.is_deleted) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (myBlocked.includes(targetUserId)) {
        return res.status(403).json({ error: 'You have blocked this user' });
      }

      const existingChat = await Chat.findPrivateChat(req.user.id, targetUserId);

      if (existingChat) {
        const isBlockedByMe = myBlocked.includes(targetUserId);
        const isBlocked = await User.isBlockedBetween(req.user.id, targetUserId);
        const isFriend = await FriendRequest.isFriend(req.user.id, targetUserId);
        let pendingUnanswered = 0;
        let incomingPendingUnanswered = 0;
        if (!isFriend) {
          pendingUnanswered = await Message.countPendingUnanswered(existingChat.id, req.user.id, targetUserId);
          incomingPendingUnanswered = await Message.countPendingUnanswered(existingChat.id, targetUserId, req.user.id);
        }

        return res.json({
          chat: {
            _id: existingChat.id,
            id: existingChat.id,
            type: existingChat.type,
            name: existingChat.name,
            participants: existingChat.participants,
            updatedAt: existingChat.updated_at,
            isBlocked,
            isBlockedByMe,
            isFriend,
            pendingUnanswered,
            incomingPendingUnanswered
          }
        });
      }
    }

    const chat = await Chat.create(type || 'private', name || null, type === 'group' ? req.user.id : null);

    await Chat.addParticipant(chat.id, req.user.id);

    if (type === 'group' && req.body.participants) {
      for (const id of req.body.participants) {
        await Chat.addParticipant(chat.id, parseInt(id));
      }
    } else {
      await Chat.addParticipant(chat.id, targetUserId);
    }

    const fullChat = await Chat.findById(chat.id);
    let isBlocked = false;
    let isBlockedByMe = false;
    let isFriend = true;
    let pendingUnanswered = 0;
    let incomingPendingUnanswered = 0;
    if (targetUserId) {
      isBlockedByMe = myBlocked.includes(targetUserId);
      isBlocked = await User.isBlockedBetween(req.user.id, targetUserId);
      isFriend = await FriendRequest.isFriend(req.user.id, targetUserId);
      if (!isFriend) {
        pendingUnanswered = await Message.countPendingUnanswered(fullChat.id, req.user.id, targetUserId);
        incomingPendingUnanswered = await Message.countPendingUnanswered(fullChat.id, targetUserId, req.user.id);
      }
    }

    const chatJSON = {
      _id: fullChat.id,
      id: fullChat.id,
      type: fullChat.type,
      name: fullChat.name,
      participants: fullChat.participants,
      updatedAt: fullChat.updated_at,
      isBlocked,
      isBlockedByMe,
      isFriend,
      pendingUnanswered,
      incomingPendingUnanswered
    };

    if (io) {
      fullChat.participants.forEach(p => {
        const pId = p.id || p._id;
        if (pId) {
          io.to(`user:${pId}`).emit('chat:new', { chat: chatJSON });
          io.to(`user:${String(pId)}`).emit('chat:new', { chat: chatJSON });
        }
      });
    }

    res.status(201).json({
      chat: chatJSON
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Error creating chat' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50, before } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

    if (!(await Chat.isParticipant(parseInt(chatId), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const messages = (await Message.findByChatId(parseInt(chatId), parsedLimit, before, req.user.id))
      .map(msg => Message.toJSON(msg));

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
};

exports.searchMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { q } = req.query;

    if (!(await Chat.isParticipant(parseInt(chatId), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const messages = (await Message.search(parseInt(chatId), q)).map(msg => Message.toJSON(msg));

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'Error searching messages' });
  }
};

exports.clearChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(parseInt(chatId));
    if (!chat || !(await Chat.isParticipant(chat.id, req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Delete-for-me semantics: only the requester loses the messages; the other side keeps them
    await pool.query(
      `INSERT INTO message_deletions (message_id, user_id)
       SELECT id, $2 FROM messages WHERE chat_id = $1
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [parseInt(chatId), req.user.id]
    );

    if (io) {
      io.to(`user:${req.user.id}`).emit('chat:cleared', { chatId: parseInt(chatId) });
    }

    res.json({ message: 'Chat cleared for you' });
  } catch (error) {
    res.status(500).json({ error: 'Error clearing chat' });
  }
};

exports.deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(parseInt(chatId));
    if (!chat || !(await Chat.isParticipant(chat.id, req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.type === 'private' && chat.participants?.length >= 2) {
      const other = chat.participants.find(p => parseInt(p._id || p.id) !== parseInt(req.user.id));
      if (other) {
        const otherId = parseInt(other._id || other.id);
        await FriendRequest.removeFriendship(req.user.id, otherId);
        if (io) {
          io.to(`user:${otherId}`).emit('friend:request_declined', {
            receiverId: req.user.id,
            chatId: parseInt(chatId)
          });
          io.to(`user:${req.user.id}`).emit('friend:request_declined', {
            receiverId: req.user.id,
            chatId: parseInt(chatId)
          });
        }
      }
    }

    await Chat.delete(parseInt(chatId));

    if (io) {
      chat.participants.forEach(p => {
        const pId = p.id || p._id;
        if (pId) {
          io.to(`user:${pId}`).emit('chat:deleted', { chatId: parseInt(chatId) });
          io.to(`user:${String(pId)}`).emit('chat:deleted', { chatId: parseInt(chatId) });
        }
      });
    }

    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting chat' });
  }
};

exports.exportChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(parseInt(chatId));

    if (!chat || !(await Chat.isParticipant(chat.id, req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const messages = await Message.findByChatId(chat.id, 1000);

    const exportData = {
      chat: {
        type: chat.type,
        name: chat.name,
        participants: chat.participants.map(p => p.username),
        exportedAt: new Date()
      },
      messages: messages.map(m => ({
        sender: m.sender.username,
        type: m.type,
        content: m.content,
        timestamp: m.created_at
      }))
    };

    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: 'Error exporting chat' });
  }
};

// Group Management Endpoints
exports.addParticipants = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userIds } = req.body;

    const chat = await Chat.findById(parseInt(chatId));
    if (!chat || chat.type !== 'group') {
      return res.status(400).json({ error: 'Invalid group chat' });
    }

    if (!(await Chat.isParticipant(chat.id, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const ids = Array.isArray(userIds) ? userIds : [userIds];
    await Chat.addParticipants(chat.id, ids);

    const updatedChat = await Chat.findById(chat.id);
    const chatJSON = {
      _id: updatedChat.id,
      type: updatedChat.type,
      name: updatedChat.name,
      participants: updatedChat.participants,
      updatedAt: updatedChat.updated_at
    };

    if (io) {
      updatedChat.participants.forEach(p => {
        io.to(`user:${p._id}`).emit('group:member_added', { chat: chatJSON, addedUserIds: ids });
      });
    }

    res.json({ success: true, chat: chatJSON });
  } catch (error) {
    console.error('Add participants error:', error);
    res.status(500).json({ error: 'Failed to add members' });
  }
};

exports.removeParticipant = async (req, res) => {
  try {
    const { chatId, userId } = req.params;
    const targetUserId = parseInt(userId);

    const chat = await Chat.findById(parseInt(chatId));
    if (!chat || chat.type !== 'group') {
      return res.status(400).json({ error: 'Invalid group chat' });
    }

    const isSelf = targetUserId === req.user.id;
    const isAdmin = chat.admin_id === req.user.id || req.user.role === 'admin' || req.user.role === 'superadmin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Only group admins can remove other members' });
    }

    await Chat.removeParticipant(chat.id, targetUserId);

    if (io) {
      io.to(`user:${targetUserId}`).emit('group:removed_self', { chatId: chat.id });
      const remainingChat = await Chat.findById(chat.id);
      if (remainingChat) {
        remainingChat.participants.forEach(p => {
          io.to(`user:${p._id}`).emit('group:member_removed', { chatId: chat.id, removedUserId: targetUserId });
        });
      }
    }

    res.json({ success: true, message: isSelf ? 'You left the group' : 'Member removed' });
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { name, avatar } = req.body;

    const chat = await Chat.findById(parseInt(chatId));
    if (!chat || chat.type !== 'group') {
      return res.status(400).json({ error: 'Invalid group chat' });
    }

    if (!(await Chat.isParticipant(chat.id, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const updatedChat = await Chat.updateMetadata(chat.id, { name, avatar });
    const chatJSON = {
      _id: updatedChat.id,
      type: updatedChat.type,
      name: updatedChat.name,
      avatar: updatedChat.avatar,
      participants: updatedChat.participants,
      updatedAt: updatedChat.updated_at
    };

    if (io) {
      updatedChat.participants.forEach(p => {
        io.to(`user:${p._id}`).emit('group:updated', { chat: chatJSON });
      });
    }

    res.json({ success: true, chat: chatJSON });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
};

// WebRTC ICE Servers with TURN support
exports.getIceServers = async (req, res) => {
  try {
    const config = require('../config');
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' }
    ];

    // If Twilio credentials are provided, generate dynamic TURN tokens
    if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio');
        const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
        const token = await client.tokens.create();
        if (token && token.iceServers) {
          return res.json({ iceServers: token.iceServers });
        }
      } catch (twErr) {
        console.warn('Twilio TURN token generation fallback:', twErr.message);
      }
    }

    res.json({ iceServers });
  } catch (error) {
    res.status(500).json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
  }
};

exports.acceptChatRequest = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const chat = await Chat.findById(chatId);
    if (!chat || !(await Chat.isParticipant(chat.id, req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.type !== 'private') {
      return res.json({ message: 'Chat is already active', isFriend: true });
    }

    const other = chat.participants.find(p => parseInt(p._id || p.id) !== parseInt(req.user.id));
    if (!other) {
      return res.status(400).json({ error: 'Other participant not found' });
    }
    const otherId = parseInt(other._id || other.id);

    const isBlocked = await User.isBlockedBetween(req.user.id, otherId);
    if (isBlocked) {
      return res.status(403).json({ error: 'Cannot accept request from blocked user' });
    }

    // Require an actual pending incoming request or pending message before accepting
    const incomingFromOther = await Message.countPendingUnanswered(chat.id, otherId, req.user.id);
    const pendingRequest = await pool.query(
      `SELECT 1 FROM friend_requests
       WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'
       LIMIT 1`,
      [otherId, req.user.id]
    );
    if (incomingFromOther < 1 && pendingRequest.rows.length === 0) {
      return res.status(400).json({ error: 'No pending request to accept' });
    }

    // Ensure friendship in friend_requests table
    const existing = await pool.query(
      `SELECT * FROM friend_requests
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       LIMIT 1`,
      [req.user.id, otherId]
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
        [otherId, req.user.id]
      );
    }

    // Merge any duplicate chats between these two participants into chatId so all pre-accept messages are unified
    try {
      const allChats = await pool.query(
        `SELECT c.id FROM chats c
         JOIN chat_participants cp ON c.id = cp.chat_id
         WHERE c.type = 'private'
           AND cp.user_id IN ($1, $2)
         GROUP BY c.id
         HAVING COUNT(DISTINCT cp.user_id) = 2
         ORDER BY c.id ASC`,
        [req.user.id, otherId]
      );
      if (allChats.rows.length > 1) {
        for (const row of allChats.rows) {
          if (row.id !== chatId) {
            await pool.query('UPDATE messages SET chat_id = $1 WHERE chat_id = $2', [chatId, row.id]);
            await pool.query('UPDATE chats SET last_message_id = NULL WHERE id = $1', [row.id]);
            await pool.query('DELETE FROM chat_participants WHERE chat_id = $1', [row.id]);
            await pool.query('DELETE FROM chats WHERE id = $1', [row.id]);
          }
        }
      }
      await pool.query(
        `UPDATE chats 
         SET last_message_id = (SELECT id FROM messages WHERE chat_id = $1 AND deleted = FALSE ORDER BY created_at DESC LIMIT 1),
             updated_at = COALESCE((SELECT MAX(created_at) FROM messages WHERE chat_id = $1), CURRENT_TIMESTAMP)
         WHERE id = $1`,
        [chatId]
      );
    } catch (e) {
      console.error('Error merging duplicate chats on accept:', e);
    }

    // Mark messages in this chat as read
    await pool.query(
      `INSERT INTO message_reads (message_id, user_id)
       SELECT m.id, $1 FROM messages m
       WHERE m.chat_id = $2 AND m.sender_id != $1
       ON CONFLICT DO NOTHING`,
      [req.user.id, chatId]
    );

    const chatJSON = {
      _id: chat.id,
      id: chat.id,
      type: chat.type,
      name: chat.name,
      participants: chat.participants,
      isFriend: true,
      isBlocked: false,
      isBlockedByMe: false,
      pendingUnanswered: 0,
      incomingPendingUnanswered: 0,
      updatedAt: chat.updated_at
    };

    if (io) {
      const uMe = await User.findById(req.user.id);
      const uOther = await User.findById(otherId);

      const acceptPayload = {
        chatId: chat.id,
        acceptedBy: req.user.id
      };
      io.to(`chat:${chat.id}`).emit('chat:request_accepted', acceptPayload);
      io.to(`chat:${String(chat.id)}`).emit('chat:request_accepted', acceptPayload);
      io.to(`user:${otherId}`).emit('chat:request_accepted', acceptPayload);
      io.to(`user:${String(otherId)}`).emit('chat:request_accepted', acceptPayload);
      io.to(`user:${req.user.id}`).emit('chat:request_accepted', acceptPayload);
      io.to(`user:${String(req.user.id)}`).emit('chat:request_accepted', acceptPayload);

      io.to(`user:${otherId}`).emit('chat:new', { chat: chatJSON });
      io.to(`user:${String(otherId)}`).emit('chat:new', { chat: chatJSON });
      io.to(`user:${req.user.id}`).emit('chat:new', { chat: chatJSON });
      io.to(`user:${String(req.user.id)}`).emit('chat:new', { chat: chatJSON });

      io.to(`user:${otherId}`).emit('friend:request_accepted', {
        user: User.toPublicJSON(uMe),
        chat: chatJSON
      });
      io.to(`user:${String(otherId)}`).emit('friend:request_accepted', {
        user: User.toPublicJSON(uMe),
        chat: chatJSON
      });
      io.to(`user:${req.user.id}`).emit('friend:request_accepted', {
        user: User.toPublicJSON(uOther),
        chat: chatJSON
      });
      io.to(`user:${String(req.user.id)}`).emit('friend:request_accepted', {
        user: User.toPublicJSON(uOther),
        chat: chatJSON
      });
    }

    res.json({ message: 'Message request accepted', chat: chatJSON, isFriend: true });
  } catch (error) {
    console.error('Accept chat request error:', error);
    res.status(500).json({ error: 'Error accepting message request' });
  }
};

exports.markChatAsRead = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    if (!chatId || isNaN(chatId)) {
      return res.status(400).json({ error: 'Valid chatId required' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat || !(await Chat.isParticipant(chatId, req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Message-request privacy: reads are not recorded/notified until both users are friends
    let canMarkRead = true;
    if (chat.type === 'private') {
      const other = chat.participants.find(p => parseInt(p._id || p.id) !== parseInt(req.user.id));
      if (other) {
        const isFriend = await FriendRequest.isFriend(req.user.id, parseInt(other._id || other.id));
        canMarkRead = !!isFriend;
      }
    }
    if (!canMarkRead) {
      return res.json({ message: 'Read receipt withheld until friends', markedRead: false });
    }

    await Message.markChatAsRead(chatId, req.user.id);

    if (io) {
      const readPayload = { chatId, userId: req.user.id };
      io.to(`chat:${chatId}`).emit('chat:read', readPayload);
      io.to(`chat:${String(chatId)}`).emit('chat:read', readPayload);
      io.to(`chat:${chatId}`).emit('message:read', readPayload);
      io.to(`chat:${String(chatId)}`).emit('message:read', readPayload);

      (chat.participants || []).forEach(p => {
        const pid = parseInt(p._id || p.id);
        if (pid) {
          io.to(`user:${pid}`).emit('chat:read', readPayload);
          io.to(`user:${String(pid)}`).emit('chat:read', readPayload);
          io.to(`user:${pid}`).emit('message:read', readPayload);
          io.to(`user:${String(pid)}`).emit('message:read', readPayload);
        }
      });
    }

    res.json({ success: true, chatId });
  } catch (error) {
    console.error('Mark chat as read error:', error);
    res.status(500).json({ error: 'Error marking chat as read' });
  }
};


