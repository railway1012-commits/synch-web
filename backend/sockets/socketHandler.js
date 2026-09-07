const { Message, Chat, User } = require('../database');

const onlineUsers = new Map();
const activeCalls = new Map();

module.exports = (io) => {
  io.on('connection', async (socket) => {
    const user = socket.user;
    if (!user) {
      // Guest socket for public announcements and live maintenance signals
      return;
    }
    console.log(`User connected: ${user.username}`);

    onlineUsers.set(user.id, socket.id);

    // Join single unified user room for this user
    socket.join(`user:${parseInt(user.id)}`);

    await User.updateStatus(user.id, 'online');

    try {
      const clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address;
      const userAgent = socket.handshake.headers['user-agent'];
      const { IpHistory } = require('../database');
      IpHistory.record(user.id, clientIp, userAgent);
    } catch (e) {}




    const userChats = await Chat.findByUserId(user.id);
    userChats.forEach(chat => {
      socket.join(`chat:${chat.id}`);
    });

    io.emit('user:status', {
      userId: user.id,
      status: 'online'
    });

    socket.on('message:send', async (data) => {
      try {
        const { chatId, content, type, replyTo, mediaUrl, mediaDuration } = data;

        const chat = await Chat.findById(parseInt(chatId));
        if (!chat || !(await Chat.isParticipant(parseInt(chatId), user.id))) {
          return;
        }

        if (chat.type === 'private') {
          const other = chat.participants.find(p => p._id !== user.id);
          if (other && other.isDeleted) {
            socket.emit('error', { message: 'This account is no longer available' });
            return;
          }
        }

        // 1. Auto-Moderation Word Blacklist Filter
        if (content && typeof content === 'string') {
          const { pool } = require('../database');
          try {
            const wordsRes = await pool.query('SELECT word, action FROM word_blacklist');
            const lowerContent = content.toLowerCase();
            for (const row of wordsRes.rows) {
              if (lowerContent.includes(row.word.toLowerCase())) {
                socket.emit('error', { message: `Message blocked: Contains restricted keyword "${row.word}"` });
                return;
              }
            }
          } catch (e) {}
        }

        const message = await Message.create(
          parseInt(chatId),
          user.id,
          type || 'text',
          content || '',
          mediaUrl || null,
          mediaDuration || null,
          replyTo ? parseInt(replyTo) : null
        );

        const messageJSON = Message.toJSON(message);

        // 2. Shadowban Check: If user is shadowbanned, only return message to sender
        if (user.is_shadowbanned) {
          socket.emit('message:new', messageJSON);
          return;
        }

        // Broadcast directly to every participant's personal room (strictly deduplicated)
        const seenPids = new Set();
        (chat.participants || []).forEach(participant => {
          const pid = participant._id || participant.id;
          if (!pid || seenPids.has(pid)) return;
          seenPids.add(pid);

          io.to(`user:${pid}`).emit('message:new', messageJSON);
          if (pid !== user.id) {
            io.to(`user:${pid}`).emit('message:notification', {
              message: messageJSON,
              chat: {
                _id: chat.id,
                participants: chat.participants
              }
            });
          }
        });
      } catch (error) {
        console.error('Socket message:send error:', error);
        socket.emit('error', { message: 'Error sending message' });
      }
    });

    socket.on('message:edit', async (data) => {
      try {
        const { messageId, content } = data;

        const message = await Message.findById(parseInt(messageId));
        if (!message || message.sender_id !== user.id) return;

        const updated = await Message.update(parseInt(messageId), content);
        const messageJSON = Message.toJSON(updated);

        io.to(`chat:${message.chat_id}`).emit('message:edited', messageJSON);
      } catch (error) {
        socket.emit('error', { message: 'Error editing message' });
      }
    });

    socket.on('message:delete', async (data) => {
      try {
        const { messageId } = data;

        const message = await Message.findById(parseInt(messageId));
        if (!message || message.sender_id !== user.id) return;

        await Message.delete(parseInt(messageId));

        io.to(`chat:${message.chat_id}`).emit('message:deleted', {
          messageId: parseInt(messageId),
          chatId: message.chat_id
        });
      } catch (error) {
        socket.emit('error', { message: 'Error deleting message' });
      }
    });

    socket.on('message:reaction', async (data) => {
      try {
        const { messageId, emoji } = data;

        const message = await Message.findById(parseInt(messageId));
        if (!message) return;

        const reactions = await Message.addReaction(parseInt(messageId), user.id, emoji);

        io.to(`chat:${message.chat_id}`).emit('message:reacted', {
          messageId: parseInt(messageId),
          reactions
        });
      } catch (error) {
        socket.emit('error', { message: 'Error adding reaction' });
      }
    });

    socket.on('typing:start', (data) => {
      socket.to(`chat:${data.chatId}`).emit('typing:start', {
        chatId: data.chatId,
        userId: user.id,
        username: user.username
      });
    });

    socket.on('typing:stop', (data) => {
      socket.to(`chat:${data.chatId}`).emit('typing:stop', {
        chatId: data.chatId,
        userId: user.id
      });
    });

    socket.on('message:read', async (data) => {
      try {
        const { messageIds, chatId } = data;

        await Message.markAsRead(messageIds.map(id => parseInt(id)), user.id);

        socket.to(`chat:${chatId}`).emit('message:read', {
          messageIds,
          userId: user.id,
          readAt: new Date()
        });
      } catch (error) {
        socket.emit('error', { message: 'Error marking messages as read' });
      }
    });

    socket.on('chat:join', async (chatId) => {
      if (await Chat.isParticipant(parseInt(chatId), user.id)) {
        socket.join(`chat:${chatId}`);
      }
    });

    socket.on('chat:leave', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // Broadcast media messages (images, voice) to other users
    socket.on('message:broadcast', (message) => {
      if (message && message.chat) {
        socket.to(`chat:${message.chat}`).emit('message:new', message);
      }
    });

    function emitToUser(userId, eventName, payload) {
      if (!userId) return;
      const uid = parseInt(userId);
      if (isNaN(uid)) return;
      io.to(`user:${uid}`).emit(eventName, payload);
    }


    // ==========================================
    // AUDIO & VIDEO CALLING (WebRTC Signaling)
    // ==========================================
    socket.on('call:initiate', async (data) => {
      try {
        const { toUserId, chatId, callerName, callerAvatar, isVideo } = data;
        const targetUserId = parseInt(toUserId || data.targetUserId);
        if (!targetUserId || isNaN(targetUserId)) {
          socket.emit('call:error', { message: 'Invalid target user ID' });
          return;
        }

        const callId = `call_${user.id}_${targetUserId}_${Date.now()}`;
        const activeCall = {
          callId,
          callerId: user.id,
          callerName: callerName || user.displayName || user.name || user.username,
          callerAvatar: callerAvatar || user.avatar || null,
          calleeId: targetUserId,
          chatId: chatId ? parseInt(chatId) : null,
          isVideo: !!isVideo,
          status: 'ringing',
          createdAt: Date.now()
        };
        activeCalls.set(callId, activeCall);

        // Notify target user's personal room across all active sockets and devices
        emitToUser(targetUserId, 'call:incoming', {
          callId,
          callerId: user.id,
          callerName: activeCall.callerName,
          callerAvatar: activeCall.callerAvatar,
          chatId: activeCall.chatId,
          isVideo: activeCall.isVideo
        });

        // Acknowledge back to caller
        socket.emit('call:initiated', { callId, toUserId: targetUserId, isVideo: activeCall.isVideo });
      } catch (err) {
        console.error('call:initiate error:', err);
        socket.emit('call:error', { message: 'Failed to initiate call' });
      }
    });

    socket.on('call:accept', (data) => {
      try {
        const { callId, isVideo } = data;
        const activeCall = activeCalls.get(callId);
        if (!activeCall) return;

        activeCall.status = 'connected';
        activeCall.connectedAt = Date.now();
        if (typeof isVideo === 'boolean') activeCall.isVideo = isVideo;

        // Notify the caller that callee accepted
        emitToUser(activeCall.callerId, 'call:accepted', {
          callId,
          calleeId: user.id,
          isVideo: activeCall.isVideo
        });
      } catch (err) {
        console.error('call:accept error:', err);
      }
    });

    socket.on('call:mode_changed', (data) => {
      try {
        const { toUserId, callId, isVideo, isScreenShare, isMuted } = data;
        if (!toUserId) return;
        emitToUser(toUserId, 'call:mode_changed', {
          fromUserId: user.id,
          callId,
          isVideo,
          isScreenShare,
          isMuted
        });
      } catch (err) {
        console.error('call:mode_changed error:', err);
      }
    });

    socket.on('call:reject', (data) => {
      try {
        const { callId, reason } = data;
        const activeCall = activeCalls.get(callId);
        if (!activeCall) return;

        activeCalls.delete(callId);

        // Notify caller that callee rejected / is busy
        emitToUser(activeCall.callerId, 'call:rejected', {
          callId,
          calleeId: user.id,
          reason: reason || 'declined'
        });
      } catch (err) {
        console.error('call:reject error:', err);
      }
    });

    socket.on('call:signal', (data) => {
      try {
        const { toUserId, callId, signal } = data;
        if (!toUserId || !signal) return;

        emitToUser(toUserId, 'call:signal', {
          fromUserId: user.id,
          callId,
          signal
        });
      } catch (err) {
        console.error('call:signal error:', err);
      }
    });

    socket.on('call:end', (data) => {
      try {
        const { callId, toUserId } = data;
        if (callId) activeCalls.delete(callId);

        const targetId = toUserId ? parseInt(toUserId) : null;
        if (targetId) {
          emitToUser(targetId, 'call:ended', {
            callId,
            byUserId: user.id
          });
        }
      } catch (err) {
        console.error('call:end error:', err);
      }
    });



    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${user.username}`);
      onlineUsers.delete(user.id);

      // Clean up any active call involving this user
      for (const [callId, call] of activeCalls.entries()) {
        if (call.callerId === user.id || call.calleeId === user.id) {
          const remoteUserId = call.callerId === user.id ? call.calleeId : call.callerId;
          io.to(`user:${remoteUserId}`).emit('call:ended', {
            callId,
            byUserId: user.id,
            reason: 'disconnected'
          });
          activeCalls.delete(callId);
        }
      }

      await User.updateStatus(user.id, 'offline');

      io.emit('user:status', {
        userId: user.id,
        status: 'offline',
        lastSeen: new Date()
      });
    });
  });
};
