(() => {
  const $ = id => document.getElementById(id);

  // ── DOM refs ──
  const dropZone      = $('dropZone');
  const fileInput     = $('fileInput');
  const previewWrapper = $('previewWrapper');
  const origPreview   = $('origPreview');
  const resizedPreview = $('resizedPreview');
  const origInfo      = $('origInfo');
  const resizedInfo   = $('resizedInfo');
  const widthInput    = $('widthInput');
  const heightInput   = $('heightInput');
  const lockBtn       = $('lockBtn');
  const qualitySlider = $('qualitySlider');
  const qualityVal    = $('qualityVal');
  const resizeBtn     = $('resizeBtn');
  const downloadBtn   = $('downloadBtn');
  const resetBtn      = $('resetBtn');
  const status        = $('status');
  const lockLabel     = document.querySelector('.lock-label');

  const curWidth      = $('curWidth');
  const curHeight     = $('curHeight');
  const curAspect     = $('curAspect');
  const curFileSize   = $('curFileSize');
  const curFormat     = $('curFormat');
  const desiredPixels = $('desiredPixels');
  const desiredScale  = $('desiredScale');
  const reductionBadge = $('reductionBadge');
  const reductionText  = $('reductionText');
  const targetSizeInput = $('targetSizeInput');
  const targetHint    = $('targetHint');

  // Crop DOM refs
  const cropSection   = $('cropSection');
  const cropCanvas    = $('cropCanvas');
  const cropCtx       = cropCanvas.getContext('2d');
  const cropInfoEl    = $('cropInfo');
  const applyCropBtn  = $('applyCropBtn');
  const skipCropBtn   = $('skipCropBtn');
  const resetCropBtn  = $('resetCropBtn');

  // ── App state ──
  let targetUnit       = 'KB';
  let originalImage    = null;
  let originalFileSize = 0;
  let originalFileType = '';
  let aspectLocked     = true;
  let aspectRatio      = 1;
  let outputFormat     = 'image/jpeg';
  let resizedBlob      = null;
  let originalFileName = 'image';
  let resizedPreviewUrl = null;
  let _origDataUrl     = '';

  // ── Crop state ──
  let cropScale       = 1;
  let cropX = 0, cropY = 0, cropW = 0, cropH = 0;
  let cropDragMode    = null;  // handle id | 'move' | 'new' | null
  let cropDragStart   = null;
  let cropDragOrigRect = null;
  let cropLockedRatio = null;  // null = free, number = W/H ratio
  let cropFixedSize   = null;  // { w, h } — fixed output size after crop (e.g. 56×56)

  const HANDLE_SIZE = 10;
  const MIN_CROP    = 20;

  // ── Helpers ──
  function formatFileSize(bytes) {
    if (bytes > 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

  function formatAspect(w, h) {
    const g = gcd(w, h);
    const rw = w / g, rh = h / g;
    if (rw <= 30 && rh <= 30) return `${rw}:${rh}`;
    return (w / h).toFixed(2) + ':1';
  }

  function formatPixels(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + ' MP';
    if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
    return n.toString();
  }

  function setStatus(msg, type = '') {
    status.textContent = msg;
    status.className = 'status' + (type ? ' ' + type : '');
  }

  // ── Desired stats (resize panel) ──
  function updateDesiredStats() {
    const w = parseInt(widthInput.value) || 0;
    const h = parseInt(heightInput.value) || 0;
    if (w > 0 && h > 0) {
      desiredPixels.textContent = formatPixels(w * h);
      if (originalImage) {
        const avg = ((w / originalImage.width + h / originalImage.height) / 2 * 100).toFixed(0);
        desiredScale.textContent = avg + '%';
        const ratio = (w * h) / (originalImage.width * originalImage.height);
        reductionBadge.style.display = 'inline-flex';
        if (ratio < 0.995) {
          reductionText.textContent = `↓ ${((1 - ratio) * 100).toFixed(0)}% fewer pixels`;
          reductionBadge.className = 'reduction-badge';
        } else if (ratio > 1.005) {
          reductionText.textContent = `↑ ${((ratio - 1) * 100).toFixed(0)}% more pixels`;
          reductionBadge.className = 'reduction-badge increase';
        } else {
          reductionText.textContent = 'Same size';
          reductionBadge.className = 'reduction-badge neutral';
        }
      }
    } else {
      desiredPixels.textContent = '—';
      desiredScale.textContent = '—';
      reductionBadge.style.display = 'none';
    }
  }

  // ── Drag & drop upload ──
  ['dragenter', 'dragover'].forEach(e =>
    dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.add('drag-over'); })
  );
  ['dragleave', 'drop'].forEach(e =>
    dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.remove('drag-over'); })
  );
  dropZone.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

  // ── File handling ──
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('Please select a valid image file.', 'error');
      return;
    }
    originalFileName = file.name.replace(/\.[^.]+$/, '');
    originalFileSize = file.size;
    originalFileType = file.type;

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        aspectRatio   = img.width / img.height;
        _origDataUrl  = e.target.result;

        // Show crop section, hide resize panel
        previewWrapper.classList.remove('visible');
        cropSection.style.display = 'block';
        // Wait a frame so the container has width
        requestAnimationFrame(() => requestAnimationFrame(initCrop));

        downloadBtn.style.display = 'none';
        resizeBtn.disabled = true;
        resizedBlob = null;
        setStatus('');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Transition: crop done → show resize section ──
  function showResizeSection(previewSrc, fixedSize = null) {
    origPreview.src = previewSrc;
    origInfo.textContent = `${originalImage.width} × ${originalImage.height}`;

    curWidth.innerHTML  = `${originalImage.width} <span class="stat-unit">px</span>`;
    curHeight.innerHTML = `${originalImage.height} <span class="stat-unit">px</span>`;
    curAspect.textContent   = formatAspect(originalImage.width, originalImage.height);
    curFileSize.textContent = formatFileSize(originalFileSize);

    const fmtMap = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/bmp': 'BMP' };
    curFormat.textContent = fmtMap[originalFileType] || originalFileType.split('/')[1]?.toUpperCase() || '—';

    widthInput.value  = fixedSize ? fixedSize.w : originalImage.width;
    heightInput.value = fixedSize ? fixedSize.h : originalImage.height;
    aspectRatio = originalImage.width / originalImage.height;
    updateDesiredStats();

    previewWrapper.classList.add('visible');
    resizedPreview.src    = '';
    resizedInfo.textContent = '—';
    downloadBtn.style.display = 'none';
    resizeBtn.disabled    = false;
    resizedBlob = null;
    setStatus('');

    // Scroll so the preview grid comes into view
    requestAnimationFrame(() => {
      previewWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ════════════════════════════════════════
  //  CROP MODULE
  // ════════════════════════════════════════

  function getCropHandles() {
    return [
      { id: 'nw', x: cropX,            y: cropY },
      { id: 'n',  x: cropX + cropW / 2, y: cropY },
      { id: 'ne', x: cropX + cropW,     y: cropY },
      { id: 'e',  x: cropX + cropW,     y: cropY + cropH / 2 },
      { id: 'se', x: cropX + cropW,     y: cropY + cropH },
      { id: 's',  x: cropX + cropW / 2, y: cropY + cropH },
      { id: 'sw', x: cropX,             y: cropY + cropH },
      { id: 'w',  x: cropX,             y: cropY + cropH / 2 },
    ];
  }

  const CURSORS = {
    nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
    e:  'e-resize',  se: 'se-resize', s: 's-resize',
    sw: 'sw-resize', w: 'w-resize',  move: 'move',
  };

  function hitHandle(px, py) {
    const hit = HANDLE_SIZE + 4;
    for (const h of getCropHandles()) {
      if (Math.abs(px - h.x) <= hit && Math.abs(py - h.y) <= hit) return h.id;
    }
    return null;
  }

  function inCropBody(px, py) {
    return px > cropX + HANDLE_SIZE && px < cropX + cropW - HANDLE_SIZE &&
           py > cropY + HANDLE_SIZE && py < cropY + cropH - HANDLE_SIZE;
  }

  function drawCrop() {
    const cw = cropCanvas.width, ch = cropCanvas.height;
    cropCtx.clearRect(0, 0, cw, ch);
    cropCtx.drawImage(originalImage, 0, 0, cw, ch);

    // 4-rect dark overlay around crop box
    cropCtx.fillStyle = 'rgba(0,0,0,0.62)';
    cropCtx.fillRect(0, 0, cw, cropY);                              // top
    cropCtx.fillRect(0, cropY + cropH, cw, ch - cropY - cropH);    // bottom
    cropCtx.fillRect(0, cropY, cropX, cropH);                       // left
    cropCtx.fillRect(cropX + cropW, cropY, cw - cropX - cropW, cropH); // right

    // Rule-of-thirds grid
    cropCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    cropCtx.lineWidth = 0.5;
    cropCtx.beginPath();
    for (let i = 1; i < 3; i++) {
      cropCtx.moveTo(cropX + cropW * i / 3, cropY);
      cropCtx.lineTo(cropX + cropW * i / 3, cropY + cropH);
      cropCtx.moveTo(cropX, cropY + cropH * i / 3);
      cropCtx.lineTo(cropX + cropW, cropY + cropH * i / 3);
    }
    cropCtx.stroke();

    // Crop border
    cropCtx.strokeStyle = '#c4f04d';
    cropCtx.lineWidth = 1.5;
    cropCtx.strokeRect(cropX, cropY, cropW, cropH);

    // Handles
    getCropHandles().forEach(h => {
      const hs = h.id.length === 2 ? HANDLE_SIZE : HANDLE_SIZE - 2; // corners bigger
      cropCtx.fillStyle = '#c4f04d';
      cropCtx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    });

    // Dimension label inside crop box
    const rw = Math.round(cropW / cropScale);
    const rh = Math.round(cropH / cropScale);
    cropInfoEl.textContent = `${rw} × ${rh} px`;
  }

  function initCrop() {
    const wrap = $('cropCanvasWrap');
    const maxW = wrap.clientWidth || 800;
    const maxH = 460;
    cropScale = Math.min(maxW / originalImage.width, maxH / originalImage.height, 1);

    cropCanvas.width  = Math.round(originalImage.width  * cropScale);
    cropCanvas.height = Math.round(originalImage.height * cropScale);

    // Default: select full image
    cropX = 0; cropY = 0;
    cropW = cropCanvas.width;
    cropH = cropCanvas.height;

    // Reset aspect ratio buttons
    document.querySelectorAll('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.crop-aspect-btn[data-ratio="free"]').classList.add('active');
    cropLockedRatio = null;

    drawCrop();
  }

  function getCanvasPos(e) {
    const rect = cropCanvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    const sx   = cropCanvas.width  / rect.width;
    const sy   = cropCanvas.height / rect.height;
    return {
      x: (src.clientX - rect.left) * sx,
      y: (src.clientY - rect.top)  * sy,
    };
  }

  function applyCropDrag(pos) {
    const dx = pos.x - cropDragStart.x;
    const dy = pos.y - cropDragStart.y;
    const o  = cropDragOrigRect;
    const cw = cropCanvas.width, ch = cropCanvas.height;

    if (cropDragMode === 'move') {
      cropX = Math.max(0, Math.min(cw - cropW, o.x + dx));
      cropY = Math.max(0, Math.min(ch - cropH, o.y + dy));

    } else if (cropDragMode === 'new') {
      const x1 = Math.max(0, Math.min(o.x, pos.x));
      const y1 = Math.max(0, Math.min(o.y, pos.y));
      const x2 = Math.min(cw, Math.max(o.x, pos.x));
      let   y2 = Math.min(ch, Math.max(o.y, pos.y));
      cropX = x1; cropY = y1; cropW = x2 - x1; cropH = y2 - y1;
      if (cropLockedRatio && cropW > 0) {
        cropH = Math.min(ch - cropY, cropW / cropLockedRatio);
      }

    } else {
      // Handle resize
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (cropDragMode.includes('w')) x1 = Math.max(0,  Math.min(x2 - MIN_CROP, o.x + dx));
      if (cropDragMode.includes('e')) x2 = Math.min(cw, Math.max(x1 + MIN_CROP, o.x + o.w + dx));
      if (cropDragMode.includes('n')) y1 = Math.max(0,  Math.min(y2 - MIN_CROP, o.y + dy));
      if (cropDragMode.includes('s')) y2 = Math.min(ch, Math.max(y1 + MIN_CROP, o.y + o.h + dy));

      if (cropLockedRatio) {
        const newW = x2 - x1;
        const newH = newW / cropLockedRatio;
        if (cropDragMode.includes('n')) y1 = Math.max(0,  y2 - newH);
        else                            y2 = Math.min(ch, y1 + newH);
      }
      cropX = x1; cropY = y1;
      cropW = Math.max(MIN_CROP, x2 - x1);
      cropH = Math.max(MIN_CROP, y2 - y1);
    }
    drawCrop();
  }

  // Mouse events
  cropCanvas.addEventListener('mousedown', e => {
    const pos    = getCanvasPos(e);
    const handle = hitHandle(pos.x, pos.y);
    cropDragMode = handle || (inCropBody(pos.x, pos.y) ? 'move' : 'new');
    if (cropDragMode === 'new') { cropX = pos.x; cropY = pos.y; cropW = 0; cropH = 0; }
    cropDragStart    = pos;
    cropDragOrigRect = { x: cropX, y: cropY, w: cropW, h: cropH };
    e.preventDefault();
  });

  cropCanvas.addEventListener('mousemove', e => {
    const pos = getCanvasPos(e);
    if (!cropDragMode) {
      const h = hitHandle(pos.x, pos.y);
      cropCanvas.style.cursor = h ? CURSORS[h] : inCropBody(pos.x, pos.y) ? 'move' : 'crosshair';
      return;
    }
    applyCropDrag(pos);
  });

  window.addEventListener('mouseup', () => {
    if (cropDragMode === 'new' && cropW < MIN_CROP && cropH < MIN_CROP) {
      // Tiny drag — reset to full
      cropX = 0; cropY = 0; cropW = cropCanvas.width; cropH = cropCanvas.height;
      drawCrop();
    }
    cropDragMode = null;
  });

  // Touch events
  cropCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const pos    = getCanvasPos(e);
    const handle = hitHandle(pos.x, pos.y);
    cropDragMode = handle || (inCropBody(pos.x, pos.y) ? 'move' : 'new');
    if (cropDragMode === 'new') { cropX = pos.x; cropY = pos.y; cropW = 0; cropH = 0; }
    cropDragStart    = pos;
    cropDragOrigRect = { x: cropX, y: cropY, w: cropW, h: cropH };
  }, { passive: false });

  cropCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    applyCropDrag(getCanvasPos(e));
  }, { passive: false });

  cropCanvas.addEventListener('touchend', () => { cropDragMode = null; });

  // Aspect ratio presets
  document.querySelectorAll('.crop-aspect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const r = btn.dataset.ratio;
      cropLockedRatio = r === 'free' ? null : parseFloat(r);
      cropFixedSize   = btn.dataset.fixedW
        ? { w: parseInt(btn.dataset.fixedW), h: parseInt(btn.dataset.fixedH) }
        : null;
      if (cropLockedRatio) {
        // Fit height to current width maintaining ratio
        const newH = cropW / cropLockedRatio;
        if (cropY + newH <= cropCanvas.height) {
          cropH = newH;
        } else {
          cropH = cropCanvas.height - cropY;
          cropW = Math.min(cropCanvas.width - cropX, cropH * cropLockedRatio);
        }
        drawCrop();
      }
    });
  });

  // Apply crop
  applyCropBtn.addEventListener('click', () => {
    if (cropW < 1 || cropH < 1) return;

    // Map display coords back to full-res image coords
    const rx = Math.round(cropX / cropScale);
    const ry = Math.round(cropY / cropScale);
    const rw = Math.max(1, Math.round(cropW / cropScale));
    const rh = Math.max(1, Math.round(cropH / cropScale));

    const tmp = document.createElement('canvas');
    tmp.width = rw; tmp.height = rh;
    tmp.getContext('2d').drawImage(originalImage, rx, ry, rw, rh, 0, 0, rw, rh);

    const croppedImg = new Image();
    croppedImg.onload = () => {
      originalImage = croppedImg;
      cropSection.style.display = 'none';
      showResizeSection(tmp.toDataURL(), cropFixedSize);
    };
    croppedImg.src = tmp.toDataURL();
  });

  // Skip crop
  skipCropBtn.addEventListener('click', () => {
    cropSection.style.display = 'none';
    showResizeSection(_origDataUrl);
  });

  // Reset crop selection
  resetCropBtn.addEventListener('click', () => {
    cropX = 0; cropY = 0; cropW = cropCanvas.width; cropH = cropCanvas.height;
    document.querySelectorAll('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.crop-aspect-btn[data-ratio="free"]').classList.add('active');
    cropLockedRatio = null;
    drawCrop();
  });

  // ════════════════════════════════════════
  //  RESIZE SECTION
  // ════════════════════════════════════════

  // Aspect ratio lock
  lockBtn.addEventListener('click', () => {
    aspectLocked = !aspectLocked;
    lockBtn.classList.toggle('unlocked', !aspectLocked);
    lockBtn.title = aspectLocked ? 'Lock aspect ratio' : 'Unlock aspect ratio';
    lockLabel.textContent = aspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked';
    lockBtn.innerHTML = aspectLocked
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>';
  });

  widthInput.addEventListener('input', () => {
    if (aspectLocked && originalImage) heightInput.value = Math.round(widthInput.value / aspectRatio);
    updateDesiredStats();
  });

  heightInput.addEventListener('input', () => {
    if (aspectLocked && originalImage) widthInput.value = Math.round(heightInput.value * aspectRatio);
    updateDesiredStats();
  });

  qualitySlider.addEventListener('input', () => { qualityVal.textContent = qualitySlider.value + '%'; });

  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      outputFormat = btn.dataset.fmt;
      updateTargetHint();
    });
  });

  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      targetUnit = btn.dataset.unit;
      updateTargetHint();
    });
  });

  targetSizeInput.addEventListener('input', updateTargetHint);

  function getTargetBytes() {
    const val = parseFloat(targetSizeInput.value);
    if (!val || val <= 0) return 0;
    return targetUnit === 'MB' ? val * 1048576 : val * 1024;
  }

  function updateTargetHint() {
    const targetBytes = getTargetBytes();
    if (!targetBytes || !originalImage) {
      targetHint.textContent = '';
      targetHint.className   = 'target-hint';
      return;
    }
    if (outputFormat === 'image/png') {
      targetHint.textContent = 'PNG is lossless — quality slider won\'t reduce size. Use JPEG or WebP for target file size.';
      targetHint.className   = 'target-hint warn';
      return;
    }
    if (targetBytes >= originalFileSize) {
      targetHint.textContent = `Target is larger than original (${formatFileSize(originalFileSize)}). Will use max quality.`;
      targetHint.className   = 'target-hint';
    } else {
      const reduction = ((1 - targetBytes / originalFileSize) * 100).toFixed(0);
      targetHint.textContent = `Target: ${formatFileSize(targetBytes)} — ${reduction}% smaller than original. Quality will auto-adjust.`;
      targetHint.className   = 'target-hint ok';
    }
  }

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!originalImage) return;
      if (btn.dataset.pct) {
        const pct = parseInt(btn.dataset.pct) / 100;
        widthInput.value  = Math.round(originalImage.width  * pct);
        heightInput.value = Math.round(originalImage.height * pct);
      } else {
        widthInput.value  = btn.dataset.w;
        heightInput.value = aspectLocked
          ? Math.round(btn.dataset.w / aspectRatio)
          : btn.dataset.h;
      }
      updateDesiredStats();
    });
  });

  // Pica (Lanczos3)
  const picaInstance = new pica({ features: ['js', 'wasm', 'ww'], idle: 4000 });

  async function highQualityResize(img, targetW, targetH) {
    const src = document.createElement('canvas');
    src.width = img.width; src.height = img.height;
    src.getContext('2d').drawImage(img, 0, 0);

    const dst = document.createElement('canvas');
    dst.width = targetW; dst.height = targetH;

    await picaInstance.resize(src, dst, {
      quality: 3, unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2
    });
    return dst;
  }

  resizeBtn.addEventListener('click', async () => {
    if (!originalImage) return;
    const w = parseInt(widthInput.value);
    const h = parseInt(heightInput.value);

    if (!w || !h || w < 1 || h < 1) { setStatus('Enter valid dimensions.', 'error'); return; }
    if (w > 10000 || h > 10000)      { setStatus('Max dimension is 10,000px.', 'error'); return; }

    const targetBytes = getTargetBytes();
    const hasTarget   = targetBytes > 0 && outputFormat !== 'image/png';

    setStatus(hasTarget ? 'Resizing & optimizing to target file size...' : 'Resizing with Lanczos3...');
    resizeBtn.disabled = true;

    try {
      const canvas = await highQualityResize(originalImage, w, h);

      if (hasTarget) {
        let lo = 0.01, hi = 1.0, bestBlob = null, bestQuality = 1.0;
        for (let i = 0; i < 12; i++) {
          const mid  = (lo + hi) / 2;
          const blob = await picaInstance.toBlob(canvas, outputFormat, mid);
          if (blob.size <= targetBytes) { bestBlob = blob; bestQuality = mid; lo = mid; }
          else hi = mid;
          if (bestBlob && Math.abs(bestBlob.size - targetBytes) / targetBytes < 0.03) break;
        }
        if (!bestBlob) { bestBlob = await picaInstance.toBlob(canvas, outputFormat, 0.01); bestQuality = 0.01; }

        resizedBlob = bestBlob;
        if (resizedPreviewUrl) URL.revokeObjectURL(resizedPreviewUrl);
        resizedPreviewUrl = URL.createObjectURL(bestBlob);
        resizedPreview.src = resizedPreviewUrl;
        resizedInfo.textContent = `${w} × ${h} · ${formatFileSize(bestBlob.size)}`;

        const qPct = Math.round(bestQuality * 100);
        qualitySlider.value = qPct; qualityVal.textContent = qPct + '%';
        downloadBtn.style.display = 'inline-flex';
        resizeBtn.disabled = false;

        setStatus(
          bestBlob.size / targetBytes > 1.1
            ? `Done! Closest achievable: ${formatFileSize(bestBlob.size)} (target was ${formatFileSize(targetBytes)}). Min quality reached.`
            : `Done via Lanczos3! Size: ${formatFileSize(bestBlob.size)} (target: ${formatFileSize(targetBytes)}, quality: ${qPct}%)`,
          'success'
        );

      } else {
        const blob = await picaInstance.toBlob(canvas, outputFormat, qualitySlider.value / 100);
        resizedBlob = blob;
        if (resizedPreviewUrl) URL.revokeObjectURL(resizedPreviewUrl);
        resizedPreviewUrl = URL.createObjectURL(blob);
        resizedPreview.src = resizedPreviewUrl;
        resizedInfo.textContent = `${w} × ${h} · ${formatFileSize(blob.size)}`;
        downloadBtn.style.display = 'inline-flex';
        resizeBtn.disabled = false;
        setStatus('Done! Resized with Lanczos3 resampling.', 'success');
      }
    } catch (err) {
      setStatus('Error resizing image: ' + err.message, 'error');
      resizeBtn.disabled = false;
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!resizedBlob) return;
    const ext = outputFormat === 'image/png' ? 'png' : outputFormat === 'image/webp' ? 'webp' : 'jpg';
    const a   = document.createElement('a');
    const url = URL.createObjectURL(resizedBlob);
    a.href = url; a.download = `${originalFileName}_resized.${ext}`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  });

  resetBtn.addEventListener('click', () => {
    originalImage = null; resizedBlob = null; _origDataUrl = '';
    if (resizedPreviewUrl) { URL.revokeObjectURL(resizedPreviewUrl); resizedPreviewUrl = null; }

    origPreview.src = ''; resizedPreview.src = '';
    origInfo.textContent = '—'; resizedInfo.textContent = '—';
    widthInput.value = ''; heightInput.value = '';
    targetSizeInput.value = ''; targetHint.textContent = ''; targetHint.className = 'target-hint';
    curWidth.textContent = '—'; curHeight.textContent = '—';
    curAspect.textContent = '—'; curFileSize.textContent = '—'; curFormat.textContent = '—';
    desiredPixels.textContent = '—'; desiredScale.textContent = '—';
    reductionBadge.style.display = 'none';

    cropSection.style.display = 'none';
    previewWrapper.classList.remove('visible');
    downloadBtn.style.display = 'none';
    resizeBtn.disabled = true;
    fileInput.value = '';
    setStatus('');
  });
})();
