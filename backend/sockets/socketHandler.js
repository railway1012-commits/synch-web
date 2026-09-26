const { Message, Chat, User, FriendRequest } = require('../database');

const onlineUsers = new Map();
const activeCalls = new Map();

module.exports = (io) => {
  io.on('connection', async (socket) => {
    // Allow guest or authenticated sockets to join QR session rooms for instant web pairing
    socket.on('qr:subscribe', (data) => {
      if (data?.qrCode) {
        socket.join(`qr:${data.qrCode}`);
      }
    });

    socket.on('qr:unsubscribe', (data) => {
      if (data?.qrCode) {
        socket.leave(`qr:${data.qrCode}`);
      }
    });

    const user = socket.user;
    if (!user) {
      // Guest socket for public announcements and live maintenance signals
      return;
    }
    console.log(`User connected: ${user.username}`);

    const userIdNum = parseInt(user.id || user._id);
    if (userIdNum && !isNaN(userIdNum)) {
      onlineUsers.set(userIdNum, socket.id);
      socket.join(`user:${userIdNum}`);
      socket.join(`user:${String(userIdNum)}`);
    }

    await User.updateStatus(user.id, 'online');

    try {
      const clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address;
      const userAgent = socket.handshake.headers['user-agent'];
      const { IpHistory } = require('../database');
      IpHistory.record(user.id, clientIp, userAgent);
    } catch (e) {}




    const userChats = await Chat.findByUserId(user.id);
    userChats.forEach(chat => {
      const cId = parseInt(chat.id);
      if (cId) {
        socket.join(`chat:${cId}`);
        socket.join(`chat:${String(cId)}`);
      }
    });

    io.emit('user:status', {
      userId: user.id,
      status: 'online'
    });

    socket.on('chat:read', async (data) => {
      try {
        const cId = parseInt(data?.chatId || data);
        if (!cId || isNaN(cId)) return;
        const chat = await Chat.findById(cId);
        if (!chat || !(await Chat.isParticipant(cId, user.id))) return;

        // Message-request privacy: reads are NOT recorded/notified until both users are friends
        let canMarkRead = true;
        if (chat.type === 'private') {
          const other = chat.participants.find(p => parseInt(p._id || p.id) !== parseInt(user.id));
          if (other) {
            const isFriend = await FriendRequest.isFriend(user.id, parseInt(other._id || other.id));
            canMarkRead = !!isFriend;
          }
        }
        if (!canMarkRead) return;

        await Message.markChatAsRead(cId, user.id);
        const readPayload = { chatId: cId, userId: user.id };
        io.to(`chat:${cId}`).emit('chat:read', readPayload);
        io.to(`chat:${cId}`).emit('message:read', readPayload);

        (chat.participants || []).forEach(p => {
          const pid = parseInt(p._id || p.id);
          if (pid && pid !== parseInt(user.id)) {
            io.to(`user:${pid}`).emit('chat:read', readPayload);
            io.to(`user:${pid}`).emit('message:read', readPayload);
          }
        });
      } catch (e) {
        console.error('Socket chat:read error:', e);
      }
    });

    socket.on('message:send', async (data, callback) => {
      try {
        const { chatId, content, type, replyTo, mediaUrl, mediaDuration } = data;

        const chat = await Chat.findById(parseInt(chatId));
        if (!chat || !(await Chat.isParticipant(parseInt(chatId), user.id))) {
          if (typeof callback === 'function') callback({ error: 'Chat not found' });
          return;
        }

        let otherParticipantId = null;
        if (chat.type === 'private') {
          const other = chat.participants.find(p => parseInt(p._id || p.id) !== parseInt(user.id));
          if (other) {
            otherParticipantId = parseInt(other._id || other.id);
            if (other.isDeleted) {
              socket.emit('error', { message: 'This account is no longer available' });
              if (typeof callback === 'function') callback({ error: 'This account is no longer available' });
              return;
            }
          }
        }

        // Strict Server-Side Blocking Check
        if (otherParticipantId) {
          const isBlocked = await User.isBlockedBetween(user.id, otherParticipantId);
          if (isBlocked) {
            socket.emit('error', { message: 'You cannot send messages to this user' });
            if (typeof callback === 'function') callback({ error: 'You cannot send messages to this user' });
            return;
          }
        }

        // Strict Server-Side Non-Friend / Message Request Check
        if (otherParticipantId) {
          const isFriend = await FriendRequest.isFriend(user.id, otherParticipantId);
          if (!isFriend) {
            // Messaging non-friends is unrestricted; replying to a non-friend still
            // auto-accepts the pending friend request below.
            const incomingFromOther = await Message.countPendingUnanswered(chat.id, otherParticipantId, user.id);
            if (incomingFromOther >= 1) {
              const { pool } = require('../database');
              const existing = await pool.query(
                `SELECT * FROM friend_requests
                 WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
                 LIMIT 1`,
                [user.id, otherParticipantId]
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
                  [otherParticipantId, user.id]
                );
              }
              const uMe = await User.findById(user.id);
              const uOther = await User.findById(otherParticipantId);
              io.to(`chat:${chat.id}`).emit('chat:request_accepted', { chatId: chat.id, acceptedBy: user.id });
              io.to(`user:${otherParticipantId}`).emit('friend:request_accepted', {
                user: User.toPublicJSON(uMe),
                chatId: chat.id
              });
              io.to(`user:${user.id}`).emit('friend:request_accepted', {
                user: User.toPublicJSON(uOther),
                chatId: chat.id
              });
            }
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
                if (typeof callback === 'function') callback({ error: 'Message blocked by word filter' });
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

        if (typeof callback === 'function') {
          callback({ success: true, message: messageJSON });
        }

        // 2. Shadowban Check: If user is shadowbanned, only return message to sender
        if (user.is_shadowbanned) {
          socket.emit('message:new', messageJSON);
          return;
        }

        // Broadcast to the chat room only (all participants are joined to it) — avoids duplicate delivery
        const chatIdNum = parseInt(chat.id);
        io.to(`chat:${chatIdNum}`).emit('message:new', messageJSON);

        // Personal-room notifications for other participants (different event, no duplication)
        const currentUserIdNum = parseInt(user.id || user._id);
        const seenPids = new Set();
        (chat.participants || []).forEach(participant => {
          const pid = parseInt(participant._id || participant.id);
          if (!pid || isNaN(pid) || seenPids.has(pid) || pid === currentUserIdNum) return;
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
      } catch (error) {
        console.error('Socket message:send error:', error);
        socket.emit('error', { message: 'Error sending message' });
        if (typeof callback === 'function') callback({ error: 'Error sending message' });
      }
    });

    socket.on('message:edit', async (data) => {
      try {
        const { messageId, content } = data;

        const message = await Message.findById(parseInt(messageId));
        if (!message || message.sender_id !== user.id) return;

        const chat = await Chat.findById(parseInt(message.chat_id));
        if (!chat || !(await Chat.isParticipant(chat.id, user.id))) return;

        const updated = await Message.update(parseInt(messageId), content);
        const messageJSON = Message.toJSON(updated);

        const chatIdNum = parseInt(message.chat_id);
        io.to(`chat:${chatIdNum}`).emit('message:edited', messageJSON);
      } catch (error) {
        socket.emit('error', { message: 'Error editing message' });
      }
    });

    socket.on('message:delete', async (data) => {
      try {
        const { messageId, deleteForEveryone = true } = data;

        const message = await Message.findById(parseInt(messageId));
        if (!message) return;

        const chat = await Chat.findById(parseInt(message.chat_id));
        if (!chat || !(await Chat.isParticipant(chat.id, user.id))) return;

        const chatIdNum = parseInt(message.chat_id);
        if (deleteForEveryone) {
          if (message.sender_id !== user.id) return;
          const createdAt = new Date(message.created_at).getTime();
          if (Date.now() - createdAt > 24 * 60 * 60 * 1000) return;

          await Message.delete(parseInt(messageId));

          const delPayload = {
            messageId: parseInt(messageId),
            chatId: chatIdNum,
            deletedForEveryone: true
          };
          io.to(`chat:${chatIdNum}`).emit('message:deleted', delPayload);
        } else {
          await Message.deleteForUser(parseInt(messageId), user.id);
          socket.emit('message:deleted', {
            messageId: parseInt(messageId),
            chatId: chatIdNum,
            deletedForEveryone: false
          });
        }
      } catch (error) {
        socket.emit('error', { message: 'Error deleting message' });
      }
    });

    socket.on('message:delete-for-me', async (data) => {
      try {
        const { messageId, messageIds } = data;
        if (messageIds && Array.isArray(messageIds)) {
          await Message.deleteForUserBulk(messageIds, user.id);
          socket.emit('message:deleted-for-me', { messageIds });
        } else if (messageId) {
          await Message.deleteForUser(parseInt(messageId), user.id);
          socket.emit('message:deleted-for-me', { messageId: parseInt(messageId) });
        }
      } catch (e) {}
    });

    socket.on('message:reaction', async (data) => {
      try {
        const { messageId, emoji } = data;

        const message = await Message.findById(parseInt(messageId));
        if (!message) return;

        const chat = await Chat.findById(parseInt(message.chat_id));
        if (!chat || !(await Chat.isParticipant(chat.id, user.id))) return;

        const reactions = await Message.addReaction(parseInt(messageId), user.id, emoji);

        const chatIdNum = parseInt(message.chat_id);
        const reactPayload = {
          messageId: parseInt(messageId),
          reactions
        };
        io.to(`chat:${chatIdNum}`).emit('message:reacted', reactPayload);
      } catch (error) {
        socket.emit('error', { message: 'Error adding reaction' });
      }
    });

    socket.on('typing:start', async (data) => {
      const cId = parseInt(data.chatId);
      if (!cId || isNaN(cId)) return;
      if (!(await Chat.isParticipant(cId, user.id))) return;
      const payload = {
        chatId: data.chatId,
        userId: user.id,
        username: user.username
      };
      socket.to(`chat:${cId}`).emit('typing:start', payload);
    });

    socket.on('typing:stop', async (data) => {
      const cId = parseInt(data.chatId);
      if (!cId || isNaN(cId)) return;
      if (!(await Chat.isParticipant(cId, user.id))) return;
      const payload = {
        chatId: data.chatId,
        userId: user.id
      };
      socket.to(`chat:${cId}`).emit('typing:stop', payload);
    });

    socket.on('message:read', async (data) => {
      try {
        const { messageIds, chatId } = data;
        if (!messageIds || !messageIds.length) return;

        const cId = parseInt(chatId);
        if (!cId || isNaN(cId)) return;
        const chat = await Chat.findById(cId);
        if (!chat || !(await Chat.isParticipant(cId, user.id))) return;

        // Message-request privacy: no read receipts until friends
        if (chat.type === 'private') {
          const other = chat.participants.find(p => parseInt(p._id || p.id) !== parseInt(user.id));
          if (other) {
            const isFriend = await FriendRequest.isFriend(user.id, parseInt(other._id || other.id));
            if (!isFriend) return;
          }
        }

        await Message.markAsRead(messageIds.map(id => parseInt(id)), user.id);

        const readData = {
          messageIds,
          chatId: cId,
          userId: user.id,
          readAt: new Date()
        };

        io.to(`chat:${cId}`).emit('message:read', readData);
      } catch (error) {
        socket.emit('error', { message: 'Error marking messages as read' });
      }
    });

    socket.on('chat:join', async (chatId) => {
      const cId = parseInt(chatId);
      if (cId && (await Chat.isParticipant(cId, user.id))) {
        socket.join(`chat:${cId}`);
      }
    });

    socket.on('chat:leave', (chatId) => {
      const cId = parseInt(chatId);
      if (cId) {
        socket.leave(`chat:${cId}`);
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

        // Strict Server-Side Calling Checks
        const isBlocked = await User.isBlockedBetween(user.id, targetUserId);
        if (isBlocked) {
          socket.emit('call:error', { message: 'Cannot call blocked user' });
          return;
        }

        const isFriend = await FriendRequest.isFriend(user.id, targetUserId);
        if (!isFriend) {
          socket.emit('call:error', { message: 'Calls are only allowed between friends' });
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

        // Only the callee may accept
        const calleeId = parseInt(activeCall.calleeId);
        if (calleeId !== parseInt(user.id || user._id)) return;

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
        const activeCall = activeCalls.get(callId);
        if (!activeCall) return;
        const uid = parseInt(user.id || user._id);
        if (parseInt(activeCall.callerId) !== uid && parseInt(activeCall.calleeId) !== uid) return;
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

        // Only the callee may reject
        const calleeId = parseInt(activeCall.calleeId);
        if (calleeId !== parseInt(user.id || user._id)) return;

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
        const activeCall = activeCalls.get(callId);
        if (!activeCall) return;
        const uid = parseInt(user.id || user._id);
        if (parseInt(activeCall.callerId) !== uid && parseInt(activeCall.calleeId) !== uid) return;

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
        const activeCall = activeCalls.get(callId);
        const uid = parseInt(user.id || user._id);
        if (activeCall && parseInt(activeCall.callerId) !== uid && parseInt(activeCall.calleeId) !== uid) return;
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
      onlineUsers.delete(parseInt(user.id || user._id));

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
