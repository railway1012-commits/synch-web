let socket = null;
let reconnectAttempts = 0;

function initSocket() {
  const token = (typeof getToken === 'function') ? getToken() : (sessionStorage.getItem('synch_token') || localStorage.getItem('synch_token'));

  // Connect to the same origin as the page
  const serverUrl = window.location.origin;

  if (socket && socket.connected) {
    return socket;
  }

  socket = io(serverUrl, {
    auth: { token: token || null },
    query: { token: token || '' },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 3000,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('Connected to SYNCH server');
    reconnectAttempts = 0;

    if (typeof onSocketConnected === 'function') {
      onSocketConnected();
    }

    if (typeof checkPendingDevicePrompts === 'function') {
      checkPendingDevicePrompts();
    } else if (typeof window.checkPendingDevicePrompts === 'function') {
      window.checkPendingDevicePrompts();
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);

    if (typeof onSocketDisconnected === 'function') {
      onSocketDisconnected(reason);
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
    reconnectAttempts++;

    if (reconnectAttempts >= maxReconnectAttempts) {
      showToast('Connection failed. Please refresh the page.', 'error');
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    showToast(error.message || 'An error occurred', 'error');
  });

  socket.on('user_banned', (data) => {
    console.warn('Live User Ban Event Received:', data);
    if (typeof showBanModal === 'function') {
      showBanModal(data);
    }
  });

  socket.on('system_announcement', (data) => {
    showSystemAnnouncement(data);
  });

  socket.on('system:maintenance', (data) => {
    if (data.enabled) {
      showMaintenanceOverlay(data.message);
    } else {
      hideMaintenanceOverlay();
    }
  });

  socket.on('maintenance_mode_started', (data) => {
    showMaintenanceOverlay(data?.message);
  });

  socket.on('maintenance_mode_ended', () => {
    hideMaintenanceOverlay();
  });

  socket.on('chat:new', (data) => {
    if (typeof onNewChat === 'function') {
      onNewChat(data);
    }
  });

  socket.on('message:new', (message) => {
    if (typeof onNewMessage === 'function') {
      onNewMessage(message);
    }
  });

  socket.on('message:edited', (message) => {
    if (typeof onMessageEdited === 'function') {
      onMessageEdited(message);
    }
  });

  socket.on('message:deleted', (data) => {
    if (typeof onMessageDeleted === 'function') {
      onMessageDeleted(data);
    }
  });

  socket.on('message:reacted', (data) => {
    if (typeof onMessageReacted === 'function') {
      onMessageReacted(data);
    }
  });

  socket.on('message:read', (data) => {
    if (typeof onMessageRead === 'function') {
      onMessageRead(data);
    }
  });

  socket.on('message:notification', (data) => {
    if (typeof onMessageNotification === 'function') {
      onMessageNotification(data);
    }
  });

  socket.on('typing:start', (data) => {
    if (typeof onTypingStart === 'function') {
      onTypingStart(data);
    }
  });

  socket.on('typing:stop', (data) => {
    if (typeof onTypingStop === 'function') {
      onTypingStop(data);
    }
  });

  socket.on('user:status', (data) => {
    if (typeof onUserStatusChange === 'function') {
      onUserStatusChange(data);
    }
  });

  socket.on('user:profile_updated', (data) => {
    if (typeof onUserProfileUpdated === 'function') {
      onUserProfileUpdated(data);
    }
  });

  socket.on('user:deleted', (data) => {
    if (typeof onUserDeleted === 'function') {
      onUserDeleted(data);
    }
  });

  socket.on('chat:deleted', (data) => {
    if (typeof onChatDeleted === 'function') {
      onChatDeleted(data);
    }
  });

  socket.on('chat:cleared', (data) => {
    if (typeof onChatCleared === 'function') {
      onChatCleared(data);
    }
  });

  socket.on('friend:request_received', (data) => {
    if (typeof onFriendRequestReceived === 'function') {
      onFriendRequestReceived(data);
    }
  });

  socket.on('friend:request_accepted', (data) => {
    if (typeof onFriendRequestAccepted === 'function') {
      onFriendRequestAccepted(data);
    }
  });

  socket.on('friend:request_declined', (data) => {
    if (typeof onFriendRequestDeclined === 'function') {
      onFriendRequestDeclined(data);
    }
  });

  socket.on('friend:request_cancelled', (data) => {
    if (typeof onFriendRequestCancelled === 'function') {
      onFriendRequestCancelled(data);
    }
  });

  socket.on('user:badge_updated', (data) => {
    if (typeof onUserBadgeUpdated === 'function') {
      onUserBadgeUpdated(data);
    }
  });

  socket.on('user_frozen', (data) => {
    if (typeof onUserFrozen === 'function') {
      onUserFrozen(data);
    }
  });

  socket.on('user_unfrozen', (data) => {
    if (typeof onUserUnfrozen === 'function') {
      onUserUnfrozen(data);
    }
  });

  socket.on('friend:updated', (data) => {
    if (typeof onFriendUpdated === 'function') {
      onFriendUpdated(data);
    }
  });

  socket.on('session:revoked', (data) => {
    if (typeof handleSessionRevoked === 'function') {
      handleSessionRevoked();
    }
  });

  socket.on('session:updated', (data) => {
    if (typeof onSessionUpdated === 'function') {
      onSessionUpdated(data);
    }
  });

  socket.on('auth:session_revoked', (data) => {
    if (typeof onSessionRevoked === 'function') {
      onSessionRevoked(data);
    }
  });

  socket.on('auth:device_prompt', (data) => {
    if (typeof onDevicePromptReceived === 'function') {
      onDevicePromptReceived(data);
    } else if (typeof window.onDevicePromptReceived === 'function') {
      window.onDevicePromptReceived(data);
    }
  });

  socket.on('auth:device_prompt_resolved', () => {
    if (typeof checkPendingDevicePrompts === 'function') {
      checkPendingDevicePrompts();
    } else if (typeof window.checkPendingDevicePrompts === 'function') {
      window.checkPendingDevicePrompts();
    }
  });

  // --- WebRTC Audio Calling Signaling Events ---
  socket.on('call:incoming', (data) => {
    if (window.SynchAudioCall && typeof window.SynchAudioCall.onIncomingCall === 'function') {
      window.SynchAudioCall.onIncomingCall(data);
    }
  });

  socket.on('call:initiated', (data) => {
    if (window.SynchAudioCall && typeof window.SynchAudioCall.onCallInitiated === 'function') {
      window.SynchAudioCall.onCallInitiated(data);
    }
  });

  socket.on('call:accepted', (data) => {
    if (window.SynchAudioCall && typeof window.SynchAudioCall.onCallAccepted === 'function') {
      window.SynchAudioCall.onCallAccepted(data);
    }
  });

  socket.on('call:rejected', (data) => {
    if (window.SynchAudioCall && typeof window.SynchAudioCall.onCallRejected === 'function') {
      window.SynchAudioCall.onCallRejected(data);
    }
  });

  socket.on('call:signal', (data) => {
    if (window.SynchAudioCall && typeof window.SynchAudioCall.onCallSignal === 'function') {
      window.SynchAudioCall.onCallSignal(data);
    }
  });

  socket.on('call:mode_changed', (data) => {
    if (window.SynchAudioCall && typeof window.SynchAudioCall.onCallModeChanged === 'function') {
      window.SynchAudioCall.onCallModeChanged(data);
    }
  });

  socket.on('call:ended', (data) => {
    if (window.SynchAudioCall && typeof window.SynchAudioCall.onCallEnded === 'function') {
      window.SynchAudioCall.onCallEnded(data);
    }
  });

  // --- Group Chat Events ---
  socket.on('group:member_added', (data) => {
    if (typeof onGroupMemberAdded === 'function') {
      onGroupMemberAdded(data);
    } else if (typeof loadChats === 'function') {
      loadChats();
    }
  });

  socket.on('group:member_removed', (data) => {
    if (typeof onGroupMemberRemoved === 'function') {
      onGroupMemberRemoved(data);
    } else if (typeof loadChats === 'function') {
      loadChats();
    }
  });

  socket.on('group:updated', (data) => {
    if (typeof onGroupUpdated === 'function') {
      onGroupUpdated(data);
    } else if (typeof loadChats === 'function') {
      loadChats();
    }
  });

  return socket;
}

// --- Offline Message Queue ---
let offlineQueue = JSON.parse(localStorage.getItem('synch_offline_queue') || '[]');

function flushOfflineQueue() {
  if (!socket || !socket.connected || offlineQueue.length === 0) return;
  const items = [...offlineQueue];
  offlineQueue = [];
  localStorage.removeItem('synch_offline_queue');

  items.forEach(msgData => {
    socket.emit('message:send', msgData);
  });
  if (typeof showToast === 'function') {
    showToast(`Sent ${items.length} pending offline message(s)`, 'success');
  }
}

// Attach queue flusher to socket connect
if (typeof socket !== 'undefined' && socket) {
  socket.on('connect', flushOfflineQueue);
}

function sendMessage(data) {
  if (socket && socket.connected) {
    socket.emit('message:send', data);
  } else {
    offlineQueue.push(data);
    localStorage.setItem('synch_offline_queue', JSON.stringify(offlineQueue));
    if (typeof showToast === 'function') {
      showToast('You are offline. Message queued for delivery when reconnected.', 'info');
    }
  }
}

function editMessage(messageId, content) {
  if (socket && socket.connected) {
    socket.emit('message:edit', { messageId, content });
  }
}


function deleteMessage(messageId) {
  if (socket && socket.connected) {
    socket.emit('message:delete', { messageId });
  }
}

function addReaction(messageId, emoji) {
  if (socket && socket.connected) {
    socket.emit('message:reaction', { messageId, emoji });
  }
}

function startTyping(chatId) {
  if (socket && socket.connected) {
    socket.emit('typing:start', { chatId });
  }
}

function stopTyping(chatId) {
  if (socket && socket.connected) {
    socket.emit('typing:stop', { chatId });
  }
}

function markMessagesAsRead(messageIds, chatId) {
  if (socket && socket.connected) {
    socket.emit('message:read', { messageIds, chatId });
  }
}

function joinChat(chatId) {
  if (socket && socket.connected) {
    socket.emit('chat:join', chatId);
  }
}

function leaveChat(chatId) {
  if (socket && socket.connected) {
    socket.emit('chat:leave', chatId);
  }
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function showSystemAnnouncement(data) {
  const existing = document.getElementById('sysAnnouncementBanner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'sysAnnouncementBanner';
  banner.className = `system-announcement-banner ${data.level || 'info'}`;
  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
      <span style="font-size: 20px;">📢</span>
      <div>
        <strong style="display: block; font-size: 13.5px; color: #ffffff; margin-bottom: 2px;">${data.title || 'System Announcement'}</strong>
        <span style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.35;">${data.message}</span>
      </div>
    </div>
    <button style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; padding: 4px;" onclick="this.parentElement.remove()">✕</button>
  `;

  document.body.appendChild(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 12000);
}

let maintenanceRetryInterval = null;

function showMaintenanceOverlay(message) {
  try {
    const userStr = localStorage.getItem('synch_user') || sessionStorage.getItem('synch_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.email && user.email.toLowerCase() === 'noreply.synch@gmail.com') return;
    }
  } catch (e) {}

  let overlay = document.getElementById('maintenanceModeOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'maintenanceModeOverlay';
    overlay.className = 'maintenance-overlay';
    document.body.appendChild(overlay);
  }

  const safeMsg = (message || 'SYNCH is currently undergoing scheduled maintenance. We are performing essential system optimizations. Access will automatically restore once complete.').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  overlay.innerHTML = `
    <div class="maintenance-card">
      <div class="maintenance-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      </div>
      <h2>System Under Maintenance</h2>
      <p>${safeMsg}</p>
      <div class="maintenance-status-badge">
        <span class="maintenance-dot"></span>
        <span>Restoring access automatically...</span>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';

  if (!maintenanceRetryInterval) {
    maintenanceRetryInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/config');
        if (res.ok) {
          const data = await res.json();
          if (data && data.maintenanceMode === false) {
            hideMaintenanceOverlay();
          }
        }
      } catch (e) {}
    }, 1000);
  }
}

function hideMaintenanceOverlay() {
  if (maintenanceRetryInterval) {
    clearInterval(maintenanceRetryInterval);
    maintenanceRetryInterval = null;
  }
  const overlay = document.getElementById('maintenanceModeOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    try { overlay.remove(); } catch (e) {}
  }
  if (typeof initSocket === 'function' && (!socket || !socket.connected)) {
    initSocket();
  }
  if (typeof loadChats === 'function') {
    try { loadChats(); } catch (e) {}
  }
  if (typeof refreshCurrentUser === 'function') {
    try { refreshCurrentUser(); } catch (e) {}
  }
}

async function checkInitialMaintenance() {
  try {
    const res = await fetch('/api/auth/config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.maintenanceMode) {
        showMaintenanceOverlay();
      } else {
        hideMaintenanceOverlay();
      }
    }
  } catch (e) {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSocket();
      checkInitialMaintenance();
    });
  } else {
    initSocket();
    checkInitialMaintenance();
  }
}
