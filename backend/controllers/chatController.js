const { Chat, Message, User, pool } = require('../database');
const config = require('../config');


let io = null;
exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.getChats = async (req, res) => {
  try {
    const chats = (await Chat.findByUserId(req.user.id)).map(chat => ({
      _id: chat.id,
      type: chat.type,
      name: chat.name,
      participants: chat.participants,
      lastMessage: chat.lastMessage,
      unreadCount: chat.unreadCount || 0,
      updatedAt: chat.updated_at
    }));

    res.json({ chats });
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

    res.json({
      chat: {
        _id: chat.id,
        type: chat.type,
        name: chat.name,
        participants: chat.participants,
        updatedAt: chat.updated_at
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chat' });
  }
};

exports.createChat = async (req, res) => {
  try {
    const { participantId, type, name } = req.body;

    if (type === 'private' || !type) {
      const existingChat = await Chat.findPrivateChat(req.user.id, parseInt(participantId));

      if (existingChat) {
        return res.json({
          chat: {
            _id: existingChat.id,
            type: existingChat.type,
            name: existingChat.name,
            participants: existingChat.participants,
            updatedAt: existingChat.updated_at
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
      await Chat.addParticipant(chat.id, parseInt(participantId));
    }

    const fullChat = await Chat.findById(chat.id);
    const chatJSON = {
      _id: fullChat.id,
      type: fullChat.type,
      name: fullChat.name,
      participants: fullChat.participants,
      updatedAt: fullChat.updated_at
    };

    if (io) {
      fullChat.participants.forEach(p => {
        io.to(`user:${p._id}`).emit('chat:new', { chat: chatJSON });
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

    if (!(await Chat.isParticipant(parseInt(chatId), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const messages = (await Message.findByChatId(parseInt(chatId), parseInt(limit), before))
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

    await pool.query('DELETE FROM messages WHERE chat_id = $1', [parseInt(chatId)]);
    await pool.query('UPDATE chats SET last_message_id = NULL WHERE id = $1', [parseInt(chatId)]);

    if (io) {
      chat.participants.forEach(p => {
        io.to(`user:${p._id}`).emit('chat:cleared', { chatId: parseInt(chatId) });
      });
    }

    res.json({ message: 'Chat cleared successfully' });
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

    await Chat.delete(parseInt(chatId));

    if (io) {
      chat.participants.forEach(p => {
        io.to(`user:${p._id}`).emit('chat:deleted', { chatId: parseInt(chatId) });
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

