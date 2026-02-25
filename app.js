/* ========================================
   Timestamp Camera PWA — App Logic
   ======================================== */

(function () {
  'use strict';

  // ---- DOM Elements ----
  const video = document.getElementById('video');
  const captureBtn = document.getElementById('captureBtn');
  const flipBtn = document.getElementById('flipBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsSheet = document.getElementById('settingsSheet');
  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const timestampToggle = document.getElementById('timestampToggle');
  const timeMode = document.getElementById('timeMode');
  const customTimeRow = document.getElementById('customTimeRow');
  const customTimeInput = document.getElementById('customTime');
  const timestampOverlay = document.getElementById('timestampOverlay');
  const captureCanvas = document.getElementById('captureCanvas');
  const previewOverlay = document.getElementById('previewOverlay');
  const previewImg = document.getElementById('previewImg');
  const previewCloseBtn = document.getElementById('previewCloseBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const shareBtn = document.getElementById('shareBtn');

  // ---- State ----
  let facingMode = 'environment'; // 'environment' = rear, 'user' = front
  let currentStream = null;
  let timestampEnabled = true;
  let timestampMode = 'current'; // 'current' | 'custom'
  let customDateTime = '';
  let capturedBlob = null;
  let overlayInterval = null;

  // ---- Initialize ----
  init();

  function init() {
    // Set default custom time to now (for the picker)
    const now = new Date();
    customTimeInput.value = toLocalISOString(now);

    // Load saved settings
    loadSettings();

    // Start camera
    startCamera();

    // Start live overlay
    startOverlayTimer();

    // Show share button if supported
    if (navigator.share) {
      shareBtn.style.display = 'inline-flex';
    }

    // Bind events
    captureBtn.addEventListener('click', capturePhoto);
    flipBtn.addEventListener('click', flipCamera);
    settingsBtn.addEventListener('click', openSettings);
    sheetBackdrop.addEventListener('click', closeSettings);
    settingsCloseBtn.addEventListener('click', closeSettings);
    previewCloseBtn.addEventListener('click', closePreview);
    downloadBtn.addEventListener('click', downloadPhoto);
    shareBtn.addEventListener('click', sharePhoto);

    timestampToggle.addEventListener('change', () => {
      timestampEnabled = timestampToggle.checked;
      saveSettings();
      updateOverlay();
    });

    timeMode.addEventListener('change', () => {
      timestampMode = timeMode.value;
      customTimeRow.classList.toggle('hidden', timestampMode !== 'custom');
      saveSettings();
      updateOverlay();
    });

    customTimeInput.addEventListener('input', () => {
      customDateTime = customTimeInput.value;
      saveSettings();
      updateOverlay();
    });

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ---- Camera ----
  async function startCamera() {
    // Stop previous stream
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
    }

    // Hide any previous error / start-camera prompt
    hideCameraOverlay();

    try {
      // Check if camera API is available at all
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showCameraOverlay(
          'Camera not available',
          'Your browser does not support camera access. Make sure you are using HTTPS or localhost.',
          null
        );
        return;
      }

      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = currentStream;

      // iOS Safari needs explicit play after user gesture
      video.play().catch(() => {});
    } catch (err) {
      console.error('Camera error:', err);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showCameraOverlay(
          'Camera access denied',
          'Please allow camera access in your browser settings, then tap below to retry.',
          'Grant Camera Access'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showCameraOverlay(
          'No camera found',
          'No camera was detected on this device.',
          'Try Again'
        );
      } else {
        showCameraOverlay(
          'Camera error',
          'Unable to start the camera. Tap below to try again.',
          'Start Camera'
        );
      }
    }
  }

  function flipCamera() {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera();
  }

  function showCameraOverlay(title, message, buttonText) {
    let overlay = document.getElementById('cameraOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cameraOverlay';
      overlay.style.cssText =
        'position:absolute;inset:0;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;z-index:15;' +
        'background:rgba(0,0,0,0.85);padding:32px;text-align:center;';
      document.getElementById('viewfinder').appendChild(overlay);
    }

    const iconSvg = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
      '<circle cx="12" cy="13" r="4"/></svg>';

    let html = iconSvg +
      '<h2 style="color:#f0f0f0;font-size:18px;margin:16px 0 8px;">' + title + '</h2>' +
      '<p style="color:#a0a0b8;font-size:14px;line-height:1.5;max-width:280px;margin:0 0 24px;">' + message + '</p>';

    if (buttonText) {
      html += '<button id="cameraRetryBtn" style="' +
        'display:inline-flex;align-items:center;gap:8px;padding:14px 32px;' +
        'border:none;border-radius:12px;background:#6c63ff;color:#fff;' +
        'font-size:16px;font-weight:600;cursor:pointer;' +
        '-webkit-tap-highlight-color:transparent;">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
        '<circle cx="12" cy="13" r="4"/></svg>' +
        buttonText + '</button>';
    }

    overlay.innerHTML = html;

    const retryBtn = document.getElementById('cameraRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        startCamera();
      });
    }
  }

  function hideCameraOverlay() {
    const overlay = document.getElementById('cameraOverlay');
    if (overlay) {
      overlay.remove();
    }
  }

  // ---- Timestamp ----
  function getTimestampText() {
    if (!timestampEnabled) return '';

    if (timestampMode === 'custom' && customDateTime) {
      const d = new Date(customDateTime);
      return formatDateTime(d);
    }

    return formatDateTime(new Date());
  }

  function formatDateTime(d) {
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  function toLocalISOString(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function updateOverlay() {
    const text = getTimestampText();
    timestampOverlay.textContent = text;
    timestampOverlay.style.display = text ? 'block' : 'none';
  }

  function startOverlayTimer() {
    updateOverlay();
    overlayInterval = setInterval(updateOverlay, 1000);
  }

  // ---- Capture ----
  function capturePhoto() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) return; // video not ready

    // Detect orientation mismatch: phone is portrait but video stream is landscape.
    // The camera sensor natively outputs landscape frames; when held portrait we
    // need to rotate the captured frame 90° so the saved image is portrait.
    const isPortrait = window.innerHeight > window.innerWidth;
    const videoIsLandscape = vw > vh;
    const needsRotation = isPortrait && videoIsLandscape;

    const canvasW = needsRotation ? vh : vw;
    const canvasH = needsRotation ? vw : vh;

    captureCanvas.width = canvasW;
    captureCanvas.height = canvasH;

    const ctx = captureCanvas.getContext('2d');
    ctx.save();

    if (needsRotation) {
      // Rotate 90° clockwise so the landscape frame becomes portrait
      ctx.translate(canvasW, 0);
      ctx.rotate(Math.PI / 2);
    }

    // If front camera, mirror the image
    if (facingMode === 'user') {
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    // Draw timestamp on the properly-oriented canvas
    const text = getTimestampText();
    if (text) {
      const fontSize = Math.max(Math.round(canvasW * 0.028), 16);
      ctx.font = `bold ${fontSize}px 'Courier New', Courier, monospace`;
      ctx.fillStyle = '#ffa726';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';

      const padding = Math.round(canvasW * 0.025);
      ctx.fillText(text, canvasW - padding, canvasH - padding);
    }

    // Export as JPEG blob
    captureCanvas.toBlob((blob) => {
      if (!blob) return;
      capturedBlob = blob;
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      previewOverlay.classList.remove('hidden');
    }, 'image/jpeg', 0.92);
  }

  // ---- Preview ----
  function closePreview() {
    previewOverlay.classList.add('hidden');
    if (previewImg.src) {
      URL.revokeObjectURL(previewImg.src);
      previewImg.src = '';
    }
    capturedBlob = null;
  }

  // ---- Download ----
  function downloadPhoto() {
    if (!capturedBlob) return;

    const url = URL.createObjectURL(capturedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- Share ----
  async function sharePhoto() {
    if (!capturedBlob || !navigator.share) return;

    const file = new File([capturedBlob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });

    try {
      await navigator.share({
        title: 'Timestamp Camera Photo',
        files: [file]
      });
    } catch (err) {
      // User cancelled or share failed — ignore
      if (err.name !== 'AbortError') {
        console.error('Share error:', err);
      }
    }
  }

  // ---- Settings Sheet ----
  function openSettings() {
    settingsSheet.classList.remove('hidden');
  }

  function closeSettings() {
    settingsSheet.classList.add('hidden');
  }

  // ---- Persist Settings ----
  function saveSettings() {
    try {
      const data = {
        timestampEnabled,
        timestampMode,
        customDateTime: customTimeInput.value
      };
      localStorage.setItem('tsCamera_settings', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem('tsCamera_settings');
      if (!raw) return;
      const data = JSON.parse(raw);

      if (typeof data.timestampEnabled === 'boolean') {
        timestampEnabled = data.timestampEnabled;
        timestampToggle.checked = timestampEnabled;
      }
      if (data.timestampMode === 'current' || data.timestampMode === 'custom') {
        timestampMode = data.timestampMode;
        timeMode.value = timestampMode;
        customTimeRow.classList.toggle('hidden', timestampMode !== 'custom');
      }
      if (data.customDateTime) {
        customDateTime = data.customDateTime;
        customTimeInput.value = customDateTime;
      }
    } catch (e) { /* ignore */ }
  }
})();
