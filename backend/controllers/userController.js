const { User, FriendRequest, Chat } = require('../database');

let io = null;
exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.getUsers = async (req, res) => {
  try {
    const { search } = req.query;

    const users = await User.findAllWithFriendStatus(req.user.id, search || '');

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Error fetching users' });
  }
};

exports.getUser = async (req, res) => {
  try {
    const user = await User.findByIdWithFriendStatus(parseInt(req.params.userId), req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user' });
  }
};

exports.findByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findByUsername(username.trim());

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    res.json({
      user: {
        _id: user.id,
        username: user.username,
        avatar: user.avatar,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error finding user' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const allowedSettings = [
      'theme', 'accentColor', 'fontSize', 'bubbleStyle',
      'showOnlineStatus', 'showReadReceipts', 'showLastSeen',
      'messageSound', 'desktopNotifications', 'notificationVolume',
      'enterToSend', 'mediaAutoDownload', 'messagePreview'
    ];

    const updates = {};
    for (const key of allowedSettings) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    await User.updateSettings(req.user.id, updates);
    const updatedUser = await User.findById(req.user.id);

    res.json({ settings: updatedUser.settings });
  } catch (error) {
    res.status(500).json({ error: 'Error updating settings' });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const userToBlock = await User.findById(parseInt(userId));
    if (!userToBlock) {
      return res.status(404).json({ error: 'User not found' });
    }

    await User.blockUser(req.user.id, parseInt(userId));

    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error blocking user' });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await User.unblockUser(req.user.id, parseInt(userId));

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error unblocking user' });
  }
};

exports.getBlockedUsers = async (req, res) => {
  try {
    const blockedUsers = (await User.getBlockedUsers(req.user.id)).map(u => ({
      _id: u.id,
      username: u.username,
      avatar: u.avatar
    }));

    res.json({ blockedUsers });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching blocked users' });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarUrl = `/uploads/images/${req.file.filename}`;
    await User.updateAvatar(req.user.id, avatarUrl);
    const updatedUser = await User.findById(req.user.id);

    if (io) {
      io.emit('user:profile_updated', {
        userId: req.user.id,
        avatar: avatarUrl,
        username: updatedUser.username
      });
    }

    res.json({ avatar: avatarUrl, user: User.toPublicJSON(updatedUser) });
  } catch (error) {
    res.status(500).json({ error: 'Error updating avatar' });
  }
};

exports.getIncomingRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.getIncoming(req.user.id);
    res.json({ requests });
  } catch (error) {
    console.error('Get incoming requests error:', error);
    res.status(500).json({ error: 'Error fetching friend requests' });
  }
};

exports.getOutgoingRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.getOutgoing(req.user.id);
    res.json({ requests });
  } catch (error) {
    console.error('Get outgoing requests error:', error);
    res.status(500).json({ error: 'Error fetching outgoing requests' });
  }
};

exports.sendFriendRequest = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const targetUserId = parseInt(receiverId);

    if (!targetUserId || targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Invalid user' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser || targetUser.is_deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    const request = await FriendRequest.send(req.user.id, targetUserId);

    if (io) {
      io.to(`user:${targetUserId}`).emit('friend:request_received', {
        request: {
          _id: request.id,
          status: request.status,
          createdAt: request.created_at,
          user: User.toPublicJSON(req.user)
        }
      });
    }

    res.status(201).json({ request, message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Error sending friend request' });
  }
};

exports.acceptFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await FriendRequest.accept(parseInt(id), req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const { request, chat } = result;

    if (io) {
      const chatJSON = {
        _id: chat.id,
        type: chat.type,
        name: chat.name,
        participants: chat.participants,
        updatedAt: chat.updated_at
      };

      // Notify sender
      io.to(`user:${request.sender_id}`).emit('friend:request_accepted', {
        requestId: request.id,
        user: User.toPublicJSON(req.user),
        chat: chatJSON
      });
      io.to(`user:${request.sender_id}`).emit('chat:new', { chat: chatJSON });

      // Notify receiver (current user)
      io.to(`user:${req.user.id}`).emit('chat:new', { chat: chatJSON });
    }

    res.json({ message: 'Friend request accepted', chat });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Error accepting friend request' });
  }
};

exports.declineFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await FriendRequest.decline(parseInt(id), req.user.id);

    if (io && request) {
      io.to(`user:${request.sender_id}`).emit('friend:request_declined', {
        requestId: request.id,
        receiverId: req.user.id,
        user: User.toPublicJSON(req.user)
      });
    }

    res.json({ message: 'Friend request declined' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'Error declining friend request' });
  }
};

exports.cancelFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await FriendRequest.cancel(parseInt(id), req.user.id);

    if (io && request) {
      io.to(`user:${request.receiver_id}`).emit('friend:request_cancelled', {
        requestId: request.id,
        senderId: req.user.id,
        user: User.toPublicJSON(req.user)
      });
    }

    res.json({ message: 'Friend request cancelled' });
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ error: 'Error cancelling friend request' });
  }
};

exports.submitReport = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { reportedId, chatId, messageId, reason, details } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Report reason is required' });
    }

    const { Report, Webhook } = require('../database');
    const report = await Report.create({
      reporter_id: reporterId,
      reported_id: reportedId ? parseInt(reportedId, 10) : null,
      chat_id: chatId ? parseInt(chatId, 10) : null,
      message_id: messageId ? parseInt(messageId, 10) : null,
      reason,
      details: details || ''
    });

    // Notify Admins in Real-time via Socket
    if (io) {
      io.emit('report:new', report);
    }

    // Trigger Staff Webhook Alert if configured
    try {
      Webhook.trigger('REPORT', {
        title: '🚨 New User Safety Report',
        reporter: req.user.username,
        reportedId: reportedId || 'N/A (System / Bug Report)',
        reason,
        details: details || 'No additional details provided'
      }).catch(() => {});
    } catch (_) {}

    res.json({ message: 'Report submitted successfully. Our safety team will review it shortly.', report });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
};

