(function () {
  const stepEl = document.getElementById('authStep');
  const overlay = document.getElementById('authLoadingOverlay');
  const overlayText = document.getElementById('authLoadingText');

  const flow = {
    tab: 'signin',
    identifier: '',
    rememberMe: false,
    googleAvailable: false,
    googleReady: false,
    step: 'entry'
  };

  let overlayShowTime = 0;

  function showLoading(text) {
    overlayText.textContent = text || 'Loading...';
    overlayShowTime = Date.now();
    overlay.classList.add('visible');
  }

  async function hideLoading() {
    const elapsed = Date.now() - overlayShowTime;
    const remaining = Math.max(0, 1500 - elapsed);
    if (remaining > 0) {
      await new Promise(r => setTimeout(r, remaining));
    }
    overlay.classList.remove('visible');
  }

  function triggerStepAnimation() {
    if (!stepEl) return;
    stepEl.classList.remove('auth-step-animate');
    void stepEl.offsetWidth;
    stepEl.classList.add('auth-step-animate');
  }

  function looksLikeEmail(v) {
    return /\S+@\S+\.\S+/.test(v);
  }

  function showFieldError(el, msg) {
    let err = el.parentElement.querySelector('.field-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'field-error';
      el.parentElement.appendChild(err);
    }
    err.textContent = msg;
    el.classList.add('has-error');
  }
  function clearFieldError(el) {
    const err = el.parentElement.querySelector('.field-error');
    if (err) err.remove();
    el.classList.remove('has-error');
  }

  function googleButtonHTML(label) {
    if (!flow.googleReady) {
      return `<div class="btn-google-skeleton"></div>`;
    }
    if (!flow.googleAvailable) return '';
    return `<div id="googleBtnContainer" class="google-btn-container"></div>`;
  }

  async function ensureGoogleButton(onClick) {
    const container = document.getElementById('googleBtnContainer');
    if (!container) return;
    container.innerHTML = '';

    GoogleAuthHelper.renderButton(container, {
      text: flow.tab === 'signup' ? 'signup_with' : 'continue_with',
      callback: async (credential) => {
        try {
          showLoading('Signing in with Google...');
          await onClick(credential);
        } catch (e) {
          await hideLoading();
          if (e && e.message !== 'popup_closed') {
            renderError("We couldn't open Google sign-in. Please try again.");
          }
        }
      }
    });
  }

  function renderError(msg) {
    let el = stepEl.querySelector('.auth-alert');
    if (!el) {
      el = document.createElement('div');
      el.className = 'auth-alert';
      stepEl.prepend(el);
    }
    el.textContent = msg;
  }

  // ---------- Step: Entry (tabs + identifier + google) ----------
  function renderEntry() {
    flow.step = 'entry';
    triggerStepAnimation();
    stepEl.innerHTML = `
      <div class="auth-tabs">
        <button type="button" class="auth-tab ${flow.tab === 'signin' ? 'active' : ''}" data-tab="signin">Sign In</button>
        <button type="button" class="auth-tab ${flow.tab === 'signup' ? 'active' : ''}" data-tab="signup">Sign Up</button>
      </div>
      <p class="auth-entry-subtext">${flow.tab === 'signup' ? 'Create an account to start chatting with your people, on your terms.' : 'Welcome back — sign in to pick up where you left off.'}</p>
      <form id="entryForm" class="auth-form">
        <div class="input-group">
          <label>${flow.tab === 'signup' ? 'Email' : 'Email or username'}</label>
          <input type="text" id="identifierInput" autocomplete="username" placeholder="${flow.tab === 'signup' ? 'you@example.com' : 'Email or username'}" value="${flow.identifier}">
        </div>
        <button type="submit" class="btn btn-primary">Continue</button>
      </form>
      ${(!flow.googleReady || flow.googleAvailable) ? '<div class="auth-divider"><span>or</span></div>' : ''}
      ${googleButtonHTML('Continue with Google')}
    `;

    stepEl.querySelectorAll('.auth-tab').forEach(t => {
      t.addEventListener('click', () => {
        flow.tab = t.dataset.tab;
        renderEntry();
      });
    });

    const input = document.getElementById('identifierInput');
    document.getElementById('entryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldError(input);
      const value = input.value.trim();
      if (!value) return showFieldError(input, 'This field is required');
      if (flow.tab === 'signup' && !looksLikeEmail(value)) {
        return showFieldError(input, 'Enter a valid email to sign up');
      }
      flow.identifier = value;
      await handleIdentifierSubmitted();
    });

    ensureGoogleButton(async (credential) => {
      await handleFreshGoogleAuth(credential);
    });
  }

  async function handleIdentifierSubmitted() {
    flow.step = 'checking';
    try {
      showLoading('Checking...');
      const res = await apiRequest('/api/auth/check-identifier', {
        method: 'POST',
        body: JSON.stringify({ identifier: flow.identifier })
      });

      if (!res.exists) {
        if (flow.tab === 'signup') {
          try {
            showLoading('Sending verification code...');
            const sendRes = await apiRequest('/api/auth/signup/send-code', {
              method: 'POST',
              body: JSON.stringify({ email: flow.identifier })
            });
            await hideLoading();
            renderSignupVerifyCode(flow.identifier, sendRes.maskedEmail || flow.identifier);
          } catch (sendErr) {
            await hideLoading();
            renderError(sendErr.message);
          }
        } else {
          await hideLoading();
          renderNotFound();
        }
        return;
      }

      await hideLoading();

      if (res.hasGoogle && !res.hasPassword) {
        renderGoogleOnly();
        return;
      }

      if (flow.tab === 'signup') {
        // Exists (password-based, or dual) — signup tab shows "already exists".
        renderEmailExists();
        return;
      }

      // Sign-in tab, account exists with a password (maybe also Google).
      renderPassword(res.hasGoogle);
    } catch (err) {
      await hideLoading();
      renderError(err.message);
    }
  }

  // ---------- Step: Password (sign in) ----------
  function renderPassword(hasGoogle) {
    let showingPassword = !hasGoogle;

    function draw() {
      triggerStepAnimation();
      stepEl.innerHTML = `
        <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
        <h2 class="auth-step-title">${flow.identifier}</h2>
        <p class="auth-subtext">Choose how you'd like to sign in.</p>
        ${(hasGoogle && !showingPassword) ? googleButtonHTML('Continue with Google') : ''}
        ${showingPassword ? `
          <form id="passwordForm" class="auth-form">
            <div class="input-group">
              <label>Password</label>
              <input type="password" id="passwordInput" autocomplete="current-password" placeholder="Enter your password">
            </div>
            <label class="checkbox-row">
              <input type="checkbox" id="rememberMeInput">
              <span>Remember me</span>
            </label>
            <button type="submit" class="btn btn-primary">Sign In</button>
            <button type="button" class="btn-text-link" id="forgotPasswordBtn">Forgot password?</button>
          </form>
        ` : ''}
        ${hasGoogle ? `<button type="button" class="btn-link btn-link-center" id="toggleWayBtn">${showingPassword ? 'Continue with Google instead' : 'Sign in with a password instead'}</button>` : ''}
      `;

      document.getElementById('backBtn').addEventListener('click', renderEntry);

      const toggleBtn = document.getElementById('toggleWayBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          showingPassword = !showingPassword;
          draw();
        });
      }

      if (showingPassword) {
        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const pwInput = document.getElementById('passwordInput');
          const remember = document.getElementById('rememberMeInput').checked;
          if (!pwInput.value) return showFieldError(pwInput, 'Enter your password');

          try {
            showLoading('Signing in...');
            const res = await apiRequest('/api/auth/login', {
              method: 'POST',
              body: JSON.stringify({ identifier: flow.identifier, password: pwInput.value })
            });
            if (res.requires2FA) {
              hideLoading();
              if (res.defaultMethod === 'device' && res.challengeId) {
                render2FADevicePrompt(res, remember);
              } else {
                render2FAEmailCode(res, remember);
              }
              return;
            }
            hideLoading();
            completeAuth(res.token, res.user, remember);
          } catch (err) {
            hideLoading();
            if (err.rawError === 'GOOGLE_ONLY_ACCOUNT') {
              renderGoogleOnly();
              return;
            }
            showFieldError(pwInput, err.message);
          }
        });

        document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
          window.location.href = `/forgot-password.html?email=${encodeURIComponent(flow.identifier)}`;
        });
      }

      if (hasGoogle && !showingPassword) {
        ensureGoogleButton(async (credential) => {
          try {
            const res = await apiRequest('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify({ credential, expectedEmail: flow.identifier })
            });
            hideLoading();
            completeAuth(res.token, res.user, true);
          } catch (err) {
            hideLoading();
            if (err.rawError === 'GOOGLE_EMAIL_MISMATCH') {
              renderGoogleMismatch();
            } else {
              renderError(err.message);
            }
          }
        });
      }
    }

    draw();
  }

  // ---------- Step: account exists via Google only ----------
  function renderGoogleOnly() {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div class="auth-message auth-message-center">
        <div class="auth-icon-circle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </div>
        <h2 class="auth-step-title">This account uses Google Sign-In</h2>
        <p><strong>${flow.identifier}</strong> doesn't have a password set — it was created with Google. Continue with Google below to sign in.</p>
      </div>
      ${googleButtonHTML('Continue with Google')}
    `;
    document.getElementById('backBtn').addEventListener('click', renderEntry);

    ensureGoogleButton(async (credential) => {
      try {
        const res = await apiRequest('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({ credential, expectedEmail: flow.identifier })
        });
        await hideLoading();
        completeAuth(res.token, res.user, true);
      } catch (err) {
        await hideLoading();
        if (err.rawError === 'GOOGLE_EMAIL_MISMATCH') {
          renderGoogleMismatch();
        } else {
          renderError(err.message);
        }
      }
    });
  }

  function renderGoogleMismatch() {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div class="auth-message auth-message-center">
        <div class="auth-icon-circle auth-icon-warn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        </div>
        <h2 class="auth-step-title">That Google account doesn't match</h2>
        <p>The Google account you picked isn't linked to <strong>${flow.identifier}</strong>. Please choose the correct account.</p>
      </div>
      ${googleButtonHTML('Try again')}
    `;
    document.getElementById('backBtn').addEventListener('click', renderEntry);
    ensureGoogleButton(async (credential) => {
      try {
        const res = await apiRequest('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({ credential, expectedEmail: flow.identifier })
        });
        hideLoading();
        completeAuth(res.token, res.user, true);
      } catch (err) {
        hideLoading();
        if (err.rawError === 'GOOGLE_EMAIL_MISMATCH') {
          renderGoogleMismatch();
        } else {
          renderError(err.message);
        }
      }
    });
  }

  // ---------- 2FA: On-Device Confirmation Prompt ----------
  // ---------- 2FA: On-Device Confirmation Prompt ----------
  let activeChallengePollTimer = null;

  function render2FADevicePrompt(data, remember) {
    if (activeChallengePollTimer) clearInterval(activeChallengePollTimer);
    triggerStepAnimation();

    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div class="auth-message auth-message-center" style="margin-top: 10px;">
        <div class="auth-icon-circle device-radar-icon" style="width: 58px; height: 58px; margin: 0 auto 16px auto; background: rgba(0, 132, 255, 0.15); color: var(--accent); display: flex; align-items: center; justify-content: center; border-radius: 50%;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </div>
        <h2 class="auth-step-title" style="margin-bottom: 8px;">Check your other devices</h2>
        <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 18px;">
          An approval request was sent to your active phone or computer. Tap <strong>Approve</strong> to sign in.
        </p>

        <div id="devicePromptStatusNotice" style="padding: 10px 14px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 10px; font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; display: inline-flex; align-items: center; gap: 8px;">
          <div class="loading-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
          <span>Waiting for your response...</span>
        </div>

        <div id="devicePromptErrorMsg" style="display: none; padding: 10px 14px; background: rgba(239, 68, 68, 0.12); color: var(--danger); border-radius: 10px; font-size: 13px; margin-bottom: 16px; font-weight: 500;"></div>
        <div id="devicePromptSuccessMsg" style="display: none; padding: 10px 14px; background: rgba(16, 185, 129, 0.12); color: var(--success, #10b981); border-radius: 10px; font-size: 13px; margin-bottom: 16px; font-weight: 500;"></div>

        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <button type="button" class="btn btn-secondary" id="resendDevicePromptBtn" style="width: 100%;">
            Resend request
          </button>
          <button type="button" class="btn-link" id="tryAnotherWayBtn">
            Try another way
          </button>
        </div>
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => {
      if (activeChallengePollTimer) clearInterval(activeChallengePollTimer);
      renderEntry();
    });

    document.getElementById('tryAnotherWayBtn').addEventListener('click', () => {
      if (activeChallengePollTimer) clearInterval(activeChallengePollTimer);
      render2FAMethodsChoice(data, remember);
    });

    document.getElementById('resendDevicePromptBtn').addEventListener('click', async () => {
      try {
        showLoading('Resending request...');
        const userIdentifier = flow.identifier || data.email || data.identifier;
        const res = await apiRequest('/api/auth/2fa/send-device-prompt', {
          method: 'POST',
          body: JSON.stringify({ identifier: userIdentifier, email: data.email })
        });
        hideLoading();
        data.challengeId = res.challengeId;
        render2FADevicePrompt(data, remember);
      } catch (err) {
        hideLoading();
        const errEl = document.getElementById('devicePromptErrorMsg');
        if (errEl) {
          errEl.textContent = err.message || 'Failed to resend request';
          errEl.style.display = 'block';
        }
      }
    });

  function render2FAApprovedScreen(token, user, remember) {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <div class="auth-message auth-message-center" style="margin-top: 15px;">
        <div class="auth-icon-circle" style="width: 64px; height: 64px; margin: 0 auto 18px auto; background: rgba(16, 185, 129, 0.15); color: var(--success, #10b981); display: flex; align-items: center; justify-content: center; border-radius: 50%;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 class="auth-step-title" style="margin-bottom: 8px; color: var(--text-primary);">Sign-in Approved</h2>
        <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 24px;">
          Your sign-in request was approved on your other device. Welcome back, <strong>${(user?.username || user?.name || 'User')}</strong>!
        </p>

        <button type="button" class="btn btn-primary" id="continueToChatsBtn" style="width: 100%;">
          Continue to Chats
        </button>
      </div>
    `;

    const btn = document.getElementById('continueToChatsBtn');
    let autoRedirectTimer = setTimeout(() => {
      completeAuth(token, user, remember);
    }, 2000);

    btn?.addEventListener('click', () => {
      clearTimeout(autoRedirectTimer);
      completeAuth(token, user, remember);
    });
  }

  function render2FADeclinedScreen(data, remember) {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <div class="auth-message auth-message-center" style="margin-top: 15px;">
        <div class="auth-icon-circle" style="width: 64px; height: 64px; margin: 0 auto 18px auto; background: rgba(239, 68, 68, 0.15); color: var(--danger); display: flex; align-items: center; justify-content: center; border-radius: 50%;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 class="auth-step-title" style="margin-bottom: 8px; color: var(--text-primary);">Sign-in Declined</h2>
        <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 24px;">
          Your sign-in request was declined from your signed-in device.
        </p>

        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <button type="button" class="btn btn-primary" id="tryAnotherWayDeclinedBtn" style="width: 100%;">
            Try another way
          </button>
          <button type="button" class="btn btn-secondary" id="tryAgainDeclinedBtn" style="width: 100%;">
            Try again
          </button>
        </div>
      </div>
    `;

    document.getElementById('tryAnotherWayDeclinedBtn')?.addEventListener('click', () => {
      render2FAMethodsChoice(data, remember);
    });

    document.getElementById('tryAgainDeclinedBtn')?.addEventListener('click', async () => {
      try {
        showLoading('Sending new request...');
        const userIdentifier = flow.identifier || data.email || data.identifier;
        const res = await apiRequest('/api/auth/2fa/send-device-prompt', {
          method: 'POST',
          body: JSON.stringify({ identifier: userIdentifier, email: data.email })
        });
        hideLoading();
        data.challengeId = res.challengeId;
        render2FADevicePrompt(data, remember);
      } catch (err) {
        hideLoading();
        renderError(err.message || 'Failed to send new request');
      }
    });
  }

  // Start polling challenge status
    const challengeId = data.challengeId;
    if (!challengeId) return;

    activeChallengePollTimer = setInterval(async () => {
      try {
        const res = await apiRequest(`/api/auth/2fa/check-device-prompt/${challengeId}`);
        if (res.status === 'approved' && res.token) {
          clearInterval(activeChallengePollTimer);
          hideLoading();
          render2FAApprovedScreen(res.token, res.user, remember);
        } else if (res.status === 'declined') {
          clearInterval(activeChallengePollTimer);
          hideLoading();
          render2FADeclinedScreen(data, remember);
        } else if (res.status === 'expired') {
          clearInterval(activeChallengePollTimer);
          const statusEl = document.getElementById('devicePromptStatusNotice');
          const errEl = document.getElementById('devicePromptErrorMsg');
          if (statusEl) statusEl.style.display = 'none';
          if (errEl) {
            errEl.textContent = 'This request has expired. Click Resend or Try another way.';
            errEl.style.display = 'block';
          }
        }
      } catch (e) {}
    }, 1200);
  }

  // ---------- 2FA: Methods Choice (Try Another Way) ----------
  function render2FAMethodsChoice(data, remember) {
    if (activeChallengePollTimer) clearInterval(activeChallengePollTimer);
    triggerStepAnimation();

    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div style="margin-top: 10px;">
        <h2 class="auth-step-title" style="margin-bottom: 6px;">Verify your identity</h2>
        <p style="color: var(--text-secondary); font-size: var(--font-sm); margin-bottom: 20px;">
          Choose how you want to complete two-factor authentication:
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
          <!-- Option 1: Device Prompt -->
          <div class="auth-choice-card" id="chooseDevicePromptBtn" style="display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; transition: all 0.15s ease; user-select: none;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(0, 132, 255, 0.12); color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; pointer-events: none;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                <line x1="12" y1="18" x2="12.01" y2="18"/>
              </svg>
            </div>
            <div style="flex: 1; pointer-events: none;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                <h4 style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0;">Approve from another device</h4>
                <span class="badge badge-primary" style="font-size: 10px; padding: 1px 6px; border-radius: 4px;">Recommended</span>
              </div>
              <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4;">Send an instant confirmation to your signed-in phone or computer</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: var(--text-secondary); pointer-events: none;"><polyline points="9 18 15 12 9 6"/></svg>
          </div>

          <!-- Option 2: Email Code -->
          <div class="auth-choice-card" id="chooseEmailCodeBtn" style="display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; transition: all 0.15s ease; user-select: none;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(168, 85, 247, 0.12); color: #a855f7; display: flex; align-items: center; justify-content: center; flex-shrink: 0; pointer-events: none;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div style="flex: 1; pointer-events: none;">
              <h4 style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0;">Email verification code</h4>
              <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4;">Get a 6-digit code sent to ${data.maskedEmail || 'your email'}</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: var(--text-secondary); pointer-events: none;"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => {
      render2FADevicePrompt(data, remember);
    });

    document.getElementById('chooseDevicePromptBtn').addEventListener('click', async () => {
      try {
        showLoading('Sending approval request...');
        const userIdentifier = flow.identifier || data.email || data.identifier;
        const res = await apiRequest('/api/auth/2fa/send-device-prompt', {
          method: 'POST',
          body: JSON.stringify({ identifier: userIdentifier, email: data.email })
        });
        hideLoading();
        data.challengeId = res.challengeId;
        render2FADevicePrompt(data, remember);
      } catch (err) {
        hideLoading();
        renderError(err.message || 'Failed to send device request');
      }
    });

    document.getElementById('chooseEmailCodeBtn').addEventListener('click', async () => {
      try {
        showLoading('Sending verification code...');
        const userIdentifier = flow.identifier || data.email || data.identifier;
        await apiRequest('/api/auth/2fa/send-email-code', {
          method: 'POST',
          body: JSON.stringify({ identifier: userIdentifier, email: data.email })
        });
        hideLoading();
        render2FAEmailCode(data, remember);
      } catch (err) {
        hideLoading();
        renderError(err.message || 'Failed to send verification code');
      }
    });
  }

  // ---------- 2FA: Email Verification Code ----------
  function render2FAEmailCode(data, remember) {
    if (activeChallengePollTimer) clearInterval(activeChallengePollTimer);
    triggerStepAnimation();

    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div style="margin-top: 10px;">
        <h2 class="auth-step-title" style="margin-bottom: 6px;">Enter verification code</h2>
        <p style="color: var(--text-secondary); font-size: var(--font-sm); margin-bottom: 20px;">
          We sent a 6-digit code to <strong>${data.maskedEmail || data.email}</strong>.
        </p>

        <form id="verify2FAForm" class="auth-form">
          <div class="input-group">
            <label for="otp2FAInput">6-Digit Code</label>
            <input type="text" id="otp2FAInput" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="123456" autocomplete="one-time-code" required style="font-size: 20px; letter-spacing: 4px; text-align: center;">
          </div>
          <button type="submit" class="btn btn-primary" id="verify2FABtn">Verify & Sign In</button>
        </form>

        <div id="email2FAStatusMsg" style="display: none; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-top: 14px; text-align: center; font-weight: 500;"></div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 16px;">
          <button type="button" class="btn-text-link" id="resend2FAEmailBtn">
            Didn't receive a code? <span style="color: var(--accent); font-weight: 500;">Resend</span>
          </button>
          <button type="button" class="btn-link" id="tryAnotherWayFromEmailBtn">
            Try another way
          </button>
        </div>
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => {
      render2FAMethodsChoice(data, remember);
    });

    document.getElementById('tryAnotherWayFromEmailBtn').addEventListener('click', () => {
      render2FAMethodsChoice(data, remember);
    });

    document.getElementById('resend2FAEmailBtn').addEventListener('click', async () => {
      const msgEl = document.getElementById('email2FAStatusMsg');
      try {
        showLoading('Resending code...');
        const userIdentifier = flow.identifier || data.email || data.identifier;
        await apiRequest('/api/auth/2fa/send-email-code', {
          method: 'POST',
          body: JSON.stringify({ identifier: userIdentifier, email: data.email })
        });
        hideLoading();
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = 'rgba(16, 185, 129, 0.12)';
          msgEl.style.color = 'var(--success, #10b981)';
          msgEl.textContent = 'Verification code resent successfully!';
        }
      } catch (err) {
        hideLoading();
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = 'rgba(239, 68, 68, 0.12)';
          msgEl.style.color = 'var(--danger)';
          msgEl.textContent = err.message || 'Failed to resend code';
        }
      }
    });

    document.getElementById('verify2FAForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('otp2FAInput');
      const code = codeInput?.value.trim();
      if (!code || code.length !== 6) {
        return showFieldError(codeInput, 'Enter a valid 6-digit code');
      }

      try {
        showLoading('Verifying code...');
        const userEmail = data.email || flow.identifier;
        const res = await apiRequest('/api/auth/login/verify-2fa', {
          method: 'POST',
          body: JSON.stringify({ email: userEmail, code })
        });
        hideLoading();
        completeAuth(res.token, res.user, remember);
      } catch (err) {
        hideLoading();
        showFieldError(codeInput, err.message);
      }
    });
  }

  // ---------- Step: signup tab, email already registered ----------
  function renderEmailExists() {
    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div class="auth-message auth-message-center">
        <div class="auth-icon-circle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </div>
        <h2 class="auth-step-title">You already have an account</h2>
        <p><strong>${flow.identifier}</strong> is already registered with SYNCH. Sign in instead to pick up right where you left off.</p>
      </div>
      <button type="button" class="btn btn-primary" id="goLoginBtn">Log In</button>
      <button type="button" class="btn-link" id="useAnotherBtn">Use a different email</button>
    `;
    document.getElementById('backBtn').addEventListener('click', renderEntry);
    document.getElementById('goLoginBtn').addEventListener('click', () => {
      flow.tab = 'signin';
      handleIdentifierSubmitted();
    });
    document.getElementById('useAnotherBtn').addEventListener('click', () => {
      flow.identifier = '';
      renderEntry();
    });
  }

  // ---------- Step: sign-in tab, account not found ----------
  function renderNotFound() {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div class="auth-message auth-message-center">
        <div class="auth-icon-circle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </div>
        <h2 class="auth-step-title">We couldn't find that account</h2>
        <p>There's no SYNCH account for <strong>${flow.identifier}</strong> yet. Want to create one? It only takes a minute.</p>
      </div>
      <button type="button" class="btn btn-primary" id="createAccountBtn">Create Account</button>
      <button type="button" class="btn-link" id="useAnotherBtn">Try a different email</button>
    `;
    document.getElementById('backBtn').addEventListener('click', renderEntry);
    document.getElementById('createAccountBtn').addEventListener('click', async () => {
      flow.tab = 'signup';
      if (looksLikeEmail(flow.identifier)) {
        try {
          showLoading('Sending verification code...');
          const sendRes = await apiRequest('/api/auth/signup/send-code', {
            method: 'POST',
            body: JSON.stringify({ email: flow.identifier })
          });
          await hideLoading();
          renderSignupVerifyCode(flow.identifier, sendRes.maskedEmail || flow.identifier);
        } catch (sendErr) {
          await hideLoading();
          renderError(sendErr.message);
        }
      } else {
        renderEntry();
      }
    });
    document.getElementById('useAnotherBtn').addEventListener('click', () => {
      flow.identifier = '';
      renderEntry();
    });
  }

  // ---------- Step: Verify Signup Email Code ----------
  let signupResendTimerInterval = null;

  function renderSignupVerifyCode(email, maskedEmail) {
    if (signupResendTimerInterval) clearInterval(signupResendTimerInterval);
    triggerStepAnimation();

    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <div style="margin-top: 10px;">
        <h2 class="auth-step-title" style="margin-bottom: 6px;">Verify your email</h2>
        <p style="color: var(--text-secondary); font-size: var(--font-sm); margin-bottom: 20px;">
          We sent a 6-digit verification code to <strong>${maskedEmail || email}</strong>. Enter it below to verify your email address.
        </p>

        <form id="signupVerifyForm" class="auth-form">
          <div class="input-group">
            <label for="signupOtpInput">6-Digit Verification Code</label>
            <input type="text" id="signupOtpInput" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="123456" autocomplete="one-time-code" required style="font-size: 20px; letter-spacing: 4px; text-align: center;">
          </div>
          <button type="submit" class="btn btn-primary" id="verifySignupBtn">Verify Code</button>
        </form>

        <div id="signupStatusMsg" style="display: none; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-top: 14px; text-align: center; font-weight: 500;"></div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 20px;">
          <button type="button" class="btn-link" id="resendSignupCodeBtn" disabled style="background: none; border: none; color: var(--text-secondary); font-size: 13px; cursor: default;">
            Resend code in <span id="resendSignupTimer">60</span>s
          </button>
        </div>
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => {
      if (signupResendTimerInterval) clearInterval(signupResendTimerInterval);
      renderEntry();
    });

    const resendBtn = document.getElementById('resendSignupCodeBtn');
    let secondsLeft = 60;

    signupResendTimerInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(signupResendTimerInterval);
        resendBtn.disabled = false;
        resendBtn.style.cursor = 'pointer';
        resendBtn.innerHTML = `Didn't receive a code? <span style="color: var(--accent); font-weight: 500;">Resend code</span>`;
      } else {
        const timerSpan = document.getElementById('resendSignupTimer');
        if (timerSpan) timerSpan.textContent = secondsLeft;
      }
    }, 1000);

    resendBtn.addEventListener('click', async () => {
      if (resendBtn.disabled) return;
      const msgEl = document.getElementById('signupStatusMsg');
      try {
        showLoading('Resending verification code...');
        await apiRequest('/api/auth/resend-code', {
          method: 'POST',
          body: JSON.stringify({ email, type: 'signup' })
        });
        await hideLoading();
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = 'rgba(16, 185, 129, 0.12)';
          msgEl.style.color = 'var(--success, #10b981)';
          msgEl.textContent = 'Verification code resent successfully!';
        }
        resendBtn.disabled = true;
        resendBtn.style.cursor = 'default';
        secondsLeft = 60;
        resendBtn.innerHTML = `Resend code in <span id="resendSignupTimer">60</span>s`;
        signupResendTimerInterval = setInterval(() => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            clearInterval(signupResendTimerInterval);
            resendBtn.disabled = false;
            resendBtn.style.cursor = 'pointer';
            resendBtn.innerHTML = `Didn't receive a code? <span style="color: var(--accent); font-weight: 500;">Resend code</span>`;
          } else {
            const tSpan = document.getElementById('resendSignupTimer');
            if (tSpan) tSpan.textContent = secondsLeft;
          }
        }, 1000);
      } catch (err) {
        await hideLoading();
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = 'rgba(239, 68, 68, 0.12)';
          msgEl.style.color = 'var(--danger)';
          msgEl.textContent = err.message || 'Failed to resend code';
        }
      }
    });

    document.getElementById('signupVerifyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('signupOtpInput');
      const code = codeInput?.value.trim();
      if (!code || code.length !== 6) {
        return showFieldError(codeInput, 'Enter a valid 6-digit code');
      }

      try {
        showLoading('Verifying code...');
        const res = await apiRequest('/api/auth/signup/verify', {
          method: 'POST',
          body: JSON.stringify({ email, code })
        });
        if (signupResendTimerInterval) clearInterval(signupResendTimerInterval);
        await hideLoading();
        renderCreatePassword(email);
      } catch (err) {
        await hideLoading();
        showFieldError(codeInput, err.message);
      }
    });
  }

  // ---------- Step: create password (new email signup) ----------
  function renderCreatePassword(email) {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <button type="button" class="btn-back" id="backBtn">&larr; Back</button>
      <h2 class="auth-step-title">Create your password</h2>
      <p class="auth-subtext">${email || flow.identifier}</p>
      <form id="createPasswordForm" class="auth-form">
        <div class="input-group">
          <label>Password</label>
          <input type="password" id="pw1" autocomplete="new-password" placeholder="At least 6 characters">
        </div>
        <div class="input-group">
          <label>Confirm password</label>
          <input type="password" id="pw2" autocomplete="new-password" placeholder="Re-enter your password">
        </div>
        <button type="submit" class="btn btn-primary" id="continueBtn" disabled>Complete Registration</button>
      </form>
    `;
    document.getElementById('backBtn').addEventListener('click', () => {
      renderSignupVerifyCode(email || flow.identifier);
    });

    const pw1 = document.getElementById('pw1');
    const pw2 = document.getElementById('pw2');
    const btn = document.getElementById('continueBtn');

    function validate() {
      const ok = pw1.value.length >= 6 && pw1.value === pw2.value;
      btn.disabled = !ok;
      return ok;
    }
    pw1.addEventListener('input', validate);
    pw2.addEventListener('input', validate);

    document.getElementById('createPasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldError(pw2);
      if (pw1.value.length < 6) return showFieldError(pw1, 'Must be at least 6 characters');
      if (pw1.value !== pw2.value) return showFieldError(pw2, 'Passwords do not match');

      const userPassword = pw1.value;

      try {
        showLoading('Creating account...');
        const res = await apiRequest('/api/auth/signup/complete', {
          method: 'POST',
          body: JSON.stringify({ email: email || flow.identifier, password: userPassword })
        });
        await hideLoading();
        saveSession(res.token, res.user, true);
        renderProfileSetup();
      } catch (err) {
        await hideLoading();
        showFieldError(pw2, err.message);
      }
    });
  }

  // ---------- Fresh Google auth from the entry screen ----------
  async function handleFreshGoogleAuth(credential) {
    flow.step = 'checking';
    try {
      const res = await apiRequest('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential })
      });
      hideLoading();

      if (res.isNewUser) {
        saveSession(res.token, res.user, true);
        renderGooglePasswordOptional(res.googleProfile);
      } else {
        completeAuth(res.token, res.user, true);
      }
    } catch (err) {
      hideLoading();
      renderError(err.message);
    }
  }

  // ---------- Step: optional password after Google signup ----------
  function renderGooglePasswordOptional() {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <h2 class="auth-step-title">Create a password (optional)</h2>
      <p class="auth-subtext">You can use this to sign in without Google later.</p>
      <form id="optPwForm" class="auth-form">
        <div class="input-group">
          <label>Password</label>
          <input type="password" id="pw1" autocomplete="new-password" placeholder="At least 6 characters">
        </div>
        <div class="input-group">
          <label>Confirm password</label>
          <input type="password" id="pw2" autocomplete="new-password" placeholder="Re-enter your password">
        </div>
        <button type="submit" class="btn btn-primary" id="continueBtn" disabled>Continue</button>
      </form>
      <button type="button" class="btn-link" id="skipBtn">Not right now — skip this step</button>
    `;

    const pw1 = document.getElementById('pw1');
    const pw2 = document.getElementById('pw2');
    const btn = document.getElementById('continueBtn');
    function validate() {
      btn.disabled = !(pw1.value.length >= 6 && pw1.value === pw2.value);
    }
    pw1.addEventListener('input', validate);
    pw2.addEventListener('input', validate);

    document.getElementById('optPwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pw1.value.length < 6) return showFieldError(pw1, 'Must be at least 6 characters');
      if (pw1.value !== pw2.value) return showFieldError(pw2, 'Passwords do not match');
      try {
        showLoading('Saving...');
        await apiRequest('/api/auth/set-password', { method: 'POST', body: JSON.stringify({ password: pw1.value }) });
        hideLoading();
        renderProfileSetup();
      } catch (err) {
        hideLoading();
        showFieldError(pw2, err.message);
      }
    });

    document.getElementById('skipBtn').addEventListener('click', renderProfileSetup);
  }

  // ---------- Step: profile setup (username + DOB, avatar optional) ----------
  function renderProfileSetup() {
    triggerStepAnimation();
    stepEl.innerHTML = `
      <h2 class="auth-step-title">Set up your profile</h2>
      <form id="profileForm" class="auth-form">
        <div class="avatar-upload-row">
          <div class="avatar-preview" id="avatarPreview">+</div>
          <input type="file" id="avatarInput" accept="image/*" class="hidden-file-input">
          <label for="avatarInput" class="btn-secondary-sm">Add photo (optional)</label>
        </div>
        <div class="input-group">
          <label>Username</label>
          <input type="text" id="usernameInput" autocomplete="username" placeholder="Choose a username">
        </div>
        <div class="input-group">
          <label>Date of birth</label>
          <div id="dobPicker"></div>
        </div>
        <button type="submit" class="btn btn-primary" id="finishBtn">Finish</button>
      </form>
    `;

    let avatarDataUrl = null;
    const avatarInput = document.getElementById('avatarInput');
    const avatarPreview = document.getElementById('avatarPreview');
    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        avatarDataUrl = e.target.result;
        avatarPreview.innerHTML = `<img src="${avatarDataUrl}" alt="avatar">`;
      };
      reader.readAsDataURL(file);
    });

    const dob = createDobPicker(document.getElementById('dobPicker'));
    const usernameInput = document.getElementById('usernameInput');

    document.getElementById('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldError(usernameInput);
      const username = usernameInput.value.trim();
      if (username.length < 3) return showFieldError(usernameInput, 'Username must be at least 3 characters');
      if (!dob.isComplete()) return renderError('Please select your full date of birth');

      try {
        showLoading('Finishing up...');
        const res = await apiRequest('/api/auth/complete-profile', {
          method: 'POST',
          body: JSON.stringify({ username, dob: dob.getValue() })
        });
        updateStoredUser(res.user);

        if (avatarDataUrl) {
          try {
            const blob = await (await fetch(avatarDataUrl)).blob();
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.jpg');
            await fetch('/api/users/avatar', {
              method: 'PUT',
              headers: { Authorization: `Bearer ${getToken()}` },
              body: formData
            });
          } catch (e) { /* avatar is optional; ignore upload failure here */ }
        }

        hideLoading();
        localStorage.setItem('synch_show_tutorial', '1');
        window.location.href = '/chat.html';
      } catch (err) {
        hideLoading();
        showFieldError(usernameInput, err.message);
      }
    });
  }

  // ---------- Shared completion ----------
  function completeAuth(token, user, remember) {
    saveSession(token, user, remember);
    if (user?.email?.toLowerCase() === 'noreply.synch@gmail.com') {
      window.location.href = '/admin.html';
      return;
    }
    if (!user.profileComplete) {
      renderProfileSetup();
      return;
    }
    window.location.href = '/chat.html';
  }

  // ---------- Boot ----------
  async function boot() {
    if (isAuthenticated()) {
      const u = getUser();
      if (u?.email?.toLowerCase() === 'noreply.synch@gmail.com') {
        window.location.href = '/admin.html';
        return;
      }
      window.location.href = '/chat.html';
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === '/signup') flow.tab = 'signup';
    if (params.get('email')) flow.identifier = params.get('email');

    // Render immediately — don't block the first paint on the Google
    // availability check. The Google button area shows a lightweight
    // skeleton until we know whether to show it.
    renderEntry();

    const g = await GoogleAuthHelper.init();
    flow.googleAvailable = g.available;
    flow.googleReady = true;

    if (flow.step === 'entry') renderEntry();
  }

  boot();
})();
