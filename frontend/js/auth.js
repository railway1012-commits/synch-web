const API_URL = '';

// User-friendly error messages mapping
const ERROR_MESSAGES = {
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

  // Chat errors
  'Chat not found': 'This conversation no longer exists or you don\'t have access to it.',
  'User not found': 'This user doesn\'t exist or may have deleted their account.',
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
  'Error logging out': 'We couldn\'t log you out. Please try again.',
  'Error fetching user': 'We couldn\'t load your profile. Please refresh the page.',
  'Error changing password': 'We couldn\'t change your password. Please try again.',
  'Error changing username': 'We couldn\'t update your username. Please try again.',
  'Error deleting account': 'We couldn\'t delete your account. Please try again.',
  'Error fetching sessions': 'We couldn\'t load your sessions. Please refresh the page.',
  'Error revoking session': 'We couldn\'t revoke this session. Please try again.',
  'Error processing request': 'Something went wrong. Please try again.',
  'Error verifying code': 'We couldn\'t verify the code. Please try again.',
  'Error updating 2FA settings': 'We couldn\'t update your security settings. Please try again.',
  'Error resetting password': 'We couldn\'t reset your password. Please try again.',
  'Request failed': 'Something went wrong. Please try again.',
  'Error sending message': 'We couldn\'t send your message. Please try again.',
  'Error loading chats': 'We couldn\'t load your conversations. Please refresh the page.',
  'Error loading messages': 'We couldn\'t load messages. Please try again.',
  'Error updating avatar': 'We couldn\'t update your profile picture. Please try again.',
  'Error updating profile': 'We couldn\'t save your changes. Please try again.',
  'Error blocking user': 'We couldn\'t block this user. Please try again.',
  'Error unblocking user': 'We couldn\'t unblock this user. Please try again.',
};

function getFriendlyError(rawError) {
  if (!rawError) return 'Something went wrong. Please try again.';

  const errorString = rawError.toString().replace('Error: ', '');

  // Check for exact match
  if (ERROR_MESSAGES[errorString]) {
    return ERROR_MESSAGES[errorString];
  }

  // Check for partial matches
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
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

  // Default friendly message
  return 'Something went wrong. Please try again.';
}

async function apiRequest(endpoint, options = {}) {
  const token = getToken();

  const defaultHeaders = {
    'Content-Type': 'application/json'
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('Server returned an invalid response');
    }

    if (!response.ok) {
      if (data && data.banned) {
        showBanModal(data);
        const err = new Error('Account Suspended: ' + (data.reason || ''));
        err.rawError = 'ACCOUNT_SUSPENDED';
        err.banned = true;
        err.banData = data;
        err.status = response.status;
        throw err;
      }

      const friendlyError = getFriendlyError(data.error);
      const error = new Error(friendlyError);
      error.rawError = data.error;
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.banned) throw error;

    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      const networkError = new Error('Unable to connect to the server. Please check your internet connection.');
      networkError.isNetworkError = true;
      throw networkError;
    }

    // Re-throw if already processed
    if (error.rawError !== undefined || error.isNetworkError) {
      throw error;
    }

    // Process other errors
    const friendlyError = getFriendlyError(error.message);
    const processedError = new Error(friendlyError);
    processedError.rawError = error.message;
    throw processedError;
  }
}

function escapeBanHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showBanModal(banData) {
  const existing = document.getElementById('banModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'banModalOverlay';
  overlay.className = 'ban-modal-overlay';

  const reason = banData?.reason || 'Your account has been suspended for violating our terms of service.';
  const expiration = banData?.bannedUntil 
    ? `Temporary Suspension — Expires: ${new Date(banData.bannedUntil).toLocaleString()}`
    : 'Permanent Account Suspension';

  const currentUserId = banData?.userId || (function() {
    try {
      const u = JSON.parse(localStorage.getItem('synch_user') || sessionStorage.getItem('synch_user') || '{}');
      return u?.id || null;
    } catch (e) {
      return null;
    }
  })();

  overlay.innerHTML = `
    <div class="ban-modal-card">
      <div class="ban-modal-icon">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3>Account Suspended</h3>
      <p class="ban-modal-desc">Your access to SYNCH has been revoked due to a policy violation.</p>
      <div class="ban-reason-box">
        <div class="ban-reason-label">Reason for Suspension</div>
        <div class="ban-reason-text">${escapeBanHtml(reason)}</div>
        <div class="ban-expiry-text">${escapeBanHtml(expiration)}</div>
      </div>

      <div class="ban-modal-footer">
        <!-- Mistake prompt & Appeal button (on top of logout button) -->
        <div id="banAppealPromptSection" class="ban-appeal-section">
          <div class="ban-mistake-label">We made a mistake?</div>
          <button type="button" class="btn ban-appeal-btn" id="banModalAppealBtn">Appeal</button>
        </div>

        <!-- In-Modal Appeal Submission Form (hidden by default) -->
        <div id="banAppealForm" class="ban-appeal-form" style="display: none;">
          <div class="ban-appeal-form-header">
            <span class="ban-appeal-title">Submit Ban Appeal</span>
            <span class="ban-appeal-char-count" id="banAppealCharCount">0/10 min</span>
          </div>
          <textarea 
            id="banAppealInput" 
            class="ban-appeal-textarea" 
            placeholder="Explain why you believe this suspension was a mistake and why your account should be reinstated (min 10 characters)..." 
            rows="4"
          ></textarea>
          <div id="banAppealError" class="ban-appeal-error" style="display: none;"></div>
          <div class="ban-appeal-actions">
            <button type="button" class="btn ban-appeal-cancel-btn" id="banModalCancelAppealBtn">Cancel</button>
            <button type="button" class="btn ban-appeal-submit-btn" id="banModalSubmitAppealBtn">Submit Appeal</button>
          </div>
        </div>

        <!-- Existing or Submitted Appeal Status Banner -->
        <div id="banAppealStatusBanner" class="ban-appeal-status-banner" style="display: none;">
          <div class="ban-appeal-status-icon" id="banAppealStatusIcon">⏳</div>
          <div class="ban-appeal-status-content">
            <div class="ban-appeal-status-title" id="banAppealStatusTitle">Appeal Under Review</div>
            <div class="ban-appeal-status-desc" id="banAppealStatusDesc">Your appeal is currently pending review by our moderation team.</div>
          </div>
        </div>

        <!-- Log Out Button (underneath Appeal) -->
        <button type="button" class="btn btn-danger ban-logout-btn" id="banModalOkBtn">Log Out</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function dismissAndLogout() {
    overlay.remove();
    clearSession();
    window.location.href = '/login';
  }

  const okBtn = document.getElementById('banModalOkBtn');
  if (okBtn) okBtn.addEventListener('click', dismissAndLogout);

  overlay.addEventListener('click', (e) => {
    const appealInput = document.getElementById('banAppealInput');
    const formVisible = document.getElementById('banAppealForm')?.style.display !== 'none';
    if (e.target === overlay) {
      if (formVisible && appealInput && appealInput.value.trim().length > 0) {
        if (!confirm('You have unsaved appeal text. Are you sure you want to exit and log out?')) return;
      }
      dismissAndLogout();
    }
  });

  const promptSection = document.getElementById('banAppealPromptSection');
  const appealBtn = document.getElementById('banModalAppealBtn');
  const appealForm = document.getElementById('banAppealForm');
  const appealInput = document.getElementById('banAppealInput');
  const appealError = document.getElementById('banAppealError');
  const appealCharCount = document.getElementById('banAppealCharCount');
  const cancelAppealBtn = document.getElementById('banModalCancelAppealBtn');
  const submitAppealBtn = document.getElementById('banModalSubmitAppealBtn');
  const statusBanner = document.getElementById('banAppealStatusBanner');
  const statusIcon = document.getElementById('banAppealStatusIcon');
  const statusTitle = document.getElementById('banAppealStatusTitle');
  const statusDesc = document.getElementById('banAppealStatusDesc');

  function renderStatusBanner(status, createdAt, adminNotes) {
    if (!statusBanner) return;
    statusBanner.className = 'ban-appeal-status-banner';
    if (status === 'pending') {
      statusBanner.classList.add('status-pending');
      statusIcon.textContent = '⏳';
      statusTitle.textContent = 'Appeal Under Review';
      statusDesc.textContent = `Your appeal submitted on ${new Date(createdAt || Date.now()).toLocaleDateString()} is pending review by our moderation team.`;
      if (promptSection) promptSection.style.display = 'none';
      if (appealForm) appealForm.style.display = 'none';
      statusBanner.style.display = 'flex';
    } else if (status === 'rejected') {
      statusBanner.classList.add('status-rejected');
      statusIcon.textContent = '✕';
      statusTitle.textContent = 'Appeal Rejected';
      statusDesc.textContent = adminNotes ? `Moderator note: ${adminNotes}` : 'Your ban appeal was reviewed and rejected by the moderation team.';
      if (promptSection) promptSection.style.display = 'none';
      if (appealForm) appealForm.style.display = 'none';
      statusBanner.style.display = 'flex';
    } else if (status === 'approved') {
      statusBanner.classList.add('status-approved');
      statusIcon.textContent = '✓';
      statusTitle.textContent = 'Appeal Approved!';
      statusDesc.textContent = 'Your suspension has been lifted! You may now log in to your account.';
      if (promptSection) promptSection.style.display = 'none';
      if (appealForm) appealForm.style.display = 'none';
      statusBanner.style.display = 'flex';
      if (okBtn) okBtn.textContent = 'Proceed to Login';
    }
  }

  // Check if there is an existing appeal for this user
  if (currentUserId) {
    fetch(`/api/auth/appeal-status?userId=${encodeURIComponent(currentUserId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.appeal) {
          renderStatusBanner(data.appeal.status, data.appeal.created_at, data.appeal.admin_notes);
        }
      })
      .catch(err => {
        console.warn('Failed to fetch appeal status:', err);
      });
  }

  if (appealBtn) {
    appealBtn.addEventListener('click', () => {
      if (promptSection) promptSection.style.display = 'none';
      if (appealForm) {
        appealForm.style.display = 'block';
        if (appealInput) appealInput.focus();
      }
    });
  }

  if (cancelAppealBtn) {
    cancelAppealBtn.addEventListener('click', () => {
      if (appealForm) appealForm.style.display = 'none';
      if (promptSection) promptSection.style.display = 'flex';
      if (appealError) {
        appealError.style.display = 'none';
        appealError.textContent = '';
      }
    });
  }

  if (appealInput) {
    appealInput.addEventListener('input', () => {
      const len = appealInput.value.trim().length;
      if (appealCharCount) {
        appealCharCount.textContent = len >= 10 ? `${len} chars` : `${len}/10 min`;
        appealCharCount.style.color = len >= 10 ? '#10b981' : '#64748b';
      }
      if (appealError && len >= 10) {
        appealError.style.display = 'none';
      }
    });
  }

  if (submitAppealBtn) {
    submitAppealBtn.addEventListener('click', async () => {
      const text = (appealInput?.value || '').trim();
      if (!text || text.length < 10) {
        if (appealError) {
          appealError.textContent = 'Please enter at least 10 characters explaining your situation.';
          appealError.style.display = 'block';
        }
        if (appealInput) appealInput.focus();
        return;
      }

      if (!currentUserId) {
        if (appealError) {
          appealError.textContent = 'Unable to identify account. Please log in again.';
          appealError.style.display = 'block';
        }
        return;
      }

      submitAppealBtn.disabled = true;
      submitAppealBtn.textContent = 'Submitting...';
      if (appealError) appealError.style.display = 'none';

      try {
        const resp = await fetch('/api/auth/appeal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUserId,
            appealText: text
          })
        });

        const result = await resp.json();
        if (!resp.ok) {
          throw new Error(result.error || 'Failed to submit appeal. Please try again.');
        }

        renderStatusBanner('pending', new Date(), null);
      } catch (err) {
        if (appealError) {
          appealError.textContent = err.message || 'Failed to submit appeal. Please try again.';
          appealError.style.display = 'block';
        }
        submitAppealBtn.disabled = false;
        submitAppealBtn.textContent = 'Submit Appeal';
      }
    });
  }
}

function logout() {
  localStorage.removeItem('synch_token');
  localStorage.removeItem('synch_user');
  sessionStorage.removeItem('synch_token');
  sessionStorage.removeItem('synch_user');
  window.location.href = '/login';
}

// --- Remember-me aware storage ---
// If the user checked "Remember me" at login/signup, we persist the session
// in localStorage (survives closing the browser). Otherwise we use
// sessionStorage, which Chrome/Firefox/Edge/Safari all clear automatically
// when the last tab for that browser is closed, so the user is logged out
// next time they open the browser.
function saveSession(token, user, rememberMe) {
  clearSession();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem('synch_token', token);
  storage.setItem('synch_user', JSON.stringify(user));
  storage.setItem('synch_remember', rememberMe ? '1' : '0');
}

function clearSession() {
  localStorage.removeItem('synch_token');
  localStorage.removeItem('synch_user');
  localStorage.removeItem('synch_remember');
  sessionStorage.removeItem('synch_token');
  sessionStorage.removeItem('synch_user');
  sessionStorage.removeItem('synch_remember');
}

function getToken() {
  return sessionStorage.getItem('synch_token') || localStorage.getItem('synch_token');
}

function getUser() {
  const userStr = sessionStorage.getItem('synch_user') || localStorage.getItem('synch_user');
  return userStr ? JSON.parse(userStr) : null;
}

function updateStoredUser(user) {
  const storage = sessionStorage.getItem('synch_token') ? sessionStorage : localStorage;
  storage.setItem('synch_user', JSON.stringify(user));
}

function isAuthenticated() {
  return !!getToken();
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/login';
    return false;
  }
  return true;
}
