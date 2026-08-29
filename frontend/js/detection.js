/**
 * Disease Detection page — upload -> REAL diagnosis via the FastAPI
 * backend (js/api.js -> POST /api/predict), which runs the trained
 * scikit-learn Gradient Boosting model server-side
 * (feature_fusion_gb_model.joblib when a Pseudo-NIR image is also
 * supplied, otherwise feature_rgb_only_gb_model.joblib). The predicted
 * class, confidence, and NDVI (when available) all come straight from
 * that real model; symptoms/treatment/prevention copy below is curated
 * reference text keyed to the returned class name.
 * "Nearby similar cases" remains simulated (no location data exists in
 * this project).
 */

// Curated reference info per class. The actual predicted class +
// confidence always come from the backend (real model output).
const DETECTION_DATA = [
  {
    name: 'Healthy Rice Leaf', severity: 'none', severityPct: 5, badge: ['badge-soft--green', 'Healthy'],
    symptoms: 'No visible lesions, discoloration, or spotting. Leaf blade is uniformly green with normal texture and structure.',
    treatment: 'No treatment necessary. Continue standard crop monitoring.',
    prevention: 'Maintain balanced fertilization, proper spacing, and routine field inspection to catch early symptoms.'
  },
  {
    name: 'Bacterial Leaf Blight', severity: 'high', severityPct: 85, badge: ['badge-soft--red', 'Severe'],
    symptoms: 'Water-soaked lesions starting at leaf tips/margins, turning yellow-to-white and drying out, often with a wavy margin.',
    treatment: 'Apply copper oxychloride or streptocycline-based bactericide. Remove and destroy severely infected leaves.',
    prevention: 'Use resistant varieties, avoid excess nitrogen, ensure proper field drainage, and use disease-free seed.'
  },
  {
    name: 'Brown Spot', severity: 'moderate', severityPct: 58, badge: ['badge-soft--amber', 'Moderate'],
    symptoms: 'Small circular to oval brown spots with a gray/white center scattered across the leaf blade.',
    treatment: 'Apply mancozeb or propiconazole-based fungicide at recommended intervals.',
    prevention: 'Ensure balanced potassium and silicon nutrition; use certified seed treated with fungicide.'
  },
  {
    name: 'Leaf Blast', severity: 'high', severityPct: 80, badge: ['badge-soft--red', 'Severe'],
    symptoms: 'Diamond/spindle-shaped lesions with gray centers and brown margins, often coalescing to blight entire leaves.',
    treatment: 'Apply tricyclazole or isoprothiolane fungicide at first sign of lesions.',
    prevention: 'Avoid excess nitrogen, maintain shallow standing water, and use blast-resistant varieties where available.'
  },
  {
    name: 'Leaf scald', severity: 'moderate', severityPct: 50, badge: ['badge-soft--amber', 'Moderate'],
    symptoms: 'Alternating light-tan and reddish-brown bands running parallel to leaf veins, starting from leaf tips.',
    treatment: 'Apply fungicide if the infection spreads rapidly; otherwise cultural control is often sufficient.',
    prevention: 'Improve airflow via proper spacing, avoid leaf injury during handling, remove crop debris after harvest.'
  },
  {
    name: 'Sheath Blight', severity: 'moderate', severityPct: 63, badge: ['badge-soft--amber', 'Moderate'],
    symptoms: 'Oval, greenish-gray lesions on the leaf sheath near the waterline, expanding upward with irregular borders.',
    treatment: 'Apply validamycin or hexaconazole fungicide; drain field temporarily to reduce humidity around the canopy.',
    prevention: 'Reduce plant density, manage nitrogen levels, and rotate crops to reduce fungal inoculum in soil.'
  }
];

let ddRgbFile = null;
let lastDdPrediction = null;

function findDetectionEntry(className) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return DETECTION_DATA.find((d) => norm(d.name) === norm(className)) || {
    name: className, severity: 'moderate', severityPct: 50, badge: ['badge-soft--amber', 'Moderate'],
    symptoms: 'Not enough reference data for this class yet.',
    treatment: 'Consult a local agronomist to confirm this diagnosis.',
    prevention: 'Maintain routine field monitoring.'
  };
}

document.addEventListener('DOMContentLoaded', () => {
  initDDDropzone();
  initAccordion();
  document.getElementById('ddDownloadReportBtn').addEventListener('click', downloadDdReport);
});

function initDDDropzone() {
  const dropzone = document.getElementById('ddDropzone');
  const fileInput = document.getElementById('ddFileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  ['dragenter', 'dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('is-dragover'); }));
  dropzone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleDDFile(f); });
  fileInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleDDFile(f); });
}

function handleDDFile(file) {
  if (!file.type.startsWith('image/')) { toast('Please upload a valid image file', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('Image is larger than 10MB — please upload a smaller file', 'error'); return; }

  ddRgbFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const tile = document.getElementById('ddPreviewTile');
    tile.innerHTML = `<img src="${e.target.result}" alt="Uploaded leaf">`;
    runDiagnosis();
  };
  reader.readAsDataURL(file);
}

function runDiagnosis() {
  document.getElementById('ddEmpty').style.display = 'none';
  document.getElementById('ddResult').style.display = 'none';
  document.getElementById('ddNotLeaf').style.display = 'none';
  document.getElementById('ddLoading').style.display = 'block';
  document.getElementById('nearbyCasesSection').style.display = 'none';
  document.getElementById('ddNdviAccordionItem').style.display = 'none';

  if (!ddRgbFile) {
    document.getElementById('ddLoading').style.display = 'none';
    document.getElementById('ddEmpty').style.display = 'block';
    return;
  }

  API.predict(ddRgbFile)
    .then((result) => {
      lastDdPrediction = result;
      window.lastDdPrediction = result;
      const data = findDetectionEntry(result.predicted_class);
      const confidence = result.confidence.toFixed(1);

      document.getElementById('ddLoading').style.display = 'none';
      document.getElementById('ddResult').style.display = 'block';

      document.getElementById('ddDiseaseName').textContent = result.predicted_class;
      document.getElementById('ddSymptoms').textContent = data.symptoms;
      document.getElementById('ddTreatment').textContent = data.treatment;
      document.getElementById('ddPrevention').textContent = data.prevention;

      const badge = document.getElementById('ddSeverityBadge');
      badge.className = `badge-soft ${data.badge[0]}`;
      badge.textContent = data.badge[1];

      document.getElementById('ddSeverityMarker').style.left = data.severityPct + '%';

      const circumference = 276.5;
      const offset = circumference - (confidence / 100) * circumference;
      document.getElementById('ddConfidenceRing').style.strokeDashoffset = offset;
      document.getElementById('ddConfidenceNumber').textContent = confidence + '%';

      const ndviItem = document.getElementById('ddNdviAccordionItem');
      // Show backend-calculated NDVI Mean/Min/Max (from /api/predict ndvi
      // object; features.NDVI_* are the same fusion-pipeline values).
      const ndvi = result.ndvi || {};
      const feats = result.features || {};
      const ndviMean = ndvi.mean != null ? ndvi.mean : feats.NDVI_mean;
      const ndviMin = ndvi.minimum != null ? ndvi.minimum : feats.NDVI_min;
      const ndviMax = ndvi.maximum != null ? ndvi.maximum : feats.NDVI_max;
      if (ndvi.available && ndviMean != null && ndviMin != null && ndviMax != null) {
        document.getElementById('ddNdviMean').textContent = Number(ndviMean).toFixed(3);
        document.getElementById('ddNdviMin').textContent = Number(ndviMin).toFixed(3);
        document.getElementById('ddNdviMax').textContent = Number(ndviMax).toFixed(3);
        const heatmapWrap = document.getElementById('ddNdviHeatmapWrap');
        heatmapWrap.innerHTML = '';
        ndviItem.style.display = 'block';

        // Open the NDVI accordion so Mean/Min/Max are visible immediately.
        document.querySelectorAll('.accordion-item').forEach((el) => {
          el.classList.remove('is-open');
          const p = el.querySelector('.accordion-panel');
          if (p) p.style.maxHeight = null;
        });
        ndviItem.classList.add('is-open');
        const panel = ndviItem.querySelector('.accordion-panel');
        if (panel) panel.style.maxHeight = panel.scrollHeight + 'px';

        if (ndvi.heatmap_url) {
          API.authenticatedImageUrl(ndvi.heatmap_url)
            .then((blobUrl) => {
              heatmapWrap.innerHTML =
                `<img src="${blobUrl}" alt="NDVI heatmap" style="max-width:160px;border-radius:8px;">`;
              if (panel && ndviItem.classList.contains('is-open')) {
                panel.style.maxHeight = panel.scrollHeight + 'px';
              }
            })
            .catch(() => { /* heatmap optional */ });
        }
      } else {
        ndviItem.style.display = 'none';
      }

      if (data.severity !== 'none') {
        renderNearbyCases();
        document.getElementById('nearbyCasesSection').style.display = 'block';
      }

      toast(`Diagnosis complete: ${result.predicted_class}`, 'success');
    })
    .catch((err) => {
      console.error(err);
      document.getElementById('ddLoading').style.display = 'none';

      // Backend returns 422 specifically when the rice-leaf validation gate
      // (services/leaf_validator.py) rejects the image as not looking like
      // a rice leaf -- show the dedicated "not a leaf" state instead of a
      // generic error toast, and never fall through to a disease result.
      if (err.status === 422) {
        document.getElementById('ddNotLeaf').style.display = 'block';
        toast(err.message || 'This doesn\'t look like a rice leaf photo.', 'error');
        return;
      }

      toast('Diagnosis failed: ' + err.message, 'error');
      document.getElementById('ddEmpty').style.display = 'block';
    });
}

function renderNearbyCases() {
  const cases = [
    { location: 'Field Block A-3', distance: '0.4 km', date: '2 days ago' },
    { location: 'Field Block C-1', distance: '1.1 km', date: '5 days ago' },
    { location: 'Field Block B-2', distance: '2.3 km', date: '1 week ago' }
  ];
  document.getElementById('nearbyCases').innerHTML = cases.map((c) => `
    <div class="glass-card" style="padding: var(--space-4);">
      <div style="font-weight:700; font-size:13.5px;">${c.location}</div>
      <div style="font-size:12px; color:var(--color-text-muted); margin-top:4px;">${c.distance} away · ${c.date}</div>
    </div>
  `).join('');
}

function downloadDdReport() {
  if (!lastDdPrediction || !lastDdPrediction.prediction_id) {
    toast('Run a diagnosis first', 'error');
    return;
  }
  const btn = document.getElementById('ddDownloadReportBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating report…';

  API.generateReport(lastDdPrediction.prediction_id)
    .then((report) => API.downloadReportBlob(report.id))
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis-report-${lastDdPrediction.prediction_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Report generated and downloaded', 'success');
    })
    .catch((err) => toast('Report generation failed: ' + err.message, 'error'))
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = originalText;
    });
}

function initAccordion() {
  document.querySelectorAll('.accordion-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const panel = item.querySelector('.accordion-panel');
      const isOpen = item.classList.contains('is-open');

      document.querySelectorAll('.accordion-item').forEach((el) => {
        el.classList.remove('is-open');
        el.querySelector('.accordion-panel').style.maxHeight = null;
      });

      if (!isOpen) {
        item.classList.add('is-open');
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });

  const openPanel = document.querySelector('.accordion-item.is-open .accordion-panel');
  if (openPanel) openPanel.style.maxHeight = openPanel.scrollHeight + 'px';
}
