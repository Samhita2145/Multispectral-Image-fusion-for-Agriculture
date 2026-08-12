/**
 * Disease Detection page — upload -> simulated diagnosis with
 * confidence ring, severity gauge, symptoms/treatment/prevention
 * accordion, and dummy "nearby similar cases".
 */

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
    name: 'Leaf Scald', severity: 'moderate', severityPct: 50, badge: ['badge-soft--amber', 'Moderate'],
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

document.addEventListener('DOMContentLoaded', () => {
  initDDDropzone();
  initAccordion();
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
  document.getElementById('ddLoading').style.display = 'block';
  document.getElementById('nearbyCasesSection').style.display = 'none';

  setTimeout(() => {
    const data = DETECTION_DATA[Math.floor(Math.random() * DETECTION_DATA.length)];
    const confidence = (81 + Math.random() * 17).toFixed(1);

    document.getElementById('ddLoading').style.display = 'none';
    document.getElementById('ddResult').style.display = 'block';

    document.getElementById('ddDiseaseName').textContent = data.name;
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

    if (data.severity !== 'none') {
      renderNearbyCases();
      document.getElementById('nearbyCasesSection').style.display = 'block';
    }

    toast(`Diagnosis complete: ${data.name}`, 'success');
  }, 1400);
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

  // Set initial open panel height
  const openPanel = document.querySelector('.accordion-item.is-open .accordion-panel');
  if (openPanel) openPanel.style.maxHeight = openPanel.scrollHeight + 'px';
}
