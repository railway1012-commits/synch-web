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

  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


// User-friendly error messages mapping
const FRIENDLY_ERRORS = {
  // Auth errors
  'Invalid email or password': 'The email or password you entered is incorrect. Please try again.',
  'Email already in use': 'This email is already registered. Try logging in instead.',
  'Username already taken': 'This username is not available. Please choose a different one.',
  'Invalid or expired verification code': 'The code you entered is invalid or has expired. Please request a new one.',
  'Invalid or expired code': 'The verification code has expired. Please request a new code.',
  'Session expired. Please login again.': 'Your session has expired. Please log in again.',
  'Signup session expired. Please start over.': 'Your signup session has timed out. Please start the registration again.',
  'Current password is incorrect': 'The current password you entered is wrong. Please try again.',
  'Password is incorrect': 'The password you entered is incorrect.',
  'No pending signup for this email': 'No signup in progress for this email. Please start a new registration.',
  'No account found with this email': 'We couldn\'t find an account with this email address.',
  'User not found': 'This account no longer exists.',
  'Invalid or expired reset code': 'The reset code is invalid or has expired. Please request a new one.',
  'Session expired. Please start over.': 'Your password reset session has expired. Please start over.',
  'Failed to send email': 'We couldn\'t send the email. Please check your email address and try again.',
  'Failed to send 2FA code': 'We couldn\'t send the verification code. Please try again.',
  'Login failed': 'We couldn\'t log you in. Please check your credentials and try again.',
  'Verification failed': 'We couldn\'t verify the code. Please try again.',
  'Invalid code': 'The code you entered is incorrect. Please check and try again.',
  'Failed to reset password': 'We couldn\'t reset your password. Please try again.',
  'Failed to resend': 'We couldn\'t resend the code. Please try again.',

  // Chat errors
  'Chat not found': 'This conversation no longer exists or you don\'t have access to it.',
  'Cannot create chat with yourself': 'You can\'t start a chat with yourself.',
  'Chat already exists': 'You already have a conversation with this user.',
  'Message not found': 'This message no longer exists.',
  'Not authorized': 'You don\'t have permission to perform this action.',
  'Cannot block yourself': 'You cannot block yourself.',
  'User is already blocked': 'This user is already blocked.',
  'User is not blocked': 'This user is not in your blocked list.',

  // File/Media errors
  'File too large': 'The file is too large. Please choose a smaller file (max 10MB).',
  'Invalid file type': 'This file type is not supported. Please use JPG, PNG, GIF, or WebP.',
  'No file uploaded': 'Please select a file to upload.',

  // Network errors
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'NetworkError': 'Network error. Please check your connection and try again.',
  'Load failed': 'Connection failed. Please check your internet and try again.',

  // Generic errors
  'Error creating account': 'We couldn\'t create your account. Please try again later.',
  'Error logging in': 'We couldn\'t log you in. Please try again.',
  'Request failed': 'Something went wrong. Please try again.',
  'Error sending message': 'We couldn\'t send your message. Please try again.',
  'Error loading chats': 'We couldn\'t load your conversations. Please refresh the page.',
  'Error loading messages': 'We couldn\'t load messages. Please try again.',
};

function getFriendlyError(rawError) {
  if (!rawError) return 'Something went wrong. Please try again.';

  const errorString = rawError.toString().replace('Error: ', '');

  // Check for exact match
  if (FRIENDLY_ERRORS[errorString]) {
    return FRIENDLY_ERRORS[errorString];
  }

  // Check for partial matches
  for (const [key, value] of Object.entries(FRIENDLY_ERRORS)) {
    if (errorString.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  // Check for common patterns
  if (errorString.includes('fetch') || errorString.includes('network') || errorString.includes('ECONNREFUSED')) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }

  if (errorString.includes('timeout') || errorString.includes('ETIMEDOUT')) {
    return 'The request timed out. Please try again.';
  }

  if (errorString.includes('401') || errorString.includes('Unauthorized')) {
    return 'Your session has expired. Please log in again.';
  }

  if (errorString.includes('403') || errorString.includes('Forbidden')) {
    return 'You don\'t have permission to do this.';
  }

  if (errorString.includes('404') || errorString.includes('Not found')) {
    return 'The requested item could not be found.';
  }

  if (errorString.includes('500') || errorString.includes('Internal')) {
    return 'Server error. Please try again later.';
  }

  // Return original if it's already user-friendly (doesn't look technical)
  if (!errorString.includes('Error:') && !errorString.includes('_') && errorString.length < 100) {
    return errorString;
  }

  // Default friendly message
  return 'Something went wrong. Please try again.';
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
