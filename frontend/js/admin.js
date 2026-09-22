(function () {
  'use strict';

  const API_BASE = window.API_BASE_URL || 'http://127.0.0.1:8000';
  const TOKEN_KEY = 'mif_admin_token';
  const USER_KEY = 'mif_admin_user';
  const isLoginPage = document.body.classList.contains('admin-login-page');
  let charts = {};

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (error) { return null; } }
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  function setSession(token, user) {
    const safeUser = user && { id: user.id, name: user.name, email: user.email, created_at: user.created_at };
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(safeUser));
  }
  function redirectToLogin() { clearSession(); window.location.href = 'admin-login.html'; }
  function showAlert(element, message) { element.textContent = message; element.hidden = false; }

  async function adminRequest(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
    let response;
    try { response = await fetch(`${API_BASE}${path}`, { ...options, headers }); }
    catch (error) { throw new Error(`Could not reach the backend at ${API_BASE}. Start it with uvicorn app:app --reload.`); }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && options.handleAuth !== false) { redirectToLogin(); }
      const detail = data && (data.detail || data.message) || `Request failed (${response.status})`;
      const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  function formatConfidence(value) { return typeof value === 'number' ? `${(value <= 1 ? value * 100 : value).toFixed(2)}%` : '—'; }
  function chartData(values) { return Object.entries(values || {}).filter((entry) => typeof entry[1] === 'number'); }
  function makeChart(id, type, labels, values, label, color) {
    const canvas = document.getElementById(id); if (!canvas || !labels.length || typeof Chart === 'undefined') return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, { type, data: { labels, datasets: [{ label, data: values, backgroundColor: color, borderColor: color, borderWidth: 2, borderRadius: type === 'bar' ? 6 : 0, fill: type === 'line', tension: 0.35 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type === 'doughnut', position: 'bottom', labels: { usePointStyle: true, padding: 16 } } }, scales: type === 'doughnut' ? {} : { y: { beginAtZero: true, grid: { color: '#e6eee8' }, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
  }
  function setEmptyState(container, id, message, visible) {
    let empty = document.getElementById(id);
    if (!visible) { if (empty) empty.remove(); return; }
    if (!empty) { empty = document.createElement('p'); empty.className = 'empty-state'; empty.id = id; empty.textContent = message; container.appendChild(empty); }
  }
  function setChartEmpty(canvasId, emptyId, message, hasData) {
    const canvas = document.getElementById(canvasId); canvas.hidden = !hasData;
    setEmptyState(canvas.parentElement, emptyId, message, !hasData);
  }

  async function loadDashboard() {
    const data = await adminRequest('/api/admin/dashboard/stats');
    document.getElementById('totalUsers').textContent = data.total_users ?? 0;
    document.getElementById('totalPredictions').textContent = data.total_predictions ?? 0;
    document.getElementById('totalReports').textContent = data.total_reports ?? 0;
    document.getElementById('averageConfidence').textContent = formatConfidence(data.average_confidence);
    const disease = chartData(data.disease_counts); setChartEmpty('dashboardDiseaseChart', 'dashboardDiseaseEmpty', 'No disease distribution data yet.', disease.length);
    makeChart('dashboardDiseaseChart', 'doughnut', disease.map((item) => item[0]), disease.map((item) => item[1]), 'Predictions', ['#287a52', '#d99058', '#5c8fbd', '#b85c62', '#7b6ca8', '#a7b84d']);
    const recent = document.getElementById('recentPredictions');
    recent.innerHTML = (data.recent_predictions || []).length ? data.recent_predictions.map((item) => `<div class="recent-item"><span class="recent-item__dot"></span><div><strong>${escapeHtml(item.predicted_class || 'Unknown')}</strong><small>${escapeHtml(item.user_email || 'Unknown')} · ${formatDate(item.created_at)}</small></div><b>${formatConfidence(item.confidence)}</b></div>`).join('') : '<p class="empty-state">No predictions recorded yet.</p>';
  }

  async function loadUsers(query) {
    const loading = document.getElementById('usersLoading'); const body = document.getElementById('usersTableBody'); const panel = body.closest('.admin-panel');
    const hasSearch = Boolean(query); loading.hidden = false; body.innerHTML = '';
    const data = await adminRequest(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    loading.hidden = true;
    if (!data.length) { setEmptyState(panel, 'usersEmpty', 'No users match this search.', hasSearch); return; }
    setEmptyState(panel, 'usersEmpty', 'No users match this search.', false);
    body.innerHTML = data.map((user) => `<tr><td>${user.id}</td><td><strong>${escapeHtml(user.name)}</strong></td><td>${escapeHtml(user.email)}</td><td>${formatDate(user.created_at)}</td><td>${user.prediction_count ?? 0}</td></tr>`).join('');
  }

  async function loadPredictions(query, model) {
    const loading = document.getElementById('predictionsLoading'); const body = document.getElementById('predictionsTableBody'); const panel = body.closest('.admin-panel');
    const hasFilter = Boolean(query || model); loading.hidden = false; body.innerHTML = '';
    const params = new URLSearchParams(); if (query) params.set('q', query); if (model) params.set('model_used', model);
    const data = await adminRequest(`/api/admin/predictions${params.toString() ? `?${params}` : ''}`); loading.hidden = true;
    if (!data.length) { setEmptyState(panel, 'predictionsEmpty', 'No predictions match this search.', hasFilter); return; }
    setEmptyState(panel, 'predictionsEmpty', 'No predictions match this search.', false);
    body.innerHTML = data.map((item) => `<tr><td>${item.id}</td><td><strong>${escapeHtml(item.user_name)}</strong><small class="table-subtext">${escapeHtml(item.user_email)}</small></td><td>${escapeHtml(item.predicted_class)}</td><td>${formatConfidence(item.confidence)}</td><td>${escapeHtml(item.model_used || 'Not available')}</td><td>${formatDate(item.created_at)}</td></tr>`).join('');
  }

  async function loadPerformance() {
    const loading = document.getElementById('performanceLoading'); const content = document.getElementById('performanceContent'); const panel = document.getElementById('performancePanel');
    loading.hidden = false; content.hidden = true;
    const data = await adminRequest('/api/admin/model-performance'); loading.hidden = true;
    const metrics = Object.values(data.metrics || {});
    if (!data.available || !metrics.length) { setEmptyState(panel, 'performanceEmpty', 'Performance metrics not available', true); return; }
    setEmptyState(panel, 'performanceEmpty', 'Performance metrics not available', false);
    document.getElementById('performanceModel').textContent = data.model || 'Not available'; document.getElementById('performanceFeatureSet').textContent = data.feature_set || 'Not available'; document.getElementById('performanceFeatureCount').textContent = data.n_features ?? 'Not available';
    document.getElementById('performanceMetrics').innerHTML = metrics.map((metric) => `<div class="metric-card"><span>${escapeHtml(metric.label)}</span><strong>${formatConfidence(metric.value)}</strong></div>`).join(''); content.hidden = false;
  }

  async function loadDataset() {
    const loading = document.getElementById('datasetLoading'); const body = document.getElementById('datasetTableBody'); const panel = body.closest('.admin-panel');
    loading.hidden = false; body.innerHTML = '';
    const data = await adminRequest('/api/admin/dataset-stats'); loading.hidden = true;
    document.getElementById('datasetTotal').textContent = data.total_images ?? 'Not available'; document.getElementById('datasetClasses').textContent = data.classes?.length || 'Not available'; document.getElementById('datasetTrain').textContent = data.train_size ?? 'Not available'; document.getElementById('datasetTest').textContent = data.test_size ?? 'Not available';
    const entries = Object.entries(data.class_counts || {}); const hasData = data.available === true && entries.length > 0;
    setEmptyState(panel, 'datasetEmpty', 'Dataset statistics not available', !hasData); if (!hasData) return;
    body.innerHTML = entries.map((item) => `<tr><td>${escapeHtml(item[0])}</td><td>${item[1]}</td></tr>`).join('');
  }

  async function loadReports(query) {
    const loading = document.getElementById('reportsLoading'); const body = document.getElementById('reportsTableBody'); const panel = body.closest('.admin-panel');
    const hasSearch = Boolean(query); loading.hidden = false; body.innerHTML = '';
    const data = await adminRequest(`/api/admin/reports${query ? `?q=${encodeURIComponent(query)}` : ''}`); loading.hidden = true;
    if (!data.length) { setEmptyState(panel, 'reportsEmpty', 'No reports match this search.', hasSearch); return; }
    setEmptyState(panel, 'reportsEmpty', 'No reports match this search.', false);
    body.innerHTML = data.map((item) => `<tr><td>RPT-${item.id}</td><td><strong>${escapeHtml(item.user_name)}</strong><small class="table-subtext">${escapeHtml(item.user_email)}</small></td><td>#${item.prediction_id}</td><td>${escapeHtml(item.predicted_class)}</td><td>${formatDate(item.created_at)}</td><td>${escapeHtml(item.type)}</td><td><span class="status-chip ${item.status === 'Available' ? 'status-chip--ok' : 'status-chip--missing'}">${escapeHtml(item.status)}</span></td></tr>`).join('');
  }

  async function loadAnalytics() {
    const data = await adminRequest('/api/admin/disease-analytics');
    const disease = chartData(data.disease_counts); const confidence = chartData(data.confidence_stats);
    setChartEmpty('analyticsDiseaseChart', 'analyticsDiseaseEmpty', 'No disease data yet.', disease.length); setChartEmpty('confidenceChart', 'confidenceEmpty', 'No confidence data yet.', confidence.length);
    makeChart('analyticsDiseaseChart', 'bar', disease.map((item) => item[0]), disease.map((item) => item[1]), 'Predictions', '#287a52');
    makeChart('confidenceChart', 'bar', confidence.map((item) => item[0]), confidence.map((item) => item[1] <= 1 ? item[1] * 100 : item[1]), 'Confidence %', '#d99058');
  }

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
  function initLogin() {
    if (getToken()) window.location.href = 'admin-dashboard.html';
    const form = document.getElementById('adminLoginForm'); const email = document.getElementById('adminEmail'); const password = document.getElementById('adminPassword');
    form.addEventListener('submit', async (event) => { event.preventDefault(); const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()); document.getElementById('emailField').classList.toggle('has-error', !validEmail); document.getElementById('passwordField').classList.toggle('has-error', !password.value); if (!validEmail || !password.value) return;
      const button = document.getElementById('loginButton'); button.disabled = true; document.getElementById('loginButtonText').textContent = 'Signing in...';
      try { const data = await adminRequest('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: email.value.trim(), password: password.value }), handleAuth: false }); setSession(data.access_token, data.user); window.location.href = 'admin-dashboard.html'; }
      catch (error) { showAlert(document.getElementById('loginAlert'), error.message || 'Admin login failed.'); button.disabled = false; document.getElementById('loginButtonText').textContent = 'Sign in to console'; }
    });
    [email, password].forEach((input) => input.addEventListener('input', () => input.closest('.admin-field').classList.remove('has-error')));
  }
  function initDashboard() {
    if (!getToken()) { redirectToLogin(); return; }
    const user = getUser(); if (user) { document.getElementById('adminName').textContent = user.name || 'Administrator'; document.getElementById('adminEmail').textContent = user.email || '—'; document.getElementById('userAvatar').textContent = (user.name || 'A').charAt(0).toUpperCase(); }
    const sections = { dashboard: ['dashboardSection', 'Dashboard'], users: ['usersSection', 'User Management'], predictions: ['predictionsSection', 'Prediction Management'], performance: ['performanceSection', 'Model Performance'], dataset: ['datasetSection', 'Dataset Statistics'], analytics: ['analyticsSection', 'Disease Analytics'], reports: ['reportsSection', 'Report Management'] };
    document.querySelectorAll('.admin-nav__link').forEach((button) => button.addEventListener('click', async () => { const section = button.dataset.section; document.querySelectorAll('.admin-nav__link').forEach((item) => item.classList.toggle('is-active', item === button)); document.querySelectorAll('.admin-section').forEach((item) => item.classList.remove('is-visible')); document.getElementById(sections[section][0]).classList.add('is-visible'); document.getElementById('pageTitle').textContent = sections[section][1]; document.getElementById('sectionLabel').textContent = sections[section][1].toUpperCase(); try { if (section === 'users') await loadUsers(document.getElementById('userSearch').value.trim()); if (section === 'predictions') await loadPredictions(document.getElementById('predictionSearch').value.trim(), document.getElementById('predictionModel').value); if (section === 'performance') await loadPerformance(); if (section === 'dataset') await loadDataset(); if (section === 'analytics') await loadAnalytics(); if (section === 'reports') await loadReports(document.getElementById('reportSearch').value.trim()); } catch (error) { showAlert(document.getElementById('dashboardAlert'), error.message); } }));
    document.getElementById('userSearchForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadUsers(document.getElementById('userSearch').value.trim()); } catch (error) { showAlert(document.getElementById('dashboardAlert'), error.message); } });
    document.getElementById('predictionSearchForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadPredictions(document.getElementById('predictionSearch').value.trim(), document.getElementById('predictionModel').value); } catch (error) { showAlert(document.getElementById('dashboardAlert'), error.message); } });
    document.getElementById('reportSearchForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadReports(document.getElementById('reportSearch').value.trim()); } catch (error) { showAlert(document.getElementById('dashboardAlert'), error.message); } });
    document.getElementById('logoutButton').addEventListener('click', async () => { try { await adminRequest('/api/admin/logout', { method: 'POST' }); } catch (error) { /* local logout still clears the session */ } finally { clearSession(); window.location.href = 'admin-login.html'; } });
    loadDashboard().catch((error) => showAlert(document.getElementById('dashboardAlert'), error.message));
  }
  document.addEventListener('DOMContentLoaded', () => isLoginPage ? initLogin() : initDashboard());
})();
