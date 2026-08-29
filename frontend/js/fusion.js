/**
 * Image Fusion page — interactive before/after compare slider,
 * opacity + zoom controls, per-layer tabs, and a downloadable
 * fused image generated on <canvas> (same pixel-math approach
 * as the Image Analysis page, applied consistently here too).
 */

let fusionSourceImg = null;
let fusedDataUrl = null;
let nirDataUrl = null;
let rgbDataUrl = null;
let currentZoom = 100;

document.addEventListener('DOMContentLoaded', () => {
  loadImageIntoFusion('assets/farm.png');
  initCompareSlider();
  initControls();
  initTabs();
  initUpload();

  document.getElementById('downloadFusionBtn').addEventListener('click', downloadFusedImage);
});

function initUpload() {
  const btn = document.getElementById('fusionUploadBtn');
  const input = document.getElementById('fusionFileInput');
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadImageIntoFusion(ev.target.result);
    reader.readAsDataURL(file);
  });
}

function loadImageIntoFusion(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    fusionSourceImg = img;
    generateLayers(img);
    applyBackgrounds();
    toast('Fusion preview updated', 'success');
  };
  img.src = src;
}

function generateLayers(img) {
  const size = 900;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size * (img.height / img.width);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  rgbDataUrl = canvas.toDataURL('image/jpeg', 0.9);

  const nirCanvas = document.createElement('canvas');
  nirCanvas.width = canvas.width;
  nirCanvas.height = canvas.height;
  const nirCtx = nirCanvas.getContext('2d');
  nirCtx.drawImage(canvas, 0, 0);
  const nirData = nirCtx.getImageData(0, 0, nirCanvas.width, nirCanvas.height);
  const npx = nirData.data;
  for (let i = 0; i < npx.length; i += 4) {
    const r = npx[i], g = npx[i + 1], b = npx[i + 2];
    npx[i] = Math.min(255, g * 1.35 + 20);
    npx[i + 1] = Math.min(255, r * 0.6);
    npx[i + 2] = Math.min(255, 255 - b * 0.7);
  }
  nirCtx.putImageData(nirData, 0, 0);
  nirDataUrl = nirCanvas.toDataURL('image/jpeg', 0.9);

  const fusedCanvas = document.createElement('canvas');
  fusedCanvas.width = canvas.width;
  fusedCanvas.height = canvas.height;
  const fusedCtx = fusedCanvas.getContext('2d');
  fusedCtx.drawImage(canvas, 0, 0);
  const fusedData = fusedCtx.getImageData(0, 0, fusedCanvas.width, fusedCanvas.height);
  const fpx = fusedData.data;
  for (let i = 0; i < fpx.length; i += 4) {
    const r = fpx[i], g = fpx[i + 1], b = fpx[i + 2];
    const nirR = Math.min(255, g * 1.35 + 20);
    const nirG = Math.min(255, r * 0.6);
    const nirB = Math.min(255, 255 - b * 0.7);
    fpx[i] = r * 0.5 + nirR * 0.5;
    fpx[i + 1] = g * 0.5 + nirG * 0.5;
    fpx[i + 2] = b * 0.5 + nirB * 0.5;
  }
  fusedCtx.putImageData(fusedData, 0, 0);
  fusedDataUrl = fusedCanvas.toDataURL('image/png');
}

function applyBackgrounds() {
  document.getElementById('fusionBefore').style.backgroundImage = `url(${rgbDataUrl})`;
  document.getElementById('fusionAfter').style.backgroundImage = `url(${fusedDataUrl})`;
  updateZoom();
  updateOpacity();
  updateActiveTabPreview();
}

/* ---------------------------------------------------------
   Compare slider (drag handle left/right)
--------------------------------------------------------- */
function initCompareSlider() {
  const compare = document.getElementById('fusionCompare');
  const before = document.getElementById('fusionBefore');
  const handle = document.getElementById('fusionHandle');
  const rangeInput = document.getElementById('comparePosition');

  function setPosition(pct) {
    pct = Math.max(0, Math.min(100, pct));
    before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    handle.style.left = pct + '%';
    rangeInput.value = pct;
  }

  let dragging = false;
  compare.addEventListener('mousedown', (e) => { dragging = true; updateFromEvent(e); });
  window.addEventListener('mousemove', (e) => { if (dragging) updateFromEvent(e); });
  window.addEventListener('mouseup', () => { dragging = false; });

  compare.addEventListener('touchstart', (e) => { dragging = true; updateFromEvent(e.touches[0]); });
  window.addEventListener('touchmove', (e) => { if (dragging) updateFromEvent(e.touches[0]); });
  window.addEventListener('touchend', () => { dragging = false; });

  function updateFromEvent(e) {
    const rect = compare.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setPosition(pct);
  }

  rangeInput.addEventListener('input', () => setPosition(parseFloat(rangeInput.value)));
  setPosition(50);
}

/* ---------------------------------------------------------
   Opacity + zoom
--------------------------------------------------------- */
function initControls() {
  document.getElementById('fusionOpacity').addEventListener('input', updateOpacity);
  document.getElementById('fusionZoom').addEventListener('input', updateZoom);
}

function updateOpacity() {
  const val = document.getElementById('fusionOpacity').value;
  document.getElementById('fusionAfter').style.opacity = val / 100;
}

function updateZoom() {
  currentZoom = document.getElementById('fusionZoom').value;
  ['fusionAfter', 'fusionBefore'].forEach((id) => {
    document.getElementById(id).style.backgroundSize = currentZoom + '%';
  });
}

/* ---------------------------------------------------------
   Layer tabs (RGB / Pseudo NIR / Fused)
--------------------------------------------------------- */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      updateActiveTabPreview();
    });
  });
}

function updateActiveTabPreview() {
  const activeTab = document.querySelector('.tab-btn.is-active');
  if (!activeTab) return;
  const tab = activeTab.getAttribute('data-tab');
  const map = { rgb: rgbDataUrl, nir: nirDataUrl, fused: fusedDataUrl };
  const src = map[tab];
  const preview = document.getElementById('fusionTabPreview');
  if (src) {
    preview.innerHTML = `<img src="${src}" alt="${tab} layer">`;
  }
}

/* ---------------------------------------------------------
   Download
--------------------------------------------------------- */
function downloadFusedImage() {
  if (!fusedDataUrl) { toast('Upload an image first', 'error'); return; }
  const a = document.createElement('a');
  a.href = fusedDataUrl;
  a.download = `fused-image-${Date.now()}.png`;
  a.click();
  toast('Fused image downloaded', 'success');
}
