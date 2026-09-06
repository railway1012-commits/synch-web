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

  // Opens the Google account chooser and resolves with an ID token
  // ("credential") once the user picks an account.
  function chooseAccount() {
    return new Promise((resolve, reject) => {
      if (!available) return reject(new Error('Google Sign-In is not available'));

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => resolve(response.credential),
        auto_select: false,
        cancel_on_tap_outside: true
      });

      // Render a hidden button and click it programmatically — this is the
      // most reliable cross-browser way to force the account chooser
      // (rather than relying on One Tap's `prompt()`, which can silently
      // no-op if the user dismissed it recently).
      const hiddenContainer = document.createElement('div');
      hiddenContainer.style.position = 'fixed';
      hiddenContainer.style.top = '-9999px';
      document.body.appendChild(hiddenContainer);

      window.google.accounts.id.renderButton(hiddenContainer, { type: 'standard' });

      setTimeout(() => {
        const btn = hiddenContainer.querySelector('div[role="button"]');
        if (btn) {
          btn.click();
        } else {
          window.google.accounts.id.prompt();
        }
        setTimeout(() => hiddenContainer.remove(), 3000);
      }, 50);
    });
  }

  return { init, chooseAccount, isAvailable: () => available };
})();
