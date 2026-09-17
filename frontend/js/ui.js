const recentToastLog = new Map();

function showToast(message, type = 'info') {
  if (!message) return;
  const key = `${message}_${type}`;
  const now = Date.now();
  if (recentToastLog.has(key) && (now - recentToastLog.get(key) < 2500)) {
    return; // Prevent duplicate toast stacking
  }
  recentToastLog.set(key, now);
  setTimeout(() => recentToastLog.delete(key), 3000);

  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'warning') {
    iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  } else if (type === 'info') {
    iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  } else {
    // error
    iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }

  const iconDiv = document.createElement('div');
  iconDiv.className = 'toast-icon';
  iconDiv.innerHTML = iconSvg;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'toast-msg';
  msgDiv.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '&times;';

  toast.appendChild(iconDiv);
  toast.appendChild(msgDiv);
  toast.appendChild(closeBtn);

  let dismissTimer = null;
  function dismiss() {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (toast.classList.contains('closing')) return;
    toast.classList.add('closing');
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 220);
  }

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });
  toast.addEventListener('click', dismiss);

  container.appendChild(toast);
  dismissTimer = setTimeout(dismiss, 3800);
}


// User-friendly error messages mapping
const FRIENDLY_ERRORS = {
  // Auth & Account errors
  'Invalid email or password': 'The email or password you entered is incorrect. Please try again.',
  'Email already in use': 'An account with this email is already registered. Try signing in instead.',
  'Email already registered': 'An account with this email is already registered. Please sign in instead.',
  'Email already registered. Please sign in instead.': 'An account with this email is already registered. Please sign in instead.',
  'Username already taken': 'This username is already taken. Please choose a different one.',
  'Invalid or expired verification code': 'The verification code is incorrect or has expired. Please check the code or request a new one.',
  'Invalid or expired code': 'The verification code has expired. Please request a new code.',
  'Incorrect or expired verification code': 'The verification code you entered is incorrect or has expired. Please check the code or request a new one.',
  'Session expired. Please login again.': 'Your session has timed out. Please sign in again.',
  'Signup session expired. Please start over.': 'Your signup session has timed out. Please start registration again.',
  'No pending signup session found for this email. Please re-enter your details.': 'Your signup session has expired. Please enter your email to start again.',
  'No pending signup for this email': 'No signup in progress for this email. Please start a new registration.',
  'Current password is incorrect': 'The current password you entered is incorrect. Please try again.',
  'Password is incorrect': 'The password you entered is incorrect. Please check your password and try again.',
  'Password must be at least 6 characters': 'Your password must be at least 6 characters long.',
  'Password must be at least 8 characters': 'Your password must be at least 8 characters long.',
  'Email and password are required': 'Please enter both your email address and password.',
  'Email and verification code are required': 'Please enter both your email address and the 6-digit code.',
  'Email is required': 'Please enter your email address to continue.',
  'Email or username is required': 'Please enter your email address or username.',
  'Identifier is required': 'Please enter your username or email address.',
  'No account found with this email': 'We couldn\'t find an account with this email address.',
  'User not found': 'This account could not be found.',
  'This account is no longer available': 'This account is no longer active or has been removed.',
  'New user registrations are currently disabled by the administrator.': 'New account registrations are temporarily paused by the administrator.',
  'Your account has been temporarily frozen by an administrator.': 'Your account has been temporarily restricted by an administrator. Please reach out to support.',
  'Please complete your profile setup (username and date of birth) before continuing.': 'Please finish setting up your username and birthday before continuing.',
  'Invalid or expired reset code': 'The reset code is invalid or has expired. Please request a new one.',
  'Session expired. Please start over.': 'Your password reset session has expired. Please start over.',
  'Failed to send email': 'We couldn\'t deliver the email. Please check your address and try again.',
  'Failed to send 2FA code': 'We couldn\'t send the verification code. Please try again.',
  'Failed to send verification email': 'We couldn\'t send the verification email. Please check your address and try again.',
  'Failed to resend verification email': 'We couldn\'t resend the verification email right now. Please wait a moment and try again.',
  'Login failed': 'We couldn\'t log you in. Please check your credentials and try again.',
  'Verification failed': 'We couldn\'t verify the code. Please check your code and try again.',
  'Invalid code': 'The verification code is incorrect. Please check and try again.',
  'Failed to reset password': 'We couldn\'t reset your password. Please try again.',
  'Failed to resend': 'We couldn\'t resend the code right now. Please wait a moment and try again.',
  'Error checking account': 'We couldn\'t verify this account right now. Please check your connection and try again.',
  'Error creating account': 'We couldn\'t create your account right now. Please check your details and try again.',
  'Error sending verification code': 'We couldn\'t send the verification code. Please check your email and try again.',
  'Error verifying code': 'We couldn\'t verify this code. Please double-check the digits or request a new code.',
  'Error logging in': 'We couldn\'t sign you in right now. Please check your credentials and try again.',
  'Error logging out': 'We couldn\'t complete sign-out right now. Please refresh the page.',

  // Chat & Messaging errors
  'Chat not found': 'This conversation could not be found or you may no longer have access to it.',
  'Cannot create chat with yourself': 'You can\'t start a conversation with yourself.',
  'Chat already exists': 'You already have an open conversation with this user.',
  'Message not found': 'This message is no longer available.',
  'Not authorized': 'You don\'t have permission to perform this action.',
  'Cannot block yourself': 'You cannot block your own account.',
  'User is already blocked': 'This user is already on your blocked list.',
  'User is not blocked': 'This user is not currently blocked.',
  'Error sending message': 'Your message couldn\'t be sent. Please check your connection and retry.',
  'Error loading chats': 'We couldn\'t load your conversations. Please pull down or refresh to retry.',
  'Error loading messages': 'We couldn\'t load recent messages. Please refresh or check your connection.',
  'Error editing message': 'We couldn\'t save your changes to this message. Please try again.',
  'Error deleting message': 'We couldn\'t delete this message right now. Please try again.',
  'Error adding reaction': 'We couldn\'t update your reaction. Please try again.',
  'Error pinning message': 'We couldn\'t pin this message right now. Please try again.',
  'Error clearing chat': 'We couldn\'t clear this conversation history. Please try again.',
  'Error marking messages as read': 'We couldn\'t update read receipts. Please refresh your chat.',

  // Profile, Settings & Support errors
  'Error fetching user': 'We couldn\'t load this profile. Please refresh the page.',
  'Error changing password': 'We couldn\'t update your password. Please verify your current password and try again.',
  'Error changing username': 'We couldn\'t update your username. Please choose another username.',
  'Error deleting account': 'We couldn\'t delete your account right now. Please try again later.',
  'Error fetching sessions': 'We couldn\'t load your active sessions. Please refresh the page.',
  'Error revoking session': 'We couldn\'t log out of that device. Please try again.',
  'Error updating 2FA settings': 'We couldn\'t update your security settings. Please try again.',
  'Error resetting password': 'We couldn\'t reset your password. Please request a new link or code.',
  'Error updating avatar': 'We couldn\'t update your profile photo. Please try a different image.',
  'Error updating profile': 'We couldn\'t save your profile changes. Please try again.',
  'Error blocking user': 'We couldn\'t block this user right now. Please try again.',
  'Error unblocking user': 'We couldn\'t unblock this user right now. Please try again.',
  'Error updating settings': 'We couldn\'t save your settings. Please try again.',
  'Failed to submit report': 'We couldn\'t submit your report right now. Please try again.',
  'Report reason is required': 'Please select or provide a reason for reporting this user.',
  'Failed to initiate call': 'We couldn\'t connect the call. The user might be offline or unavailable.',

  // File & Upload errors
  'File too large': 'This file exceeds the 100MB upload limit. Please select a smaller file.',
  'File too large. Maximum allowed size is 100MB.': 'This file exceeds the 100MB upload limit. Please select a smaller file.',
  'Invalid file type': 'This file format is not supported. Please upload an image, audio, video, or document.',
  'No file uploaded': 'Please select a file to upload.',
  'Upload error': 'We couldn\'t upload your file. Please check your connection and file size, then try again.',

  // Network, Rate Limit & Server errors
  'Failed to fetch': 'Unable to reach SYNCH. Please check your internet connection and try again.',
  'NetworkError': 'Network connection issue. Please check your connection and try again.',
  'Load failed': 'Connection interrupted. Please check your internet and try again.',
  'Error processing request': 'We ran into a brief hiccup processing your request. Please try again.',
  'Request failed': 'The server couldn\'t complete this request. Please refresh or try again shortly.',
};

function getFriendlyError(rawError, status = null, endpoint = '') {
  // If no error message provided, derive a human, helpful message from status or context
  if (!rawError) {
    if (status === 429) {
      return 'You\'ve made a few too many attempts in a short time. Please wait a moment before trying again.';
    }
    if (status === 503) {
      return 'SYNCH is currently undergoing scheduled maintenance or updates. Please check back shortly.';
    }
    if (status === 502 || status === 504) {
      return 'The server took a little too long to respond. Please give it a few seconds and try again.';
    }
    if (status === 500) {
      return 'We encountered a temporary server hiccup. Please try again in a moment.';
    }
    if (status === 401) {
      return 'Your session has timed out. Please sign in again to continue.';
    }
    if (status === 403) {
      return 'You don\'t have permission to perform this action.';
    }
    if (status === 404) {
      return 'We couldn\'t find the requested information or conversation.';
    }
    if (status === 413) {
      return 'That upload is too large. Please select a file under 100MB.';
    }
    if (status === 400) {
      return 'We couldn\'t process this request with the details provided. Please double-check your input and try again.';
    }
    return 'We ran into a brief snag completing this action. Please refresh or try again in a moment.';
  }

  const errorString = String(rawError).replace(/^Error:\s*/i, '').trim();

  // 1. Check for exact match in dictionary
  if (FRIENDLY_ERRORS[errorString]) {
    return FRIENDLY_ERRORS[errorString];
  }

  // 2. Check for partial matches in dictionary
  const lower = errorString.toLowerCase();
  for (const [key, value] of Object.entries(FRIENDLY_ERRORS)) {
    if (lower.includes(key.toLowerCase())) {
      return value;
    }
  }

  // 3. Network & Connection errors
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('econnrefused') || lower.includes('failed to connect') || lower.includes('load failed')) {
    return 'Unable to reach SYNCH. Please check your internet connection and try again.';
  }

  // 4. Timeouts
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return 'The request took a little too long to complete. Please check your connection and try again.';
  }

  // 5. Rate limits / Too many requests
  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('slow down') || lower.includes('429')) {
    if (lower.includes('email') || lower.includes('code')) {
      return 'Too many verification codes requested recently. Please wait a short while before requesting another.';
    }
    return 'You\'ve made a few too many attempts. Please wait a moment before trying again.';
  }

  // 6. Auth / Permissions
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('jwt') || lower.includes('token expired') || lower.includes('session revoked')) {
    return 'Your session has expired. Please sign in again to continue.';
  }

  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('access denied')) {
    return 'You don\'t have permission to access this. Please sign in with an authorized account.';
  }

  if (lower.includes('404') || lower.includes('not found')) {
    return 'The requested information or conversation could not be found.';
  }

  // 7. Server & Maintenance
  if (lower.includes('502') || lower.includes('504') || lower.includes('bad gateway') || lower.includes('gateway timeout')) {
    return 'The server is temporarily unreachable or restarting. Please refresh in a moment.';
  }

  if (lower.includes('503') || lower.includes('maintenance')) {
    return 'SYNCH is currently undergoing scheduled maintenance. Please check back shortly.';
  }

  if (lower.includes('500') || lower.includes('internal server')) {
    return 'We encountered a temporary server hiccup on our end. Please try again in a moment.';
  }

  // 8. If the error is already a human-readable sentence (not technical code or stack trace),
  // format it nicely with proper capitalization and punctuation!
  const isTechnical = /^[A-Z0-9_]+$/.test(errorString) || // e.g. ERR_INVALID_ARG
                      errorString.includes('at ') || // stack trace
                      errorString.includes('Cannot read property') ||
                      errorString.includes('undefined is not') ||
                      errorString.includes('SyntaxError') ||
                      errorString.includes('ReferenceError') ||
                      errorString.includes('TypeError') ||
                      errorString.length > 200;

  if (!isTechnical && errorString.length > 2) {
    let cleaned = errorString.charAt(0).toUpperCase() + errorString.slice(1);
    if (!/[.!?]$/.test(cleaned)) {
      cleaned += '.';
    }
    return cleaned;
  }

  // 9. Contextual fallback if technical or unhandled
  if (status && status >= 500) {
    return 'We ran into a temporary server issue while processing your request. Please try again shortly.';
  }
  if (status && status >= 400) {
    return 'We couldn\'t complete your request with the details provided. Please check your information and try again.';
  }
  return 'We ran into a brief snag completing this action. Please refresh or try again in a moment.';
}

function formatTime(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  const oneDay = 24 * 60 * 60 * 1000;

  if (diff < oneDay && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diff < oneDay * 2) {
    return 'Yesterday';
  } else if (diff < oneDay * 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  } else {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(date) {
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
}

function formatLastSeen(date) {
  if (!date) return 'Offline';

  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

  return formatTime(date);
}

function getInitials(name) {
  if (!name || name === 'Account Unavailable' || name.startsWith('unavailable_')) return '?';
  return name.charAt(0).toUpperCase();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    if (['http:', 'https:', 'data:'].includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch (e) {}
  if (url.startsWith('/uploads/')) return url;
  return '';
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return escapeHtml(text).replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

let previousActiveElement = null;

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    previousActiveElement = document.activeElement;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus first focusable element
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
      setTimeout(() => focusable[0].focus(), 100);
    }

    // Add focus trap
    modal.addEventListener('keydown', trapFocus);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    modal.removeEventListener('keydown', trapFocus);

    // Restore focus
    if (previousActiveElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  }
}

function trapFocus(e) {
  if (e.key !== 'Tab') return;

  const modal = e.currentTarget;
  const focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === firstFocusable) {
      e.preventDefault();
      lastFocusable.focus();
    }
  } else {
    if (document.activeElement === lastFocusable) {
      e.preventDefault();
      firstFocusable.focus();
    }
  }
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const activeModal = document.querySelector('.modal-overlay.active');
    if (activeModal) {
      if (activeModal.id === 'sessionRevokedModal') {
        window.location.href = '/login';
        return;
      }
      activeModal.classList.remove('active');
      document.body.style.overflow = '';
      if (previousActiveElement) {
        previousActiveElement.focus();
        previousActiveElement = null;
      }
    }
  }
});

// Delegated listeners so close buttons and overlay-click-to-close work for
// ANY [data-close]/.modal-overlay element, including ones added to the page
// after this script runs (e.g. modals declared further down the HTML).
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) {
    if (closeBtn.dataset.close === 'sessionRevokedModal') {
      window.location.href = '/login';
      return;
    }
    closeModal(closeBtn.dataset.close);
    return;
  }

  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    if (e.target.id === 'sessionRevokedModal') {
      window.location.href = '/login';
      return;
    }
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  let actualTheme = theme;
  if (theme === 'system') {
    actualTheme = getSystemTheme();
  }
  document.documentElement.dataset.theme = actualTheme;
  localStorage.setItem('synch_theme', theme);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const savedTheme = localStorage.getItem('synch_theme') || 'dark';
  if (savedTheme === 'system') {
    applyTheme('system');
  }
});

function applyAccentColor(color) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-light', adjustColor(color, 30));
  document.documentElement.style.setProperty('--accent-dark', adjustColor(color, -30));
  document.documentElement.style.setProperty('--accent-glow', `${color}40`);
  localStorage.setItem('synch_accent', color);
}

function applyFontSize(size) {
  document.documentElement.dataset.fontSize = size;
  localStorage.setItem('synch_fontSize', size);
}

function adjustColor(color, amount) {
  const clamp = (num) => Math.min(255, Math.max(0, num));

  let hex = color.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  r = clamp(r + amount);
  g = clamp(g + amount);
  b = clamp(b + amount);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function loadSavedSettings() {
  const theme = localStorage.getItem('synch_theme') || 'dark';
  const accent = localStorage.getItem('synch_accent') || '#0084FF';
  const fontSize = localStorage.getItem('synch_fontSize') || 'medium';

  applyTheme(theme);
  applyAccentColor(accent);
  applyFontSize(fontSize);
}

loadSavedSettings();

const emojis = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
  '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗',
  '😋', '😛', '😜', '🤪', '😝', '🤗', '🤭', '🤫',
  '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒',
  '🙄', '😬', '😮', '😯', '😲', '😳', '🥺', '😢',
  '😭', '😤', '😡', '🤬', '😈', '👿', '💀', '☠️',
  '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️',
  '🤟', '🤘', '👌', '🤏', '👈', '👉', '👆', '👇',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘',
  '🔥', '✨', '🎉', '🎊', '💯', '💢', '💥', '💫'
];

function createEmojiPicker(containerId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.type = 'button';
    btn.addEventListener('click', () => onSelect(emoji));
    container.appendChild(btn);
  });
}

// Custom confirm dialog
let confirmResolve = null;

function showConfirm(title, message, actionText = 'Delete', isDanger = true) {
  return new Promise((resolve) => {
    confirmResolve = resolve;

    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const actionBtn = document.getElementById('confirmActionBtn');

    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    actionBtn.textContent = actionText;
    actionBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

    openModal('confirmModal');
  });
}

document.getElementById('confirmActionBtn')?.addEventListener('click', () => {
  closeModal('confirmModal');
  if (confirmResolve) {
    confirmResolve(true);
    confirmResolve = null;
  }
});

document.querySelector('#confirmModal [data-close]')?.addEventListener('click', () => {
  if (confirmResolve) {
    confirmResolve(false);
    confirmResolve = null;
  }
});

document.getElementById('confirmModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'confirmModal') {
    closeModal('confirmModal');
    if (confirmResolve) {
      confirmResolve(false);
      confirmResolve = null;
    }
  }
});

// Check for queued auth toast (e.g. 'Verified' for email 2FA or 'Signed in successfully')
try {
  const pendingAuthToast = sessionStorage.getItem('synch_auth_toast');
  if (pendingAuthToast) {
    sessionStorage.removeItem('synch_auth_toast');
    const parsed = JSON.parse(pendingAuthToast);
    if (parsed && parsed.message) {
      let shown = false;
      const trigger = () => {
        if (shown) return;
        shown = true;
        setTimeout(() => {
          showToast(parsed.message, parsed.type || 'success');
        }, 350);
      };
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        trigger();
      } else {
        window.addEventListener('DOMContentLoaded', trigger, { once: true });
      }
    }
  }
} catch (e) {}
