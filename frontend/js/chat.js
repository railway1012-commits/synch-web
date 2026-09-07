const token = getToken();
let currentUser = getUser() || {};

if (!token) {
  window.location.href = '/login';
}

if (currentUser?.email?.toLowerCase() === 'noreply.synch@gmail.com') {
  window.location.href = '/admin.html';
}

// Fix mobile keyboard viewport issue
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    document.documentElement.style.setProperty('--viewport-height', `${window.visualViewport.height}px`);
  });
  document.documentElement.style.setProperty('--viewport-height', `${window.visualViewport.height}px`);
}

let chats = [];
let currentChat = null;
let messages = [];
let replyingTo = null;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
let typingTimeout = null;
let contextMenuMessage = null;
let appMode = 'chats'; // 'chats' | 'settings'
let activeSettingsSection = 'account';
let chatFilter = 'all'; // 'all' | 'unread'
let currentChatUser = null;
let searchResults = [];
let currentSearchIndex = -1;
let pendingTwoFactorState = false;
let pendingGoogleAction = null; // 'connect' | 'disconnect'

const nicknames = JSON.parse(localStorage.getItem('synch_nicknames') || '{}');
const contactNotes = JSON.parse(localStorage.getItem('synch_contact_notes') || '{}');
const blockedUsers = JSON.parse(localStorage.getItem('synch_blocked') || '[]');

const elements = {
  appRail: document.getElementById('appRail'),
  railChatsBtn: document.getElementById('railChatsBtn'),
  railNewChatBtn: document.getElementById('railNewChatBtn'),
  railProfileBtn: document.getElementById('railProfileBtn'),
  railAvatar: document.getElementById('railAvatar'),
  railStatusDot: document.getElementById('railStatusDot'),
  railUnreadBadge: document.getElementById('railUnreadBadge'),
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  chatsSidebarView: document.getElementById('chatsSidebarView'),
  settingsSidebarView: document.getElementById('settingsSidebarView'),
  chatList: document.getElementById('chatList'),
  searchChats: document.getElementById('searchChats'),
  searchSettings: document.getElementById('searchSettings'),
  filterAllChats: document.getElementById('filterAllChats'),
  filterUnreadChats: document.getElementById('filterUnreadChats'),
  settingsHeroAvatar: document.getElementById('settingsHeroAvatar'),
  settingsHeroName: document.getElementById('settingsHeroName'),
  settingsHeroEmail: document.getElementById('settingsHeroEmail'),
  settingsCategoriesNav: document.getElementById('settingsCategoriesNav'),
  mainContent: document.getElementById('mainContent'),
  chatsMainView: document.getElementById('chatsMainView'),
  settingsMainView: document.getElementById('settingsMainView'),
  noChatSelected: document.getElementById('noChatSelected'),
  chatView: document.getElementById('chatView'),
  chatAvatar: document.getElementById('chatAvatar'),
  chatName: document.getElementById('chatName'),
  chatStatus: document.getElementById('chatStatus'),
  messagesContainer: document.getElementById('messagesContainer'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  typingIndicator: document.getElementById('typingIndicator'),
  typingText: document.getElementById('typingText'),
  replyPreview: document.getElementById('replyPreview'),
  replyName: document.getElementById('replyName'),
  replyText: document.getElementById('replyText'),
  contextMenu: document.getElementById('contextMenu'),
  reactionMenu: document.getElementById('reactionMenu'),
  newChatModal: document.getElementById('newChatModal'),
  userList: document.getElementById('userList'),
  voiceRecorder: document.getElementById('voiceRecorder'),
  recordTime: document.getElementById('recordTime'),
  emojiPickerPanel: document.getElementById('emojiPickerPanel'),
  imageInput: document.getElementById('imageInput'),
  avatarInput: document.getElementById('avatarInput'),
  imagePreviewModal: document.getElementById('imagePreviewModal'),
  previewImage: document.getElementById('previewImage'),
  scrollToBottomBtn: document.getElementById('scrollToBottomBtn'),
  profileUsernameDisplay: document.getElementById('profileUsernameDisplay'),
  profileEmailDisplay: document.getElementById('profileEmailDisplay'),
  googleStatusText: document.getElementById('googleStatusText'),
  googleConnectBtn: document.getElementById('googleConnectBtn'),
  twoFactorToggle: document.getElementById('twoFactorToggle'),
  sessionsList: document.getElementById('sessionsList'),
  blockedUsersList: document.getElementById('blockedUsersList'),
  themeSelector: document.getElementById('themeSelector')
};

let isRevokeModalOpen = false;
function handleSessionRevoked() {
  if (isRevokeModalOpen) return;
  isRevokeModalOpen = true;

  clearSession();
  if (typeof socket !== 'undefined' && socket && socket.disconnect) {
    try { socket.disconnect(); } catch (e) {}
  }

  const modal = document.getElementById('sessionRevokedModal');
  if (modal) {
    openModal('sessionRevokedModal');
  } else {
    window.location.href = '/login';
  }
}

async function fetchAPI(endpoint, options = {}) {
  const defaultHeaders = {};
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...defaultHeaders,
      ...options.headers
    }
  });
  if (!response.ok) {
    let errorMsg = 'Request failed';
    let isRevoked = false;
    let isMaintenance = false;
    try {
      const data = await response.json();
      errorMsg = data.error || errorMsg;
      if (response.status === 401 && (data.sessionRevoked || data.error === 'Session revoked' || data.error === 'Invalid token')) {
        isRevoked = true;
      }
      if (response.status === 503 && (data.maintenance || data.error === 'Maintenance Mode')) {
        isMaintenance = true;
        if (typeof showMaintenanceOverlay === 'function') {
          showMaintenanceOverlay(data.message);
        }
      }
    } catch (e) {}

    if (isRevoked) {
      handleSessionRevoked();
    }
    if (isMaintenance) {
      throw new Error(errorMsg);
    }
    throw new Error(errorMsg);
  }
  return response.json();
}

function renderUserBadge(badge) {
  if (!badge) return '';
  const clean = String(badge).trim();
  const slug = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `<span class="user-badge badge-${escapeAttr(slug)}">${escapeHtml(clean)}</span>`;
}

function showPageLoading(text) {
  const overlay = document.getElementById('pageLoadingOverlay');
  const textEl = document.getElementById('pageLoadingText');
  if (textEl) textEl.textContent = text || 'Loading...';
  if (overlay) overlay.classList.add('active');
}

function hidePageLoading() {
  const overlay = document.getElementById('pageLoadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

function updatePasswordSection() {
  const rowTitle = document.getElementById('passwordRowTitle');
  const rowDesc = document.getElementById('passwordRowDesc');
  const btn = document.getElementById('changePasswordBtn');

  if (!currentUser) return;

  if (currentUser.hasPassword) {
    if (rowTitle) rowTitle.textContent = 'Password';
    if (rowDesc) rowDesc.textContent = 'Change your login password';
    if (btn) btn.textContent = 'Change';
  } else {
    if (rowTitle) rowTitle.textContent = 'Password';
    if (rowDesc) rowDesc.textContent = 'Set a password to log in without Google';
    if (btn) btn.textContent = 'Set Password';
  }
}

async function refreshCurrentUser() {
  try {
    const data = await fetchAPI('/api/auth/me');
    if (data.user) {
      currentUser = data.user;
      updateStoredUser(currentUser);
      initHeaderAvatar();
      updateTwoFactorToggle();
      updateGoogleSection();
      updatePasswordSection();
    }
  } catch (e) {}
}

function initHeaderAvatar() {
  const initials = getInitials(currentUser.username);
  const avatarImg = currentUser.avatar ? `<img src="${sanitizeUrl(currentUser.avatar)}" alt="${escapeAttr(currentUser.username)}" onerror="this.parentElement.textContent='${escapeAttr(initials)}'">` : null;
  if (elements.railAvatar) elements.railAvatar.innerHTML = avatarImg || initials;
  if (elements.settingsHeroAvatar) elements.settingsHeroAvatar.innerHTML = avatarImg || initials;
  if (elements.settingsHeroName) elements.settingsHeroName.textContent = currentUser.username || 'Username';
  if (elements.settingsHeroEmail) elements.settingsHeroEmail.textContent = currentUser.email || '';
  if (elements.profileUsernameDisplay) elements.profileUsernameDisplay.textContent = '@' + (currentUser.username || '');
  if (elements.profileEmailDisplay) elements.profileEmailDisplay.textContent = currentUser.email || '';
  updatePasswordSection();
}

function switchAppMode(mode) {
  appMode = mode;
  document.querySelector('.chat-app').classList.remove('settings-detail-open');
  if (mode === 'chats') {
    elements.railChatsBtn?.classList.add('active');
    elements.railProfileBtn?.classList.remove('active');
    if (elements.chatsSidebarView) elements.chatsSidebarView.style.display = 'flex';
    if (elements.settingsSidebarView) elements.settingsSidebarView.style.display = 'none';
    if (elements.chatsMainView) {
      elements.chatsMainView.style.display = 'flex';
      elements.chatsMainView.classList.add('active');
    }
    if (elements.settingsMainView) {
      elements.settingsMainView.style.display = 'none';
      elements.settingsMainView.classList.remove('active');
    }
  } else if (mode === 'settings') {
    elements.railProfileBtn?.classList.add('active');
    elements.railChatsBtn?.classList.remove('active');
    if (elements.chatsSidebarView) elements.chatsSidebarView.style.display = 'none';
    if (elements.settingsSidebarView) elements.settingsSidebarView.style.display = 'flex';
    if (elements.chatsMainView) {
      elements.chatsMainView.style.display = 'none';
      elements.chatsMainView.classList.remove('active');
    }
    if (elements.settingsMainView) {
      elements.settingsMainView.style.display = 'flex';
      elements.settingsMainView.classList.add('active');
    }
    switchSettingsSection(activeSettingsSection || 'account', false);
    refreshSettingsData();
  }
}

function switchSettingsSection(sectionId, openMobileDetail = true) {
  if (!sectionId) return;
  activeSettingsSection = sectionId;

  document.querySelectorAll('#settingsCategoriesNav .settings-cat-item').forEach(item => {
    const isMatched = item.dataset.section === sectionId;
    item.classList.toggle('active', isMatched);
    if (isMatched) {
      const title = item.querySelector('span')?.textContent || 'Settings';
      const mobileTitle = document.getElementById('settingsMobileTitle');
      if (mobileTitle) mobileTitle.textContent = title;
    }
  });

  document.querySelectorAll('.settings-detail-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `sec-${sectionId}`);
  });

  if (openMobileDetail && window.innerWidth <= 768) {
    document.querySelector('.chat-app').classList.add('settings-detail-open');
  }

  if (sectionId === 'account') {
    loadSessions();
  } else if (sectionId === 'privacy') {
    loadBlockedUsers();
  }
}

document.querySelectorAll('#settingsCategoriesNav .settings-cat-item[data-section]').forEach(item => {
  item.addEventListener('click', () => {
    if (!item.dataset.section) return;
    switchSettingsSection(item.dataset.section, true);
  });
});

document.getElementById('settingsMobileBackBtn')?.addEventListener('click', () => {
  document.querySelector('.chat-app').classList.remove('settings-detail-open');
});

elements.railChatsBtn?.addEventListener('click', () => switchAppMode('chats'));
elements.railProfileBtn?.addEventListener('click', () => switchAppMode('settings'));
elements.searchSettings?.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  document.querySelectorAll('#settingsCategoriesNav .settings-cat-item').forEach(item => {
    item.style.display = (!query || item.textContent.toLowerCase().includes(query)) ? 'flex' : 'none';
  });
});

elements.filterAllChats?.addEventListener('click', () => {
  chatFilter = 'all';
  elements.filterAllChats.classList.add('active');
  elements.filterUnreadChats.classList.remove('active');
  renderChatList(elements.searchChats ? elements.searchChats.value : '');
});

elements.filterUnreadChats?.addEventListener('click', () => {
  chatFilter = 'unread';
  elements.filterUnreadChats.classList.add('active');
  elements.filterAllChats.classList.remove('active');
  renderChatList(elements.searchChats ? elements.searchChats.value : '');
});

document.getElementById('railNewChatBtn')?.addEventListener('click', () => initConnectModal());
document.getElementById('newChatBtn')?.addEventListener('click', () => initConnectModal());
document.getElementById('emptyStateNewChatBtn')?.addEventListener('click', () => initConnectModal());
document.getElementById('newChatBtnMobile')?.addEventListener('click', () => initConnectModal());

function updateRailUnreadBadge() {
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const badge = elements.railUnreadBadge;
  if (badge) {
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.display = totalUnread > 0 ? 'flex' : 'none';
  }
}

async function loadChats() {
  const cachedChats = localStorage.getItem('synch_chats_cache');
  if (cachedChats) {
    try {
      const parsed = JSON.parse(cachedChats);
      if (Array.isArray(parsed) && parsed.length > 0) {
        chats = parsed;
        renderChatList(elements.searchChats ? elements.searchChats.value : '');
      }
    } catch (e) {}
  }
  try {
    const data = await fetchAPI('/api/chats');
    chats = data.chats || [];
    localStorage.setItem('synch_chats_cache', JSON.stringify(chats));
    renderChatList(elements.searchChats ? elements.searchChats.value : '');
  } catch (error) {
    if (error.banned) {
      elements.chatList.innerHTML = `<div class="empty-state" style="padding: 24px; text-align: center;"><div style="color: #ef4444; font-size: 24px; margin-bottom: 8px;">🚫</div><p style="color: #ef4444; font-weight: 700; margin-bottom: 4px;">Account Suspended</p><p style="color: var(--text-muted); font-size: 12px;">Unable to load conversations. Your account is banned.</p></div>`;
      return;
    }
    if (chats.length === 0) {
      elements.chatList.innerHTML = `<div class="empty-state"><p>${getFriendlyError(error.message)}</p></div>`;
    }
  }
}

function renderChatList(searchQuery = '') {
  const savedNicknames = JSON.parse(localStorage.getItem('synch_nicknames') || '{}');
  updateRailUnreadBadge();
  const filteredChats = chats.filter(chat => {
    const otherParticipant = chat.participants?.find(p => p._id !== currentUser._id);
    const isUnavailable = otherParticipant?.isDeleted || otherParticipant?.username === 'Account Unavailable' || otherParticipant?.username?.startsWith('unavailable_');
    const displayName = isUnavailable ? 'Account Unavailable' : (savedNicknames[otherParticipant?._id] || (chat.type === 'group' ? chat.name : otherParticipant?.username));
    const matchesSearch = !searchQuery || displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = chatFilter === 'all' || (chatFilter === 'unread' && (chat.unreadCount || 0) > 0);
    return matchesSearch && matchesFilter;
  });
  if (filteredChats.length === 0) {
    elements.chatList.innerHTML = `<div class="empty-state"><p>${searchQuery ? 'No chats found' : (chatFilter === 'unread' ? 'No unread messages' : 'No conversations yet')}</p></div>`;
    return;
  }
  elements.chatList.innerHTML = filteredChats.map(chat => {
    const otherParticipant = chat.participants?.find(p => p._id !== currentUser._id);
    const isUnavailable = otherParticipant?.isDeleted || otherParticipant?.username === 'Account Unavailable' || otherParticipant?.username?.startsWith('unavailable_');
    const nickname = isUnavailable ? null : savedNicknames[otherParticipant?._id];
    const name = isUnavailable ? 'Account Unavailable' : (nickname || (chat.type === 'group' ? chat.name : otherParticipant?.username || 'User'));
    const avatar = isUnavailable ? null : (chat.type === 'group' ? chat.avatar : otherParticipant?.avatar);
    const status = isUnavailable ? 'offline' : (otherParticipant?.status || 'offline');
    const lastMessage = chat.lastMessage;
    const isOwnMessage = lastMessage?.sender?._id === currentUser._id || lastMessage?.senderId === currentUser._id;
    const previewPrefix = isOwnMessage ? 'You: ' : '';
    let previewText = lastMessage ? (lastMessage.type === 'voice' ? '🎤 Voice message' : lastMessage.type === 'image' ? '🖼️ Image' : lastMessage.content || '') : 'No messages yet';
    const preview = lastMessage ? previewPrefix + previewText : previewText;
    const unreadCount = chat.unreadCount || 0;
    return `
      <div class="chat-item ${currentChat?._id === chat._id ? 'active' : ''}" data-chat-id="${chat._id}" role="button">
        <div class="chat-item-avatar">
          <div class="avatar" style="${isUnavailable ? 'background: var(--bg-tertiary); color: var(--text-muted);' : ''}">${avatar ? `<img src="${sanitizeUrl(avatar)}" alt="${escapeAttr(name)}" loading="lazy" onerror="this.parentElement.textContent='${escapeAttr(isUnavailable ? '?' : getInitials(name))}'">` : (isUnavailable ? '?' : getInitials(name))}</div>
          <div class="status-dot ${status}"></div>
        </div>
        <div class="chat-item-content">
          <div class="chat-item-header">
            <span class="chat-item-name">${escapeHtml(name)} ${!isUnavailable ? renderUserBadge(otherParticipant?.badge) : ''}</span>
            <span class="chat-time">${lastMessage ? formatTime(lastMessage.createdAt) : ''}</span>
          </div>
          <div class="chat-preview">${escapeHtml(preview.substring(0, 40))}</div>
        </div>
        ${unreadCount > 0 ? `<div class="chat-item-badge">${unreadCount > 99 ? '99+' : unreadCount}</div>` : ''}
      </div>
    `;
  }).join('');
  elements.chatList.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => selectChat(item.dataset.chatId));
    item.addEventListener('contextmenu', (e) => { e.preventDefault(); showChatContextMenu(e, item.dataset.chatId); });
  });
}

elements.searchChats?.addEventListener('input', (e) => renderChatList(e.target.value));

async function selectChat(chatId) {
  const numericId = parseInt(chatId);
  const chat = chats.find(c => c._id === numericId || c._id === chatId);
  if (!chat) return;
  if (currentChat) leaveChat(currentChat._id);
  currentChat = chat;
  joinChat(chatId);
  const savedNicknames = JSON.parse(localStorage.getItem('synch_nicknames') || '{}');
  const otherParticipant = chat.participants?.find(p => p._id !== currentUser._id);
  const isUnavailable = otherParticipant?.isDeleted || otherParticipant?.username === 'Account Unavailable' || otherParticipant?.username?.startsWith('unavailable_');
  const nickname = isUnavailable ? null : savedNicknames[otherParticipant?._id];
  const name = isUnavailable ? 'Account Unavailable' : (nickname || (chat.type === 'group' ? chat.name : otherParticipant?.username || 'User'));
  const status = isUnavailable ? 'offline' : (otherParticipant?.status || 'offline');

  elements.chatAvatar.innerHTML = (!isUnavailable && otherParticipant?.avatar) ? `<img src="${sanitizeUrl(otherParticipant.avatar)}" alt="${escapeAttr(name)}" onerror="this.parentElement.textContent='${escapeAttr(isUnavailable ? '?' : getInitials(name))}'">` : (isUnavailable ? '?' : getInitials(name));
  elements.chatAvatar.style.background = isUnavailable ? 'var(--bg-tertiary)' : '';
  elements.chatAvatar.style.color = isUnavailable ? 'var(--text-muted)' : '';
  elements.chatName.innerHTML = `${escapeHtml(name)} ${!isUnavailable ? renderUserBadge(otherParticipant?.badge) : ''}`;
  elements.chatStatus.textContent = isUnavailable ? 'Unavailable' : (status === 'online' ? 'Online' : `Last seen ${formatLastSeen(otherParticipant?.lastSeen)}`);
  elements.chatStatus.className = `chat-header-status ${status}`;

  // Disable input if account is unavailable
  if (elements.messageInput) {
    elements.messageInput.disabled = isUnavailable;
    elements.messageInput.placeholder = isUnavailable ? 'This account is no longer available' : 'Type a message...';
  }
  if (elements.sendBtn) elements.sendBtn.disabled = isUnavailable;
  const attachBtn = document.getElementById('attachImage');
  const voiceBtn = document.getElementById('recordVoice');
  const emojiBtn = document.getElementById('emojiPicker');
  if (attachBtn) attachBtn.style.pointerEvents = isUnavailable ? 'none' : 'auto';
  if (voiceBtn) voiceBtn.style.pointerEvents = isUnavailable ? 'none' : 'auto';
  if (emojiBtn) emojiBtn.style.pointerEvents = isUnavailable ? 'none' : 'auto';

  chat.unreadCount = 0;
  elements.noChatSelected.style.display = 'none';
  elements.chatView.style.display = 'flex';
  document.querySelector('.chat-app').classList.add('chat-open');
  renderChatList(elements.searchChats ? elements.searchChats.value : '');
  await loadMessages();
}

async function loadMessages() {
  if (!currentChat) return;
  elements.messagesContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
  try {
    const data = await fetchAPI(`/api/chats/${currentChat._id}/messages`);
    messages = data.messages || [];
    renderMessages();
    scrollToBottom();

    // Mark unread messages as read upon opening chat
    const unreadIds = messages
      .filter(m => (m.sender?._id !== currentUser._id && m.senderId !== currentUser._id) && !m.read)
      .map(m => m._id);

    if (unreadIds.length > 0) {
      markMessagesAsRead(unreadIds, currentChat._id);
    }
  } catch (error) { showToast(getFriendlyError(error.message), 'error'); }
}

function formatDateSeparator(date) {
  if (!date) return 'Today';
  try {
    const msgDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (msgDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (msgDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return msgDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
  } catch (e) {
    return 'Today';
  }
}

function createMessageHTML(msg) {
  const isSent = msg.sender?._id === currentUser._id || msg.senderId === currentUser._id;
  const bubbleStyle = localStorage.getItem('synch_bubbleStyle') || 'modern';
  if (msg.deleted) return `<div class="message ${isSent ? 'sent' : ''}" data-message-id="${msg._id}"><div class="message-content"><div class="message-bubble message-deleted" data-style="${bubbleStyle}"><span class="message-text">Message deleted</span></div></div></div>`;
  let content = msg.replyTo ? `<div class="message-reply"><strong>${escapeHtml(msg.replyTo.sender?.username || 'User')}</strong><p>${escapeHtml(msg.replyTo.content?.substring(0, 50) || '')}</p></div>` : '';
  const safeMediaUrl = sanitizeUrl(msg.mediaUrl);
  
  if (msg.type === 'text') {
    content += `<span class="message-text">${linkify(msg.content)}</span>`;
  } else if (msg.type === 'image') {
    content += `<div class="message-media"><img src="${safeMediaUrl}" alt="Shared image" loading="lazy" onclick="openImagePreview('${escapeAttr(safeMediaUrl)}')"></div>${msg.content && msg.content !== msg.mediaUrl ? `<span class="message-text">${linkify(msg.content)}</span>` : ''}`;
  } else if (msg.type === 'video') {
    content += `<div class="message-media"><video src="${safeMediaUrl}" controls playsinline style="max-width: 100%; max-height: 280px; border-radius: 8px;"></video></div>${msg.content && msg.content !== msg.mediaUrl ? `<span class="message-text">${linkify(msg.content)}</span>` : ''}`;
  } else if (msg.type === 'file') {
    const fileName = escapeHtml(msg.content || 'Download Attachment');
    content += `
      <div class="message-file-card" onclick="window.open('${escapeAttr(safeMediaUrl)}', '_blank')">
        <div class="message-file-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="message-file-info">
          <div class="message-file-name">${fileName}</div>
          <div class="message-file-sub">Click to download</div>
        </div>
        <div class="message-file-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
      </div>
    `;
  } else if (msg.type === 'voice') {
    const duration = msg.mediaDuration || 0;
    const durText = `${Math.floor(duration/60)}:${Math.floor(duration%60).toString().padStart(2,'0')}`;
    content += `
      <div class="message-voice-player" data-audio-url="${escapeAttr(safeMediaUrl)}" data-duration="${duration}">
        <button class="voice-play-btn" onclick="toggleVoicePlayback(this)">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="voice-seek-container" onclick="seekVoicePlayback(event, this)">
          <div class="voice-seek-track">
            <div class="voice-seek-progress" style="width: 0%;"></div>
          </div>
        </div>
        <span class="voice-duration-text">${durText}</span>
        <button class="voice-speed-btn" onclick="cycleVoiceSpeed(this)">1x</button>
      </div>
    `;
  }

  const otherParticipant = currentChat?.participants?.find(p => p._id !== currentUser._id);
  const chatIsUnavailable = !isSent && (otherParticipant?.isDeleted || otherParticipant?.username === 'Account Unavailable' || otherParticipant?.username?.startsWith('unavailable_'));
  const isSenderUnavailable = msg.sender?.isDeleted || msg.sender?.username === 'Account Unavailable' || msg.sender?.username?.startsWith('unavailable_') || chatIsUnavailable;
  const isRead = !!msg.read || (msg.readBy && msg.readBy.length > 0);
  
  // Single tick for sent, Double blue ticks for read
  const readReceipt = isSent ? `<span class="message-status ${isRead ? 'read' : 'sent'}" title="${isRead ? 'Read' : 'Sent'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/>${isRead ? '<polyline points="16 6 5 17"/>' : ''}</svg></span>` : '';
  
  const senderName = isSenderUnavailable ? 'Account Unavailable' : (msg.sender?.username || 'User');
  const senderAvatar = isSenderUnavailable ? null : msg.sender?.avatar;
  const senderBadge = !isSenderUnavailable ? renderUserBadge(msg.sender?.badge) : '';
  const avatarMarkup = !isSent ? `<div class="message-avatar avatar avatar-sm" style="${isSenderUnavailable ? 'background: var(--bg-tertiary); color: var(--text-muted);' : ''}">${senderAvatar ? `<img src="${sanitizeUrl(senderAvatar)}" alt="${escapeAttr(senderName)}" onerror="this.parentElement.textContent='${escapeAttr(isSenderUnavailable ? '?' : getInitials(senderName))}'">` : (isSenderUnavailable ? '?' : getInitials(senderName))}</div>` : '';
  const groupSenderTag = (currentChat?.type === 'group' && !isSent) ? `<div style="font-size: 11.5px; font-weight: 700; color: var(--accent); margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">${escapeHtml(senderName)} ${senderBadge}</div>` : '';
  const reactions = (msg.reactions && msg.reactions.length > 0) ? `<div class="message-reactions">${groupReactions(msg.reactions).map(r => `<span class="message-reaction" onclick="toggleReaction('${msg._id}', '${escapeAttr(r.emoji)}')">${escapeHtml(r.emoji)} ${r.count}</span>`).join('')}</div>` : '';
  return `<div class="message ${isSent ? 'sent' : ''}" data-message-id="${msg._id}">${avatarMarkup}<div class="message-content">${groupSenderTag}<div class="message-bubble" data-style="${bubbleStyle}">${content}</div><div class="message-meta"><span>${formatMessageTime(msg.createdAt)}</span>${msg.edited ? '<span>(edited)</span>' : ''}${readReceipt}</div>${reactions}</div></div>`;
}


function attachMessageListeners(el) { el.addEventListener('contextmenu', (e) => { e.preventDefault(); showContextMenu(e, el.dataset.messageId); }); }

function appendMessage(msg) {
  const emptyState = elements.messagesContainer.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  elements.messagesContainer.insertAdjacentHTML('beforeend', createMessageHTML(msg));
  const newEl = elements.messagesContainer.lastElementChild;
  if (newEl) attachMessageListeners(newEl);
  scrollToBottom();
}

function renderMessages() {
  if (!messages || messages.length === 0) {
    elements.messagesContainer.innerHTML = '<div class="empty-state"><p>No messages yet. Start the conversation!</p></div>';
    return;
  }
  let html = '', lastDate = null;
  messages.forEach(msg => {
    try {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) { 
        html += `<div class="message-date-separator"><span>${formatDateSeparator(msg.createdAt)}</span></div>`; 
        lastDate = msgDate; 
      }
      html += createMessageHTML(msg);
    } catch (err) {
      console.error('Error rendering message:', msg, err);
    }
  });
  elements.messagesContainer.innerHTML = html;
  elements.messagesContainer.querySelectorAll('.message').forEach(attachMessageListeners);
}

function groupReactions(reactions) {
  if (!Array.isArray(reactions)) return [];
  const grouped = {};
  reactions.forEach(r => { if (r && r.emoji) { if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, count: 0 }; grouped[r.emoji].count++; } });
  return Object.values(grouped);
}

function scrollToBottom() { if (elements.messagesContainer) elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight; }

if (elements.messagesContainer) {
  elements.messagesContainer.addEventListener('scroll', () => {
    isNearBottom = (elements.messagesContainer.scrollHeight - elements.messagesContainer.scrollTop - elements.messagesContainer.clientHeight) < 150;
    if (elements.scrollToBottomBtn) elements.scrollToBottomBtn.style.display = isNearBottom ? 'none' : 'flex';
  });
}

elements.scrollToBottomBtn?.addEventListener('click', () => { scrollToBottom(); elements.scrollToBottomBtn.style.display = 'none'; });

elements.messageInput?.addEventListener('input', () => {
  elements.messageInput.style.height = 'auto';
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 120)}px`;
  elements.sendBtn.disabled = !elements.messageInput.value.trim();
  if (currentChat) { startTyping(currentChat._id); clearTimeout(typingTimeout); typingTimeout = setTimeout(() => stopTyping(currentChat._id), 2000); }
});

elements.messageInput?.addEventListener('keydown', (e) => {
  const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
  if (e.key === 'Enter' && !e.shiftKey && (settings.enterToSend !== false)) { e.preventDefault(); if (!elements.sendBtn.disabled) handleSendMessage(); }
});

elements.sendBtn?.addEventListener('click', handleSendMessage);

function handleSendMessage() {
  const content = elements.messageInput.value.trim();
  if (!content || !currentChat) return;
  const editingId = elements.messageInput.dataset.editing;
  if (editingId) editMessage(editingId, content);
  else sendMessage({ chatId: currentChat._id, content, type: 'text', replyTo: replyingTo?._id || null });
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';
  elements.sendBtn.disabled = true;
  replyingTo = null;
  elements.replyPreview.classList.remove('active');
}

document.getElementById('attachImage')?.addEventListener('click', () => elements.imageInput?.click());
elements.imageInput?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentChat) return;
  const formData = new FormData(); formData.append('media', file); formData.append('chatId', currentChat._id); formData.append('type', 'image');
  try {
    const res = await fetch('/api/messages', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (!res.ok) throw new Error('Failed to send image');
  } catch (error) { showToast(getFriendlyError(error.message), 'error'); }
  e.target.value = '';
});

document.getElementById('attachDoc')?.addEventListener('click', () => document.getElementById('docInput')?.click());
document.getElementById('docInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentChat) return;
  const formData = new FormData();
  formData.append('media', file);
  formData.append('chatId', currentChat._id);
  formData.append('content', file.originalname);
  const type = file.type.startsWith('video/') ? 'video' : 'file';
  formData.append('type', type);
  try {
    const res = await fetch('/api/messages', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (!res.ok) throw new Error('Failed to send file');
  } catch (error) { showToast(getFriendlyError(error.message), 'error'); }
  e.target.value = '';
});

document.getElementById('recordVoice')?.addEventListener('click', toggleVoiceRecording);
document.getElementById('cancelRecord')?.addEventListener('click', cancelRecording);

async function toggleVoiceRecording() { isRecording ? stopRecording() : startRecording(); }

async function startRecording() {
  try {
    let stream;
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } else {
      const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
      if (legacy) {
        stream = await new Promise((resolve, reject) => legacy.call(navigator, { audio: true }, resolve, reject));
      } else {
        throw new Error('Microphone not supported on this browser');
      }
    }
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      await sendVoiceMessage(new Blob(recordedChunks, { type: 'audio/webm' }));
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    isRecording = true;
    recordingStartTime = Date.now();
    elements.voiceRecorder.classList.add('active');
    elements.messageInput.style.display = 'none';
    recordingInterval = setInterval(() => {
      const el = Math.floor((Date.now() - recordingStartTime) / 1000);
      elements.recordTime.textContent = `${Math.floor(el / 60)}:${(el % 60).toString().padStart(2, '0')}`;
    }, 1000);
  } catch (e) {
    console.error('Voice recording mic error:', e);
    showToast('Microphone access unavailable. Check browser permissions.', 'error');
  }
}


function stopRecording() { if (mediaRecorder && isRecording) { mediaRecorder.stop(); isRecording = false; clearInterval(recordingInterval); elements.voiceRecorder.classList.remove('active'); elements.messageInput.style.display = 'block'; } }
function cancelRecording() { if (mediaRecorder && isRecording) { mediaRecorder.stop(); isRecording = false; recordedChunks = []; clearInterval(recordingInterval); elements.voiceRecorder.classList.remove('active'); elements.messageInput.style.display = 'block'; } }

async function sendVoiceMessage(blob) {
  if (!currentChat) return;
  const formData = new FormData(); formData.append('media', blob, 'voice.webm'); formData.append('chatId', currentChat._id); formData.append('type', 'voice'); formData.append('mediaDuration', Math.floor((Date.now() - recordingStartTime) / 1000));
  try {
    const res = await fetch('/api/messages', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (!res.ok) throw new Error('Failed to send voice');
  } catch (e) { showToast(getFriendlyError(e.message), 'error'); }
}

// Global Audio Engine for Seekable Voice Memos
let activeVoiceAudio = null;
let activeVoicePlayerContainer = null;
let voicePlaybackSpeed = 1.0;

window.toggleVoicePlayback = function(btn) {
  const container = btn.closest('.message-voice-player');
  if (!container) return;
  const audioUrl = container.dataset.audioUrl;
  const progressEl = container.querySelector('.voice-seek-progress');
  const durationText = container.querySelector('.voice-duration-text');

  if (activeVoiceAudio && activeVoicePlayerContainer === container) {
    if (activeVoiceAudio.paused) {
      activeVoiceAudio.play();
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    } else {
      activeVoiceAudio.pause();
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    }
    return;
  }

  // Stop previous audio
  if (activeVoiceAudio) {
    activeVoiceAudio.pause();
    if (activeVoicePlayerContainer) {
      const prevBtn = activeVoicePlayerContainer.querySelector('.voice-play-btn');
      if (prevBtn) prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    }
  }

  const audio = new Audio(audioUrl);
  audio.playbackRate = voicePlaybackSpeed;
  activeVoiceAudio = audio;
  activeVoicePlayerContainer = container;

  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

  audio.ontimeupdate = () => {
    if (audio.duration) {
      const pct = (audio.currentTime / audio.duration) * 100;
      if (progressEl) progressEl.style.width = `${pct}%`;
      const rem = Math.max(0, Math.floor(audio.duration - audio.currentTime));
      if (durationText) durationText.textContent = `${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,'0')}`;
    }
  };

  audio.onended = () => {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    if (progressEl) progressEl.style.width = '0%';
    const origDur = parseFloat(container.dataset.duration) || 0;
    if (durationText) durationText.textContent = `${Math.floor(origDur/60)}:${Math.floor(origDur%60).toString().padStart(2,'0')}`;
    activeVoiceAudio = null;
    activeVoicePlayerContainer = null;
  };

  audio.play().catch(() => {});
};

window.seekVoicePlayback = function(event, container) {
  if (!activeVoiceAudio || activeVoicePlayerContainer !== container.closest('.message-voice-player')) return;
  const rect = container.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const fraction = Math.max(0, Math.min(1, clickX / rect.width));
  if (activeVoiceAudio.duration) {
    activeVoiceAudio.currentTime = fraction * activeVoiceAudio.duration;
  }
};

window.cycleVoiceSpeed = function(btn) {
  const speeds = [1.0, 1.5, 2.0];
  const nextIdx = (speeds.indexOf(voicePlaybackSpeed) + 1) % speeds.length;
  voicePlaybackSpeed = speeds[nextIdx];
  btn.textContent = `${voicePlaybackSpeed}x`;
  if (activeVoiceAudio) {
    activeVoiceAudio.playbackRate = voicePlaybackSpeed;
  }
};


document.getElementById('emojiPicker')?.addEventListener('click', (e) => { e.stopPropagation(); elements.emojiPickerPanel?.classList.toggle('active'); });
if (typeof createEmojiPicker === 'function') {
  createEmojiPicker('emojiGrid', (emoji) => { elements.messageInput.value += emoji; elements.messageInput.focus(); elements.sendBtn.disabled = false; elements.emojiPickerPanel.classList.remove('active'); });
}

document.addEventListener('click', (e) => { if (elements.emojiPickerPanel && !elements.emojiPickerPanel.contains(e.target) && e.target.id !== 'emojiPicker') elements.emojiPickerPanel.classList.remove('active'); });

window.openImagePreview = function(url) { elements.previewImage.src = url; elements.imagePreviewModal.classList.add('active'); };
document.getElementById('closeImagePreview')?.addEventListener('click', () => elements.imagePreviewModal?.classList.remove('active'));
elements.imagePreviewModal?.addEventListener('click', (e) => { if (e.target === elements.imagePreviewModal) elements.imagePreviewModal.classList.remove('active'); });

function showContextMenu(e, messageId) {
  e.preventDefault(); e.stopPropagation();
  contextMenuMessage = messages.find(m => m._id == messageId);
  if (!contextMenuMessage) return;
  const isSent = (contextMenuMessage.sender?._id === currentUser._id || contextMenuMessage.senderId === currentUser._id);
  elements.contextMenu.querySelector('[data-action="edit"]').style.display = isSent ? 'flex' : 'none';
  elements.contextMenu.querySelector('[data-action="delete"]').style.display = isSent ? 'flex' : 'none';
  elements.contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 190)}px`;
  elements.contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 260)}px`;
  elements.contextMenu.classList.add('active');
}

function hideContextMenu() { elements.contextMenu?.classList.remove('active'); elements.reactionMenu?.classList.remove('active'); document.getElementById('chatContextMenu')?.classList.remove('active'); }
document.addEventListener('click', hideContextMenu);

elements.contextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
  item.addEventListener('click', () => {
    if (!contextMenuMessage) return;
    const action = item.dataset.action;
    if (action === 'reply') { replyingTo = contextMenuMessage; elements.replyName.textContent = `Replying to ${contextMenuMessage.sender?.username || 'User'}`; elements.replyText.textContent = contextMenuMessage.content || 'Media'; elements.replyPreview.classList.add('active'); elements.messageInput.focus(); }
    else if (action === 'copy') { navigator.clipboard.writeText(contextMenuMessage.content || ''); showToast('Copied!', 'success'); }
    else if (action === 'react') { elements.reactionMenu.style.left = elements.contextMenu.style.left; elements.reactionMenu.style.top = elements.contextMenu.style.top; elements.reactionMenu.classList.add('active'); }
    else if (action === 'edit') { elements.messageInput.value = contextMenuMessage.content; elements.messageInput.dataset.editing = contextMenuMessage._id; elements.messageInput.focus(); elements.sendBtn.disabled = false; }
    else if (action === 'delete') deleteMessage(contextMenuMessage._id);
    else if (action === 'report-message') {
      openReportModal({
        reportedId: contextMenuMessage.sender?._id || contextMenuMessage.sender_id || contextMenuMessage.senderId,
        chatId: currentChat?._id || currentChat?.id,
        messageId: contextMenuMessage._id || contextMenuMessage.id,
        title: 'Report Message',
        label: `Message by @${contextMenuMessage.sender?.username || 'User'}`,
        sub: contextMenuMessage.content ? `"${contextMenuMessage.content.substring(0, 80)}"` : 'Media attachment'
      });
    }
  });
});


elements.reactionMenu?.querySelectorAll('.emoji-btn').forEach(btn => btn.addEventListener('click', () => { if (contextMenuMessage) { addReaction(contextMenuMessage._id, btn.dataset.emoji); elements.reactionMenu.classList.remove('active'); } }));

function showChatContextMenu(e, chatId) {
  e.preventDefault(); e.stopPropagation();
  contextMenuChatId = chatId;
  const menu = document.getElementById('chatContextMenu');
  if (menu) { menu.style.left = `${Math.min(e.clientX, window.innerWidth - 210)}px`; menu.style.top = `${Math.min(e.clientY, window.innerHeight - 230)}px`; menu.classList.add('active'); }
}

document.getElementById('chatContextMenu')?.querySelectorAll('.context-menu-item').forEach(item => {
  item.addEventListener('click', async () => {
    const action = item.dataset.action;
    if (action === 'open') selectChat(contextMenuChatId);
    else if (action === 'delete-chat') {
      if (await showConfirm('Delete Chat', 'Confirm delete?', 'Delete', true)) {
        try { await fetchAPI(`/api/chats/${contextMenuChatId}`, { method: 'DELETE' }); await loadChats(); } catch (e) { showToast(getFriendlyError(e.message), 'error'); }
      }
    }
    hideContextMenu();
  });
});

document.getElementById('backToChatsBtn')?.addEventListener('click', () => { document.querySelector('.chat-app').classList.remove('chat-open'); currentChat = null; elements.noChatSelected.style.display = 'flex'; elements.chatView.style.display = 'none'; });
let currentConnectTab = 'tab-discover';
let ignoredSuggestions = JSON.parse(localStorage.getItem('synch_ignored_suggestions') || '[]');

function initConnectModal() {
  currentConnectTab = 'tab-discover';
  switchConnectTab('tab-discover');
  updateFriendBadges();
  openModal('newChatModal');
}

function switchConnectTab(tabId) {
  currentConnectTab = tabId;
  document.querySelectorAll('#connectTabsNav .connect-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.connect-tab-pane').forEach(pane => {
    pane.style.display = (pane.id === tabId) ? 'flex' : 'none';
  });

  if (tabId === 'tab-discover') {
    const searchInput = document.getElementById('searchUsers');
    loadDiscoverUsers(searchInput ? searchInput.value : '');
  } else if (tabId === 'tab-incoming') {
    loadIncomingRequests();
  } else if (tabId === 'tab-outgoing') {
    loadOutgoingRequests();
  }
}

document.getElementById('connectTabsNav')?.querySelectorAll('.connect-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchConnectTab(btn.dataset.tab));
});

document.getElementById('searchUsers')?.addEventListener('input', (e) => {
  if (currentConnectTab === 'tab-discover') {
    loadDiscoverUsers(e.target.value);
  }
});

async function loadDiscoverUsers(search = '') {
  const listEl = document.getElementById('userList');
  const labelEl = document.getElementById('discoverSectionLabel');
  if (!listEl) return;

  const isSearching = !!search.trim();
  if (labelEl) {
    labelEl.textContent = isSearching ? 'Search Results' : 'Recommended';
  }

  listEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
  try {
    const data = await fetchAPI(`/api/users?search=${encodeURIComponent(search.trim())}`);
    let users = data.users || [];

    if (!isSearching) {
      users = users.filter(u => !ignoredSuggestions.includes(u._id));
    }

    if (users.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><p>${isSearching ? 'No users found' : 'No recommendations right now'}</p></div>`;
      return;
    }

    listEl.innerHTML = users.map(u => {
      const isUnavailable = u.isDeleted || u.username === 'Account Unavailable';
      const name = u.username;
      const avatar = u.avatar;
      const handle = `@${u.username}`;

      let actionsHtml = '';
      if (isSearching) {
        let mainBtn = '';
        if (u.friendStatus === 'friends') {
          mainBtn = `<button class="btn btn-sm btn-primary" onclick="startNewChat('${u._id}')">Message</button>`;
        } else if (u.friendStatus === 'pending_outgoing') {
          mainBtn = `<span class="btn-action-requested">Requested</span>`;
        } else if (u.friendStatus === 'pending_incoming') {
          mainBtn = `<button class="btn btn-sm btn-primary" onclick="acceptFriendReq('${u.requestId}')">Accept</button>`;
        } else {
          mainBtn = `<button class="btn-action-add" onclick="sendFriendReq('${u._id}')">+ Add</button>`;
        }

        actionsHtml = `
          <button class="btn-action-view" onclick="previewUserProfile('${u._id}')">View</button>
          ${mainBtn}
        `;
      } else {
        let mainBtn = '';
        if (u.friendStatus === 'friends') {
          mainBtn = `<button class="btn btn-sm btn-primary" onclick="startNewChat('${u._id}')">Message</button>`;
        } else if (u.friendStatus === 'pending_outgoing') {
          mainBtn = `<span class="btn-action-requested">Requested</span>`;
        } else if (u.friendStatus === 'pending_incoming') {
          mainBtn = `<button class="btn btn-sm btn-primary" onclick="acceptFriendReq('${u.requestId}')">Accept</button>`;
        } else {
          mainBtn = `<button class="btn-action-add" onclick="sendFriendReq('${u._id}')">+ Add</button>`;
        }

        actionsHtml = `
          <button class="btn-icon-dismiss" onclick="ignoreSuggestion('${u._id}')" title="Ignore suggestion">✕</button>
          ${mainBtn}
        `;
      }

      return `
        <div class="connect-user-item">
          <div class="connect-user-left">
            <div class="avatar" style="${isUnavailable ? 'background: var(--bg-tertiary); color: var(--text-muted);' : ''}">${avatar ? `<img src="${sanitizeUrl(avatar)}" alt="${escapeAttr(name)}" onerror="this.parentElement.textContent='${escapeAttr(isUnavailable ? '?' : getInitials(name))}'">` : (isUnavailable ? '?' : getInitials(name))}</div>
            <div class="connect-user-info">
              <span class="connect-user-name">${escapeHtml(name)} ${!isUnavailable ? renderUserBadge(u.badge) : ''}</span>
              <span class="connect-user-handle">${escapeHtml(handle)}</span>
            </div>
          </div>
          <div class="connect-user-actions">
            ${actionsHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><p>${getFriendlyError(e.message)}</p></div>`;
  }
}

async function loadIncomingRequests() {
  const listEl = document.getElementById('incomingReqList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
  try {
    const data = await fetchAPI('/api/users/friend-requests/incoming');
    const requests = data.requests || [];
    updateIncomingBadge(requests.length);

    if (requests.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>No incoming friend requests</p></div>';
      return;
    }

    listEl.innerHTML = requests.map(req => {
      const u = req.user;
      const name = u.username;
      const handle = `@${u.username}`;
      return `
        <div class="connect-user-item" id="freq-row-${req._id}">
          <div class="connect-user-left">
            <div class="avatar">${u.avatar ? `<img src="${sanitizeUrl(u.avatar)}" alt="${escapeAttr(name)}" onerror="this.parentElement.textContent='${escapeAttr(getInitials(name))}'">` : getInitials(name)}</div>
            <div class="connect-user-info">
              <span class="connect-user-name">${escapeHtml(name)} ${renderUserBadge(u.badge)}</span>
              <span class="connect-user-handle">${escapeHtml(handle)}</span>
            </div>
          </div>
          <div class="connect-user-actions">
            <button class="btn btn-sm btn-secondary" onclick="declineFriendReq('${req._id}')">Decline</button>
            <button class="btn btn-sm btn-primary" onclick="acceptFriendReq('${req._id}')">Accept</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><p>${getFriendlyError(e.message)}</p></div>`;
  }
}

async function loadOutgoingRequests() {
  const listEl = document.getElementById('outgoingReqList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
  try {
    const data = await fetchAPI('/api/users/friend-requests/outgoing');
    const requests = data.requests || [];
    updateOutgoingBadge(requests.length);

    if (requests.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>No outgoing requests</p></div>';
      return;
    }

    listEl.innerHTML = requests.map(req => {
      const u = req.user;
      const name = u.username;
      const handle = `@${u.username}`;
      return `
        <div class="connect-user-item" id="freq-out-row-${req._id}">
          <div class="connect-user-left">
            <div class="avatar">${u.avatar ? `<img src="${sanitizeUrl(u.avatar)}" alt="${escapeAttr(name)}" onerror="this.parentElement.textContent='${escapeAttr(getInitials(name))}'">` : getInitials(name)}</div>
            <div class="connect-user-info">
              <span class="connect-user-name">${escapeHtml(name)} ${renderUserBadge(u.badge)}</span>
              <span class="connect-user-handle">${escapeHtml(handle)}</span>
            </div>
          </div>
          <div class="connect-user-actions">
            <button class="btn btn-sm btn-secondary" onclick="cancelFriendReq('${req._id}')">Cancel</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><p>${getFriendlyError(e.message)}</p></div>`;
  }
}

function ignoreSuggestion(userId) {
  const idNum = parseInt(userId);
  if (!ignoredSuggestions.includes(idNum) && !ignoredSuggestions.includes(userId)) {
    ignoredSuggestions.push(idNum);
    localStorage.setItem('synch_ignored_suggestions', JSON.stringify(ignoredSuggestions));
  }
  const searchInput = document.getElementById('searchUsers');
  loadDiscoverUsers(searchInput ? searchInput.value : '');
}

async function sendFriendReq(receiverId) {
  try {
    await fetchAPI('/api/users/friend-requests', {
      method: 'POST',
      body: JSON.stringify({ receiverId })
    });
    showToast('Friend request sent!', 'success');
    const searchInput = document.getElementById('searchUsers');
    loadDiscoverUsers(searchInput ? searchInput.value : '');
    updateFriendBadges();
  } catch (e) {
    showToast(getFriendlyError(e.message), 'error');
  }
}

async function acceptFriendReq(requestId) {
  try {
    const res = await fetchAPI(`/api/users/friend-requests/${requestId}/accept`, {
      method: 'POST'
    });
    showToast('Friend request accepted!', 'success');
    closeModal('newChatModal');
    updateFriendBadges();
    await loadChats();
    if (res.chat?._id) {
      selectChat(res.chat._id);
    }
  } catch (e) {
    showToast(getFriendlyError(e.message), 'error');
  }
}

async function declineFriendReq(requestId) {
  try {
    await fetchAPI(`/api/users/friend-requests/${requestId}/decline`, {
      method: 'POST'
    });
    showToast('Friend request declined', 'info');
    loadIncomingRequests();
    updateFriendBadges();
  } catch (e) {
    showToast(getFriendlyError(e.message), 'error');
  }
}

async function cancelFriendReq(requestId) {
  try {
    await fetchAPI(`/api/users/friend-requests/${requestId}/cancel`, {
      method: 'DELETE'
    });
    showToast('Request cancelled', 'info');
    loadOutgoingRequests();
    updateFriendBadges();
  } catch (e) {
    showToast(getFriendlyError(e.message), 'error');
  }
}

async function updateFriendBadges() {
  try {
    const inc = await fetchAPI('/api/users/friend-requests/incoming');
    updateIncomingBadge(inc.requests?.length || 0);
    const out = await fetchAPI('/api/users/friend-requests/outgoing');
    updateOutgoingBadge(out.requests?.length || 0);
  } catch (e) {}
}

function updateIncomingBadge(count) {
  const badge = document.getElementById('incomingReqBadge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
  const railBadge = document.getElementById('railFriendReqBadge');
  if (railBadge) {
    railBadge.textContent = count > 99 ? '99+' : count;
    railBadge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function updateOutgoingBadge(count) {
  const badge = document.getElementById('outgoingReqBadge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

async function previewUserProfile(userId) {
  try {
    const data = await fetchAPI(`/api/users/${userId}`);
    const u = data.user;
    if (!u) return;
    populateProfileModal({
      user: u,
      isFriends: u.friendStatus === 'friends',
      friendStatus: u.friendStatus || 'none',
      requestId: u.requestId
    });
  } catch (e) {
    showToast(getFriendlyError(e.message), 'error');
  }
}

async function startNewChat(userId) {
  try {
    const data = await fetchAPI('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ participantId: userId, type: 'private' })
    });
    closeModal('newChatModal');
    closeModal('userInfoModal');
    await loadChats();
    selectChat(data.chat._id);
  } catch (e) {
    showToast(getFriendlyError(e.message), 'error');
  }
}

let initialModalNickname = '';
let initialModalNote = '';

function updateSaveButtonState() {
  const saveBtn = document.getElementById('saveNicknameBtn');
  if (!saveBtn) return;
  const currentNick = document.getElementById('nicknameInput')?.value.trim() || '';
  const currentNote = document.getElementById('contactNoteInput')?.value.trim() || '';
  const hasChanges = (currentNick !== initialModalNickname || currentNote !== initialModalNote);

  saveBtn.disabled = !hasChanges;
  saveBtn.style.opacity = hasChanges ? '1' : '0.4';
  saveBtn.style.cursor = hasChanges ? 'pointer' : 'not-allowed';
  saveBtn.style.pointerEvents = hasChanges ? 'auto' : 'none';
}

document.getElementById('nicknameInput')?.addEventListener('input', updateSaveButtonState);
document.getElementById('contactNoteInput')?.addEventListener('input', updateSaveButtonState);

function populateProfileModal({ user, isFriends = false, friendStatus = 'none', requestId = null }) {
  currentChatUser = user;
  const isUnavailable = user.isDeleted || user.username === 'Account Unavailable' || user.username?.startsWith('unavailable_');
  const savedNicknames = JSON.parse(localStorage.getItem('synch_nicknames') || '{}');
  const savedNotes = JSON.parse(localStorage.getItem('synch_contact_notes') || '{}');
  const displayName = isUnavailable ? 'Account Unavailable' : (savedNicknames[user._id] || user.username);

  // Avatar
  const avatarEl = document.getElementById('userInfoAvatar');
  if (avatarEl) {
    avatarEl.innerHTML = (!isUnavailable && user.avatar) ? `<img src="${sanitizeUrl(user.avatar)}" alt="${escapeAttr(user.username)}" onerror="this.parentElement.textContent='${escapeAttr(isUnavailable ? '?' : getInitials(user.username))}'">` : (isUnavailable ? '?' : getInitials(user.username));
    avatarEl.style.background = isUnavailable ? 'var(--bg-tertiary)' : '';
    avatarEl.style.color = isUnavailable ? 'var(--text-muted)' : '';
  }

  const ringEl = document.getElementById('userInfoStatusRing');
  if (ringEl) {
    ringEl.className = `profile-status-ring ${(!isUnavailable && user.status === 'online') ? 'online' : ''}`;
  }

  // Username & Handle
  const nameEl = document.getElementById('userInfoUsername');
  if (nameEl) nameEl.innerHTML = `${escapeHtml(displayName)} ${!isUnavailable ? renderUserBadge(user.badge) : ''}`;

  const synchIdEl = document.getElementById('userInfoSynchId');
  if (synchIdEl) {
    synchIdEl.textContent = isUnavailable ? '@unavailable' : `@${user.username}`;
  }

  // Status
  const statusEl = document.getElementById('userInfoStatus');
  const pillEl = document.getElementById('userInfoPresencePill');
  if (statusEl) {
    statusEl.textContent = isUnavailable ? 'Unavailable' : (user.status === 'online' ? 'Online' : `Last seen ${formatLastSeen(user.lastSeen)}`);
  }
  if (pillEl) {
    pillEl.className = `profile-presence-pill ${(!isUnavailable && user.status === 'online') ? 'online' : ''}`;
  }

  // Stranger notice vs Personalization card
  const strangerNotice = document.getElementById('userInfoStrangerNotice');
  const nicknameGroup = document.getElementById('userInfoNicknameGroup');
  const saveNicknameBtn = document.getElementById('saveNicknameBtn');
  const toolbar = document.getElementById('userInfoActionsToolbar');

  const effectiveIsFriends = isFriends || (friendStatus === 'friends');

  if (isUnavailable) {
    if (strangerNotice) strangerNotice.style.display = 'none';
    if (nicknameGroup) nicknameGroup.style.display = 'none';
    if (saveNicknameBtn) saveNicknameBtn.style.display = 'none';
    if (toolbar) toolbar.style.display = 'none';
  } else if (effectiveIsFriends) {
    if (strangerNotice) strangerNotice.style.display = 'none';
    if (nicknameGroup) nicknameGroup.style.display = 'block';
    if (saveNicknameBtn) saveNicknameBtn.style.display = 'inline-flex';
    if (toolbar) {
      toolbar.style.display = 'grid';
      toolbar.className = 'profile-actions-toolbar';
      toolbar.innerHTML = `
        <button class="profile-tool-btn primary" onclick="onProfileMessageClick('${user._id}')" title="Direct Message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Message</span>
        </button>
        <button class="profile-tool-btn" onclick="onProfileExportClick()" title="Export Conversation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Export</span>
        </button>
        <button class="profile-tool-btn danger" onclick="onProfileBlockClick()" title="Block User">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span>Block</span>
        </button>
        <button class="profile-tool-btn" onclick="onProfileReportClick()" title="Report User" style="color: var(--warning, #f59e0b);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          <span>Report</span>
        </button>
      `;
    }
  } else {
    // Non-friends preview view
    if (strangerNotice) strangerNotice.style.display = 'flex';
    if (nicknameGroup) nicknameGroup.style.display = 'none';
    if (saveNicknameBtn) saveNicknameBtn.style.display = 'none';
    if (toolbar) {
      toolbar.style.display = 'grid';
      if (friendStatus === 'pending_outgoing') {
        toolbar.className = 'profile-actions-toolbar grid-2';
        toolbar.innerHTML = `
          <div class="profile-status-pill-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Request Pending</span>
          </div>
          <button class="profile-tool-btn secondary" onclick="cancelFriendReqFromProfile('${requestId}')" title="Cancel Request">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span>Cancel Request</span>
          </button>
          <button class="profile-tool-btn" onclick="onProfileReportClick()" title="Report User" style="color: var(--warning, #f59e0b);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            <span>Report</span>
          </button>
        `;
      } else if (friendStatus === 'pending_incoming') {
        toolbar.className = 'profile-actions-toolbar grid-2';
        toolbar.innerHTML = `
          <button class="profile-tool-btn primary" onclick="acceptFriendReqFromProfile('${requestId}')" title="Accept Request">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Accept</span>
          </button>
          <button class="profile-tool-btn secondary" onclick="declineFriendReqFromProfile('${requestId}')" title="Decline Request">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span>Decline</span>
          </button>
          <button class="profile-tool-btn" onclick="onProfileReportClick()" title="Report User" style="color: var(--warning, #f59e0b);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            <span>Report</span>
          </button>
        `;
      } else {
        // 'none'
        toolbar.className = 'profile-actions-toolbar grid-2';
        toolbar.innerHTML = `
          <button class="profile-tool-btn primary" onclick="sendFriendReqFromProfile('${user._id}')" title="Send Friend Request">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            <span>+ Add Friend</span>
          </button>
          <button class="profile-tool-btn danger" onclick="onProfileBlockClick()" title="Block User">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            <span>Block</span>
          </button>
          <button class="profile-tool-btn" onclick="onProfileReportClick()" title="Report User" style="color: var(--warning, #f59e0b);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            <span>Report</span>
          </button>
        `;
      }
    }
  }

  initialModalNickname = savedNicknames[user._id] || '';
  initialModalNote = savedNotes[user._id] || '';


  const nicknameInput = document.getElementById('nicknameInput');
  if (nicknameInput) nicknameInput.value = initialModalNickname;

  const noteInput = document.getElementById('contactNoteInput');
  if (noteInput) noteInput.value = initialModalNote;

  updateSaveButtonState();
  openModal('userInfoModal');
}

// Profile Modal Action Handlers
async function sendFriendReqFromProfile(userId) {
  await sendFriendReq(userId);
  previewUserProfile(userId);
}

async function cancelFriendReqFromProfile(requestId) {
  await cancelFriendReq(requestId);
  if (currentChatUser) previewUserProfile(currentChatUser._id);
}

async function acceptFriendReqFromProfile(requestId) {
  await acceptFriendReq(requestId);
  closeModal('userInfoModal');
}

async function declineFriendReqFromProfile(requestId) {
  await declineFriendReq(requestId);
  if (currentChatUser) previewUserProfile(currentChatUser._id);
}

function onProfileMessageClick(userId) {
  closeModal('userInfoModal');
  if (userId) startNewChat(userId);
}

function onProfileExportClick() {
  document.getElementById('exportChatBtn')?.click();
}

function onProfileBlockClick() {
  document.getElementById('blockUserBtn')?.click();
}

function onProfileReportClick() {
  closeModal('userInfoModal');
  if (currentChatUser) {
    openReportModal({
      reportedId: currentChatUser._id || currentChatUser.id,
      chatId: currentChat?._id || currentChat?.id || null,
      title: `Report @${currentChatUser.username}`,
      label: `User: @${currentChatUser.username} (#${currentChatUser._id || currentChatUser.id})`,
      sub: currentChatUser.displayName ? `Name: ${currentChatUser.displayName}` : 'SYNCH Account'
    });
  }
}

// Window scope exports for HTML inline handlers
window.initConnectModal = initConnectModal;
window.ignoreSuggestion = ignoreSuggestion;
window.sendFriendReq = sendFriendReq;
window.acceptFriendReq = acceptFriendReq;
window.declineFriendReq = declineFriendReq;
window.cancelFriendReq = cancelFriendReq;
window.previewUserProfile = previewUserProfile;
window.startNewChat = startNewChat;
window.sendFriendReqFromProfile = sendFriendReqFromProfile;
window.cancelFriendReqFromProfile = cancelFriendReqFromProfile;
window.acceptFriendReqFromProfile = acceptFriendReqFromProfile;
window.declineFriendReqFromProfile = declineFriendReqFromProfile;
window.onProfileMessageClick = onProfileMessageClick;
window.onProfileExportClick = onProfileExportClick;
window.onProfileBlockClick = onProfileBlockClick;
window.onProfileReportClick = onProfileReportClick;


document.getElementById('chatUserInfo')?.addEventListener('click', () => {
  if (!currentChat) return;
  if (currentChat.type === 'group') {
    openGroupInfoModal(currentChat);
    return;
  }
  const p = currentChat.participants?.find(p => p._id !== currentUser._id);
  if (!p) return;
  populateProfileModal({
    user: p,
    isFriends: true,
    friendStatus: 'friends'
  });
});

document.getElementById('modalMessageBtn')?.addEventListener('click', () => {
  closeModal('userInfoModal');
  if (currentChatUser) {
    startNewChat(currentChatUser._id);
  }
});

document.getElementById('startVoiceCallBtn')?.addEventListener('click', () => {
  if (!currentChat) {
    showToast('Open a chat first to start a call', 'info');
    return;
  }
  if (currentChat.type === 'group') {
    showToast('Group audio calling coming soon', 'info');
    return;
  }
  const otherUser = currentChat.participants?.find(p => p._id !== currentUser._id && p._id !== currentUser.id);
  if (!otherUser) {
    showToast('Cannot call in this chat', 'warning');
    return;
  }
  if (otherUser.isDeleted || otherUser.username === 'Account Unavailable') {
    showToast('This user is unavailable for calls', 'error');
    return;
  }

  if (window.SynchAudioCall && typeof window.SynchAudioCall.startCall === 'function') {
    window.SynchAudioCall.startCall(otherUser, currentChat._id || currentChat.id);
  }
});

document.getElementById('startVideoCallBtn')?.addEventListener('click', () => {
  if (!currentChat) {
    showToast('Open a chat first to start a video call', 'info');
    return;
  }
  if (currentChat.type === 'group') {
    showToast('Group video calling coming soon', 'info');
    return;
  }
  const otherUser = currentChat.participants?.find(p => p._id !== currentUser._id && p._id !== currentUser.id);
  if (!otherUser) {
    showToast('Cannot call in this chat', 'warning');
    return;
  }
  if (otherUser.isDeleted || otherUser.username === 'Account Unavailable') {
    showToast('This user is unavailable for video calls', 'error');
    return;
  }

  if (window.SynchAudioCall && typeof window.SynchAudioCall.startVideoCall === 'function') {
    window.SynchAudioCall.startVideoCall(otherUser, currentChat._id || currentChat.id);
  }
});

document.getElementById('modalAudioCallBtn')?.addEventListener('click', () => {
  closeModal('userInfoModal');
  if (currentChatUser) {
    if (currentChatUser.isDeleted || currentChatUser.username === 'Account Unavailable') {
      showToast('This user is unavailable for calls', 'error');
      return;
    }
    if (window.SynchAudioCall && typeof window.SynchAudioCall.startCall === 'function') {
      window.SynchAudioCall.startCall(currentChatUser, currentChat?._id || currentChat?.id || null);
    }
  }
});

// --- Group Chat Creation & Management ---
document.getElementById('newGroupBtn')?.addEventListener('click', async () => {
  const container = document.getElementById('groupFriendsList');
  if (container) {
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
  }
  openModal('createGroupModal');

  try {
    const res = await fetchAPI('/api/friends');
    const friends = res.friends || [];
    if (!container) return;

    if (friends.length === 0) {
      container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">Add friends first to start a group chat.</div>';
      return;
    }

    container.innerHTML = friends.map(f => `
      <label style="display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; cursor: pointer; hover: background: var(--bg-hover);">
        <input type="checkbox" name="groupMember" value="${f._id}" style="cursor: pointer;">
        <div class="avatar avatar-sm">${f.avatar ? `<img src="${sanitizeUrl(f.avatar)}">` : getInitials(f.username)}</div>
        <span style="font-size: 14px; font-weight: 500;">${escapeHtml(f.username || 'User')}</span>
      </label>
    `).join('');
  } catch (err) {
    if (container) container.innerHTML = '<div style="padding: 12px; color: var(--danger); text-align: center;">Failed to load friends</div>';
  }
});

document.getElementById('createGroupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('groupNameInput');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) return showToast('Please enter a group name', 'error');

  const checkedBoxes = Array.from(document.querySelectorAll('input[name="groupMember"]:checked'));
  const participantIds = checkedBoxes.map(cb => parseInt(cb.value)).filter(Boolean);

  if (participantIds.length === 0) {
    return showToast('Select at least 1 friend to add to the group', 'warning');
  }

  showPageLoading('Creating group...');
  try {
    const data = await fetchAPI('/api/chats', {
      method: 'POST',
      body: JSON.stringify({
        type: 'group',
        name,
        participants: participantIds
      })
    });
    hidePageLoading();
    closeModal('createGroupModal');
    if (nameInput) nameInput.value = '';
    showToast('Group chat created!', 'success');
    await loadChats();
    if (data.chat?._id) {
      selectChat(data.chat._id);
    }
  } catch (err) {
    hidePageLoading();
    showToast(getFriendlyError(err.message), 'error');
  }
});

function openGroupInfoModal(chat) {
  const modal = document.getElementById('groupInfoModal');
  if (!modal) return;

  const title = document.getElementById('groupInfoName');
  const count = document.getElementById('groupInfoMemberCount');
  const avatar = document.getElementById('groupInfoAvatar');
  const list = document.getElementById('groupMembersList');

  if (title) title.textContent = chat.name || 'Group Chat';
  if (count) count.textContent = `${chat.participants?.length || 0} members`;
  if (avatar) avatar.textContent = getInitials(chat.name || 'G');

  if (list && Array.isArray(chat.participants)) {
    list.innerHTML = chat.participants.map(p => {
      const isMe = p._id === currentUser._id;
      const isAdmin = p.role === 'admin' || p.role === 'superadmin';
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; background: var(--bg-secondary);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="avatar avatar-sm">${p.avatar ? `<img src="${sanitizeUrl(p.avatar)}">` : getInitials(p.username)}</div>
            <div>
              <div style="font-size: 13.5px; font-weight: 600;">${escapeHtml(p.username || 'User')} ${isMe ? '<span style="font-size: 11px; opacity: 0.7;">(You)</span>' : ''}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.role || 'Member')}</div>
            </div>
          </div>
          ${isAdmin ? '<span class="badge badge-primary" style="font-size: 10px;">Admin</span>' : ''}
        </div>
      `;
    }).join('');
  }

  openModal('groupInfoModal');
}

document.getElementById('leaveGroupBtn')?.addEventListener('click', async () => {
  if (!currentChat || currentChat.type !== 'group') return;
  const confirmed = await showConfirm('Leave Group', `Are you sure you want to leave ${escapeHtml(currentChat.name)}?`, 'Leave Group', true);
  if (!confirmed) return;

  showPageLoading('Leaving group...');
  try {
    await fetchAPI(`/api/chats/${currentChat._id}/participants/${currentUser._id}`, {
      method: 'DELETE'
    });
    hidePageLoading();
    closeModal('groupInfoModal');
    currentChat = null;
    elements.noChatSelected.style.display = 'flex';
    elements.chatView.style.display = 'none';
    document.querySelector('.chat-app')?.classList.remove('chat-open');
    showToast('You left the group', 'info');
    await loadChats();
  } catch (err) {
    hidePageLoading();
    showToast(getFriendlyError(err.message), 'error');
  }
});


document.getElementById('copySynchIdFromModal')?.addEventListener('click', () => {
  if (currentChatUser) {
    const isUnavailable = currentChatUser.isDeleted || currentChatUser.username === 'Account Unavailable';
    const val = isUnavailable ? '@unavailable' : currentChatUser.username;
    navigator.clipboard.writeText(val);
    showToast('Copied to clipboard!', 'success');
  }
});

document.getElementById('saveNicknameBtn')?.addEventListener('click', () => {
  if (!currentChatUser) return;
  const nick = document.getElementById('nicknameInput')?.value.trim();
  const note = document.getElementById('contactNoteInput')?.value.trim();
  const savedNicknames = JSON.parse(localStorage.getItem('synch_nicknames') || '{}');
  const savedNotes = JSON.parse(localStorage.getItem('synch_contact_notes') || '{}');

  if (nick) savedNicknames[currentChatUser._id] = nick;
  else delete savedNicknames[currentChatUser._id];

  if (note) savedNotes[currentChatUser._id] = note;
  else delete savedNotes[currentChatUser._id];

  localStorage.setItem('synch_nicknames', JSON.stringify(savedNicknames));
  localStorage.setItem('synch_contact_notes', JSON.stringify(savedNotes));

  initialModalNickname = nick || '';
  initialModalNote = note || '';
  updateSaveButtonState();

  closeModal('userInfoModal');
  showToast('Contact details saved', 'success');
  renderChatList(elements.searchChats ? elements.searchChats.value : '');
  if (currentChat) selectChat(currentChat._id);
});

document.getElementById('exportChatBtn')?.addEventListener('click', () => {
  if (!currentChat) return;
  const exportData = {
    chat: currentChat,
    messages: messages,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-export-${currentChat._id}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Chat exported', 'success');
});

document.getElementById('blockUserBtn')?.addEventListener('click', async () => {
  if (!currentChatUser) return;
  const confirmed = await showConfirm('Block User', `Are you sure you want to block ${currentChatUser.username}?`, 'Block', true);
  if (!confirmed) return;
  try {
    await fetchAPI(`/api/users/${currentChatUser._id}/block`, { method: 'POST' });
    closeModal('userInfoModal');
    showToast('User blocked', 'success');
    loadChats();
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// ----------------------------------------------------
// SETTINGS & ACCOUNT LOGIC
// ----------------------------------------------------

async function refreshCurrentUser() {
  try {
    const data = await fetchAPI('/api/auth/me');
    currentUser = data.user;
    updateStoredUser(currentUser);
    initHeaderAvatar();
    updateGoogleSection();
    updateTwoFactorToggle();
  } catch (error) {}
}

function refreshSettingsData() {
  refreshCurrentUser();
  loadSavedSettings();
  loadSessions();
  loadBlockedUsers();
  updateTwoFactorToggle();
  updateGoogleSection();
}

function loadSavedSettings() {
  const settings = currentUser.settings || {};

  const theme = localStorage.getItem('synch_theme') || 'dark';
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });

  const accentColor = localStorage.getItem('synch_accent') || '#0084FF';
  document.querySelectorAll('.color-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.color === accentColor);
  });

  const fontSize = localStorage.getItem('synch_fontSize') || 'medium';
  if (fontSizeDropdown) fontSizeDropdown.setValue(fontSize);

  const bubbleStyle = localStorage.getItem('synch_bubbleStyle') || 'modern';
  if (bubbleStyleDropdown) bubbleStyleDropdown.setValue(bubbleStyle);

  document.getElementById('onlineStatusToggle')?.classList.toggle('active', settings.showOnlineStatus !== false);
  document.getElementById('readReceiptsToggle')?.classList.toggle('active', settings.showReadReceipts !== false);
  document.getElementById('lastSeenToggle')?.classList.toggle('active', settings.showLastSeen !== false);
  document.getElementById('messageSoundToggle')?.classList.toggle('active', settings.messageSound !== false);
  document.getElementById('desktopNotificationsToggle')?.classList.toggle('active', settings.desktopNotifications !== false);
  document.getElementById('enterToSendToggle')?.classList.toggle('active', settings.enterToSend !== false);
  document.getElementById('mediaAutoDownloadToggle')?.classList.toggle('active', settings.mediaAutoDownload !== false);
  document.getElementById('messagePreviewToggle')?.classList.toggle('active', settings.messagePreview !== false);

  const volume = settings.notificationVolume || 50;
  const volumeRange = document.getElementById('volumeRange');
  const volumeValue = document.getElementById('volumeValue');
  if (volumeRange) volumeRange.value = volume;
  if (volumeValue) volumeValue.textContent = `${volume}%`;
}

// Custom Dropdowns for Settings (Matches signup DOB picker)
let fontSizeDropdown = null;
let bubbleStyleDropdown = null;

function initSettingsDropdowns() {
  const fontContainer = document.getElementById('fontSizeDropdownContainer');
  if (fontContainer && typeof createDropdown === 'function') {
    const currentFontSize = localStorage.getItem('synch_fontSize') || 'medium';
    fontSizeDropdown = createDropdown(fontContainer, {
      options: [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' }
      ],
      value: currentFontSize,
      placeholder: 'Select size',
      onChange: (val) => {
        applyFontSize(val);
        updateSetting('fontSize', val);
      }
    });
  }

  const bubbleContainer = document.getElementById('bubbleStyleDropdownContainer');
  if (bubbleContainer && typeof createDropdown === 'function') {
    const currentBubbleStyle = localStorage.getItem('synch_bubbleStyle') || 'modern';
    bubbleStyleDropdown = createDropdown(bubbleContainer, {
      options: [
        { value: 'modern', label: 'Modern' },
        { value: 'minimal', label: 'Minimal' },
        { value: 'rounded', label: 'Rounded' }
      ],
      value: currentBubbleStyle,
      placeholder: 'Select style',
      onChange: (val) => {
        localStorage.setItem('synch_bubbleStyle', val);
        updateSetting('bubbleStyle', val);
        renderMessages();
      }
    });
  }
}

// Theme Selector
document.querySelectorAll('.theme-option').forEach(option => {
  option.addEventListener('click', function() {
    document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
    this.classList.add('active');
    const theme = this.dataset.theme;
    applyTheme(theme);
    updateSetting('theme', theme);
  });
});

// Color Picker
document.querySelectorAll('.color-option').forEach(option => {
  option.addEventListener('click', function() {
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
    this.classList.add('active');
    const color = this.dataset.color;
    applyAccentColor(color);
    updateSetting('accentColor', color);
  });
});

// Setting Toggles
document.querySelectorAll('.toggle[data-setting]').forEach(toggle => {
  toggle.addEventListener('click', function() {
    this.classList.toggle('active');
    const setting = this.dataset.setting;
    const value = this.classList.contains('active');
    updateSetting(setting, value);

    const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
    settings[setting] = value;
    localStorage.setItem('synch_settings', JSON.stringify(settings));

    if (setting === 'desktopNotifications' && value) {
      if ('Notification' in window) {
        if (Notification.permission === 'denied') {
          explainBrowserNotificationSettings();
        } else if (Notification.permission === 'default') {
          requestNotificationPermission();
        }
      }
    }
  });
});

// Volume
document.getElementById('volumeRange')?.addEventListener('input', function() {
  const valEl = document.getElementById('volumeValue');
  if (valEl) valEl.textContent = `${this.value}%`;
  localStorage.setItem('synch_volume', this.value);
});

document.getElementById('volumeRange')?.addEventListener('change', function() {
  updateSetting('notificationVolume', parseInt(this.value));
});

async function updateSetting(key, value) {
  try {
    await fetchAPI('/api/users/settings', {
      method: 'PUT',
      body: JSON.stringify({ [key]: value })
    });
  } catch (error) {
    console.error('Failed to update setting:', error);
  }
}

// Copy Synch ID
document.getElementById('copySynchIdBtn')?.addEventListener('click', () => {
  navigator.clipboard.writeText(currentUser.username || '');
  showToast('Username copied!', 'success');
});

// Change Username
document.getElementById('changeUsernameBtn')?.addEventListener('click', () => {
  openModal('usernameModal');
  const input = document.getElementById('newUsername');
  if (input) input.value = currentUser.username || '';
});

document.getElementById('saveUsernameBtn')?.addEventListener('click', async () => {
  const newUsername = document.getElementById('newUsername')?.value.trim();

  if (!newUsername || newUsername.length < 3) {
    showToast('Username must be at least 3 characters', 'error');
    return;
  }

  try {
    await fetchAPI('/api/auth/username', {
      method: 'PUT',
      body: JSON.stringify({ username: newUsername })
    });

    currentUser.username = newUsername;
    updateStoredUser(currentUser);
    initHeaderAvatar();
    closeModal('usernameModal');
    showToast('Username updated', 'success');
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Change / Set Password
document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
  const modalTitle = document.getElementById('passwordModalTitle');
  const modalDesc = document.getElementById('passwordModalDesc');
  const currentPwGroup = document.getElementById('currentPasswordGroup');
  const saveBtn = document.getElementById('savePasswordBtn');
  const currentPwInput = document.getElementById('currentPassword');
  const newPwInput = document.getElementById('newPassword');
  const confirmPwInput = document.getElementById('confirmNewPassword');

  if (currentPwInput) currentPwInput.value = '';
  if (newPwInput) newPwInput.value = '';
  if (confirmPwInput) confirmPwInput.value = '';

  if (currentUser?.hasPassword) {
    if (modalTitle) modalTitle.textContent = 'Change Password';
    if (modalDesc) modalDesc.style.display = 'none';
    if (currentPwGroup) currentPwGroup.style.display = 'block';
    if (saveBtn) saveBtn.textContent = 'Save Password';
  } else {
    if (modalTitle) modalTitle.textContent = 'Set Password';
    if (modalDesc) {
      modalDesc.textContent = 'Set a password so you can also log into your account using your username or email.';
      modalDesc.style.display = 'block';
    }
    if (currentPwGroup) currentPwGroup.style.display = 'none';
    if (saveBtn) saveBtn.textContent = 'Set Password';
  }

  openModal('passwordModal');
});

document.getElementById('savePasswordBtn')?.addEventListener('click', async () => {
  const currentPassword = document.getElementById('currentPassword')?.value;
  const newPassword = document.getElementById('newPassword')?.value;
  const confirmNewPassword = document.getElementById('confirmNewPassword')?.value;

  if (currentUser?.hasPassword && !currentPassword) {
    showToast('Please enter your current password', 'error');
    return;
  }

  if (!newPassword || newPassword.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  if (newPassword !== confirmNewPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const data = await fetchAPI('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    closeModal('passwordModal');
    if (document.getElementById('currentPassword')) document.getElementById('currentPassword').value = '';
    if (document.getElementById('newPassword')) document.getElementById('newPassword').value = '';
    if (document.getElementById('confirmNewPassword')) document.getElementById('confirmNewPassword').value = '';

    if (data.user) {
      currentUser = data.user;
    } else {
      currentUser.hasPassword = true;
    }
    updateStoredUser(currentUser);
    updatePasswordSection();
    showToast(data.message || 'Password saved successfully', 'success');
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Delete Account
document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
  const pwGroup = document.getElementById('deletePasswordGroup');
  const googleNotice = document.getElementById('deleteGoogleNotice');
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  const googleBtn = document.getElementById('confirmDeleteGoogleBtn');

  if (currentUser.googleLinked && !currentUser.hasPassword) {
    if (pwGroup) pwGroup.style.display = 'none';
    if (googleNotice) googleNotice.style.display = 'block';
    if (confirmBtn) confirmBtn.style.display = 'none';
    if (googleBtn) googleBtn.style.display = 'inline-flex';
  } else {
    if (pwGroup) pwGroup.style.display = 'block';
    if (googleNotice) googleNotice.style.display = 'none';
    if (confirmBtn) confirmBtn.style.display = 'inline-flex';
    if (googleBtn) googleBtn.style.display = 'none';
    const pwInput = document.getElementById('deletePassword');
    if (pwInput) pwInput.value = '';
  }

  openModal('deleteAccountModal');
});

document.getElementById('confirmDeleteBtn')?.addEventListener('click', async () => {
  const password = document.getElementById('deletePassword')?.value;

  if (!password) {
    showToast('Please enter your password', 'error');
    return;
  }

  closeModal('deleteAccountModal');
  showPageLoading('Deleting account...');

  try {
    await fetchAPI('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password })
    });

    hidePageLoading();
    clearSession();
    window.location.href = '/login';
  } catch (error) {
    hidePageLoading();
    showToast(getFriendlyError(error.message), 'error');
  }
});

document.getElementById('confirmDeleteGoogleBtn')?.addEventListener('click', async () => {
  closeModal('deleteAccountModal');
  showPageLoading('Verifying Google account...');

  try {
    const credential = await GoogleAuthHelper.chooseAccount();
    hidePageLoading();
    showPageLoading('Deleting account...');

    await fetchAPI('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ credential })
    });

    hidePageLoading();
    clearSession();
    window.location.href = '/login';
  } catch (error) {
    hidePageLoading();
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Sessions
async function loadSessions() {
  if (!elements.sessionsList) return;
  try {
    const data = await fetchAPI('/api/auth/sessions');

    if (!data.sessions || data.sessions.length === 0) {
      elements.sessionsList.innerHTML = '<div class="empty-state"><p>No active sessions</p></div>';
      return;
    }

    elements.sessionsList.innerHTML = data.sessions.map(session => `
      <div class="session-item ${session.current ? 'current' : ''}">
        <div class="session-info">
          <div class="session-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="session-details">
            <h4>
              ${escapeHtml(session.device?.substring(0, 40) || 'Unknown device')}
              ${session.current ? '<span class="session-badge">Current</span>' : ''}
            </h4>
            <p>${formatTime(session.createdAt)}</p>
          </div>
        </div>
        ${!session.current ? `<button class="btn btn-secondary btn-sm" onclick="revokeSession('${session.id}')">Revoke</button>` : ''}
      </div>
    `).join('');
  } catch (error) {
    elements.sessionsList.innerHTML = '<div class="empty-state"><p>Unable to load sessions</p></div>';
  }
}

window.revokeSession = async function(sessionId) {
  try {
    await fetchAPI(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
    showToast('Session revoked', 'success');
    loadSessions();
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
};

// Blocked Users
async function loadBlockedUsers() {
  if (!elements.blockedUsersList) return;
  try {
    const data = await fetchAPI('/api/users/blocked');

    if (!data.blockedUsers || data.blockedUsers.length === 0) {
      elements.blockedUsersList.innerHTML = '<div class="empty-state" style="padding: 24px;"><p>No blocked users</p></div>';
      return;
    }

    elements.blockedUsersList.innerHTML = data.blockedUsers.map(user => `
      <div class="blocked-user-item">
        <div class="blocked-user-info">
          <div class="avatar">${user.avatar ? `<img src="${sanitizeUrl(user.avatar)}" alt="${escapeAttr(user.username)}">` : getInitials(user.username)}</div>
          <span>${escapeHtml(user.username)}</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="unblockUser('${user._id}')">Unblock</button>
      </div>
    `).join('');
  } catch (error) {
    elements.blockedUsersList.innerHTML = '<div class="empty-state"><p>Unable to load blocked users</p></div>';
  }
}

window.unblockUser = async function(userId) {
  try {
    await fetchAPI(`/api/users/${userId}/block`, { method: 'DELETE' });
    showToast('User unblocked', 'success');
    loadBlockedUsers();
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
};

// Avatar Upload
document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    showPageLoading('Uploading photo...');
    const response = await fetch('/api/users/avatar', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await response.json();
    hidePageLoading();

    if (!response.ok) throw new Error(data.error);

    currentUser.avatar = data.avatar;
    updateStoredUser(currentUser);
    initHeaderAvatar();

    const myId = parseInt(currentUser._id);
    chats.forEach(chat => {
      const p = chat.participants?.find(p => parseInt(p._id) === myId);
      if (p) p.avatar = data.avatar;
    });
    localStorage.setItem('synch_chats_cache', JSON.stringify(chats));
    renderChatList(elements.searchChats ? elements.searchChats.value : '');

    if (currentChat) {
      let msgChanged = false;
      messages.forEach(msg => {
        if (msg.sender && parseInt(msg.sender._id) === myId) {
          msg.sender.avatar = data.avatar;
          msgChanged = true;
        }
      });
      if (msgChanged) renderMessages();
    }

    showToast('Avatar updated', 'success');
  } catch (error) {
    hidePageLoading();
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Logout
async function performUserLogout() {
  const confirmed = await showConfirm('Log Out', 'Are you sure you want to sign out?', 'Log Out', true);
  if (!confirmed) return;

  showPageLoading('Signing out...');
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (e) {}

  clearSession();
  window.location.href = '/login';
}

document.getElementById('settingsLogoutBtn')?.addEventListener('click', performUserLogout);
document.getElementById('railDirectLogoutBtn')?.addEventListener('click', performUserLogout);

// Export Data
document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
  showToast('Preparing export...', 'info');

  try {
    const chatsData = await fetchAPI('/api/chats');
    const exportData = {
      user: currentUser,
      chats: chatsData.chats,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synch-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Export complete', 'success');
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Clear Chats
document.getElementById('clearChatsBtn')?.addEventListener('click', async () => {
  const confirmed = await showConfirm('Clear All Chats', 'Are you sure you want to clear your chat history?', 'Clear All', true);
  if (!confirmed) return;
  showToast('Please clear conversations individually from the chat menu', 'info');
});

// ----------------------------------------------------
// TWO-FACTOR AUTHENTICATION DEDICATED SUB-SETTINGS & PROMPTS
// ----------------------------------------------------

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

function updateTwoFactorToggle() {
  const badge = document.getElementById('twoFactorStatusBadge');
  const overview = document.getElementById('twoFactorStatusOverview');
  const masterToggle = document.getElementById('twoFactorMasterToggle');
  const methodsContainer = document.getElementById('twoFactorMethodsContainer');
  const disabledNotice = document.getElementById('twoFactorDisabledNotice');
  const methodsActiveBadge = document.getElementById('methodsActiveBadge');
  const emailMasked = document.getElementById('twoFactorEmailMasked');

  const isEnabled = !!currentUser?.twoFactorEnabled;

  if (badge) {
    badge.textContent = isEnabled ? 'On' : 'Off';
    badge.className = isEnabled ? 'badge badge-primary' : 'badge badge-secondary';
  }
  if (overview) {
    overview.textContent = isEnabled ? 'On-device approval & email verification' : 'Add extra security to your account';
  }
  if (masterToggle) {
    masterToggle.classList.toggle('active', isEnabled);
  }
  if (methodsContainer) {
    methodsContainer.classList.toggle('methods-container-disabled', !isEnabled);
  }
  if (disabledNotice) {
    disabledNotice.style.display = isEnabled ? 'none' : 'block';
  }
  if (methodsActiveBadge) {
    methodsActiveBadge.textContent = isEnabled ? 'Active' : 'Disabled';
    methodsActiveBadge.className = isEnabled ? 'badge badge-primary' : 'badge badge-secondary';
  }
  if (emailMasked) {
    emailMasked.textContent = maskEmail(currentUser?.email);
  }
}

// 1. Click row in Account & Security
document.getElementById('open2FASettingsRow')?.addEventListener('click', () => {
  if (currentUser?.hasPassword) {
    const pwInput = document.getElementById('confirm2FAPasswordInput');
    const errEl = document.getElementById('confirm2FAPasswordError');
    if (pwInput) pwInput.value = '';
    if (errEl) errEl.style.display = 'none';
    openModal('confirmPasswordFor2FAModal');
  } else {
    // Google-only account without password
    open2FASubSection();
  }
});

// 2. Submit password verification form
document.getElementById('confirmPasswordFor2FAForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwInput = document.getElementById('confirm2FAPasswordInput');
  const errEl = document.getElementById('confirm2FAPasswordError');
  const pw = pwInput?.value;

  if (!pw) return;
  if (errEl) errEl.style.display = 'none';

  try {
    showPageLoading('Verifying password...');
    const data = await fetchAPI('/api/auth/2fa/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password: pw })
    });
    hidePageLoading();

    if (data.verified) {
      closeModal('confirmPasswordFor2FAModal');
      open2FASubSection();
    }
  } catch (error) {
    hidePageLoading();
    if (errEl) {
      errEl.textContent = getFriendlyError(error.message) || 'Incorrect password';
      errEl.style.display = 'block';
    }
  }
});

function open2FASubSection() {
  document.querySelectorAll('.settings-detail-section').forEach(sec => sec.classList.remove('active'));
  const sec2FA = document.getElementById('sec-2fa');
  if (sec2FA) sec2FA.classList.add('active');
  updateTwoFactorToggle();
}

document.getElementById('backToAccountSecurityBtn')?.addEventListener('click', () => {
  document.querySelectorAll('.settings-detail-section').forEach(sec => sec.classList.remove('active'));
  const secAccount = document.getElementById('sec-account');
  if (secAccount) secAccount.classList.add('active');
});

// 3. Master Toggle click handler
document.getElementById('twoFactorMasterToggle')?.addEventListener('click', async () => {
  const targetState = !currentUser.twoFactorEnabled;
  showPageLoading(targetState ? 'Enabling 2FA...' : 'Disabling 2FA...');

  try {
    const data = await fetchAPI('/api/auth/2fa', {
      method: 'PUT',
      body: JSON.stringify({ enabled: targetState })
    });

    currentUser.twoFactorEnabled = targetState;
    updateStoredUser(currentUser);
    updateTwoFactorToggle();

    setTimeout(() => {
      hidePageLoading();
      showToast(data.message, 'success');
    }, 400);
  } catch (error) {
    hidePageLoading();
    showToast(getFriendlyError(error.message), 'error');
  }
});

// 4. Real-Time On-Device Approval Prompt Popup
let activePromptCountdownTimer = null;
let currentPromptChallengeId = null;

function onDevicePromptReceived(data) {
  if (!data || !data.challengeId) return;
  currentPromptChallengeId = data.challengeId;

  // Vibrate mobile device if supported
  if ('vibrate' in navigator) {
    try { navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  // Show push notification on mobile / desktop
  if ('Notification' in window && Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification('SYNCH — Sign-In Request', {
          body: `Sign-in attempt from ${data.device || 'another device'} (${data.location?.display || 'Nearby'}). Tap to review.`,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: `device-prompt-${data.challengeId}`,
          vibrate: [200, 100, 200],
          data: {
            type: 'device_prompt',
            challengeId: data.challengeId,
            ...data
          }
        });
      }).catch(() => {});
    } else {
      try {
        new Notification('SYNCH — Sign-In Request', {
          body: `Sign-in attempt from ${data.device || 'another device'} (${data.location?.display || 'Nearby'}).`,
          icon: '/favicon.svg',
          tag: `device-prompt-${data.challengeId}`
        });
      } catch (e) {}
    }
  }

  const deviceEl = document.getElementById('devicePromptDeviceName');
  const ipEl = document.getElementById('devicePromptIP');
  const timeEl = document.getElementById('devicePromptTime');
  const locEl = document.getElementById('devicePromptLocationText');
  const mapFrame = document.getElementById('devicePromptMapFrame');
  const expiryEl = document.getElementById('devicePromptExpiryText');
  const banner = document.getElementById('devicePromptExpiredBanner');
  const actions = document.getElementById('devicePromptActions');

  if (deviceEl) deviceEl.textContent = data.device || 'Unknown Device';
  if (ipEl) ipEl.textContent = data.ip || 'Unknown IP';
  if (timeEl) timeEl.textContent = formatTime(data.createdAt || Date.now());
  if (locEl) locEl.textContent = data.location?.display || 'Approximate Location';

  if (mapFrame) {
    const lat = data.location?.lat || 37.7749;
    const lon = data.location?.lon || -122.4194;
    mapFrame.src = `https://maps.google.com/maps?q=${lat},${lon}&z=11&output=embed`;
  }

  if (banner) banner.style.display = 'none';
  if (actions) actions.style.display = 'flex';

  // Start 5-minute countdown
  if (activePromptCountdownTimer) clearInterval(activePromptCountdownTimer);
  const expiryTime = data.expiresAt || (Date.now() + 5 * 60 * 1000);

  function updateTimer() {
    const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    if (expiryEl) expiryEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (remaining <= 0) {
      clearInterval(activePromptCountdownTimer);
      if (banner) banner.style.display = 'block';
      if (actions) actions.style.display = 'none';
    }
  }
  updateTimer();
  activePromptCountdownTimer = setInterval(updateTimer, 1000);

  openModal('deviceApprovalModal');
}

window.onDevicePromptReceived = onDevicePromptReceived;

async function checkPendingDevicePrompts() {
  if (!getToken()) return;
  try {
    const res = await fetchAPI('/api/auth/2fa/pending-prompts');
    if (res.prompts && res.prompts.length > 0) {
      onDevicePromptReceived(res.prompts[0]);
    } else {
      if (currentPromptChallengeId) {
        closeModal('deviceApprovalModal');
        if (activePromptCountdownTimer) clearInterval(activePromptCountdownTimer);
        currentPromptChallengeId = null;
      }
    }
  } catch (e) {}
}

window.checkPendingDevicePrompts = checkPendingDevicePrompts;

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkPendingDevicePrompts();
});
window.addEventListener('focus', checkPendingDevicePrompts);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'OPEN_DEVICE_PROMPT') {
      if (event.data.promptData?.challengeId) {
        onDevicePromptReceived(event.data.promptData);
      } else {
        checkPendingDevicePrompts();
      }
    }
  });
}

function showDevicePromptResult(action, deviceName) {
  const iconEl = document.getElementById('devicePromptResultIcon');
  const titleEl = document.getElementById('devicePromptResultTitle');
  const descEl = document.getElementById('devicePromptResultDesc');

  const dev = deviceName || 'the requested device';

  if (action === 'approve') {
    if (iconEl) {
      iconEl.style.background = 'rgba(16, 185, 129, 0.15)';
      iconEl.innerHTML = `
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = 'Sign-in Approved';
    if (descEl) descEl.innerHTML = `You approved the sign-in request for <strong>${escapeHtml(dev)}</strong>. That device has now been logged in.`;
  } else {
    if (iconEl) {
      iconEl.style.background = 'rgba(239, 68, 68, 0.15)';
      iconEl.innerHTML = `
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = 'Sign-in Declined';
    if (descEl) descEl.innerHTML = `You declined the sign-in request for <strong>${escapeHtml(dev)}</strong>. Access was denied. If this wasn't you, consider changing your password.`;
  }

  openModal('devicePromptResultModal');
}

async function respondToDevicePrompt(action) {
  if (!currentPromptChallengeId) return;
  const challengeId = currentPromptChallengeId;
  const deviceName = document.getElementById('devicePromptDeviceName')?.textContent || 'Device';

  try {
    showPageLoading(action === 'approve' ? 'Approving request...' : 'Declining request...');
    const data = await fetchAPI('/api/auth/2fa/respond-device-prompt', {
      method: 'POST',
      body: JSON.stringify({ challengeId, action })
    });
    hidePageLoading();
    closeModal('deviceApprovalModal');
    if (activePromptCountdownTimer) clearInterval(activePromptCountdownTimer);
    currentPromptChallengeId = null;

    showDevicePromptResult(action, deviceName);
  } catch (error) {
    hidePageLoading();
    if (error.message.includes('EXPIRED') || error.message.includes('expired')) {
      const banner = document.getElementById('devicePromptExpiredBanner');
      const actions = document.getElementById('devicePromptActions');
      if (banner) banner.style.display = 'block';
      if (actions) actions.style.display = 'none';
    } else {
      showToast(getFriendlyError(error.message), 'error');
    }
  }
}

document.getElementById('approveDevicePromptBtn')?.addEventListener('click', () => respondToDevicePrompt('approve'));
document.getElementById('declineDevicePromptBtn')?.addEventListener('click', () => respondToDevicePrompt('decline'));
document.getElementById('devicePromptResultCloseBtn')?.addEventListener('click', () => closeModal('devicePromptResultModal'));

// Google Connect / Disconnect
function updateGoogleSection() {
  const text = document.getElementById('googleStatusText');
  const btn = document.getElementById('googleConnectBtn');
  if (!text || !btn) return;

  if (currentUser.googleLinked) {
    text.textContent = 'Connected';
    btn.textContent = 'Disconnect';
    btn.classList.add('btn-danger');
    btn.classList.remove('btn-secondary');
  } else {
    text.textContent = 'Not connected';
    btn.textContent = 'Connect';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-secondary');
  }
}

async function startGoogleLink(password) {
  try {
    showPageLoading('Opening Google sign-in...');
    const credential = await GoogleAuthHelper.chooseAccount();
    hidePageLoading();
    showPageLoading('Connecting...');
    const data = await fetchAPI('/api/auth/link-google', {
      method: 'POST',
      body: JSON.stringify({ credential, password })
    });
    currentUser = data.user;
    updateStoredUser(currentUser);
    updateGoogleSection();
    hidePageLoading();
    showToast('Google account connected', 'success');
  } catch (error) {
    hidePageLoading();
    showToast(getFriendlyError(error.message), 'error');
  }
}

document.getElementById('googleConnectBtn')?.addEventListener('click', async () => {
  if (currentUser.googleLinked) {
    if (!currentUser.hasPassword) {
      pendingGoogleAction = 'disconnect';
      const desc = document.getElementById('googleSetPasswordFirstText');
      const btn = document.getElementById('confirmGoogleSetPasswordBtn');
      if (desc) desc.textContent = 'Your account currently signs in only with Google. Set a password so you can still sign in after disconnecting it.';
      if (btn) btn.textContent = 'Set Password & Disconnect';
      openModal('googleSetPasswordFirstModal');
      return;
    }
    pendingGoogleAction = 'disconnect';
    const title = document.getElementById('googlePasswordModalTitle');
    const desc = document.getElementById('googlePasswordModalDesc');
    const confirmBtn = document.getElementById('confirmGoogleLinkBtn');
    if (title) title.textContent = 'Verify your password';
    if (desc) desc.textContent = 'Enter your password to disconnect your Google account.';
    if (confirmBtn) confirmBtn.textContent = 'Disconnect';
    const pwInput = document.getElementById('googleLinkPassword');
    if (pwInput) pwInput.value = '';
    openModal('googlePasswordModal');
    return;
  }

  if (currentUser.hasPassword) {
    pendingGoogleAction = 'connect';
    const title = document.getElementById('googlePasswordModalTitle');
    const desc = document.getElementById('googlePasswordModalDesc');
    const confirmBtn = document.getElementById('confirmGoogleLinkBtn');
    if (title) title.textContent = 'Verify your password';
    if (desc) desc.textContent = 'Enter your password to connect a Google account.';
    if (confirmBtn) confirmBtn.textContent = 'Continue';
    const pwInput = document.getElementById('googleLinkPassword');
    if (pwInput) pwInput.value = '';
    openModal('googlePasswordModal');
  } else {
    pendingGoogleAction = 'connect';
    const desc = document.getElementById('googleSetPasswordFirstText');
    const btn = document.getElementById('confirmGoogleSetPasswordBtn');
    if (desc) desc.textContent = 'Set a password before connecting Google, so you always have a backup way to sign in.';
    if (btn) btn.textContent = 'Set Password & Continue';
    openModal('googleSetPasswordFirstModal');
  }
});

document.getElementById('googleLinkPassword')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('confirmGoogleLinkBtn')?.click();
  }
});

document.getElementById('confirmGoogleLinkBtn')?.addEventListener('click', async () => {
  const pw = document.getElementById('googleLinkPassword')?.value;
  if (!pw) return showToast('Enter your password', 'error');
  closeModal('googlePasswordModal');
  if (document.getElementById('googleLinkPassword')) document.getElementById('googleLinkPassword').value = '';

  if (pendingGoogleAction === 'disconnect') {
    try {
      showPageLoading('Disconnecting...');
      const data = await fetchAPI('/api/auth/unlink-google', {
        method: 'POST',
        body: JSON.stringify({ password: pw })
      });
      currentUser = data.user;
      updateStoredUser(currentUser);
      updateGoogleSection();
      hidePageLoading();
      showToast('Google account disconnected', 'success');
    } catch (error) {
      hidePageLoading();
      showToast(getFriendlyError(error.message), 'error');
    }
  } else {
    await startGoogleLink(pw);
  }
});

document.getElementById('confirmGoogleSetPasswordBtn')?.addEventListener('click', async () => {
  const pw1 = document.getElementById('googleNewPassword')?.value;
  const pw2 = document.getElementById('googleNewPasswordConfirm')?.value;
  if (!pw1 || pw1.length < 6) return showToast('Password must be at least 6 characters', 'error');
  if (pw1 !== pw2) return showToast('Passwords do not match', 'error');

  try {
    showPageLoading('Saving password...');
    const data = await fetchAPI('/api/auth/set-password', { method: 'POST', body: JSON.stringify({ password: pw1 }) });
    currentUser = data.user;
    updateStoredUser(currentUser);
    closeModal('googleSetPasswordFirstModal');
    if (document.getElementById('googleNewPassword')) document.getElementById('googleNewPassword').value = '';
    if (document.getElementById('googleNewPasswordConfirm')) document.getElementById('googleNewPasswordConfirm').value = '';
    hidePageLoading();
    updateGoogleSection();

    if (pendingGoogleAction === 'connect') {
      pendingGoogleAction = null;
      showToast('Password set — now choose your Google account.', 'success');
      await startGoogleLink(null);
    } else {
      pendingGoogleAction = null;
      showPageLoading('Disconnecting...');
      const unlinkData = await fetchAPI('/api/auth/unlink-google', {
        method: 'POST',
        body: JSON.stringify({ password: pw1 })
      });
      currentUser = unlinkData.user;
      updateStoredUser(currentUser);
      updateGoogleSection();
      hidePageLoading();
      showToast('Google account disconnected', 'success');
    }
  } catch (error) {
    hidePageLoading();
    showToast(getFriendlyError(error.message), 'error');
  }
});

(async () => {
  if (typeof GoogleAuthHelper !== 'undefined') {
    await GoogleAuthHelper.init();
    updateGoogleSection();
  }
})();

// ----------------------------------------------------
// SOCKET EVENT LISTENERS
// ----------------------------------------------------

function onSocketConnected() {
  loadChats();
}

function onSocketDisconnected() {
  showToast('Connection lost. Reconnecting...', 'warning');
}

function onNewChat(data) {
  loadChats();
  if (data.chat?._id) {
    joinChat(data.chat._id);
  }
}

const processedMessageIds = new Set();

function onNewMessage(message) {
  if (!message || !message._id) return;

  // Deduplicate: ignore if this message ID was already handled
  if (processedMessageIds.has(message._id)) {
    return;
  }
  processedMessageIds.add(message._id);
  if (processedMessageIds.size > 2000) {
    const oldest = processedMessageIds.values().next().value;
    processedMessageIds.delete(oldest);
  }

  const isCurrentChat = !!(currentChat && (parseInt(currentChat._id) === parseInt(message.chat) || currentChat._id === message.chat));
  const isSender = (message.sender?._id === currentUser._id || message.senderId === currentUser._id);

  if (isCurrentChat) {
    if (!messages.find(m => m._id === message._id)) {
      messages.push(message);
      appendMessage(message);
    }

    if (!isSender) {
      markMessagesAsRead([message._id], currentChat._id);
    }
  }

  const msgChatId = parseInt(message.chat) || message.chat;
  const chat = chats.find(c => c._id === msgChatId || c._id == message.chat);
  if (chat) {
    chat.lastMessage = {
      content: message.content,
      type: message.type,
      senderId: message.sender?._id || message.senderId,
      createdAt: message.createdAt
    };
    if (!isCurrentChat && !isSender) {
      chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
    chats.sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
    renderChatList(elements.searchChats ? elements.searchChats.value : '');
  } else {
    loadChats();
  }

  const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
  if (settings.messageSound !== false && !isSender) {
    playNotificationSound();
  }
}

function onMessageEdited(message) {
  const index = messages.findIndex(m => m._id === message._id);
  if (index !== -1) {
    messages[index] = message;
    renderMessages();
  }
}

function onMessageDeleted(data) {
  const index = messages.findIndex(m => m._id === data.messageId);
  if (index !== -1) {
    messages[index].deleted = true;
    messages[index].content = '';
    renderMessages();
  }
}

function onMessageReacted(data) {
  const index = messages.findIndex(m => m._id === data.messageId);
  if (index !== -1) {
    messages[index].reactions = data.reactions;
    renderMessages();
  }
}

function onMessageRead(data) {
  if (data.messageIds && Array.isArray(data.messageIds)) {
    data.messageIds.forEach(id => {
      const msg = messages.find(m => m._id == id);
      if (msg) msg.read = true;
      const el = document.querySelector(`.message[data-message-id="${id}"] .message-status`);
      if (el) {
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#0084FF" stroke-width="2" class="read" style="color: #0084FF;"><polyline points="20 6 9 17 4 12"/><polyline points="20 12 11 20 7 16"/></svg>';
      }
    });
  }
}

function onTypingStart(data) {
  if (data.chatId === currentChat?._id && data.userId !== currentUser._id) {
    elements.typingIndicator.style.display = 'flex';
    elements.typingText.textContent = `${data.username} is typing...`;
  }
  const chatItem = document.querySelector(`.chat-item[data-chat-id="${data.chatId}"] .chat-preview`);
  if (chatItem) {
    chatItem.innerHTML = '<span style="color: var(--success, #22c55e); font-style: italic; font-weight: 500;">typing...</span>';
  }
}

function onTypingStop(data) {
  if (data.chatId === currentChat?._id) {
    elements.typingIndicator.style.display = 'none';
  }
  const chat = chats.find(c => c._id == data.chatId);
  if (chat) {
    const chatItem = document.querySelector(`.chat-item[data-chat-id="${data.chatId}"] .chat-preview`);
    if (chatItem) {
      const lastMessage = chat.lastMessage;
      const isOwn = lastMessage?.sender?._id === currentUser._id || lastMessage?.senderId === currentUser._id;
      const prefix = isOwn ? 'You: ' : '';
      const preview = lastMessage ? (lastMessage.type === 'voice' ? '🎤 Voice message' : lastMessage.type === 'image' ? '🖼️ Image' : lastMessage.content || '') : 'No messages yet';
      chatItem.textContent = (prefix + preview).substring(0, 40);
    }
  }
}

function onUserProfileUpdated(data) {
  const updatedUserId = parseInt(data.userId);
  const isMe = parseInt(currentUser._id) === updatedUserId;

  if (isMe) {
    if (data.username) currentUser.username = data.username;
    if (data.avatar !== undefined) currentUser.avatar = data.avatar;
    updateStoredUser(currentUser);
    initHeaderAvatar();
  }

  // 1. Update in-memory chats list
  chats.forEach(chat => {
    const p = chat.participants?.find(p => parseInt(p._id) === updatedUserId);
    if (p) {
      if (data.username) p.username = data.username;
      if (data.avatar !== undefined) p.avatar = data.avatar;
    }
  });
  localStorage.setItem('synch_chats_cache', JSON.stringify(chats));

  // 2. Update current active chat if it involves this user
  if (currentChat) {
    const other = currentChat.participants?.find(p => parseInt(p._id) === updatedUserId);
    if (other) {
      if (data.username) {
        other.username = data.username;
        const savedNicknames = JSON.parse(localStorage.getItem('synch_nicknames') || '{}');
        elements.chatName.textContent = savedNicknames[other._id] || data.username;
      }
      if (data.avatar !== undefined) {
        other.avatar = data.avatar;
        elements.chatAvatar.innerHTML = data.avatar ? `<img src="${sanitizeUrl(data.avatar)}" alt="${escapeAttr(other.username)}" onerror="this.parentElement.textContent='${escapeAttr(getInitials(other.username))}'">` : getInitials(other.username);
      }
    }
    // Update messages in current open chat
    let messageChanged = false;
    messages.forEach(msg => {
      if (msg.sender && parseInt(msg.sender._id) === updatedUserId) {
        if (data.avatar !== undefined) msg.sender.avatar = data.avatar;
        if (data.username) msg.sender.username = data.username;
        messageChanged = true;
      }
    });
    if (messageChanged) {
      renderMessages();
    }
  }

  // 3. Re-render sidebar chat list
  renderChatList(elements.searchChats ? elements.searchChats.value : '');

  // 4. Update open profile modal if viewing this user
  const userModal = document.getElementById('userInfoModal');
  if (userModal && userModal.classList.contains('active') && currentChatUser && parseInt(currentChatUser._id) === updatedUserId) {
    previewUserProfile(currentChatUser._id);
  }

  // 5. Refresh Connect modal if open (Discover / Incoming / Outgoing)
  refreshConnectModal();
}

function onUserBadgeUpdated(data) {
  const updatedUserId = parseInt(data.userId);
  const badgeVal = data.badge || null;
  const isMe = parseInt(currentUser?._id) === updatedUserId;

  if (isMe && currentUser) {
    currentUser.badge = badgeVal;
    updateStoredUser(currentUser);
  }

  // 1. Update in-memory chats list
  chats.forEach(chat => {
    const p = chat.participants?.find(p => parseInt(p._id) === updatedUserId);
    if (p) {
      p.badge = badgeVal;
    }
  });
  localStorage.setItem('synch_chats_cache', JSON.stringify(chats));

  // 2. Update current active chat
  if (currentChat) {
    const other = currentChat.participants?.find(p => parseInt(p._id) === updatedUserId);
    if (other) {
      other.badge = badgeVal;
      const savedNicknames = JSON.parse(localStorage.getItem('synch_nicknames') || '{}');
      const displayName = savedNicknames[other._id] || (currentChat.type === 'group' ? currentChat.name : other.username || 'User');
      elements.chatName.innerHTML = `${escapeHtml(displayName)} ${renderUserBadge(badgeVal)}`;
    }
    // Update messages
    let messageChanged = false;
    messages.forEach(msg => {
      if (msg.sender && parseInt(msg.sender._id) === updatedUserId) {
        msg.sender.badge = badgeVal;
        messageChanged = true;
      }
    });
    if (messageChanged) {
      renderMessages();
    }
  }

  // 3. Re-render sidebar chat list
  renderChatList(elements.searchChats ? elements.searchChats.value : '');

  // 4. Update profile modal if open
  const userModal = document.getElementById('userInfoModal');
  if (userModal && userModal.classList.contains('active') && currentChatUser && parseInt(currentChatUser._id) === updatedUserId) {
    currentChatUser.badge = badgeVal;
    const nameEl = document.getElementById('userInfoUsername');
    if (nameEl) nameEl.innerHTML = `${escapeHtml(currentChatUser.username)} ${renderUserBadge(badgeVal)}`;
  }

  // 5. Refresh Connect modal if open
  refreshConnectModal();
}

function onUserFrozen(data) {
  showToast(data?.reason || 'Your account has been temporarily frozen by an administrator.', 'warning');
  if (elements.messageInput) {
    elements.messageInput.disabled = true;
    elements.messageInput.placeholder = 'Account frozen — messaging temporarily disabled';
  }
  if (elements.sendBtn) elements.sendBtn.disabled = true;
}

function onUserUnfrozen() {
  showToast('Your account has been unfrozen. Messaging access restored.', 'success');
  if (elements.messageInput) {
    elements.messageInput.disabled = false;
    elements.messageInput.placeholder = 'Type a message...';
  }
  if (elements.sendBtn) elements.sendBtn.disabled = !elements.messageInput.value.trim();
}

async function onFriendUpdated(data) {
  await loadChats();
  updateFriendBadges();
  refreshConnectModal();
}

function onUserDeleted(data) {
  chats.forEach(chat => {
    const p = chat.participants?.find(p => p._id === data.userId);
    if (p) {
      p.isDeleted = true;
      p.username = 'Account Unavailable';
      p.avatar = null;
      p.status = 'offline';
    }
  });
  if (currentChat) {
    const other = currentChat.participants?.find(p => p._id === data.userId);
    if (other) {
      other.isDeleted = true;
      other.username = 'Account Unavailable';
      other.avatar = null;
      elements.chatAvatar.innerHTML = '?';
      elements.chatName.textContent = 'Account Unavailable';
      elements.chatStatus.textContent = 'Unavailable';
      elements.chatStatus.className = 'chat-header-status offline';
      if (elements.messageInput) {
        elements.messageInput.disabled = true;
        elements.messageInput.placeholder = 'This account is no longer available';
      }
      if (elements.sendBtn) elements.sendBtn.disabled = true;
    }
  }
  renderChatList(elements.searchChats ? elements.searchChats.value : '');
}

function onChatDeleted(data) {
  const chatId = parseInt(data.chatId);
  chats = chats.filter(c => c._id !== chatId);
  if (currentChat?._id === chatId) {
    leaveChat(chatId);
    currentChat = null;
    elements.noChatSelected.style.display = 'flex';
    elements.chatView.style.display = 'none';
    document.querySelector('.chat-app').classList.remove('chat-open');
  }
  renderChatList(elements.searchChats ? elements.searchChats.value : '');
}

function onChatCleared(data) {
  const chatId = parseInt(data.chatId);
  const chat = chats.find(c => c._id === chatId);
  if (chat) {
    chat.lastMessage = null;
  }
  if (currentChat?._id === chatId) {
    messages = [];
    elements.messagesContainer.innerHTML = '<div class="empty-state"><p>No messages yet. Start the conversation!</p></div>';
  }
  renderChatList(elements.searchChats ? elements.searchChats.value : '');
}

function onUserStatusChange(data) {
  const chat = chats.find(c =>
    c.participants?.some(p => p._id === data.userId)
  );

  if (chat) {
    const participant = chat.participants.find(p => p._id === data.userId);
    if (participant) {
      participant.status = data.status;
      participant.lastSeen = data.lastSeen;
    }

    if (currentChat?._id === chat._id) {
      const otherParticipant = currentChat.participants.find(p => p._id !== currentUser._id);
      if (otherParticipant && otherParticipant._id === data.userId) {
        elements.chatStatus.textContent = data.status === 'online' ? 'Online' : `Last seen ${formatLastSeen(data.lastSeen)}`;
        elements.chatStatus.className = `chat-header-status ${data.status}`;
      }
    }

    renderChatList(elements.searchChats ? elements.searchChats.value : '');
  }
}

function onSessionUpdated(data) {
  if (typeof loadSessions === 'function') {
    loadSessions();
  }
}

function onSessionRevoked(data) {
  const currentToken = getToken();
  if (!data?.token || data.token === currentToken) {
    handleSessionRevoked();
  } else {
    if (typeof loadSessions === 'function') {
      loadSessions();
    }
  }
}

document.getElementById('reloginSessionRevokedBtn')?.addEventListener('click', () => {
  window.location.href = '/login';
});

document.getElementById('closeSessionRevokedBtn')?.addEventListener('click', () => {
  window.location.href = '/login';
});

document.getElementById('sessionRevokedModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('sessionRevokedModal')) {
    window.location.href = '/login';
  }
});

// ----------------------------------------------------
// NOTIFICATION MANAGEMENT & BANNER
// ----------------------------------------------------

async function initNotificationBanner() {
  const banner = document.getElementById('notifWarningBanner');
  const icon = document.getElementById('notifBannerIcon');
  const title = document.getElementById('notifBannerTitle');
  const desc = document.getElementById('notifBannerDesc');
  const closeBtn = document.getElementById('notifBannerCloseBtn');

  if (!banner) return;

  if (!('Notification' in window)) {
    banner.style.display = 'none';
    return;
  }

  // Check permission via both Notification.permission and navigator.permissions API
  let currentPerm = Notification.permission;
  if (currentPerm !== 'granted' && typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: 'notifications' });
      if (status && status.state) {
        currentPerm = status.state;
      }
    } catch (e) {}
  }

  // If notifications are granted, ALWAYS hide the banner
  if (currentPerm === 'granted') {
    banner.style.display = 'none';
    banner.classList.remove('banner-default', 'banner-denied');
    return;
  }

  const isDismissed = localStorage.getItem('synch_notif_banner_dismissed') === '1' ||
                      sessionStorage.getItem('synch_notif_banner_dismissed') === '1';

  if (isDismissed) {
    banner.style.display = 'none';
    return;
  }

  // Clicking anywhere on the banner (except the X close button) triggers notification permission or help modal
  banner.onclick = (e) => {
    if (e.target.closest('#notifBannerCloseBtn')) return;
    requestNotificationPermission();
  };

  if (currentPerm === 'denied') {
    banner.style.display = 'flex';
    banner.className = 'notif-warning-banner banner-denied';
    if (icon) {
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          <path d="M18.63 13A17.89 17.89 0 0 1 18 8"/>
          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      `;
    }
    if (title) title.textContent = 'Notifications are off';
    if (desc) desc.textContent = 'Click to turn on notifications';
  } else if (currentPerm === 'default' || currentPerm === 'prompt') {
    banner.style.display = 'flex';
    banner.className = 'notif-warning-banner banner-default';
    if (icon) {
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      `;
    }
    if (title) title.textContent = 'Turn on notifications';
    if (desc) desc.textContent = 'Click to get message alerts';
  }

  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      banner.style.display = 'none';
      localStorage.setItem('synch_notif_banner_dismissed', '1');
      sessionStorage.setItem('synch_notif_banner_dismissed', '1');
    };
  }
}

// Real-time permission change & focus listeners
if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'notifications' }).then((permissionStatus) => {
    if (permissionStatus.state === 'granted') {
      const banner = document.getElementById('notifWarningBanner');
      if (banner) banner.style.display = 'none';
    }
    permissionStatus.onchange = () => {
      initNotificationBanner();
    };
  }).catch(() => {});
}

window.addEventListener('focus', () => {
  initNotificationBanner();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    initNotificationBanner();
  }
});

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported in your browser', 'warning');
    return;
  }

  try {
    // Directly trigger native browser prompt: "Allow Synch to send notifications: [Allow] [Block]"
    const permission = await Notification.requestPermission();
    localStorage.removeItem('synch_notif_banner_dismissed');
    sessionStorage.removeItem('synch_notif_banner_dismissed');
    initNotificationBanner();

    if (permission === 'granted') {
      showToast('Notifications turned on!', 'success');
      const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
      settings.desktopNotifications = true;
      localStorage.setItem('synch_settings', JSON.stringify(settings));

      showDesktopNotification('SYNCH Notifications Enabled', {
        body: "You'll now receive alerts when someone messages you.",
        tag: 'synch-welcome'
      });
    }
  } catch (e) {
    console.error('Notification permission error:', e);
  }
}

function showDesktopNotification(title, options = {}, onClick = null) {
  if (typeof options === 'string') {
    options = { body: options };
  }
  const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
  if (settings.desktopNotifications === false) return;

  const notifOptions = {
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    ...options
  };

  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          showDesktopNotification(title, options, onClick);
        }
      }).catch(() => {});
      return;
    }

    if (Notification.permission === 'granted') {
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((reg) => {
          if (reg && typeof reg.showNotification === 'function') {
            reg.showNotification(title, notifOptions);
          } else {
            tryFallbackNotification(title, notifOptions, onClick);
          }
        }).catch(() => {
          tryFallbackNotification(title, notifOptions, onClick);
        });
      } else {
        tryFallbackNotification(title, notifOptions, onClick);
      }
    }
  }
}
window.showDesktopNotification = showDesktopNotification;

// Auto-request notification permission on first user tap/click
document.addEventListener('click', function autoRequestNotif() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') {
        const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
        settings.desktopNotifications = true;
        localStorage.setItem('synch_settings', JSON.stringify(settings));
        initNotificationBanner();
      }
    }).catch(() => {});
  }
}, { once: true });

function tryFallbackNotification(title, options, onClick) {
  try {
    const notif = new Notification(title, options);
    if (onClick && typeof onClick === 'function') {
      notif.onclick = () => {
        window.focus();
        onClick();
      };
    }
  } catch (e) {
    console.warn('Fallback Notification failed:', e);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'OPEN_CHAT' && event.data.chatId) {
      selectChat(event.data.chatId);
    } else if (event.data.type === 'OPEN_INCOMING_CALL') {
      // Focus call dialog / banner
      if (window.SynchAudioCall && typeof window.SynchAudioCall.maximizeCall === 'function') {
        window.SynchAudioCall.maximizeCall();
      }
    }
  });
}

// In-memory and cross-tab deduplication cache
const recentlyNotifiedMsgIds = new Set();

function onMessageNotification(data) {
  const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
  if (settings.desktopNotifications === false) return;

  const isSender = data.message?.sender?._id === currentUser._id || data.message?.senderId === currentUser._id;
  if (isSender) return;

  const isCurrentChatAndFocused = document.hasFocus() && currentChat && (parseInt(currentChat._id) === parseInt(data.chat?._id || data.message?.chat));
  if (isCurrentChatAndFocused) return;

  // Deduplicate by message ID across events and open browser tabs
  const msgId = data.message?._id || data.message?.id;
  if (msgId) {
    if (recentlyNotifiedMsgIds.has(msgId)) return;
    recentlyNotifiedMsgIds.add(msgId);
    setTimeout(() => recentlyNotifiedMsgIds.delete(msgId), 15000);

    const lockKey = 'synch_last_notif_' + msgId;
    const lastNotifTime = localStorage.getItem(lockKey);
    if (lastNotifTime && (Date.now() - parseInt(lastNotifTime, 10)) < 15000) {
      return; // Already triggered by another tab
    }
    localStorage.setItem(lockKey, Date.now().toString());
  }

  const otherParticipant = data.chat?.participants?.find(p => p._id !== currentUser._id);
  const senderName = data.message?.sender?.username || otherParticipant?.username || 'New Message';
  let bodyText = 'New message';
  if (settings.messagePreview !== false) {
    if (data.message?.type === 'voice') bodyText = '🎤 Voice message';
    else if (data.message?.type === 'image') bodyText = '🖼️ Image';
    else if (data.message?.type === 'video') bodyText = '🎬 Video';
    else if (data.message?.type === 'file') bodyText = '📁 Document';
    else if (data.message?.content) bodyText = data.message.content;
  }

  showDesktopNotification(senderName, {
    body: bodyText,
    tag: `synch-msg-${data.chat?._id || data.message?.chat}`,
    renotify: true
  }, () => {
    if (data.chat?._id) selectChat(data.chat._id);
  });
}


function playNotificationSound() {
  const audio = new Audio('/assets/audio/notification.mp3');
  const volume = localStorage.getItem('synch_volume') || 50;
  audio.volume = volume / 100;
  audio.play().catch(() => {});
}

// Floating Friend Request Notification Toast Functions
window.dismissFreqToast = function(toastId) {
  const el = document.getElementById(toastId);
  if (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateX(50px)';
    setTimeout(() => el.remove(), 200);
  }
};

window.acceptFriendReqFromToast = async function(requestId, toastId) {
  dismissFreqToast(toastId);
  await acceptFriendReq(requestId);
};

window.declineFriendReqFromToast = async function(requestId, toastId) {
  dismissFreqToast(toastId);
  await declineFriendReq(requestId);
};

// Real-Time Friend Request Socket Handlers
function refreshConnectModal() {
  const modal = document.getElementById('newChatModal');
  if (modal && modal.classList.contains('active')) {
    if (currentConnectTab === 'tab-discover') {
      const searchInput = document.getElementById('searchUsers');
      loadDiscoverUsers(searchInput ? searchInput.value : '');
    } else if (currentConnectTab === 'tab-incoming') {
      loadIncomingRequests();
    } else if (currentConnectTab === 'tab-outgoing') {
      loadOutgoingRequests();
    }
  }
}

function refreshProfileModal(targetUserId) {
  const userModal = document.getElementById('userInfoModal');
  if (userModal && userModal.classList.contains('active') && currentChatUser) {
    const modalUserId = parseInt(currentChatUser._id);
    const changedUserId = targetUserId ? parseInt(targetUserId) : null;
    if (!changedUserId || modalUserId === changedUserId) {
      previewUserProfile(currentChatUser._id);
    }
  }
}

function onFriendRequestReceived(data) {
  updateFriendBadges();
  refreshConnectModal();

  const req = data.request;
  const sender = req?.user || data.sender;
  if (sender?._id || sender?.id) {
    refreshProfileModal(sender._id || sender.id);
  }
  if (!sender) return;

  const container = document.getElementById('friendReqToastContainer');
  if (!container) return;

  const reqId = req?._id || req?.id;
  const toastId = `freq-toast-${reqId || Date.now()}`;
  
  // Deduplicate: avoid popping up the same request multiple times
  if (reqId && document.getElementById(toastId)) return;

  const toast = document.createElement('div');
  toast.className = 'freq-toast';
  toast.id = toastId;
  toast.innerHTML = `
    <button class="freq-toast-close" onclick="dismissFreqToast('${toastId}')" title="Dismiss">✕</button>
    <div class="freq-toast-header">
      <div class="avatar avatar-sm">${sender.avatar ? `<img src="${sanitizeUrl(sender.avatar)}">` : getInitials(sender.username)}</div>
      <div class="freq-toast-body">
        <strong>@${escapeHtml(sender.username || 'User')}</strong> sent you a friend request
      </div>
    </div>
    <div class="freq-toast-actions">
      <button class="btn btn-secondary btn-sm" onclick="declineFriendReqFromToast('${reqId || req?._id}', '${toastId}')">Decline</button>
      <button class="btn btn-primary btn-sm" onclick="acceptFriendReqFromToast('${reqId || req?._id}', '${toastId}')">Accept</button>
    </div>
  `;
  container.appendChild(toast);

  // Auto-dismiss after 3 seconds (without declining)
  setTimeout(() => {
    dismissFreqToast(toastId);
  }, 3000);

  const sound = new Audio('/assets/audio/notification.mp3');
  sound.play().catch(() => {});
}

const processedFriendAcceptKeys = new Set();
function onFriendRequestAccepted(data) {
  const reqKey = `${data.user?._id || data.user?.id || ''}_${data.chat?._id || ''}`;
  if (reqKey && processedFriendAcceptKeys.has(reqKey)) return;
  if (reqKey) {
    processedFriendAcceptKeys.add(reqKey);
    setTimeout(() => processedFriendAcceptKeys.delete(reqKey), 8000);
  }

  updateFriendBadges();
  showToast(`@${data.user?.username || 'User'} accepted your friend request!`, 'success');
  loadChats();
  if (data.chat?._id) {
    joinChat(data.chat._id);
  }
  refreshConnectModal();
  refreshProfileModal(data.user?._id || data.user?.id);
}

function onFriendRequestDeclined(data) {
  updateFriendBadges();
  refreshConnectModal();
  refreshProfileModal(data.receiverId || data.user?._id);
}

function onFriendRequestCancelled(data) {
  updateFriendBadges();
  refreshConnectModal();
  refreshProfileModal(data.senderId || data.user?._id);
}

// ----------------------------------------------------
// USER & MESSAGE SAFETY REPORTING SYSTEM
// ----------------------------------------------------

window.openReportModal = function({ reportedId = null, chatId = null, messageId = null, title = 'Report an Issue', label = null, sub = null, defaultReason = 'Harassment / Bullying / Hate Speech' } = {}) {
  const modal = document.getElementById('reportModal');
  if (!modal) return;

  const titleEl = document.getElementById('reportModalTitle');
  if (titleEl) titleEl.textContent = title;

  const targetUserEl = document.getElementById('reportTargetUserId');
  if (targetUserEl) targetUserEl.value = reportedId || '';

  const targetChatEl = document.getElementById('reportTargetChatId');
  if (targetChatEl) targetChatEl.value = chatId || '';

  const targetMsgEl = document.getElementById('reportTargetMessageId');
  if (targetMsgEl) targetMsgEl.value = messageId || '';

  const reasonEl = document.getElementById('reportReasonSelect');
  if (reasonEl) reasonEl.value = defaultReason;

  const detailsEl = document.getElementById('reportDetailsInput');
  if (detailsEl) detailsEl.value = '';

  const summaryBox = document.getElementById('reportTargetSummary');
  if (label && summaryBox) {
    summaryBox.style.display = 'block';
    const labelEl = document.getElementById('reportTargetLabel');
    if (labelEl) labelEl.textContent = label;
    const subEl = document.getElementById('reportTargetSub');
    if (subEl) subEl.textContent = sub || '';
  } else if (summaryBox) {
    summaryBox.style.display = 'none';
  }

  openModal('reportModal');
};

async function handleReportSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const submitBtn = document.getElementById('btnSubmitReportForm');
  const reportedId = document.getElementById('reportTargetUserId')?.value;
  const chatId = document.getElementById('reportTargetChatId')?.value;
  const messageId = document.getElementById('reportTargetMessageId')?.value;
  const reason = document.getElementById('reportReasonSelect')?.value || 'Safety / Terms Violation';
  const details = document.getElementById('reportDetailsInput')?.value.trim();

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  try {
    let res;
    try {
      res = await fetchAPI('/api/users/report', {
        method: 'POST',
        body: JSON.stringify({
          reportedId: reportedId ? parseInt(reportedId, 10) : null,
          chatId: chatId ? parseInt(chatId, 10) : null,
          messageId: messageId ? parseInt(messageId, 10) : null,
          reason,
          details
        })
      });
    } catch (e1) {
      res = await fetchAPI('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          reportedId: reportedId ? parseInt(reportedId, 10) : null,
          chatId: chatId ? parseInt(chatId, 10) : null,
          messageId: messageId ? parseInt(messageId, 10) : null,
          reason,
          details
        })
      });
    }

    showToast(res.message || 'Report submitted. Our moderation team will review this shortly.', 'success');
    closeModal('reportModal');
  } catch (err) {
    showToast('Failed to submit report: ' + err.message, 'error');
  } finally {

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
    }
  }
}

document.getElementById('reportForm')?.addEventListener('submit', handleReportSubmit);
document.getElementById('btnSubmitReportForm')?.addEventListener('click', (e) => {
  const form = document.getElementById('reportForm');
  if (form && !form.checkValidity()) {
    form.reportValidity();
    return;
  }
  handleReportSubmit(e);
});


// Settings: Report a Problem
document.getElementById('settingsReportProblemBtn')?.addEventListener('click', () => {
  openReportModal({
    title: 'Report a Problem or Feedback',
    defaultReason: 'Technical Bug / App Problem',
    label: 'SYNCH Platform Issue',
    sub: 'Bug report, feature feedback, or safety concern'
  });
});

// Profile Modal: Report User
document.getElementById('reportUserModalBtn')?.addEventListener('click', () => {
  if (currentChatUser) {
    openReportModal({
      reportedId: currentChatUser._id || currentChatUser.id,
      chatId: currentChat?._id || currentChat?.id,
      title: `Report @${currentChatUser.username}`,
      label: `User: @${currentChatUser.username} (#${currentChatUser._id || currentChatUser.id})`,
      sub: currentChatUser.displayName ? `Name: ${currentChatUser.displayName}` : 'SYNCH Account'
    });
    closeModal('userInfoModal');
  }
});

// INITIAL STARTUP
initHeaderAvatar();
initSettingsDropdowns();
loadChats();
initSocket();
refreshCurrentUser();
updateFriendBadges();
initNotificationBanner();
checkPendingDevicePrompts();

