(function () {
  const token = getToken();
  const user = getUser();

  if (!token || user?.email?.toLowerCase() !== 'noreply.synch@gmail.com') {
    window.location.href = '/login';
    return;
  }

  let allUsers = [];
  let selectedUser = null;
  let userDetails = null;
  let activeChatId = null;
  let currentActiveView = 'users';

  // DOM Elements
  const metrics = {
    totalUsers: document.getElementById('metricTotalUsers'),
    onlineUsers: document.getElementById('metricOnlineUsers'),
    twoFactor: document.getElementById('metricTwoFactorUsers'),
    sessions: document.getElementById('metricSessions'),
    chats: document.getElementById('metricChats')
  };

  const usersTbody = document.getElementById('tbodyUsers') || document.getElementById('adminUsersTbody');
  const searchInput = document.getElementById('adminSearchInput');
  const userDrawer = document.getElementById('userDrawer') || document.getElementById('controlDrawer');

  // Modern Non-Blocking Toast
  function showToast(message, type = 'info') {
    let container = document.querySelector('.admin-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'admin-toast-container';
      container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'admin-toast ' + type;
    const bg = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6';
    toast.style.cssText = 'background: ' + bg + '; color: #ffffff; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.4); pointer-events: auto; animation: fadeIn 0.25s ease;';
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {})
    };
    const res = await fetch(path, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || ('HTTP ' + res.status));
    }
    return res.json();
  }

  // View Navigation
  const navItems = document.querySelectorAll('.admin-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const view = item.getAttribute('data-view');
      currentActiveView = view;
      document.querySelectorAll('.admin-view').forEach(v => v.style.display = 'none');

      const targetView = document.getElementById('view-' + view);
      if (targetView) targetView.style.display = 'block';

      if (view === 'reports') loadReports();
      if (view === 'badges') loadCustomBadges();
      if (view === 'webhooks') loadWebhooks();
      if (view === 'health') loadSystemHealth();
      if (view === 'ip') loadIpBlacklist();
      if (view === 'words') loadWordBlacklist();
      if (view === 'media') loadMediaGallery();
      if (view === 'flags') loadFeatureFlags();
      if (view === 'audit') loadAuditLogs();
    });
  });

  // Users Management & Dashboard Stats
  async function loadDashboard(silent = false) {
    try {
      const [statsData, usersData] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/users')
      ]);

      if (metrics.totalUsers) metrics.totalUsers.textContent = statsData.totalUsers;
      if (metrics.onlineUsers) metrics.onlineUsers.textContent = statsData.onlineUsers;
      if (metrics.twoFactor) metrics.twoFactor.textContent = statsData.twoFactorUsers;
      if (metrics.sessions) metrics.sessions.textContent = statsData.totalSessions;
      if (metrics.chats) metrics.chats.textContent = statsData.totalChats;

      allUsers = usersData;
      renderUsers(allUsers);
    } catch (err) {
      if (!silent) console.error('Failed to load dashboard:', err);
    }
  }

  function renderUserBadgeSpan(badge) {
    if (!badge) return '';
    const clean = String(badge).trim();
    const slug = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
    return '<span class="user-badge badge-' + slug + '">' + clean + '</span>';
  }

  function renderUsers(users) {
    if (!usersTbody) return;
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const displayList = q ? users.filter(u =>
      u.id.toString() === q ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.display_name && u.display_name.toLowerCase().includes(q))
    ) : users;

    if (!displayList.length) {
      usersTbody.innerHTML = '<tr><td colspan="8" class="text-center p-4" style="color: var(--text-secondary);">No users found</td></tr>';
      return;
    }

    usersTbody.innerHTML = displayList.map(u => `
      <tr data-user-id="${u.id}" class="${selectedUser?.id === u.id ? 'active' : ''}">
        <td><strong>#${u.id}</strong></td>
        <td>
          <div class="user-cell">
            <div class="avatar avatar-sm">${(u.username || 'U')[0].toUpperCase()}</div>
            <div>
              <div style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                ${u.display_name || u.username}
                ${renderUserBadgeSpan(u.badge)}
                ${u.role && u.role !== 'user' ? `<span class="badge" style="background: var(--accent); color: #fff; font-size: 9.5px; padding: 1px 6px; border-radius: 4px; text-transform: uppercase;">${u.role}</span>` : ''}
              </div>
              <div style="font-size: 11px; color: var(--text-muted);">@${u.username}</div>
            </div>
          </div>
        </td>
        <td>${u.email || '<span style="color: var(--text-muted);">None</span>'}</td>
        <td>
          <span class="status-dot ${u.status === 'online' ? 'online' : 'offline'}"></span> ${u.status || 'offline'}
        </td>
        <td>${u.two_factor_enabled ? '<span class="badge-2fa">ON</span>' : '<span style="color: var(--text-muted);">OFF</span>'}</td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${u.is_banned ? '<span class="badge-banned">BANNED</span>' : ''}
            ${u.is_frozen ? '<span class="badge-frozen">FROZEN</span>' : ''}
            ${u.is_shadowbanned ? '<span class="badge-shadowbanned">SHADOW</span>' : ''}
            ${!u.is_banned && !u.is_frozen && !u.is_shadowbanned ? '<span style="color: var(--text-muted); font-size: 11px;">Normal</span>' : ''}
          </div>
        </td>
        <td>${u.session_count || 0}</td>
        <td>
          <button class="btn btn-secondary btn-sm select-user-btn" data-id="${u.id}">Control</button>
        </td>
      </tr>
    `).join('');

    usersTbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = parseInt(tr.getAttribute('data-user-id'), 10);
        selectUser(id);
      });
    });
  }

  // Search Filter
  searchInput?.addEventListener('input', () => {
    renderUsers(allUsers);
  });

  // Select User & Load Deep Details
  async function selectUser(userId, silent = false) {
    try {
      const drawer = document.getElementById('userDrawer') || document.getElementById('controlDrawer');
      if (drawer) drawer.style.display = 'flex';

      const drawerUsername = document.getElementById('drawerUsername');
      if (drawerUsername && !silent) drawerUsername.textContent = 'Loading...';

      const res = await api('/api/admin/users/' + userId);
      const data = res;
      selectedUser = data.user;

      renderUsers(allUsers);

      // Header info
      if (drawerUsername) drawerUsername.textContent = selectedUser.displayName || selectedUser.username;
      const drawerEmail = document.getElementById('drawerEmail');
      if (drawerEmail) drawerEmail.textContent = selectedUser.email || `@${selectedUser.username} (ID: #${selectedUser.id})`;

      const drawerAvatar = document.getElementById('drawerAvatar');
      if (drawerAvatar) {
        if (selectedUser.avatar) {
          drawerAvatar.innerHTML = `<img src="${selectedUser.avatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
          drawerAvatar.textContent = (selectedUser.username || 'U')[0].toUpperCase();
        }
      }

      const badgesRow = document.getElementById('drawerBadgesRow');
      if (badgesRow) {
        let badgesHtml = '';
        if (selectedUser.badge) badgesHtml += renderUserBadgeSpan(selectedUser.badge);
        if (selectedUser.role && selectedUser.role !== 'user') badgesHtml += `<span class="badge" style="background:var(--accent);color:#fff;font-size:10px;">${selectedUser.role.toUpperCase()}</span>`;
        if (selectedUser.isBanned) badgesHtml += `<span class="badge" style="background:#ef4444;color:#fff;font-size:10px;">BANNED</span>`;
        badgesRow.innerHTML = badgesHtml;
      }

      // Tab 1: Account
      const ctrlEmail = document.getElementById('ctrlEmail');
      if (ctrlEmail) ctrlEmail.value = selectedUser.email || '';
      const ctrlUsername = document.getElementById('ctrlUsername');
      if (ctrlUsername) ctrlUsername.value = selectedUser.username || '';
      const ctrlDisplayName = document.getElementById('ctrlDisplayName');
      if (ctrlDisplayName) ctrlDisplayName.value = selectedUser.displayName || '';
      const ctrlStatus = document.getElementById('ctrlStatus');
      if (ctrlStatus) ctrlStatus.value = selectedUser.status || 'offline';
      const ctrlTwoFactor = document.getElementById('ctrlTwoFactor');
      if (ctrlTwoFactor) ctrlTwoFactor.checked = !!selectedUser.twoFactorEnabled;

      const ctrlGoogleRow = document.getElementById('ctrlGoogleRow');
      const ctrlGoogleStatus = document.getElementById('ctrlGoogleStatus');
      if (ctrlGoogleRow && ctrlGoogleStatus) {
        if (selectedUser.googleLinked) {
          ctrlGoogleRow.style.display = 'flex';
          ctrlGoogleStatus.textContent = 'Connected (Google ID active)';
        } else {
          ctrlGoogleRow.style.display = 'none';
        }
      }

      // Ban State in Drawer
      const banBanner = document.getElementById('banStatusBanner');
      const openBanBtn = document.getElementById('btnOpenBanDialog');
      const unbanBtn = document.getElementById('btnUnbanUserBtn');

      if (selectedUser.isBanned) {
        if (banBanner) banBanner.style.display = 'block';
        const banReasonText = document.getElementById('banReasonText');
        if (banReasonText) banReasonText.textContent = selectedUser.banReason || 'Violation of SYNCH Terms of Service';
        const banExpiryText = document.getElementById('banExpiryText');
        if (banExpiryText) {
          banExpiryText.textContent = selectedUser.bannedUntil 
            ? ('Temporary Ban • Expires: ' + new Date(selectedUser.bannedUntil).toLocaleString()) 
            : 'Permanent Account Ban';
        }
        if (openBanBtn) openBanBtn.style.display = 'none';
        if (unbanBtn) unbanBtn.style.display = 'block';
      } else {
        if (banBanner) banBanner.style.display = 'none';
        if (openBanBtn) openBanBtn.style.display = 'block';
        if (unbanBtn) unbanBtn.style.display = 'none';
      }

      // Tab 2: Moderation & Badges & Role
      const ctrlShadowban = document.getElementById('ctrlShadowban');
      if (ctrlShadowban) ctrlShadowban.checked = !!selectedUser.isShadowbanned;
      const ctrlFreeze = document.getElementById('ctrlFreeze');
      if (ctrlFreeze) ctrlFreeze.checked = !!selectedUser.isFrozen;
      const ctrlBadgeSelect = document.getElementById('ctrlBadgeSelect');
      if (ctrlBadgeSelect) ctrlBadgeSelect.value = selectedUser.badge || '';
      const ctrlRole = document.getElementById('ctrlRole') || document.getElementById('ctrlRoleSelect');
      if (ctrlRole) ctrlRole.value = selectedUser.role || 'user';
      const ctrlAdminNotes = document.getElementById('ctrlAdminNotes');
      if (ctrlAdminNotes) ctrlAdminNotes.value = selectedUser.adminNotes || '';

      // Tab 3: Sessions
      if (data.sessions) renderSessions(data.sessions);

      // Tab 4: Friends
      if (data.friends) renderFriends(data.friends, data.incomingRequests || [], data.outgoingRequests || []);

      // Tab 5: Chats
      if (data.chats) renderChats(data.chats);


      // Tab: Alt Accounts & Warnings
      loadUserAlts(selectedUser.id);
      loadUserWarnings(selectedUser.id);

    } catch (err) {
      if (!silent) showToast('Failed to load user details: ' + err.message, 'error');
    }
  }

  // Drawer Tabs Switching (Support both .drawer-tab and .drawer-tab-btn)
  document.querySelectorAll('.drawer-tab, .drawer-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.drawer-tab, .drawer-tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.drawer-tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      const pane = document.getElementById('pane-' + target);
      if (pane) pane.classList.add('active');
    });
  });


  const closeDrawerBtn = document.getElementById('btnCloseDrawer') || document.getElementById('drawerCloseBtn');
  closeDrawerBtn?.addEventListener('click', () => {
    const drawer = document.getElementById('userDrawer') || document.getElementById('controlDrawer');
    if (drawer) drawer.style.display = 'none';
    selectedUser = null;
    renderUsers(allUsers);
  });


  // Action: Save Account Info
  document.getElementById('btnSaveAccount')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    try {
      const email = document.getElementById('ctrlEmail').value.trim();
      const username = document.getElementById('ctrlUsername').value.trim();
      const displayName = document.getElementById('ctrlDisplayName').value.trim();
      const status = document.getElementById('ctrlStatus').value;

      await api('/api/admin/users/' + selectedUser.id, {
        method: 'PUT',
        body: JSON.stringify({ email, username, displayName, status })
      });
      showToast('User profile updated successfully!', 'success');
      loadDashboard(true);
      selectUser(selectedUser.id, true);
    } catch (err) {
      showToast('Error updating profile: ' + err.message, 'error');
    }
  });

  // Action: Toggle 2FA
  document.getElementById('ctrlTwoFactor')?.addEventListener('change', async (e) => {
    if (!selectedUser) return;
    try {
      await api('/api/admin/users/' + selectedUser.id, {
        method: 'PUT',
        body: JSON.stringify({ twoFactorEnabled: e.target.checked })
      });
      showToast('2FA turned ' + (e.target.checked ? 'ON' : 'OFF'), 'success');
      loadDashboard(true);
    } catch (err) {
      showToast('Error updating 2FA: ' + err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  });

  // Action: Disconnect Google
  document.getElementById('btnDisconnectGoogle')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    if (!confirm('Disconnect Google account for ' + selectedUser.username + '?')) return;
    try {
      await api('/api/admin/users/' + selectedUser.id + '/disconnect-google', { method: 'POST' });
      showToast('Google account disconnected.', 'success');
      selectUser(selectedUser.id, true);
    } catch (err) {
      showToast('Error disconnecting Google: ' + err.message, 'error');
    }
  });

  // Action: Reset Password
  document.getElementById('btnResetPassword')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const newPassword = document.getElementById('ctrlNewPassword').value.trim();
    if (!newPassword) return showToast('Enter a new password', 'warning');
    try {
      await api('/api/admin/users/' + selectedUser.id + '/reset-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword })
      });
      showToast('Password updated successfully!', 'success');
      document.getElementById('ctrlNewPassword').value = '';
    } catch (err) {
      showToast('Error setting password: ' + err.message, 'error');
    }
  });

  // Action: Force Reset Avatar
  document.getElementById('btnResetAvatar')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    if (!confirm('Reset avatar for ' + selectedUser.username + ' to default initials placeholder?')) return;
    try {
      await api('/api/admin/users/' + selectedUser.id + '/reset-avatar', { method: 'POST' });
      showToast('Avatar reset to default.', 'success');
      selectUser(selectedUser.id, true);
      loadDashboard(true);
    } catch (err) {
      showToast('Error resetting avatar: ' + err.message, 'error');
    }
  });

  // Action: Moderation Controls (Shadowban, Freeze, Badge, Notes)
  document.getElementById('ctrlShadowban')?.addEventListener('change', async (e) => {
    if (!selectedUser) return;
    try {
      await api('/api/admin/users/' + selectedUser.id + '/shadowban', {
        method: 'POST',
        body: JSON.stringify({ shadowbanned: e.target.checked })
      });
      showToast('Shadowban set to ' + (e.target.checked ? 'ON' : 'OFF'), 'success');
      loadDashboard(true);
    } catch (err) {
      showToast('Error updating shadowban: ' + err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  });

  document.getElementById('ctrlFreeze')?.addEventListener('change', async (e) => {
    if (!selectedUser) return;
    try {
      await api('/api/admin/users/' + selectedUser.id + '/freeze', {
        method: 'POST',
        body: JSON.stringify({ frozen: e.target.checked })
      });
      showToast('Account freeze set to ' + (e.target.checked ? 'FROZEN' : 'ACTIVE'), 'success');
      loadDashboard(true);
    } catch (err) {
      showToast('Error freezing account: ' + err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  });

  document.getElementById('btnSaveRole')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const roleSelect = document.getElementById('ctrlRole') || document.getElementById('ctrlRoleSelect');
    const role = roleSelect ? roleSelect.value : 'user';
    try {
      await api('/api/admin/users/' + selectedUser.id + '/role', {
        method: 'POST',
        body: JSON.stringify({ role })
      });
      showToast('User role updated to ' + role.toUpperCase(), 'success');
      selectUser(selectedUser.id, true);
      loadDashboard(true);
    } catch (err) {
      showToast('Error updating role: ' + err.message, 'error');
    }
  });

  document.getElementById('btnSaveBadge')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const badge = document.getElementById('ctrlBadgeSelect').value;
    try {
      await api('/api/admin/users/' + selectedUser.id + '/badge', {
        method: 'POST',
        body: JSON.stringify({ badge })
      });
      showToast('User badge updated live!', 'success');
      selectUser(selectedUser.id, true);
      loadDashboard(true);
    } catch (err) {
      showToast('Error updating badge: ' + err.message, 'error');
    }
  });

  document.getElementById('btnSaveNotes')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const notes = document.getElementById('ctrlAdminNotes').value.trim();
    try {
      await api('/api/admin/users/' + selectedUser.id + '/notes', {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
      showToast('Admin dossier notes saved.', 'success');
    } catch (err) {
      showToast('Error saving notes: ' + err.message, 'error');
    }
  });

  // Action: Delete User Completely
  document.getElementById('btnDeleteUser')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    if (!confirm('Are you sure you want to permanently delete user #' + selectedUser.id + ' (' + selectedUser.username + ')?')) return;
    try {
      await api('/api/admin/users/' + selectedUser.id, { method: 'DELETE' });
      showToast('User permanently deleted.', 'success');
      const drawer = document.getElementById('userDrawer') || document.getElementById('controlDrawer');
      if (drawer) drawer.style.display = 'none';
      selectedUser = null;
      loadDashboard(true);
    } catch (err) {
      showToast('Error deleting user: ' + err.message, 'error');
    }
  });


  // Render Drawer Sub-Tabs (Sessions, Friends, Chats)
  function renderSessions(sessions) {
    const list = document.getElementById('drawerSessionsList');
    if (!sessions.length) {
      list.innerHTML = '<div class="empty-state p-3" style="color: var(--text-secondary); font-size: 12.5px;">No active sessions</div>';
      return;
    }

    list.innerHTML = sessions.map(s => `
      <div class="session-item-card" data-id="${s.id}" style="padding: 10px; background: var(--bg-primary); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; font-size: 13px;">${s.device || 'Web Browser'}</div>
          <div style="font-size: 11px; color: var(--text-muted);">IP: ${s.ip || '127.0.0.1'} • Created: ${new Date(s.created_at).toLocaleString()}</div>
        </div>
        <button class="btn btn-danger btn-sm revoke-session-btn" data-id="${s.id}">Revoke</button>
      </div>
    `).join('');

    list.querySelectorAll('.revoke-session-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const sid = e.target.getAttribute('data-id');
        try {
          await api('/api/admin/users/' + selectedUser.id + '/sessions/' + sid, { method: 'DELETE' });
          showToast('Session revoked live.', 'success');
          selectUser(selectedUser.id, true);
        } catch (err) {
          showToast('Error revoking session: ' + err.message, 'error');
        }
      });
    });
  }

  document.getElementById('btnRevokeAllSessions')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    try {
      await api('/api/admin/users/' + selectedUser.id + '/sessions', { method: 'DELETE' });
      showToast('All sessions revoked live.', 'success');
      selectUser(selectedUser.id, true);
    } catch (err) {
      showToast('Error revoking sessions: ' + err.message, 'error');
    }
  });

  function renderFriends(friends, incoming, outgoing) {
    const list = document.getElementById('drawerFriendsList');
    const inList = document.getElementById('drawerIncomingList');
    const outList = document.getElementById('drawerOutgoingList');

    if (!friends.length) {
      list.innerHTML = '<div class="empty-state p-2" style="color: var(--text-muted); font-size: 12px;">No friends connected</div>';
    } else {
      list.innerHTML = friends.map(f => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--bg-primary); border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="avatar avatar-sm">${(f.username || 'U')[0].toUpperCase()}</div>
            <div>
              <div style="font-weight: 600; font-size: 12.5px;">${f.displayName || f.username}</div>
              <div style="font-size: 11px; color: var(--text-muted);">@${f.username}</div>
            </div>
          </div>
          <button class="btn btn-danger btn-sm remove-friend-btn" data-id="${f.id}">Remove</button>
        </div>
      `).join('');

      list.querySelectorAll('.remove-friend-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const fid = e.target.getAttribute('data-id');
          if (!confirm('Remove friendship between #' + selectedUser.id + ' and #' + fid + '?')) return;
          try {
            await api('/api/admin/users/' + selectedUser.id + '/friends/' + fid, { method: 'DELETE' });
            showToast('Friend removed live.', 'success');
            selectUser(selectedUser.id, true);
          } catch (err) {
            showToast('Error removing friend: ' + err.message, 'error');
          }
        });
      });
    }

    // Incoming Requests
    if (!incoming.length) {
      inList.innerHTML = '<div style="color: var(--text-muted); font-size: 11.5px; padding: 4px;">No incoming requests</div>';
    } else {
      inList.innerHTML = incoming.map(r => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg-primary); border-radius: 6px; margin-bottom: 4px; border: 1px solid var(--border-color);">
          <span style="font-size: 12px;">From <strong>@${r.username}</strong></span>
          <div style="display: flex; gap: 4px;">
            <button class="btn btn-primary btn-sm accept-req-btn" data-id="${r.id}">Accept</button>
            <button class="btn btn-secondary btn-sm decline-req-btn" data-id="${r.id}">Decline</button>
          </div>
        </div>
      `).join('');

      inList.querySelectorAll('.accept-req-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const reqId = e.target.getAttribute('data-id');
          try {
            await api('/api/admin/requests/' + reqId + '/action', { method: 'POST', body: JSON.stringify({ action: 'accept' }) });
            showToast('Friend request accepted live.', 'success');
            selectUser(selectedUser.id, true);
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
          }
        });
      });

      inList.querySelectorAll('.decline-req-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const reqId = e.target.getAttribute('data-id');
          try {
            await api('/api/admin/requests/' + reqId + '/action', { method: 'POST', body: JSON.stringify({ action: 'decline' }) });
            showToast('Friend request declined live.', 'success');
            selectUser(selectedUser.id, true);
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
          }
        });
      });
    }

    // Outgoing Requests
    if (!outgoing.length) {
      outList.innerHTML = '<div style="color: var(--text-muted); font-size: 11.5px; padding: 4px;">No outgoing requests</div>';
    } else {
      outList.innerHTML = outgoing.map(r => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg-primary); border-radius: 6px; margin-bottom: 4px; border: 1px solid var(--border-color);">
          <span style="font-size: 12px;">To <strong>@${r.username}</strong></span>
          <button class="btn btn-secondary btn-sm cancel-req-btn" data-id="${r.id}">Cancel</button>
        </div>
      `).join('');

      outList.querySelectorAll('.cancel-req-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const reqId = e.target.getAttribute('data-id');
          try {
            await api('/api/admin/requests/' + reqId + '/action', { method: 'POST', body: JSON.stringify({ action: 'cancel' }) });
            showToast('Friend request cancelled live.', 'success');
            selectUser(selectedUser.id, true);
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
          }
        });
      });
    }
  }

  document.getElementById('btnAddFriendDirect')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const targetUserId = document.getElementById('inputTargetUserId').value.trim();
    if (!targetUserId) return showToast('Enter target user ID', 'warning');
    try {
      await api('/api/admin/users/' + selectedUser.id + '/friends', {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });
      showToast('Friend added directly!', 'success');
      document.getElementById('inputTargetUserId').value = '';
      selectUser(selectedUser.id, true);
    } catch (err) {
      showToast('Error adding friend: ' + err.message, 'error');
    }
  });

  function renderChats(chats) {
    const list = document.getElementById('drawerChatsList');
    if (!chats.length) {
      list.innerHTML = '<div class="empty-state p-3" style="color: var(--text-secondary); font-size: 12.5px;">No active conversations</div>';
      return;
    }

    list.innerHTML = chats.map(c => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-primary); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border-color);">
        <div>
          <div style="font-weight: 600; font-size: 13px;">${c.is_group ? '👥 ' + (c.name || 'Group Chat') : '💬 Private Chat #' + c.id}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${c.message_count} messages • Created: ${new Date(c.created_at).toLocaleDateString()}</div>
        </div>
        <button class="btn btn-primary btn-sm open-chat-spy-btn" data-id="${c.id}">Spy & Send</button>
      </div>
    `).join('');

    list.querySelectorAll('.open-chat-spy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cid = e.target.getAttribute('data-id');
        openChatSpy(cid);
      });
    });
  }

  async function openChatSpy(chatId) {
    activeChatId = parseInt(chatId, 10);
    document.getElementById('spyChatsListView').style.display = 'none';
    document.getElementById('spyMessagesView').style.display = 'block';

    const msgBox = document.getElementById('spyMessagesContainer');
    msgBox.innerHTML = '<div class="p-3 text-center" style="color: var(--text-muted);">Loading conversation history...</div>';

    try {
      const data = await api('/api/admin/chats/' + chatId + '/messages');
      if (!data.messages.length) {
        msgBox.innerHTML = '<div class="p-3 text-center" style="color: var(--text-muted);">No messages in this chat</div>';
        return;
      }

      msgBox.innerHTML = data.messages.map(m => `
        <div class="spy-msg-item" data-id="${m.id}" style="padding: 8px 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 6px; font-size: 12.5px; border-left: 3px solid ${m.sender_id === selectedUser?.id ? 'var(--accent)' : '#64748b'};">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">
            <strong>@${m.sender_username || 'User'}</strong>
            <span>${new Date(m.created_at).toLocaleTimeString()}</span>
          </div>
          <div>${m.content || ''}</div>
          <div style="text-align: right; margin-top: 4px;">
            <button class="btn-link delete-msg-btn" data-id="${m.id}" style="color: var(--danger); font-size: 11px; cursor: pointer; background: none; border: none;">Delete</button>
          </div>
        </div>
      `).join('');

      msgBox.scrollTop = msgBox.scrollHeight;

      msgBox.querySelectorAll('.delete-msg-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const mid = e.target.getAttribute('data-id');
          if (!confirm('Delete this message?')) return;
          try {
            await api('/api/admin/messages/' + mid, { method: 'DELETE' });
            showToast('Message deleted.', 'success');
            openChatSpy(chatId);
          } catch (err) {
            showToast('Error deleting message: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      showToast('Error opening chat: ' + err.message, 'error');
    }
  }

  document.getElementById('btnBackToChatsList')?.addEventListener('click', () => {
    document.getElementById('spyChatsListView').style.display = 'block';
    document.getElementById('spyMessagesView').style.display = 'none';
  });

  // Action: Export Chat Forensic JSON
  document.getElementById('btnExportChat')?.addEventListener('click', async () => {
    if (!activeChatId) return;
    try {
      const data = await api('/api/admin/chats/' + activeChatId + '/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'synch_chat_' + activeChatId + '_export.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Chat export downloaded.', 'success');
    } catch (err) {
      showToast('Error exporting chat: ' + err.message, 'error');
    }
  });

  // Action: Spy Send Message
  document.getElementById('btnSpySend')?.addEventListener('click', async () => {
    if (!activeChatId || !selectedUser) return;
    const content = document.getElementById('spyMessageInput').value.trim();
    if (!content) return;
    try {
      await api('/api/admin/chats/' + activeChatId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ senderId: selectedUser.id, content })
      });
      document.getElementById('spyMessageInput').value = '';
      openChatSpy(activeChatId);
    } catch (err) {
      showToast('Error sending message: ' + err.message, 'error');
    }
  });

  // System Health & Maintenance Mode
  async function loadSystemHealth() {
    try {
      const health = await api('/api/admin/health');
      document.getElementById('healthHeapVal').textContent = health.memory.heapUsedMb + ' MB';
      document.getElementById('healthHeapSub').textContent = 'Total: ' + health.memory.heapTotalMb + ' MB | RSS: ' + health.memory.rssMb + ' MB';

      document.getElementById('healthRamVal').textContent = health.memory.systemTotalMb + ' MB';
      document.getElementById('healthRamSub').textContent = 'Free: ' + health.memory.systemFreeMb + ' MB (' + Math.round((health.memory.systemFreeMb / health.memory.systemTotalMb) * 100) + '% available)';

      const mins = Math.floor(health.uptime.processUptimeSec / 60);
      const hrs = Math.floor(mins / 60);
      document.getElementById('healthUptimeVal').textContent = hrs + 'h ' + (mins % 60) + 'm';
      document.getElementById('healthOsUptimeSub').textContent = 'OS Uptime: ' + Math.floor(health.uptime.osUptimeSec / 3600) + 'h';

      document.getElementById('healthPoolVal').textContent = health.pool.total + ' Connections';
      document.getElementById('healthPoolSub').textContent = health.pool.idle + ' Idle | ' + health.pool.waiting + ' Waiting';

      document.getElementById('healthSocketsVal').textContent = '' + health.activeSockets;
      document.getElementById('healthNodeVal').textContent = '' + health.nodeVersion;
      document.getElementById('healthPlatformSub').textContent = health.platform + ' (' + health.cpu.cores + ' Cores)';

      const mToggle = document.getElementById('ctrlMaintenanceMode');
      if (mToggle) mToggle.checked = !!health.maintenanceMode;

      // Table storage diagnostics
      const diag = await api('/api/admin/system/diagnostics').catch(() => null);
      const tbody = document.getElementById('tbodyTableDiagnostics');
      if (diag && diag.tables && tbody) {
        tbody.innerHTML = diag.tables.map(t => `
          <tr>
            <td><code>${t.table_name}</code></td>
            <td><strong>${t.total_size}</strong></td>
            <td>${t.live_rows || 0}</td>
            <td><span style="color: ${parseInt(t.dead_rows) > 50 ? '#f59e0b' : 'var(--text-muted)'};">${t.dead_rows || 0}</span></td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Error loading health:', err);
    }
  }


  document.getElementById('btnRefreshHealth')?.addEventListener('click', loadSystemHealth);

  document.getElementById('ctrlMaintenanceMode')?.addEventListener('change', async (e) => {
    try {
      await api('/api/admin/maintenance', {
        method: 'POST',
        body: JSON.stringify({ enabled: e.target.checked })
      });
      showToast('Maintenance mode is now ' + (e.target.checked ? 'ENABLED' : 'DISABLED') + '.', 'success');
    } catch (err) {
      showToast('Error updating maintenance mode: ' + err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  });

  // IP Blacklist Management
  async function loadIpBlacklist() {
    try {
      const ips = await api('/api/admin/ip-blacklist');
      const tbody = document.getElementById('tbodyIpBlacklist');
      if (!tbody) return;
      if (!ips.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4" style="color: var(--text-secondary);">No blocked IP addresses</td></tr>';
        return;
      }
      tbody.innerHTML = ips.map(item => `
        <tr>
          <td>#${item.id}</td>
          <td><code>${item.ip}</code></td>
          <td>${item.reason || 'N/A'}</td>
          <td>${new Date(item.created_at).toLocaleString()}</td>
          <td>
            <button class="btn btn-danger btn-sm remove-ip-btn" data-id="${item.id}">Unblock</button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.remove-ip-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
          if (!confirm('Remove IP from blacklist?')) return;
          try {
            await api('/api/admin/ip-blacklist/' + id, { method: 'DELETE' });
            showToast('IP unblocked live.', 'success');
            loadIpBlacklist();
          } catch (err) {
            showToast('Error removing IP: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      console.error('Error loading IP blacklist:', err);
    }
  }

  document.getElementById('btnAddIpBlacklist')?.addEventListener('click', async () => {
    const ip = document.getElementById('inputBlacklistIp').value.trim();
    const reason = document.getElementById('inputBlacklistReason').value.trim();
    if (!ip) return showToast('Enter IP address', 'warning');
    try {
      await api('/api/admin/ip-blacklist', {
        method: 'POST',
        body: JSON.stringify({ ip, reason })
      });
      document.getElementById('inputBlacklistIp').value = '';
      document.getElementById('inputBlacklistReason').value = '';
      showToast('IP address added to blacklist live.', 'success');
      loadIpBlacklist();
    } catch (err) {
      showToast('Error adding IP: ' + err.message, 'error');
    }
  });

  // Word Blacklist & Auto-Mod
  async function loadWordBlacklist() {
    try {
      const words = await api('/api/admin/word-blacklist');
      const tbody = document.getElementById('tbodyWordBlacklist');
      if (!tbody) return;
      if (!words.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4" style="color: var(--text-secondary);">No restricted keywords configured</td></tr>';
        return;
      }
      tbody.innerHTML = words.map(w => `
        <tr>
          <td>#${w.id}</td>
          <td><code>${w.word}</code></td>
          <td><span class="badge" style="background: rgba(239,68,68,0.15); color: #ef4444;">${w.action}</span></td>
          <td>${new Date(w.created_at).toLocaleString()}</td>
          <td>
            <button class="btn btn-danger btn-sm remove-word-btn" data-id="${w.id}">Delete</button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.remove-word-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
          if (!confirm('Delete restricted keyword?')) return;
          try {
            await api('/api/admin/word-blacklist/' + id, { method: 'DELETE' });
            showToast('Keyword removed live.', 'success');
            loadWordBlacklist();
          } catch (err) {
            showToast('Error deleting keyword: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      console.error('Error loading word blacklist:', err);
    }
  }

  document.getElementById('btnAddWordBlacklist')?.addEventListener('click', async () => {
    const word = document.getElementById('inputBannedWord').value.trim();
    const action = document.getElementById('selectWordAction').value;
    if (!word) return showToast('Enter restricted keyword', 'warning');
    try {
      await api('/api/admin/word-blacklist', {
        method: 'POST',
        body: JSON.stringify({ word, action })
      });
      document.getElementById('inputBannedWord').value = '';
      showToast('Keyword added to auto-mod filter live.', 'success');
      loadWordBlacklist();
    } catch (err) {
      showToast('Error adding keyword: ' + err.message, 'error');
    }
  });

  // Media Gallery & Storage Inspector
  async function loadMediaGallery() {
    const grid = document.getElementById('adminMediaGrid');
    if (!grid) return;
    try {
      const files = await api('/api/admin/media');
      if (!files.length) {
        grid.innerHTML = '<div class="text-center p-4 w-100" style="color: var(--text-secondary);">No media files in /uploads</div>';
        return;
      }
      grid.innerHTML = files.map(f => `
        <div class="media-card">
          <div class="media-preview">
            ${f.isImage ? `<img src="${f.url}" alt="${f.filename}" loading="lazy">` : ''}
            ${f.isVideo ? `<video src="${f.url}" preload="metadata"></video>` : ''}
            ${f.isAudio ? '<div style="font-size: 28px;">🎵</div>' : ''}
            ${!f.isImage && !f.isVideo && !f.isAudio ? '<div style="font-size: 28px;">📄</div>' : ''}
          </div>
          <div class="media-info">
            <div class="media-filename">${f.filename}</div>
            <div class="media-meta">${f.sizeKb} KB • ${new Date(f.createdAt).toLocaleDateString()}</div>
            <div class="d-flex justify-between align-center">
              <a href="${f.url}" target="_blank" class="btn-link" style="font-size: 11px;">View</a>
              <button class="btn btn-danger btn-sm delete-media-btn" data-filename="${f.filename}">Delete</button>
            </div>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.delete-media-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const fn = e.target.getAttribute('data-filename');
          if (!confirm('Permanently delete ' + fn + '?')) return;
          try {
            await api('/api/admin/media/' + fn, { method: 'DELETE' });
            showToast('File deleted live.', 'success');
            loadMediaGallery();
          } catch (err) {
            showToast('Error deleting file: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      console.error('Error loading media:', err);
    }
  }

  document.getElementById('btnRefreshMedia')?.addEventListener('click', loadMediaGallery);

  // Feature Flags
  async function loadFeatureFlags() {
    try {
      const flags = await api('/api/admin/feature-flags');
      flags.forEach(f => {
        const el = document.getElementById('flag-' + f.key);
        if (el) {
          el.checked = f.value === 'true';
        }
      });
    } catch (err) {
      console.error('Error loading feature flags:', err);
    }
  }

  document.querySelectorAll('#flagsContainer input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const flagKey = e.target.getAttribute('data-flag');
      try {
        await api('/api/admin/feature-flags', {
          method: 'POST',
          body: JSON.stringify({ key: flagKey, value: e.target.checked ? 'true' : 'false' })
        });
        showToast('Feature flag ' + flagKey + ' updated live.', 'success');
      } catch (err) {
        showToast('Error updating flag: ' + err.message, 'error');
        e.target.checked = !e.target.checked;
      }
    });
  });

  // Interactive PostgreSQL SQL Studio
  document.querySelectorAll('.sql-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('sqlQueryInput').value = btn.getAttribute('data-sql');
    });
  });

  document.getElementById('btnExecuteSql')?.addEventListener('click', async () => {
    const sql = document.getElementById('sqlQueryInput').value.trim();
    if (!sql) return showToast('Enter SQL query', 'warning');

    const resultBox = document.getElementById('sqlResultContainer');
    const thead = document.getElementById('sqlResultThead');
    const tbody = document.getElementById('sqlResultTbody');
    const summary = document.getElementById('sqlResultSummary');
    const timeDisplay = document.getElementById('sqlExecutionTime');

    try {
      const res = await api('/api/admin/sql-console', {
        method: 'POST',
        body: JSON.stringify({ sql })
      });

      resultBox.style.display = 'block';
      summary.textContent = (res.command || 'SELECT') + ' — ' + (res.rowCount || 0) + ' rows returned';
      timeDisplay.textContent = 'Executed in ' + res.executionTimeMs + ' ms';

      if (res.fields && res.fields.length) {
        thead.innerHTML = '<tr>' + res.fields.map(f => '<th>' + f + '</th>').join('') + '</tr>';
      } else {
        thead.innerHTML = '';
      }

      if (res.rows && res.rows.length) {
        tbody.innerHTML = res.rows.map(row => `
          <tr>${res.fields.map(f => '<td>' + (row[f] !== null ? String(row[f]) : '<span style="color: var(--text-muted);">NULL</span>') + '</td>').join('')}</tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="' + (res.fields?.length || 1) + '" class="text-center p-4" style="color: var(--text-secondary);">No records returned</td></tr>';
      }
    } catch (err) {
      showToast('SQL Error: ' + err.message, 'error');
    }
  });

  // Admin Audit Logs
  async function loadAuditLogs() {
    try {
      const logs = await api('/api/admin/audit-logs');
      const tbody = document.getElementById('tbodyAuditLogs');
      if (!tbody) return;
      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4" style="color: var(--text-secondary);">No audit logs recorded</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td>${new Date(l.created_at).toLocaleString()}</td>
          <td><strong>@${l.admin_username || 'Admin'}</strong></td>
          <td><code>${l.action}</code></td>
          <td>${l.target_type ? (l.target_type + ' ' + (l.target_id ? '#' + l.target_id : '')) : '-'}</td>
          <td><pre style="margin: 0; font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${JSON.stringify(l.details || {})}</pre></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading audit logs:', err);
    }
  }

  document.getElementById('btnRefreshAudit')?.addEventListener('click', loadAuditLogs);

  // ==========================================
  // ENTERPRISE TRUST & SAFETY IMPLEMENTATIONS
  // ==========================================

  // 1. Alt Accounts & Forensics
  async function loadUserAlts(userId) {
    const altsContainer = document.getElementById('drawerAltsList');
    const ipsContainer = document.getElementById('drawerIpHistoryList');
    if (!altsContainer || !ipsContainer) return;

    try {
      const data = await api(`/api/admin/users/${userId}/alts`);
      if (!data.alts || !data.alts.length) {
        altsContainer.innerHTML = '<div class="text-muted p-2" style="font-size: 12px;">No connected alt accounts detected.</div>';
      } else {
        altsContainer.innerHTML = data.alts.map(alt => `
          <div class="p-2 mb-2" style="background: rgba(255,255,255,0.04); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>@${alt.username}</strong> <span style="font-size: 11px; color: var(--text-secondary);">(#${alt.id})</span>
              <div style="font-size: 11px; color: ${alt.is_banned ? '#ef4444' : '#10b981'};">${alt.is_banned ? 'Suspended' : 'Active'} • IP: ${alt.ip || 'N/A'}</div>
            </div>
            <button class="btn btn-secondary btn-sm select-alt-btn" data-id="${alt.id}">Inspect</button>
          </div>
        `).join('');

        altsContainer.querySelectorAll('.select-alt-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const altId = parseInt(e.target.getAttribute('data-id'), 10);
            selectUser(altId);
          });
        });
      }

      if (!data.ipHistory || !data.ipHistory.length) {
        ipsContainer.innerHTML = '<div class="text-muted p-2" style="font-size: 12px;">No IP history recorded yet.</div>';
      } else {
        ipsContainer.innerHTML = data.ipHistory.map(rec => `
          <div class="p-2 mb-1" style="background: rgba(0,0,0,0.25); border-radius: 6px; font-size: 11.5px; font-family: monospace;">
            <strong>${rec.ip}</strong> • <span style="color: var(--text-muted);">${new Date(rec.last_seen).toLocaleString()}</span>
          </div>
        `).join('');
      }
    } catch (e) {
      console.warn('Error loading alts:', e);
    }
  }

  // 2. Cascade Poison Ban
  document.getElementById('btnPoisonBan')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const confirmText = prompt(`Type "POISON" to permanently ban User #${selectedUser.id} (@${selectedUser.username}), blacklist their IP, and terminate all connected alt accounts:`);
    if (confirmText !== 'POISON') return;

    try {
      const res = await api(`/api/admin/users/${selectedUser.id}/poison-ban`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Poison ban cascade executed by Super Admin.' })
      });
      showToast(res.message || 'Poison ban executed successfully.', 'success');
      loadDashboard(true);
      selectUser(selectedUser.id, true);
    } catch (err) {
      showToast('Error executing poison ban: ' + err.message, 'error');
    }
  });

  // 3. Warnings System
  async function loadUserWarnings(userId) {
    const list = document.getElementById('drawerWarningsList');
    if (!list) return;
    try {
      const warnings = await api(`/api/admin/users/${userId}/warnings`);
      if (!warnings.length) {
        list.innerHTML = '<div class="text-muted p-2" style="font-size: 12px;">No infractions or strikes on record. Clean record.</div>';
        return;
      }
      list.innerHTML = warnings.map(w => `
        <div class="warning-item p-2 mb-2" style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; border-radius: 4px;">
          <div class="d-flex justify-between align-center mb-1">
            <span class="badge" style="background: #f59e0b; color: #000; font-size: 10px; font-weight: 700; text-transform: uppercase;">${w.severity}</span>
            <span style="font-size: 11px; color: var(--text-muted);">${new Date(w.created_at).toLocaleDateString()}</span>
          </div>
          <div style="font-size: 12.5px; font-weight: 500;">${w.reason}</div>
          <div class="d-flex justify-between align-center mt-2">
            <span style="font-size: 11px; color: var(--text-secondary);">By: @${w.moderator_username || 'Admin'}</span>
            <button class="btn-link delete-warn-btn" data-id="${w.id}" style="color: var(--danger); font-size: 11px; cursor: pointer; background: none; border: none;">Remove</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.delete-warn-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const wId = e.target.getAttribute('data-id');
          try {
            await api(`/api/admin/warnings/${wId}`, { method: 'DELETE' });
            showToast('Warning strike removed.', 'success');
            loadUserWarnings(userId);
          } catch (err) {
            showToast('Error removing warning: ' + err.message, 'error');
          }
        });
      });
    } catch (e) {
      console.warn('Error loading warnings:', e);
    }
  }

  document.getElementById('btnSubmitWarning')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const reason = document.getElementById('inputWarnReason').value.trim();
    const severity = document.getElementById('selectWarnSeverity').value;
    if (!reason) return showToast('Please enter a warning reason.', 'warning');

    try {
      await api(`/api/admin/users/${selectedUser.id}/warnings`, {
        method: 'POST',
        body: JSON.stringify({ reason, severity })
      });
      document.getElementById('inputWarnReason').value = '';
      showToast('Formal warning strike issued live.', 'success');
      loadUserWarnings(selectedUser.id);
    } catch (err) {
      showToast('Error issuing warning: ' + err.message, 'error');
    }
  });

  // 4. Bulk Message Purge
  document.getElementById('btnConfirmBulkPurge')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const hours = parseInt(document.getElementById('selectPurgeHours').value, 10);
    const scopeLabel = hours === -1 ? 'ALL messages' : `messages sent in the last ${hours} hours`;
    if (!confirm(`Purge ${scopeLabel} from user @${selectedUser.username} across all chats?`)) return;

    try {
      const res = await api(`/api/admin/users/${selectedUser.id}/messages/bulk-purge`, {
        method: 'POST',
        body: JSON.stringify({ hours })
      });
      showToast(res.message || 'Messages purged.', 'success');
      loadDashboard(true);
    } catch (err) {
      showToast('Error purging messages: ' + err.message, 'error');
    }
  });

  // 5. Reports Review Queue
  async function loadReports() {
    const container = document.getElementById('reportsContainer');
    const badge = document.getElementById('navBadgeReports');
    if (!container) return;
    const status = document.getElementById('selectReportStatusFilter')?.value || 'pending';

    try {
      const data = await api(`/api/admin/reports?status=${status}`);
      if (badge) {
        if (data.pendingCount > 0) {
          badge.textContent = data.pendingCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      if (!data.reports || !data.reports.length) {
        container.innerHTML = '<div class="text-center p-4 w-100" style="color: var(--text-secondary);">No reports currently in this queue.</div>';
        return;
      }

      container.innerHTML = data.reports.map(r => `
        <div class="report-card ${r.status}">
          <div class="report-header">
            <div>
              <span class="report-user-badge">Reported User: @${r.reported_username || 'User #' + r.reported_id}</span>
              <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">(Reporter: @${r.reporter_username || 'Anonymous'})</span>
            </div>
            <span class="report-reason-pill">${r.reason}</span>
          </div>
          ${r.details ? `<div style="font-size: 12.5px; color: var(--text-primary);">${r.details}</div>` : ''}
          ${r.message_content ? `
            <div class="report-evidence-box">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Reported Message Content:</div>
              <div style="font-weight: 500;">"${r.message_content}"</div>
              ${r.message_media ? `<div style="margin-top: 6px;"><a href="${r.message_media}" target="_blank" class="btn-link" style="font-size: 11.5px;">View Attached Media</a></div>` : ''}
            </div>
          ` : ''}
          <div class="report-actions-row">
            <span style="font-size: 11px; color: var(--text-muted); align-self: center; margin-right: auto;">Status: ${r.status.toUpperCase()} • ${new Date(r.created_at).toLocaleString()}</span>
            ${r.status === 'pending' ? `
              <button class="btn btn-secondary btn-sm dismiss-report-btn" data-id="${r.id}">Dismiss</button>
              <button class="btn btn-warning btn-sm warn-report-user-btn" data-user-id="${r.reported_id}">Warn User</button>
              <button class="btn btn-success btn-sm resolve-report-btn" data-id="${r.id}">Resolve Report</button>
            ` : `<span style="font-size: 12px; color: #10b981; font-weight: 600;">✓ ${r.resolution || 'Handled'}</span>`}
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.resolve-report-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const rId = e.target.getAttribute('data-id');
          try {
            await api(`/api/admin/reports/${rId}/resolve`, { method: 'POST', body: JSON.stringify({ resolution: 'Resolved by Admin' }) });
            showToast('Report marked as resolved.', 'success');
            loadReports();
          } catch (err) { showToast('Error resolving: ' + err.message, 'error'); }
        });
      });

      container.querySelectorAll('.dismiss-report-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const rId = e.target.getAttribute('data-id');
          try {
            await api(`/api/admin/reports/${rId}/dismiss`, { method: 'POST' });
            showToast('Report dismissed.', 'info');
            loadReports();
          } catch (err) { showToast('Error dismissing: ' + err.message, 'error'); }
        });
      });

      container.querySelectorAll('.warn-report-user-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const uId = e.target.getAttribute('data-user-id');
          const reason = prompt('Enter warning reason for this strike:');
          if (!reason) return;
          try {
            await api(`/api/admin/users/${uId}/warnings`, { method: 'POST', body: JSON.stringify({ reason, severity: 'moderate' }) });
            showToast('Warning strike issued to user #' + uId, 'success');
          } catch (err) { showToast('Error issuing warning: ' + err.message, 'error'); }
        });
      });
    } catch (err) {
      console.error('Error loading reports:', err);
    }
  }

  document.getElementById('selectReportStatusFilter')?.addEventListener('change', loadReports);
  document.getElementById('btnRefreshReports')?.addEventListener('click', loadReports);

  // 6. Custom Badges Manager
  async function loadCustomBadges() {
    const tbody = document.getElementById('tbodyBadgesList');
    if (!tbody) return;
    try {
      const badges = await api('/api/admin/badges');
      if (!badges.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4" style="color: var(--text-secondary);">No custom badges created yet</td></tr>';
        return;
      }
      tbody.innerHTML = badges.map(b => `
        <tr>
          <td><span class="custom-badge-preview" style="color: ${b.color}; background: ${b.bg_color}; border: 1px solid ${b.color};">${b.icon} ${b.name}</span></td>
          <td><strong>${b.name}</strong></td>
          <td><code>${b.slug}</code></td>
          <td>${b.icon}</td>
          <td>${new Date(b.created_at).toLocaleDateString()}</td>
          <td><button class="btn btn-danger btn-sm delete-badge-btn" data-id="${b.id}">Delete</button></td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.delete-badge-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const bId = e.target.getAttribute('data-id');
          if (!confirm('Delete custom badge?')) return;
          try {
            await api(`/api/admin/badges/${bId}`, { method: 'DELETE' });
            showToast('Custom badge deleted.', 'success');
            loadCustomBadges();
          } catch (err) { showToast('Error deleting badge: ' + err.message, 'error'); }
        });
      });
    } catch (err) {
      console.error('Error loading custom badges:', err);
    }
  }

  document.getElementById('btnCreateBadge')?.addEventListener('click', async () => {
    const name = document.getElementById('inputBadgeName').value.trim();
    const slug = document.getElementById('inputBadgeSlug').value.trim();
    const icon = document.getElementById('inputBadgeIcon').value.trim() || '🛡️';
    const color = document.getElementById('inputBadgeColor').value || '#0084ff';
    if (!name || !slug) return showToast('Badge name and slug are required.', 'warning');

    try {
      await api('/api/admin/badges', {
        method: 'POST',
        body: JSON.stringify({ name, slug, icon, color, bg_color: color + '22' })
      });
      document.getElementById('inputBadgeName').value = '';
      document.getElementById('inputBadgeSlug').value = '';
      showToast('Custom badge created successfully!', 'success');
      loadCustomBadges();
    } catch (err) { showToast('Error creating badge: ' + err.message, 'error'); }
  });

  // 7. Discord / Slack Webhooks Manager
  async function loadWebhooks() {
    const tbody = document.getElementById('tbodyWebhooksList');
    if (!tbody) return;
    try {
      const hooks = await api('/api/admin/webhooks');
      if (!hooks.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4" style="color: var(--text-secondary);">No active webhook integrations configured</td></tr>';
        return;
      }
      tbody.innerHTML = hooks.map(h => `
        <tr>
          <td><strong>${h.name}</strong></td>
          <td><code style="font-size: 11px;">${h.url.substring(0, 45)}...</code></td>
          <td><span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">${h.events}</span></td>
          <td><span style="color: #10b981; font-weight: 600;">Active</span></td>
          <td><button class="btn btn-danger btn-sm delete-hook-btn" data-id="${h.id}">Delete</button></td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.delete-hook-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const hId = e.target.getAttribute('data-id');
          if (!confirm('Remove webhook integration?')) return;
          try {
            await api(`/api/admin/webhooks/${hId}`, { method: 'DELETE' });
            showToast('Webhook deleted.', 'success');
            loadWebhooks();
          } catch (err) { showToast('Error deleting webhook: ' + err.message, 'error'); }
        });
      });
    } catch (err) {
      console.error('Error loading webhooks:', err);
    }
  }

  document.getElementById('btnAddWebhook')?.addEventListener('click', async () => {
    const name = document.getElementById('inputWebhookName').value.trim();
    const url = document.getElementById('inputWebhookUrl').value.trim();
    if (!name || !url) return showToast('Webhook name and URL are required.', 'warning');

    try {
      await api('/api/admin/webhooks', {
        method: 'POST',
        body: JSON.stringify({ name, url })
      });
      document.getElementById('inputWebhookName').value = '';
      document.getElementById('inputWebhookUrl').value = '';
      showToast('Webhook integration registered successfully!', 'success');
      loadWebhooks();
    } catch (err) { showToast('Error saving webhook: ' + err.message, 'error'); }
  });

  document.getElementById('btnTestWebhook')?.addEventListener('click', async () => {
    try {
      const res = await api('/api/admin/webhooks/test', { method: 'POST' });
      showToast(res.message || 'Test alert dispatched to webhooks!', 'success');
    } catch (err) { showToast('Error triggering webhook: ' + err.message, 'error'); }
  });

  // 8. DevOps Tools: Vacuum & Orphaned Files
  document.getElementById('btnRunVacuum')?.addEventListener('click', async () => {
    if (!confirm('Run VACUUM ANALYZE on PostgreSQL database?')) return;
    try {
      showToast('Running database optimization...', 'info');
      const res = await api('/api/admin/system/vacuum', { method: 'POST' });
      showToast(res.message || 'Database vacuum completed successfully.', 'success');
    } catch (err) { showToast('Vacuum failed: ' + err.message, 'error'); }
  });

  document.getElementById('btnCleanOrphaned')?.addEventListener('click', async () => {
    if (!confirm('Scan and delete orphaned files in /uploads?')) return;
    try {
      showToast('Scanning orphaned media...', 'info');
      const res = await api('/api/admin/system/cleanup-orphaned-media', { method: 'POST' });
      showToast(`Cleaned ${res.removedFiles} orphaned file(s), freeing ${res.freedMb} MB.`, 'success');
      if (currentActiveView === 'media') loadMediaGallery();
    } catch (err) { showToast('Cleanup failed: ' + err.message, 'error'); }
  });


  // Ban Modal & Broadcast Modals
  const banModal = document.getElementById('adminBanModal');
  const banTitle = document.getElementById('banModalTitle');
  const banReasonInput = document.getElementById('banReasonInput');
  const banDurationSelect = document.getElementById('banDurationSelect');

  document.getElementById('btnOpenBanDialog')?.addEventListener('click', () => {
    if (!selectedUser) return;
    banTitle.textContent = 'Ban User #' + selectedUser.id + ' (' + selectedUser.username + ')';
    banReasonInput.value = 'Violation of SYNCH Terms of Service';
    banDurationSelect.value = '0';
    banModal.style.display = 'flex';
  });

  document.getElementById('btnCloseBanModal')?.addEventListener('click', () => { banModal.style.display = 'none'; });
  document.getElementById('btnCancelBan')?.addEventListener('click', () => { banModal.style.display = 'none'; });

  document.querySelectorAll('.preset-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      banReasonInput.value = badge.getAttribute('data-reason');
    });
  });

  document.getElementById('btnConfirmBan')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    const reason = banReasonInput.value.trim();
    const durationHours = parseInt(banDurationSelect.value, 10);
    try {
      await api('/api/admin/users/' + selectedUser.id + '/ban', {
        method: 'POST',
        body: JSON.stringify({ reason, durationHours })
      });
      showToast('User #' + selectedUser.id + ' banned live. Sockets disconnected.', 'success');
      banModal.style.display = 'none';
      loadDashboard(true);
      selectUser(selectedUser.id, true);
    } catch (err) {
      showToast('Error banning user: ' + err.message, 'error');
    }
  });

  document.getElementById('btnUnbanUserBtn')?.addEventListener('click', async () => {
    if (!selectedUser) return;
    if (!confirm('Unban user #' + selectedUser.id + ' (' + selectedUser.username + ') and restore access?')) return;
    try {
      await api('/api/admin/users/' + selectedUser.id + '/unban', { method: 'POST' });
      showToast('User #' + selectedUser.id + ' unbanned live.', 'success');
      loadDashboard(true);
      selectUser(selectedUser.id, true);
    } catch (err) {
      showToast('Error unbanning user: ' + err.message, 'error');
    }
  });

  const broadcastModal = document.getElementById('adminBroadcastModal');
  document.getElementById('btnOpenBroadcastModal')?.addEventListener('click', () => {
    document.getElementById('broadcastMessageInput').value = '';
    broadcastModal.style.display = 'flex';
  });

  document.getElementById('btnCloseBroadcastModal')?.addEventListener('click', () => { broadcastModal.style.display = 'none'; });
  document.getElementById('btnCancelBroadcast')?.addEventListener('click', () => { broadcastModal.style.display = 'none'; });

  document.getElementById('btnConfirmBroadcast')?.addEventListener('click', async () => {
    const title = document.getElementById('broadcastTitleInput').value.trim();
    const message = document.getElementById('broadcastMessageInput').value.trim();
    const level = document.getElementById('broadcastLevelSelect').value;

    if (!message) return showToast('Enter announcement message', 'warning');
    try {
      await api('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ title, message, level })
      });
      showToast('Announcement pushed live to all connected clients!', 'success');
      broadcastModal.style.display = 'none';
    } catch (err) {
      showToast('Error broadcasting: ' + err.message, 'error');
    }
  });

  // Sign out
  document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
    logout();
    window.location.href = '/login';
  });

  // =========================================================================
  // REAL-TIME WEBSOCKET LISTENER (A TO Z LIVE UPDATES WITHOUT REFRESH)
  // =========================================================================
  if (typeof io !== 'undefined') {
    const adminSocket = io({
      auth: { token },
      query: { token }
    });

    adminSocket.on('connect', () => {
      console.log('⚡ Admin Console Connected to Real-Time WebSocket Gateway');
    });

    // 1. User Online/Offline Status
    adminSocket.on('user:status', (data) => {
      const uid = parseInt(data.userId);
      const u = allUsers.find(x => x.id === uid);
      if (u) {
        u.status = data.status;
        renderUsers(allUsers);
        if (selectedUser && selectedUser.id === u.id) {
          const sSelect = document.getElementById('ctrlStatus');
          if (sSelect) sSelect.value = data.status;
        }
      }
      // Silently refresh stats
      api('/api/admin/stats').then(s => {
        if (metrics.onlineUsers) metrics.onlineUsers.textContent = s.onlineUsers;
      }).catch(() => {});
    });

    // 2. User Badge Updated
    adminSocket.on('user:badge_updated', (data) => {
      const uid = parseInt(data.userId);
      const u = allUsers.find(x => x.id === uid);
      if (u) {
        u.badge = data.badge;
        renderUsers(allUsers);
      }
      if (selectedUser && selectedUser.id === uid) {
        selectedUser.badge = data.badge;
        const bSelect = document.getElementById('ctrlBadgeSelect');
        if (bSelect) bSelect.value = data.badge || '';
        const bDisplay = document.getElementById('drawerBadgeDisplay');
        if (bDisplay) {
          if (data.badge) {
            bDisplay.innerHTML = renderUserBadgeSpan(data.badge);
            bDisplay.style.display = 'inline-block';
          } else {
            bDisplay.style.display = 'none';
          }
        }
      }
    });

    // 3. User Frozen Updated
    adminSocket.on('user:frozen_updated', (data) => {
      const uid = parseInt(data.userId || selectedUser?.id);
      const u = allUsers.find(x => x.id === uid);
      if (u) {
        u.is_frozen = !!data.isFrozen;
        renderUsers(allUsers);
      }
      if (selectedUser && selectedUser.id === uid) {
        selectedUser.isFrozen = !!data.isFrozen;
        const fChk = document.getElementById('ctrlFreeze');
        if (fChk) fChk.checked = !!data.isFrozen;
      }
    });

    // 4. User Shadowban Updated
    adminSocket.on('user:shadowban_updated', (data) => {
      const uid = parseInt(data.userId || selectedUser?.id);
      const u = allUsers.find(x => x.id === uid);
      if (u) {
        u.is_shadowbanned = !!data.isShadowbanned;
        renderUsers(allUsers);
      }
      if (selectedUser && selectedUser.id === uid) {
        selectedUser.isShadowbanned = !!data.isShadowbanned;
        const sChk = document.getElementById('ctrlShadowban');
        if (sChk) sChk.checked = !!data.isShadowbanned;
      }
    });

    // 5. User Ban / Unban
    adminSocket.on('user_banned', (data) => {
      loadDashboard(true);
      if (selectedUser) selectUser(selectedUser.id, true);
    });

    adminSocket.on('user_unbanned', (data) => {
      loadDashboard(true);
      if (selectedUser) selectUser(selectedUser.id, true);
    });

    // 6. User Profile Updated / Avatar Reset
    adminSocket.on('user:profile_updated', (data) => {
      const uid = parseInt(data.userId);
      const u = allUsers.find(x => x.id === uid);
      if (u) {
        if (data.username) u.username = data.username;
        if (data.displayName) u.display_name = data.displayName;
        if (data.email) u.email = data.email;
        if (data.avatar !== undefined) u.avatar = data.avatar;
        renderUsers(allUsers);
      }
      if (selectedUser && selectedUser.id === uid) {
        selectUser(uid, true);
      }
    });

    // 7. User Deleted
    adminSocket.on('user:deleted', (data) => {
      const uid = parseInt(data.userId);
      allUsers = allUsers.filter(x => x.id !== uid);
      renderUsers(allUsers);
      if (selectedUser && selectedUser.id === uid) {
        drawerContent.style.display = 'none';
        drawerEmpty.style.display = 'flex';
        selectedUser = null;
      }
      loadDashboard(true);
    });

    // 8. Maintenance Mode State Broadcast
    adminSocket.on('system:maintenance', (data) => {
      const mToggle = document.getElementById('ctrlMaintenanceMode');
      if (mToggle) mToggle.checked = !!data.enabled;
    });

    // 9. Live Messages & Chat Spy
    adminSocket.on('message:new', (msg) => {
      if (activeChatId && msg.chat_id === activeChatId) {
        const msgBox = document.getElementById('spyMessagesContainer');
        if (msgBox) {
          const empty = msgBox.querySelector('.text-center');
          if (empty) empty.remove();

          const div = document.createElement('div');
          div.className = 'spy-msg-item';
          div.setAttribute('data-id', msg.id);
          div.style.cssText = 'padding: 8px 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 6px; font-size: 12.5px; border-left: 3px solid ' + (msg.sender_id === selectedUser?.id ? 'var(--accent)' : '#64748b') + ';';
          div.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">
              <strong>@${msg.sender_username || msg.sender?.username || 'User'}</strong>
              <span>${new Date(msg.created_at || Date.now()).toLocaleTimeString()}</span>
            </div>
            <div>${msg.content || ''}</div>
            <div style="text-align: right; margin-top: 4px;">
              <button class="btn-link delete-msg-btn" data-id="${msg.id}" style="color: var(--danger); font-size: 11px; cursor: pointer; background: none; border: none;">Delete</button>
            </div>
          `;
          msgBox.appendChild(div);
          msgBox.scrollTop = msgBox.scrollHeight;

          div.querySelector('.delete-msg-btn')?.addEventListener('click', async () => {
            if (!confirm('Delete this message?')) return;
            try {
              await api('/api/admin/messages/' + msg.id, { method: 'DELETE' });
              showToast('Message deleted live.', 'success');
              div.remove();
            } catch (err) {
              showToast('Error deleting: ' + err.message, 'error');
            }
          });
        }
      }
    });

    adminSocket.on('message:deleted', (data) => {
      if (activeChatId && data.messageId) {
        const item = document.querySelector('.spy-msg-item[data-id="' + data.messageId + '"]');
        if (item) item.remove();
      }
    });

    // 10. Friend Updates & Sessions
    adminSocket.on('friend:updated', () => {
      if (selectedUser) selectUser(selectedUser.id, true);
    });

    adminSocket.on('session:revoked', () => {
      if (selectedUser) selectUser(selectedUser.id, true);
    });
  }

  // Live Auto-Refresh Heartbeat (Updates stats smoothly in background every 4s)
  setInterval(() => {
    if (document.hidden) return;
    api('/api/admin/stats').then(statsData => {
      if (metrics.totalUsers) metrics.totalUsers.textContent = statsData.totalUsers;
      if (metrics.onlineUsers) metrics.onlineUsers.textContent = statsData.onlineUsers;
      if (metrics.twoFactor) metrics.twoFactor.textContent = statsData.twoFactorUsers;
      if (metrics.sessions) metrics.sessions.textContent = statsData.totalSessions;
      if (metrics.chats) metrics.chats.textContent = statsData.totalChats;
    }).catch(() => {});
  }, 4000);

  document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
    sessionStorage.clear();
    localStorage.removeItem('synch_token');
    localStorage.removeItem('synch_user');
    window.location.href = '/login';
  });

  loadDashboard();
})();

