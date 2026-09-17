const API_URL = '';

// User-friendly error messages mapping
// User-friendly error messages mapping
const ERROR_MESSAGES = {
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
  if (ERROR_MESSAGES[errorString]) {
    return ERROR_MESSAGES[errorString];
  }

  // 2. Check for partial matches in dictionary
  const lower = errorString.toLowerCase();
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
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
      if (response.status === 502 || response.status === 504) {
        throw new Error('The server took a little too long to respond. Please give it a few seconds and try again.');
      }
      if (response.status === 503) {
        throw new Error('SYNCH is currently undergoing scheduled maintenance. Please check back shortly.');
      }
      if (response.status >= 500) {
        throw new Error('We encountered an unexpected server hiccup on our end. Please try again in a moment.');
      }
      throw new Error('The server sent an unexpected response. Please check your connection and try again.');
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

      const rawMsg = (data && (data.error || data.message)) || null;
      const friendlyError = getFriendlyError(rawMsg, response.status, endpoint);
      const error = new Error(friendlyError);
      error.rawError = rawMsg;
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.banned) throw error;

    // Handle network errors
    if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch'))) {
      const networkError = new Error('Unable to reach SYNCH. Please check your internet connection and try again.');
      networkError.isNetworkError = true;
      throw networkError;
    }

    // Re-throw if already processed
    if (error.rawError !== undefined || error.isNetworkError) {
      throw error;
    }

    // Process other errors
    const friendlyError = getFriendlyError(error.message, error.status || null, endpoint);
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
  clearSession();
  window.location.replace('/login');
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
  try {
    const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;
    document.cookie = 'synch_token=' + encodeURIComponent(token) + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
  } catch (e) {}
}

function clearSession() {
  localStorage.removeItem('synch_token');
  localStorage.removeItem('synch_user');
  localStorage.removeItem('synch_remember');
  sessionStorage.removeItem('synch_token');
  sessionStorage.removeItem('synch_user');
  sessionStorage.removeItem('synch_remember');
  try {
    document.cookie = 'synch_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  } catch (e) {}
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
