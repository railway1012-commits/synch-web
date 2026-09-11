const { Message, Chat } = require('../database');

let io = null;

exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.sendMessage = async (req, res) => {
  try {
    const { chatId, content, type, replyTo, mediaDuration } = req.body;

    const chat = await Chat.findById(parseInt(chatId));
    if (!chat || !(await Chat.isParticipant(parseInt(chatId), req.user.id))) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.type === 'private') {
      const other = chat.participants.find(p => p._id !== req.user.id);
      if (other && other.isDeleted) {
        return res.status(400).json({ error: 'This account is no longer available' });
      }
    }

    let mediaUrl = null;
    let messageType = type || 'text';
    if (req.file) {
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
      // 1. Broadcast directly to chat room for instant live delivery
      io.to(`chat:${chatIdNum}`).emit('message:new', messageJSON);
      io.to(`chat:${String(chatIdNum)}`).emit('message:new', messageJSON);

      // 2. Broadcast to participant personal rooms
      const seenPids = new Set();
      (chat.participants || []).forEach(participant => {
        const pid = parseInt(participant._id || participant.id);
        if (!pid || isNaN(pid) || seenPids.has(pid)) return;
        seenPids.add(pid);

        io.to(`user:${pid}`).emit('message:new', messageJSON);
        io.to(`user:${String(pid)}`).emit('message:new', messageJSON);
        if (pid !== parseInt(req.user.id)) {
          const notifPayload = {
            message: messageJSON,
            chat: {
              _id: chat.id,
              participants: chat.participants
            }
          };
          io.to(`user:${pid}`).emit('message:notification', notifPayload);
          io.to(`user:${String(pid)}`).emit('message:notification', notifPayload);
        }
      });
    }

    res.status(201).json({ message: messageJSON });
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

    await Message.delete(parseInt(messageId));

    if (io) {
      const chatIdNum = parseInt(message.chat_id);
      const delPayload = {
        messageId: parseInt(messageId),
        chatId: chatIdNum
      };
      io.to(`chat:${chatIdNum}`).emit('message:deleted', delPayload);
      io.to(`chat:${String(chatIdNum)}`).emit('message:deleted', delPayload);
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting message' });
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

    await Message.markAsRead(messageIds.map(id => parseInt(id)), req.user.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error marking messages as read' });
  }
};
