// Wraps Google Identity Services (GIS). Google Sign-In only works when the
// page is served from `localhost` or `https://` — it will NOT work from a
// plain LAN IP like http://192.168.1.35:3000 (Google blocks it for
// security). We detect that up front and simply hide the Google button
// everywhere it can't work, so phones/other devices fall back to
// email/username + password without a broken button on screen.

const GoogleAuthHelper = (() => {
  let clientId = null;
  let scriptLoaded = false;
  let available = false;

  function isEligibleOrigin() {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'https:';
  }

  function loadScript() {
    return new Promise((resolve, reject) => {
      if (scriptLoaded) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => { scriptLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (!isEligibleOrigin()) {
      available = false;
      return { available: false, reason: 'origin' };
    }

    try {
      const res = await fetch('/api/auth/config');
      const data = await res.json();
      clientId = data.googleClientId;
    } catch (e) {
      available = false;
      return { available: false, reason: 'network' };
    }

    if (!clientId) {
      available = false;
      return { available: false, reason: 'not-configured' };
    }

    try {
      await loadScript();
    } catch (e) {
      available = false;
      return { available: false, reason: 'script-load' };
    }

    available = true;
    return { available: true };
  }

  // Renders the official Google Sign-In button natively into a container element.
  // When clicked, Google opens its OAuth popup natively and delivers the ID token.
  function renderButton(container, { callback, text = 'continue_with', width = 320 } = {}) {
    if (!available || !window.google?.accounts?.id) return false;
    const targetEl = (typeof container === 'string') ? document.getElementById(container) : container;
    if (!targetEl) return false;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response && response.credential && typeof callback === 'function') {
          callback(response.credential);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true
    });

    const calcWidth = Math.min(360, Math.max(200, targetEl.offsetWidth || width));
    window.google.accounts.id.renderButton(targetEl, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: text,
      shape: 'pill',
      logo_alignment: 'left',
      width: calcWidth
    });
    return true;
  }

  // Programmatic account chooser for settings/linking flows.
  // Shows a clean Google dialog containing the rendered button so the user can click it natively.
  function chooseAccount() {
    return new Promise((resolve, reject) => {
      if (!available || !window.google?.accounts?.id) {
        return reject(new Error('Google Sign-In is not available'));
      }

      const existingModal = document.getElementById('gsiChooserModal');
      if (existingModal) existingModal.remove();

      const modalOverlay = document.createElement('div');
      modalOverlay.id = 'gsiChooserModal';
      modalOverlay.className = 'modal-overlay active';
      modalOverlay.style.zIndex = '999999';
      modalOverlay.innerHTML = `
        <div class="modal" style="max-width: 380px; text-align: center; padding: 32px 28px; border-radius: 32px; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(24px); border: 1px solid rgba(255, 255, 255, 0.1);">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <svg width="24" height="24" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.7-1.57 2.68-3.88 2.68-6.64z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 013.68 9c0-.59.1-1.17.29-1.71V4.95H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.34z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px; color: #fff;">Connect Google Account</h3>
          <p style="color: var(--text-secondary); font-size: 13.5px; margin-bottom: 24px; line-height: 1.4;">Click below to authenticate securely with Google.</p>
          <div id="gsiModalBtnWrap" style="display: flex; justify-content: center; min-height: 44px; margin-bottom: 20px;"></div>
          <button type="button" class="btn btn-secondary" id="gsiCancelBtn" style="width: 100%; border-radius: var(--radius-pill); font-size: 14px;">Cancel</button>
        </div>
      `;
      document.body.appendChild(modalOverlay);

      function cleanup() {
        modalOverlay.remove();
      }

      document.getElementById('gsiCancelBtn')?.addEventListener('click', () => {
        cleanup();
        reject(new Error('popup_closed'));
      });

      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          cleanup();
          reject(new Error('popup_closed'));
        }
      });

      const btnWrap = document.getElementById('gsiModalBtnWrap');
      renderButton(btnWrap, {
        text: 'continue_with',
        width: 300,
        callback: (cred) => {
          cleanup();
          resolve(cred);
        }
      });

      // Also trigger prompt in background if eligible
      try {
        window.google.accounts.id.prompt();
      } catch (e) {}
    });
  }

  return { init, renderButton, chooseAccount, isAvailable: () => available, getClientId: () => clientId };
})();
