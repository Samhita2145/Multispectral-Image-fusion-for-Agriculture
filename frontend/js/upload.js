/**
 * Image Analysis page
 * - Drag & drop / browse upload
 * - Generates Original / RGB / Pseudo-NIR / Fusion previews on <canvas>
 *   using simple, deterministic pixel-math (no real spectral sensor data —
 *   this is a frontend-only simulation clearly using the uploaded photo).
 * - Runs a simulated "analysis" with a loading state and dummy prediction.
 */

const DISEASE_CLASSES = [
  {
    name: 'Healthy Rice Leaf',
    severity: 'none',
    severityPct: 6,
    treatment: 'No treatment required. Continue routine monitoring and maintain current irrigation and fertilization schedule.'
  },
  {
    name: 'Bacterial Leaf Blight',
    severity: 'high',
    severityPct: 82,
    treatment: 'Apply copper-based bactericide, improve field drainage, and avoid excess nitrogen fertilizer. Remove and destroy infected leaves.'
  },
  {
    name: 'Brown Spot',
    severity: 'moderate',
    severityPct: 55,
    treatment: 'Apply a recommended fungicide (e.g. mancozeb-based), ensure balanced potassium levels, and use certified disease-free seed.'
  },
  {
    name: 'Leaf Blast',
    severity: 'high',
    severityPct: 78,
    treatment: 'Apply tricyclazole-based fungicide at early stage, reduce nitrogen dosage, and maintain shallow standing water in the field.'
  },
  {
    name: 'Leaf Scald',
    severity: 'moderate',
    severityPct: 48,
    treatment: 'Improve field ventilation by adjusting plant spacing, avoid leaf injury during handling, and apply fungicide if spread continues.'
  },
  {
    name: 'Sheath Blight',
    severity: 'moderate',
    severityPct: 61,
    treatment: 'Apply validamycin or hexaconazole fungicide, reduce plant density, and manage nitrogen application to reduce canopy humidity.'
  }
];

let uploadedImage = null;
let lastPrediction = null;

document.addEventListener('DOMContentLoaded', () => {
  initDropzone();
  initButtons();
});

function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  dropzone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    toast('Please upload a valid image file', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      renderPreviews(img);
      document.getElementById('analyseBtn').disabled = false;
      toast('Image uploaded successfully', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderPreviews(img) {
  drawTile('tile-original', img, 'Original', (ctx, w, h) => {
    ctx.drawImage(img, 0, 0, w, h);
  });

  drawTile('tile-rgb', img, 'RGB Image', (ctx, w, h) => {
    ctx.drawImage(img, 0, 0, w, h);
    ctx.fillStyle = 'rgba(76,175,80,0.06)';
    ctx.fillRect(0, 0, w, h);
  });

  drawTile('tile-nir', img, 'Pseudo NIR', (ctx, w, h) => {
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      // False-color NIR simulation: healthy vegetation (high green)
      // is remapped toward red/pink, as in real NIR false-color photography.
      px[i] = Math.min(255, g * 1.35 + 20);
      px[i + 1] = Math.min(255, r * 0.6);
      px[i + 2] = Math.min(255, 255 - b * 0.7);
    }
    ctx.putImageData(data, 0, 0);
  });

  drawTile('tile-fusion', img, 'Fused', (ctx, w, h) => {
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const nirR = Math.min(255, g * 1.35 + 20);
      const nirG = Math.min(255, r * 0.6);
      const nirB = Math.min(255, 255 - b * 0.7);
      px[i] = r * 0.5 + nirR * 0.5;
      px[i + 1] = g * 0.5 + nirG * 0.5;
      px[i + 2] = b * 0.5 + nirB * 0.5;
    }
    ctx.putImageData(data, 0, 0);
  });
}

function drawTile(tileId, img, label, drawFn) {
  const tile = document.getElementById(tileId);
  tile.innerHTML = '';

  const size = 400;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Cover-fit draw
  const scale = Math.max(size / img.width, size / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.translate((size - dw) / 2, (size - dh) / 2);
  const scaledImg = { width: dw, height: dh };
  ctx.drawImage(img, 0, 0, dw, dh);
  ctx.restore();

  drawFn(ctx, size, size);

  tile.appendChild(canvas);
  const labelEl = document.createElement('div');
  labelEl.className = 'preview-tile__label';
  labelEl.textContent = label;
  tile.appendChild(labelEl);
}

function initButtons() {
  document.getElementById('analyseBtn').addEventListener('click', runAnalysis);
  document.getElementById('resetBtn').addEventListener('click', resetPage);
  document.getElementById('downloadReportBtn').addEventListener('click', downloadReport);
}

function runAnalysis() {
  if (!uploadedImage) return;

  const btn = document.getElementById('analyseBtn');
  const btnText = document.getElementById('analyseBtnText');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Analysing…';

  document.getElementById('predictionEmpty').style.display = 'none';
  document.getElementById('predictionResult').style.display = 'none';
  document.getElementById('predictionLoading').style.display = 'block';

  setTimeout(() => {
    const prediction = DISEASE_CLASSES[Math.floor(Math.random() * DISEASE_CLASSES.length)];
    const confidence = (82 + Math.random() * 16).toFixed(1);
    lastPrediction = { ...prediction, confidence, date: new Date().toLocaleString() };

    document.getElementById('predictionLoading').style.display = 'none';
    document.getElementById('predictionResult').style.display = 'block';

    document.getElementById('diseaseName').textContent = prediction.name;
    document.getElementById('treatmentText').textContent = prediction.treatment;

    const severityBadge = document.getElementById('severityBadge');
    const severityMap = {
      none: ['badge-soft--green', 'Healthy'],
      moderate: ['badge-soft--amber', 'Moderate'],
      high: ['badge-soft--red', 'Severe']
    };
    const [cls, labelText] = severityMap[prediction.severity];
    severityBadge.className = `badge-soft ${cls}`;
    severityBadge.textContent = labelText;

    document.getElementById('severityMarker').style.left = prediction.severityPct + '%';

    const circumference = 351.9;
    const offset = circumference - (confidence / 100) * circumference;
    document.getElementById('confidenceRing').style.strokeDashoffset = offset;
    document.getElementById('confidenceNumber').textContent = confidence + '%';

    btn.disabled = false;
    btnText.textContent = 'Re-analyse';

    toast(`Prediction complete: ${prediction.name}`, 'success');
  }, 1600);
}

function resetPage() {
  uploadedImage = null;
  lastPrediction = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('tile-original').innerHTML = '<div class="preview-tile__empty">Original will appear here</div>';
  document.getElementById('tile-rgb').innerHTML = '<div class="preview-tile__empty">RGB channel</div>';
  document.getElementById('tile-nir').innerHTML = '<div class="preview-tile__empty">Pseudo NIR</div>';
  document.getElementById('tile-fusion').innerHTML = '<div class="preview-tile__empty">Fused image</div>';

  document.getElementById('analyseBtn').disabled = true;
  document.getElementById('analyseBtnText').textContent = 'Analyse Image';
  document.getElementById('predictionEmpty').style.display = 'block';
  document.getElementById('predictionResult').style.display = 'none';
  document.getElementById('predictionLoading').style.display = 'none';

  toast('Workspace reset', 'success');
}

function downloadReport() {
  if (!lastPrediction) return;

  const content = `MULTISPECTRAL IMAGE FUSION FOR AGRICULTURE
Disease Analysis Report
--------------------------------------------
Date: ${lastPrediction.date}
Predicted Disease: ${lastPrediction.name}
Confidence: ${lastPrediction.confidence}%
Severity: ${lastPrediction.severity.toUpperCase()}

Suggested Treatment:
${lastPrediction.treatment}

--------------------------------------------
Generated by Multispectral Image Fusion for Agriculture (Demo)
`;

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analysis-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  toast('Report downloaded', 'success');
}
