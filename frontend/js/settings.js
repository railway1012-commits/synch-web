const token = getToken();
let currentUser = getUser() || {};

if (!token) {
  if (window.self !== window.top) {
    window.top.location.href = '/login';
  } else {
    window.location.href = '/login';
  }
}

const elements = {
  settingsSidebar: document.getElementById('settingsSidebar'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  userAvatar: document.getElementById('userAvatar'),
  profileUsername: document.getElementById('profileUsername'),
  profileEmail: document.getElementById('profileEmail'),
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
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch (e) {}

  if (!response.ok) {
    if (response.status === 401 && (data.sessionRevoked || data.error === 'Session revoked' || data.error === 'Invalid token')) {
      handleSessionRevoked();
    }
    throw new Error(data.error || 'Request failed');
  }

  return data;
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

// Cached currentUser (from login) can go stale — e.g. Google link/unlink or
// password changes made in another tab or an earlier session won't be
// reflected until we ask the server directly. Refresh it on every load.
async function refreshCurrentUser() {
  try {
    const data = await fetchAPI('/api/auth/me');
    currentUser = data.user;
    updateStoredUser(currentUser);
    loadUserProfile();
    updateGoogleSection();
  } catch (error) { /* fall back silently to the cached copy */ }
}

function loadUserProfile() {
  elements.userAvatar.textContent = getInitials(currentUser.username);
  if (currentUser.avatar) {
    elements.userAvatar.innerHTML = `<img src="${sanitizeUrl(currentUser.avatar)}" alt="${escapeAttr(currentUser.username)}">`;
  }
  elements.profileUsername.textContent = currentUser.username;
  elements.profileEmail.textContent = currentUser.email;
}

// Copy username (used as the account's unique identifier for adding friends)
document.getElementById('copySynchIdBtn')?.addEventListener('click', () => {
  navigator.clipboard.writeText(currentUser.username || '');
  showToast('Username copied!', 'success');
});

// Mobile sidebar toggle
elements.mobileMenuBtn?.addEventListener('click', () => {
  elements.settingsSidebar.classList.toggle('open');
});

// Navigation
document.querySelectorAll('.settings-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset.section;

    document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${section}-section`).classList.add('active');

    elements.settingsSidebar.classList.remove('open');
  });
});

function loadSavedSettings() {
  const settings = currentUser.settings || {};

  // Theme
  const theme = localStorage.getItem('synch_theme') || 'dark';
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });

  // Accent color
  const accentColor = localStorage.getItem('synch_accent') || '#0084FF';
  document.querySelectorAll('.color-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.color === accentColor);
  });

  // Custom Dropdowns
  const fontSize = localStorage.getItem('synch_fontSize') || 'medium';
  if (fontSizeDropdown) fontSizeDropdown.setValue(fontSize);

  const bubbleStyle = localStorage.getItem('synch_bubbleStyle') || 'modern';
  if (bubbleStyleDropdown) bubbleStyleDropdown.setValue(bubbleStyle);

  // Toggles
  document.getElementById('onlineStatusToggle').classList.toggle('active', settings.showOnlineStatus !== false);
  document.getElementById('readReceiptsToggle').classList.toggle('active', settings.showReadReceipts !== false);
  document.getElementById('lastSeenToggle').classList.toggle('active', settings.showLastSeen !== false);
  document.getElementById('messageSoundToggle').classList.toggle('active', settings.messageSound !== false);
  document.getElementById('desktopNotificationsToggle').classList.toggle('active', settings.desktopNotifications !== false);
  document.getElementById('enterToSendToggle').classList.toggle('active', settings.enterToSend !== false);
  document.getElementById('mediaAutoDownloadToggle').classList.toggle('active', settings.mediaAutoDownload !== false);
  document.getElementById('messagePreviewToggle').classList.toggle('active', settings.messagePreview !== false);

  // Volume
  const volume = settings.notificationVolume || 50;
  document.getElementById('volumeRange').value = volume;
  document.getElementById('volumeValue').textContent = `${volume}%`;
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
      }
    });
  }
}

// Theme selector
document.querySelectorAll('.theme-option').forEach(option => {
  option.addEventListener('click', function() {
    document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
    this.classList.add('active');
    const theme = this.dataset.theme;
    applyTheme(theme);
    updateSetting('theme', theme);
  });
});

// Color picker
document.querySelectorAll('.color-option').forEach(option => {
  option.addEventListener('click', function() {
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
    this.classList.add('active');
    const color = this.dataset.color;
    applyAccentColor(color);
    updateSetting('accentColor', color);
  });
});

// Toggles
document.querySelectorAll('.toggle[data-setting]').forEach(toggle => {
  toggle.addEventListener('click', function() {
    this.classList.toggle('active');
    const setting = this.dataset.setting;
    const value = this.classList.contains('active');
    updateSetting(setting, value);

    // Save to local settings
    const settings = JSON.parse(localStorage.getItem('synch_settings') || '{}');
    settings[setting] = value;
    localStorage.setItem('synch_settings', JSON.stringify(settings));
  });
});

// Volume
document.getElementById('volumeRange').addEventListener('input', function() {
  document.getElementById('volumeValue').textContent = `${this.value}%`;
  localStorage.setItem('synch_volume', this.value);
});

document.getElementById('volumeRange').addEventListener('change', function() {
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

// Username change
document.getElementById('changeUsernameBtn').addEventListener('click', () => {
  openModal('usernameModal');
  document.getElementById('newUsername').value = currentUser.username;
});

document.getElementById('saveUsernameBtn').addEventListener('click', async () => {
  const newUsername = document.getElementById('newUsername').value.trim();

  if (!newUsername || newUsername.length < 3) {
    showToast('Username must be at least 3 characters', 'error');
    return;
  }

  try {
    const data = await fetchAPI('/api/auth/username', {
      method: 'PUT',
      body: JSON.stringify({ username: newUsername })
    });

    currentUser.username = newUsername;
    updateStoredUser(currentUser);
    loadUserProfile();
    closeModal('usernameModal');
    showToast('Username updated', 'success');
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Password change
document.getElementById('changePasswordBtn').addEventListener('click', () => {
  openModal('passwordModal');
});

document.getElementById('savePasswordBtn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;

  if (newPassword !== confirmNewPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  try {
    await fetchAPI('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    closeModal('passwordModal');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    showToast('Password updated', 'success');
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Delete account
document.getElementById('deleteAccountBtn').addEventListener('click', () => {
  openModal('deleteAccountModal');
});

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  const password = document.getElementById('deletePassword').value;

  if (!password) {
    showToast('Please enter your password', 'error');
    return;
  }

  try {
    await fetchAPI('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password })
    });

    clearSession();
    if (window.self !== window.top) {
      window.top.location.href = '/index.html';
    } else {
      window.location.href = 'index.html';
    }
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Sessions
async function loadSessions() {
  try {
    const data = await fetchAPI('/api/auth/sessions');

    if (data.sessions.length === 0) {
      elements.sessionsList.innerHTML = '<div class="empty-state"><p>No sessions</p></div>';
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
    elements.sessionsList.innerHTML = '<div class="empty-state"><p>Unable to load sessions. Please try again.</p></div>';
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

// Blocked users
async function loadBlockedUsers() {
  try {
    const data = await fetchAPI('/api/users/blocked');

    if (data.blockedUsers.length === 0) {
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
    elements.blockedUsersList.innerHTML = '<div class="empty-state"><p>Unable to load blocked users. Please try again.</p></div>';
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

// Avatar upload
document.getElementById('avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const response = await fetch('/api/users/avatar', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    currentUser.avatar = data.avatar;
    updateStoredUser(currentUser);
    loadUserProfile();
    showToast('Avatar updated', 'success');
  } catch (error) {
    showToast(getFriendlyError(error.message), 'error');
  }
});

// Page loading overlay helpers
function showPageLoading(text) {
  document.getElementById('pageLoadingText').textContent = text || 'Loading...';
  document.getElementById('pageLoadingOverlay').classList.add('active');
}

function hidePageLoading() {
  document.getElementById('pageLoadingOverlay').classList.remove('active');
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  showPageLoading('Signing out...');

  try {
    await fetchAPI('/api/auth/logout', { method: 'POST' });
  } catch (error) {}

  clearSession();
  if (window.self !== window.top) {
    window.top.location.href = '/login';
  } else {
    window.location.href = '/login';
  }
});

// Export data
document.getElementById('exportDataBtn').addEventListener('click', async () => {
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

// Clear chats
document.getElementById('clearChatsBtn').addEventListener('click', async () => {
  const confirmed = await showConfirm('Clear Chat History', 'Are you sure you want to clear all chat history? This cannot be undone.', 'Clear All', true);
  if (!confirmed) {
    return;
  }
  showToast('Clear each chat individually from chat view', 'info');
});

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

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

// 1. Click row in Account
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
  document.querySelectorAll('.settings-section').forEach(sec => sec.classList.remove('active'));
  const sec2FA = document.getElementById('twofactor-section');
  if (sec2FA) sec2FA.classList.add('active');
  updateTwoFactorToggle();
}

document.getElementById('backToAccountSecurityBtn')?.addEventListener('click', () => {
  document.querySelectorAll('.settings-section').forEach(sec => sec.classList.remove('active'));
  const secAccount = document.getElementById('account-section');
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

// --- Google account connect/disconnect ---
function updateGoogleSection() {
  const text = document.getElementById('googleStatusText');
  const btn = document.getElementById('googleConnectBtn');
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

let pendingGoogleAction = null; // 'connect' | 'disconnect'

document.getElementById('googleConnectBtn').addEventListener('click', async () => {
  if (currentUser.googleLinked) {
    if (!currentUser.hasPassword) {
      pendingGoogleAction = 'disconnect';
      document.getElementById('googleSetPasswordFirstText').textContent = 'Your account currently signs in only with Google. Set a password so you can still sign in after disconnecting it.';
      document.getElementById('confirmGoogleSetPasswordBtn').textContent = 'Set Password & Disconnect';
      openModal('googleSetPasswordFirstModal');
      return;
    }
    pendingGoogleAction = 'disconnect';
    document.getElementById('googlePasswordModalTitle').textContent = 'Verify your password';
    document.getElementById('googlePasswordModalDesc').textContent = 'Enter your password to disconnect your Google account.';
    document.getElementById('confirmGoogleLinkBtn').textContent = 'Disconnect';
    document.getElementById('googleLinkPassword').value = '';
    openModal('googlePasswordModal');
    return;
  }

  if (currentUser.hasPassword) {
    pendingGoogleAction = 'connect';
    document.getElementById('googlePasswordModalTitle').textContent = 'Verify your password';
    document.getElementById('googlePasswordModalDesc').textContent = 'Enter your password to connect a Google account.';
    document.getElementById('confirmGoogleLinkBtn').textContent = 'Continue';
    document.getElementById('googleLinkPassword').value = '';
    openModal('googlePasswordModal');
  } else {
    pendingGoogleAction = 'connect';
    document.getElementById('googleSetPasswordFirstText').textContent = 'Set a password before connecting Google, so you always have a backup way to sign in.';
    document.getElementById('confirmGoogleSetPasswordBtn').textContent = 'Set Password & Continue';
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
  const pw = document.getElementById('googleLinkPassword').value;
  if (!pw) return showToast('Enter your password', 'error');
  closeModal('googlePasswordModal');
  document.getElementById('googleLinkPassword').value = '';

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
  const pw1 = document.getElementById('googleNewPassword').value;
  const pw2 = document.getElementById('googleNewPasswordConfirm').value;
  if (pw1.length < 6) return showToast('Password must be at least 6 characters', 'error');
  if (pw1 !== pw2) return showToast('Passwords do not match', 'error');
  try {
    showPageLoading('Saving password...');
    const data = await fetchAPI('/api/auth/set-password', { method: 'POST', body: JSON.stringify({ password: pw1 }) });
    currentUser = data.user;
    updateStoredUser(currentUser);
    closeModal('googleSetPasswordFirstModal');
    document.getElementById('googleNewPassword').value = '';
    document.getElementById('googleNewPasswordConfirm').value = '';
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
  await GoogleAuthHelper.init();
  updateGoogleSection();
})();

// Initialize
initSocket();
initSettingsDropdowns();
loadUserProfile();
loadSavedSettings();
loadSessions();
loadBlockedUsers();
updateTwoFactorToggle();
refreshCurrentUser();
checkPendingDevicePrompts();