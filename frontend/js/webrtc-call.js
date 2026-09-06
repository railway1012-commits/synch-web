/**
 * SYNCH WebRTC Audio & Video Calling Module
 * Real-time peer-to-peer encrypted audio & video calling with WebRTC, Web Audio API ringtones,
 * dynamic ICE/TURN server discovery, screen sharing, and adaptive video UI.
 */

(function () {
  'use strict';

  // --- Dynamic ICE / STUN / TURN Configuration ---
  let RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' }
    ]
  };

  // Fetch dynamic ICE / TURN servers from backend
  async function fetchIceServers() {
    try {
      const token = typeof getToken === 'function' ? getToken() : (sessionStorage.getItem('synch_token') || localStorage.getItem('synch_token'));
      if (!token) return;
      const res = await fetch('/api/chats/ice-servers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers && Array.isArray(data.iceServers)) {
          RTC_CONFIG.iceServers = data.iceServers;
        }
      }
    } catch (e) {
      console.warn('Using default STUN servers:', e.message);
    }
  }
  fetchIceServers();

  // --- Call State ---
  let callState = 'idle'; // 'idle' | 'outgoing' | 'incoming' | 'connected'
  let activeCall = null;  // { callId, remoteUserId, remoteUserName, remoteUserAvatar, isCaller, isVideo, ... }
  let peerConnection = null;
  let localStream = null;
  let screenStream = null;
  let callTimerInterval = null;
  let callStartTime = null;
  let isMuted = false;
  let isVideoEnabled = false;
  let isScreenSharing = false;
  let isSpeakerOn = true;
  let isMinimized = false;

  // --- Web Audio API Ringtone & Dialtone Synthesizer ---
  let audioCtx = null;
  let ringtoneInterval = null;

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq1, freq2, duration) {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = freq1;
      osc2.frequency.value = freq2;

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + duration);
      osc2.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function startDialTone() {
    stopAllSounds();
    playTone(440, 480, 1.8);
    ringtoneInterval = setInterval(() => {
      playTone(440, 480, 1.8);
    }, 4000);
  }

  function startIncomingRingtone() {
    stopAllSounds();
    const playMelody = () => {
      playTone(523.25, 659.25, 0.4); // C5 + E5
      setTimeout(() => playTone(659.25, 783.99, 0.5), 350); // E5 + G5
      setTimeout(() => playTone(783.99, 1046.50, 0.6), 750); // G5 + C6
    };
    playMelody();
    ringtoneInterval = setInterval(playMelody, 3200);

    // Vibration on mobile
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([400, 200, 400, 200, 400]);
      } catch (e) {}
    }
  }

  function stopAllSounds() {
    if (ringtoneInterval) {
      clearInterval(ringtoneInterval);
      ringtoneInterval = null;
    }
  }

  // --- UI Elements ---
  const el = {
    get overlay() { return document.getElementById('audioCallOverlay'); },
    get videoContainer() { return document.getElementById('callVideoContainer'); },
    get audioCenter() { return document.getElementById('callAudioCenter'); },
    get localVideo() { return document.getElementById('localVideoStream'); },
    get remoteVideo() { return document.getElementById('remoteVideoStream'); },
    get avatar() { return document.getElementById('callAvatar'); },
    get name() { return document.getElementById('callUserName'); },
    get status() { return document.getElementById('callStatusText'); },
    get timer() { return document.getElementById('callDurationTimer'); },
    get muteBtn() { return document.getElementById('callMuteBtn'); },
    get muteIcon() { return document.getElementById('callMuteIcon'); },
    get muteText() { return document.getElementById('callMuteText'); },
    get videoBtn() { return document.getElementById('callVideoBtn'); },
    get videoIcon() { return document.getElementById('callVideoIcon'); },
    get videoText() { return document.getElementById('callVideoText'); },
    get screenBtn() { return document.getElementById('callScreenShareBtn'); },
    get screenText() { return document.getElementById('callScreenShareText'); },
    get speakerBtn() { return document.getElementById('callSpeakerBtn'); },
    get endBtn() { return document.getElementById('callEndBtn'); },
    get minimizeBtn() { return document.getElementById('callMinimizeBtn'); },
    get minimizedBadge() { return document.getElementById('minimizedCallBadge'); },
    get minimizedName() { return document.getElementById('minimizedCallName'); },
    get minimizedTimer() { return document.getElementById('minimizedCallTimer'); },
    get remoteAudio() { return document.getElementById('remoteAudioStream'); },

    // Universal Green Call Banner (Top of Screen)
    get banner() { return document.getElementById('universalCallBanner'); },
    get bannerClickArea() { return document.getElementById('callBannerClickArea'); },
    get bannerName() { return document.getElementById('callBannerName'); },
    get bannerTypeBadge() { return document.getElementById('callBannerTypeBadge'); },
    get bannerStatus() { return document.getElementById('callBannerStatus'); },
    get bannerAcceptBtn() { return document.getElementById('bannerAcceptBtn'); },
    get bannerDeclineBtn() { return document.getElementById('bannerDeclineBtn'); },
    get bannerEndBtn() { return document.getElementById('bannerEndBtn'); },

    // Incoming Call Modal
    get incomingModal() { return document.getElementById('incomingCallModal'); },
    get incomingAvatar() { return document.getElementById('incomingCallAvatar'); },
    get incomingName() { return document.getElementById('incomingCallName'); },
    get incomingType() { return document.getElementById('incomingCallType'); },
    get acceptBtn() { return document.getElementById('acceptIncomingCallBtn'); },
    get declineBtn() { return document.getElementById('declineIncomingCallBtn'); }
  };

  // --- Universal Call Banner Synchronizer ---
  function updateCallBanner(customStatus) {
    if (!el.banner) return;

    // Rule 0: Hide if idle or no active call
    if (callState === 'idle' || !activeCall) {
      el.banner.style.display = 'none';
      return;
    }

    // Rule 1: Incoming call (Receiver hasn't answered yet) -> Show ONLY to receiver
    if (callState === 'incoming') {
      el.banner.style.display = 'flex';
      if (el.bannerName) el.bannerName.textContent = activeCall.remoteUserName || 'User';
      if (el.bannerTypeBadge) el.bannerTypeBadge.textContent = activeCall.isVideo ? 'Video Call' : 'Audio Call';
      if (el.bannerStatus) el.bannerStatus.textContent = 'Incoming call • Tap to answer';
      if (el.bannerAcceptBtn) el.bannerAcceptBtn.style.display = 'inline-flex';
      if (el.bannerDeclineBtn) el.bannerDeclineBtn.style.display = 'inline-flex';
      if (el.bannerEndBtn) el.bannerEndBtn.style.display = 'none';
      return;
    }

    // Rule 2: If answered / connected (or outgoing), ONLY show if call screen is MINIMIZED!
    if (isMinimized) {
      el.banner.style.display = 'flex';
      if (el.bannerName) el.bannerName.textContent = activeCall.remoteUserName || 'User';
      if (el.bannerTypeBadge) el.bannerTypeBadge.textContent = activeCall.isVideo ? 'Video Call' : 'Audio Call';

      if (callState === 'outgoing') {
        if (el.bannerStatus) el.bannerStatus.textContent = customStatus || (activeCall.isVideo ? 'Calling with Video...' : 'Calling...');
      } else if (callState === 'connected') {
        const elapsed = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const formatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
        if (el.bannerStatus) el.bannerStatus.textContent = `${formatted} • Tap to return to call`;
      }

      if (el.bannerAcceptBtn) el.bannerAcceptBtn.style.display = 'none';
      if (el.bannerDeclineBtn) el.bannerDeclineBtn.style.display = 'none';
      if (el.bannerEndBtn) el.bannerEndBtn.style.display = 'inline-flex';
    } else {
      // Full screen call overlay is active -> hide top banner
      el.banner.style.display = 'none';
    }
  }

  // --- Initialize UI Handlers ---
  function initUI() {
    document.getElementById('callEndBtn')?.addEventListener('click', () => endCall('ended'));
    document.getElementById('callMuteBtn')?.addEventListener('click', toggleMute);
    document.getElementById('callVideoBtn')?.addEventListener('click', toggleVideo);
    document.getElementById('callScreenShareBtn')?.addEventListener('click', toggleScreenShare);
    document.getElementById('callSpeakerBtn')?.addEventListener('click', toggleSpeaker);
    document.getElementById('callMinimizeBtn')?.addEventListener('click', toggleMinimize);
    document.getElementById('minimizedCallBadge')?.addEventListener('click', maximizeCall);

    document.getElementById('acceptIncomingCallBtn')?.addEventListener('click', acceptIncomingCall);
    document.getElementById('declineIncomingCallBtn')?.addEventListener('click', () => rejectIncomingCall('declined'));

    // Universal Green Banner Handlers
    document.getElementById('callBannerClickArea')?.addEventListener('click', () => {
      if (callState === 'incoming') {
        acceptIncomingCall();
      } else {
        maximizeCall();
      }
    });
    document.getElementById('bannerAcceptBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      acceptIncomingCall();
    });
    document.getElementById('bannerDeclineBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      rejectIncomingCall('declined');
    });
    document.getElementById('bannerEndBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      endCall('ended');
    });
  }

  // --- Virtual Silent Stream (Fallback when mic is unavailable) ---
  function createSilentAudioStream() {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        const osc = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(dst);
        osc.start();
        return dst.stream;
      }
    } catch (e) {
      console.warn('Silent audio generator failed:', e);
    }
    return null;
  }

  // --- Helper: Acquire Media Stream with Progressive Mobile Fallbacks ---
  async function requestMediaStream(wantVideo = false) {
    const getUM = (constraints) => {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        return navigator.mediaDevices.getUserMedia(constraints);
      }
      const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
      if (legacy) {
        return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
      }
      return Promise.reject(new Error('MediaDevices not supported'));
    };

    // 1. If video is requested, try video + audio progressively
    if (wantVideo) {
      try {
        return await getUM({
          audio: true,
          video: { facingMode: 'user' }
        });
      } catch (e1) {
        console.warn('Video facingMode user failed, trying basic video:', e1);
      }

      try {
        return await getUM({ audio: true, video: true });
      } catch (e2) {
        console.warn('Basic video failed, falling back to audio:', e2);
      }
    }

    // 2. Audio-only capture
    try {
      return await getUM({ audio: true });
    } catch (finalErr) {
      console.error('Microphone access failed:', finalErr);
      if (finalErr.name === 'NotAllowedError' || finalErr.name === 'PermissionDeniedError') {
        if (typeof showToast === 'function') {
          showToast('Microphone/Camera blocked. Tap the lock/camera icon in your browser URL bar to allow permissions.', 'warning');
        }
      }
      throw finalErr;
    }
  }

  function handleMediaError(err) {
    console.error('Media stream error:', err);
  }


  // --- Start Outgoing Call (Audio or Video) ---
  let callTimeoutTimer = null;

  async function startCall(targetUser, chatId, isVideo = false) {
    if (callState !== 'idle') {
      if (typeof showToast === 'function') showToast('You are already in a call', 'warning');
      return;
    }

    if (!targetUser || (!targetUser._id && !targetUser.id)) {
      if (typeof showToast === 'function') showToast('Cannot call this user', 'error');
      return;
    }

    const targetUserId = parseInt(targetUser._id || targetUser.id || (typeof targetUser === 'number' ? targetUser : targetUser));
    const caller = typeof getUser === 'function' ? getUser() : {};

    try {
      localStream = await requestMediaStream(isVideo);
      isMuted = false;
      isVideoEnabled = isVideo && localStream.getVideoTracks().length > 0;
    } catch (err) {
      localStream = createSilentAudioStream();
      isMuted = true;
      isVideoEnabled = false;
    }

    callState = 'outgoing';
    activeCall = {
      remoteUserId: targetUserId,
      remoteUserName: targetUser.displayName || targetUser.username || targetUser.name || 'User',
      remoteUserAvatar: targetUser.avatar || null,
      chatId: chatId,
      isVideo: isVideoEnabled,
      isCaller: true,
      startedAt: Date.now()
    };

    updateCallViewMode();
    renderCallScreen(activeCall, isVideo ? 'Calling with Video...' : 'Calling...');
    updateCallBanner(isVideo ? 'Calling with Video...' : 'Calling...');
    startDialTone();

    // 45-second outgoing call timeout
    if (callTimeoutTimer) clearTimeout(callTimeoutTimer);
    callTimeoutTimer = setTimeout(() => {
      if (callState === 'outgoing') {
        if (typeof showToast === 'function') showToast('User is not answering', 'info');
        endCall('no_answer');
      }
    }, 45000);

    if (isVideoEnabled && el.localVideo) {
      el.localVideo.srcObject = localStream;
    }

    if (typeof socket !== 'undefined' && socket?.connected) {
      socket.emit('call:initiate', {
        toUserId: targetUserId,
        chatId: chatId,
        callerName: caller.displayName || caller.username || 'Friend',
        callerAvatar: caller.avatar || null,
        isVideo: isVideoEnabled
      });
    }
  }

  // Convenience helper for Video Call
  function startVideoCall(targetUser, chatId) {
    return startCall(targetUser, chatId, true);
  }

  // --- Incoming Call Handler ---
  function onIncomingCall(data) {
    // If incoming call is from ourselves, ignore
    const currentUserId = typeof getUser === 'function' ? (getUser()?.id || getUser()?._id) : null;
    if (data.callerId && currentUserId && parseInt(data.callerId) === parseInt(currentUserId)) {
      return;
    }

    // If currently connected in an active call, ignore duplicate ringing
    if (callState === 'connected') {
      return;
    }

    // Reset any prior stale state
    if (callState !== 'idle') {
      resetCallState();
    }

    callState = 'incoming';
    activeCall = {
      callId: data.callId,
      remoteUserId: parseInt(data.callerId),
      remoteUserName: data.callerName || 'User',
      remoteUserAvatar: data.callerAvatar || null,
      chatId: data.chatId,
      isVideo: !!data.isVideo,
      isCaller: false,
      startedAt: Date.now()
    };


    if (el.incomingName) el.incomingName.textContent = activeCall.remoteUserName;
    if (el.incomingType) el.incomingType.textContent = activeCall.isVideo ? 'Incoming Video Call...' : 'Incoming Audio Call...';
    if (el.incomingAvatar) {
      if (activeCall.remoteUserAvatar) {
        el.incomingAvatar.innerHTML = `<img src="${activeCall.remoteUserAvatar}" alt="Avatar">`;
      } else {
        el.incomingAvatar.textContent = (activeCall.remoteUserName[0] || 'U').toUpperCase();
      }
    }

    startIncomingRingtone();
    updateCallBanner('Incoming call • Tap to answer');

    if (typeof openModal === 'function') {
      openModal('incomingCallModal');
    } else if (el.incomingModal) {
      el.incomingModal.classList.add('active');
    }

    if (typeof showDesktopNotification === 'function') {
      showDesktopNotification(activeCall.isVideo ? 'Incoming Video Call' : 'Incoming Audio Call', {
        body: `${activeCall.remoteUserName} is calling you on SYNCH. Tap to answer.`,
        tag: 'incoming-call',
        renotify: true,
        requireInteraction: true,
        data: { type: 'incoming_call', callId: data.callId }
      });
    }
  }

  // --- Accept Incoming Call ---
  async function acceptIncomingCall() {
    if (!activeCall || callState !== 'incoming') return;

    try {
      localStream = await requestMediaStream(activeCall.isVideo);
      isMuted = false;
      isVideoEnabled = activeCall.isVideo && localStream.getVideoTracks().length > 0;
    } catch (err) {
      localStream = createSilentAudioStream();
      isMuted = true;
      isVideoEnabled = false;
    }

    stopAllSounds();

    if (typeof closeModal === 'function') closeModal('incomingCallModal');
    const incomingModal = document.getElementById('incomingCallModal');
    if (incomingModal) incomingModal.classList.remove('active');

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLOSE_CALL_NOTIFICATION' });
    }

    callState = 'connected';
    updateCallViewMode();
    renderCallScreen(activeCall, 'Connecting...');
    updateCallBanner('Connecting...');

    if (isVideoEnabled && el.localVideo) {
      el.localVideo.srcObject = localStream;
    }

    if (typeof socket !== 'undefined' && socket?.connected) {
      socket.emit('call:accept', { callId: activeCall.callId, isVideo: isVideoEnabled });
    }

    setupPeerConnection();
  }

  // --- Reject Incoming Call ---
  function rejectIncomingCall(reason) {
    stopAllSounds();
    if (typeof closeModal === 'function') closeModal('incomingCallModal');
    const incomingModal = document.getElementById('incomingCallModal');
    if (incomingModal) incomingModal.classList.remove('active');

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLOSE_CALL_NOTIFICATION' });
    }

    if (activeCall && typeof socket !== 'undefined' && socket?.connected) {
      socket.emit('call:reject', {
        callId: activeCall.callId,
        reason: reason || 'declined'
      });
    }

    resetCallState();
  }

  // --- WebRTC Peer Connection Setup ---
  let remoteVideoStreamObject = null;
  let remoteAudioStreamObject = null;
  let pendingIceCandidates = [];

  function setupPeerConnection() {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    pendingIceCandidates = [];
    remoteVideoStreamObject = new MediaStream();
    remoteAudioStreamObject = new MediaStream();

    peerConnection = new RTCPeerConnection(RTC_CONFIG);

    if (localStream) {
      localStream.getTracks().forEach(track => {
        try {
          peerConnection.addTrack(track, localStream);
        } catch (e) {
          console.warn('Error adding track to peerConnection:', e);
        }
      });
    }

    peerConnection.ontrack = (event) => {
      let stream = event.streams && event.streams[0];

      if (event.track.kind === 'video') {
        if (!stream) {
          remoteVideoStreamObject.addTrack(event.track);
          stream = remoteVideoStreamObject;
        }
        if (el.remoteVideo) {
          el.remoteVideo.srcObject = stream;
          el.remoteVideo.play().catch(e => console.warn('Remote video play error:', e));
        }
        activeCall.hasRemoteVideo = true;
        updateCallViewMode();
      } else if (event.track.kind === 'audio') {
        if (!stream) {
          remoteAudioStreamObject.addTrack(event.track);
          stream = remoteAudioStreamObject;
        }
        if (el.remoteAudio) {
          el.remoteAudio.srcObject = stream;
          el.remoteAudio.play().catch(e => console.warn('Remote audio play error:', e));
        }
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && activeCall) {
        if (typeof socket !== 'undefined' && socket?.connected) {
          socket.emit('call:signal', {
            toUserId: activeCall.remoteUserId,
            callId: activeCall.callId,
            signal: { candidate: event.candidate }
          });
        }
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log('WebRTC Connection State:', state);
      if (state === 'connected') {
        callState = 'connected';
        stopAllSounds();
        if (callTimeoutTimer) {
          clearTimeout(callTimeoutTimer);
          callTimeoutTimer = null;
        }
        startCallDurationTimer();
        if (el.status) el.status.textContent = 'Connected';
        document.getElementById('audioWaveVisualizer')?.classList.add('active');
        updateCallBanner();
        updateCallViewMode();
      } else if (state === 'disconnected' || state === 'failed') {
        endCall('connection_lost');
      }
    };
  }

  // --- Call Signaling Handlers ---
  async function onCallInitiated(data) {
    if (activeCall) {
      activeCall.callId = data.callId;
    }
  }

  async function onCallAccepted(data) {
    if (!activeCall || !activeCall.isCaller) return;
    stopAllSounds();
    if (callTimeoutTimer) {
      clearTimeout(callTimeoutTimer);
      callTimeoutTimer = null;
    }

    if (el.status) el.status.textContent = 'Connecting...';
    callState = 'connected';
    updateCallBanner('Connecting...');

    if (typeof data.isVideo === 'boolean') {
      activeCall.hasRemoteVideo = data.isVideo;
    }
    updateCallViewMode();

    setupPeerConnection();

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);

      if (typeof socket !== 'undefined' && socket?.connected) {
        socket.emit('call:signal', {
          toUserId: activeCall.remoteUserId,
          callId: activeCall.callId,
          signal: { sdp: peerConnection.localDescription }
        });
      }
    } catch (err) {
      console.error('Error creating offer:', err);
      endCall('handshake_failed');
    }
  }

  function onCallRejected(data) {
    stopAllSounds();
    if (callTimeoutTimer) {
      clearTimeout(callTimeoutTimer);
      callTimeoutTimer = null;
    }
    const reason = data.reason === 'busy' ? 'User is busy on another call' : 'Call declined';
    if (typeof showToast === 'function') showToast(reason, 'info');

    if (el.status) el.status.textContent = reason;
    updateCallBanner(reason);
    setTimeout(() => {
      endCall(reason);
    }, 1200);
  }

  async function onCallSignal(data) {
    const signal = data.signal;
    if (!signal) return;

    if (!peerConnection) {
      setupPeerConnection();
    }

    try {
      if (signal.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // Flush any queued ICE candidates that arrived before remoteDescription
        if (pendingIceCandidates.length > 0) {
          for (const cand of pendingIceCandidates) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
          }
          pendingIceCandidates = [];
        }

        if (signal.sdp.type === 'offer') {
          const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await peerConnection.setLocalDescription(answer);

          if (typeof socket !== 'undefined' && socket?.connected) {
            socket.emit('call:signal', {
              toUserId: activeCall.remoteUserId,
              callId: activeCall.callId,
              signal: { sdp: peerConnection.localDescription }
            });
          }
        }
      } else if (signal.candidate) {
        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          pendingIceCandidates.push(signal.candidate);
        }
      }
    } catch (err) {
      console.error('Error handling WebRTC signal:', err);
    }
  }


  function onCallModeChanged(data) {
    if (!activeCall) return;
    if (typeof data.isVideo === 'boolean') {
      activeCall.hasRemoteVideo = data.isVideo;
      updateCallViewMode();
    }
    if (data.isScreenShare) {
      if (typeof showToast === 'function') showToast(`${activeCall.remoteUserName} started sharing screen`, 'info');
    }
  }

  function onCallEnded(data) {
    stopAllSounds();
    const wasRinging = (callState === 'incoming');
    const callerName = activeCall?.remoteUserName;
    resetCallState();
    if (wasRinging) {
      if (typeof showToast === 'function') showToast(`Missed call from ${callerName || 'caller'}`, 'info');
    } else {
      if (typeof showToast === 'function') showToast('Call ended', 'info');
    }
  }

  // --- End Call ---
  function endCall(reason) {
    stopAllSounds();
    if (callTimeoutTimer) {
      clearTimeout(callTimeoutTimer);
      callTimeoutTimer = null;
    }

    if (activeCall && typeof socket !== 'undefined' && socket?.connected) {
      socket.emit('call:end', {
        callId: activeCall.callId,
        toUserId: activeCall.remoteUserId,
        reason: reason || 'user_ended'
      });
    }

    resetCallState();
  }

  function resetCallState() {
    stopAllSounds();
    if (callTimeoutTimer) {
      clearTimeout(callTimeoutTimer);
      callTimeoutTimer = null;
    }

    if (callTimerInterval) {
      clearInterval(callTimerInterval);
      callTimerInterval = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (el.remoteAudio) el.remoteAudio.srcObject = null;
    if (el.remoteVideo) el.remoteVideo.srcObject = null;
    if (el.localVideo) el.localVideo.srcObject = null;

    if (typeof closeModal === 'function') closeModal('incomingCallModal');
    const incomingModal = document.getElementById('incomingCallModal');
    if (incomingModal) incomingModal.classList.remove('active');

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLOSE_CALL_NOTIFICATION' });
    }

    callState = 'idle';
    activeCall = null;
    isMuted = false;
    isVideoEnabled = false;
    isScreenSharing = false;
    isMinimized = false;

    if (el.overlay) el.overlay.classList.remove('active', 'minimized', 'video-mode');
    if (el.videoContainer) el.videoContainer.style.display = 'none';
    if (el.audioCenter) el.audioCenter.style.display = 'flex';
    if (el.minimizedBadge) el.minimizedBadge.style.display = 'none';
    if (el.timer) el.timer.textContent = '00:00';
    if (el.status) el.status.textContent = 'Connecting...';
    document.getElementById('audioWaveVisualizer')?.classList.remove('active');

    document.getElementById('callMuteBtn')?.classList.remove('active');
    document.getElementById('callVideoBtn')?.classList.remove('active');
    document.getElementById('callScreenShareBtn')?.classList.remove('active');

    updateCallBanner();
  }

  // --- Call Duration Timer ---
  function startCallDurationTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callStartTime = Date.now();

    function update() {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const formatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

      if (el.timer) el.timer.textContent = formatted;
      if (el.minimizedTimer) el.minimizedTimer.textContent = formatted;
      updateCallBanner();
    }

    update();
    callTimerInterval = setInterval(update, 1000);
  }

  // --- View Mode Adjustment (Audio vs Video) ---
  function updateCallViewMode() {
    const hasVideo = isVideoEnabled || activeCall?.hasRemoteVideo || isScreenSharing;
    if (el.overlay) {
      el.overlay.classList.toggle('video-mode', hasVideo);
    }
    if (el.videoContainer) {
      el.videoContainer.style.display = hasVideo ? 'block' : 'none';
    }
    if (el.audioCenter) {
      el.audioCenter.style.display = hasVideo ? 'none' : 'flex';
    }
  }

  // --- Call Screen Controls ---
  function renderCallScreen(call, statusText) {
    if (!el.overlay) return;

    if (el.name) el.name.textContent = call.remoteUserName;
    if (el.status) el.status.textContent = statusText || 'Calling...';
    if (el.timer) el.timer.textContent = '00:00';

    if (el.avatar) {
      if (call.remoteUserAvatar) {
        el.avatar.innerHTML = `<img src="${call.remoteUserAvatar}" alt="Avatar">`;
      } else {
        el.avatar.textContent = (call.remoteUserName[0] || 'U').toUpperCase();
      }
    }

    el.overlay.classList.remove('minimized');
    el.overlay.classList.add('active');
    if (el.minimizedBadge) el.minimizedBadge.style.display = 'none';
  }

  function toggleMute() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    isMuted = !isMuted;
    audioTrack.enabled = !isMuted;

    const muteBtn = document.getElementById('callMuteBtn');
    const muteText = document.getElementById('callMuteText');

    if (muteBtn) {
      muteBtn.classList.toggle('active', isMuted);
      if (muteText) muteText.textContent = isMuted ? 'Unmute' : 'Mute';
    }

    if (activeCall && typeof socket !== 'undefined' && socket?.connected) {
      socket.emit('call:mode_changed', {
        toUserId: activeCall.remoteUserId,
        callId: activeCall.callId,
        isMuted
      });
    }
  }

  async function toggleVideo() {
    if (!peerConnection || !activeCall) return;

    try {
      if (!isVideoEnabled) {
        let videoStream;
        try {
          videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
          });
        } catch (e) {
          videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        const videoTrack = videoStream.getVideoTracks()[0];

        if (localStream) {
          localStream.addTrack(videoTrack);
        } else {
          localStream = videoStream;
        }

        let sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        } else {
          peerConnection.addTrack(videoTrack, localStream);
        }

        if (el.localVideo) {
          el.localVideo.srcObject = localStream;
          el.localVideo.play().catch(() => {});
        }

        isVideoEnabled = true;
      } else {
        const videoTrack = localStream?.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          localStream.removeTrack(videoTrack);
          let sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) await sender.replaceTrack(null);
        }
        if (el.localVideo) el.localVideo.srcObject = null;
        isVideoEnabled = false;
      }

      const videoBtn = document.getElementById('callVideoBtn');
      if (videoBtn) videoBtn.classList.toggle('active', isVideoEnabled);

      updateCallViewMode();

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);

      if (typeof socket !== 'undefined' && socket?.connected) {
        socket.emit('call:signal', {
          toUserId: activeCall.remoteUserId,
          callId: activeCall.callId,
          signal: { sdp: peerConnection.localDescription }
        });
        socket.emit('call:mode_changed', {
          toUserId: activeCall.remoteUserId,
          callId: activeCall.callId,
          isVideo: isVideoEnabled
        });
      }
    } catch (err) {
      console.error('Error toggling video:', err);
      if (typeof showToast === 'function') showToast('Camera access failed', 'error');
    }
  }


  async function toggleScreenShare() {
    if (!peerConnection || !activeCall) return;

    try {
      if (!isScreenSharing) {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });
        const screenTrack = screenStream.getVideoTracks()[0];

        let sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          peerConnection.addTrack(screenTrack, screenStream);
        }

        if (el.localVideo) {
          el.localVideo.srcObject = screenStream;
          el.localVideo.play().catch(() => {});
        }

        screenTrack.onended = () => {
          if (isScreenSharing) {
            toggleScreenShare();
          }
        };

        isScreenSharing = true;
        isVideoEnabled = true;
      } else {
        if (screenStream) {
          screenStream.getTracks().forEach(t => t.stop());
          screenStream = null;
        }

        const cameraTrack = localStream?.getVideoTracks()[0];
        let sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (cameraTrack && sender) {
          await sender.replaceTrack(cameraTrack);
          if (el.localVideo) {
            el.localVideo.srcObject = localStream;
            el.localVideo.play().catch(() => {});
          }
          isVideoEnabled = true;
        } else if (sender) {
          await sender.replaceTrack(null);
          if (el.localVideo) el.localVideo.srcObject = null;
          isVideoEnabled = false;
        }

        isScreenSharing = false;
      }

      const screenBtn = document.getElementById('callScreenShareBtn');
      if (screenBtn) screenBtn.classList.toggle('active', isScreenSharing);

      updateCallViewMode();

      // Renegotiate WebRTC offer so peer receives the screen video track
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);

      if (typeof socket !== 'undefined' && socket?.connected) {
        socket.emit('call:signal', {
          toUserId: activeCall.remoteUserId,
          callId: activeCall.callId,
          signal: { sdp: peerConnection.localDescription }
        });
        socket.emit('call:mode_changed', {
          toUserId: activeCall.remoteUserId,
          callId: activeCall.callId,
          isScreenShare: isScreenSharing,
          isVideo: isVideoEnabled
        });
      }
    } catch (err) {
      console.error('Screen sharing error:', err);
      if (err.name !== 'NotAllowedError') {
        if (typeof showToast === 'function') showToast('Screen share failed to start', 'error');
      }
    }
  }


  function toggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    if (el.remoteAudio) el.remoteAudio.volume = isSpeakerOn ? 1.0 : 0.4;
    if (el.remoteVideo) el.remoteVideo.volume = isSpeakerOn ? 1.0 : 0.4;
    const speakerBtn = document.getElementById('callSpeakerBtn');
    if (speakerBtn) speakerBtn.classList.toggle('active', !isSpeakerOn);
  }

  function toggleMinimize() {
    if (!el.overlay) return;
    isMinimized = !isMinimized;

    if (isMinimized) {
      el.overlay.classList.remove('active');
      if (el.minimizedBadge) {
        if (el.minimizedName) el.minimizedName.textContent = activeCall?.remoteUserName || 'Call';
        el.minimizedBadge.style.display = 'flex';
      }
      updateCallBanner();
    } else {
      maximizeCall();
    }
  }

  function maximizeCall() {
    isMinimized = false;
    if (el.minimizedBadge) el.minimizedBadge.style.display = 'none';
    if (el.overlay && activeCall) {
      el.overlay.classList.add('active');
    }
    updateCallBanner();
  }

  // --- Initialize when DOM is ready ---
  document.addEventListener('DOMContentLoaded', initUI);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initUI();
  }

  // --- Export Global Calling API ---
  window.SynchAudioCall = {
    startCall,
    startVideoCall,
    endCall,
    acceptIncomingCall,
    rejectIncomingCall,
    onIncomingCall,
    onCallInitiated,
    onCallAccepted,
    onCallRejected,
    onCallSignal,
    onCallModeChanged,
    onCallEnded,
    maximizeCall
  };

})();