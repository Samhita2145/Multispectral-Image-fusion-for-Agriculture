/**
 * api.js — thin fetch wrapper for the FastAPI backend.
 *
 * Loaded before app.js on every page. Exposes `window.API`.
 *
 * Auth token is stored in localStorage (survives page reloads/new tabs
 * until logout), separate from the old sessionStorage-only demo flag that
 * app.js's `Session` object used to manage entirely client-side.
 */
(function () {
  'use strict';

  // Change this if your backend runs somewhere other than localhost:8000.
  const API_BASE = window.API_BASE_URL || 'http://localhost:8000';
  const TOKEN_KEY = 'mif_auth_token';
  const USER_KEY = 'mif_auth_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  async function request(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
    const headers = {};
    if (auth && getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      throw new Error(
        `Could not reach the backend at ${API_BASE}. Is it running? (uvicorn app:app --reload)`
      );
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }

    if (!res.ok) {
      const detail =
        (data && (data.detail || data.message)) ||
        (Array.isArray(data) ? data.map((d) => d.msg).join(', ') : null) ||
        (data && data.detail && Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg).join(', ')
          : null) ||
        `Request failed (${res.status})`;
      const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  const API = {
    base: API_BASE,
    getToken,
    getUser,
    isLoggedIn,
    clearSession,

    // ---------------- Auth ----------------
    async register(name, email, password) {
      const data = await request('/api/auth/register', {
        method: 'POST',
        body: { name, email, password },
        auth: false,
      });
      setSession(data.access_token, data.user);
      return data;
    },
    async login(email, password) {
      const data = await request('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setSession(data.access_token, data.user);
      return data;
    },
    async logout() {
      try {
        if (getToken()) await request('/api/auth/logout', { method: 'POST' });
      } catch (e) {
        // ignore network errors on logout — clear local session regardless
      }
      clearSession();
    },
    async me() {
      return request('/api/auth/me');
    },

    // ---------------- Prediction ----------------
    async predict(rgbFile, nirFile) {
      const form = new FormData();
      form.append('rgb_image', rgbFile);
      if (nirFile) form.append('nir_image', nirFile);
      return request('/api/predict', { method: 'POST', body: form, isForm: true });
    },
    fileUrl(relativeUrl) {
      if (!relativeUrl) return null;
      return `${API_BASE}${relativeUrl}`;
    },
    // Bearer-token auth means a plain <img src> can't load prediction
    // files (the browser won't attach the header), so fetch as a blob
    // and return an object URL — same pattern as downloadReportBlob.
    async authenticatedImageUrl(relativeUrl) {
      if (!relativeUrl) return null;
      const headers = {};
      if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
      const res = await fetch(`${API_BASE}${relativeUrl}`, { headers });
      if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
      return URL.createObjectURL(await res.blob());
    },

    // ---------------- History ----------------
    async getHistory(page = 1, pageSize = 50) {
      return request(`/api/history?page=${page}&page_size=${pageSize}`);
    },
    async getHistoryItem(id) {
      return request(`/api/history/${id}`);
    },
    async deleteHistoryItem(id) {
      return request(`/api/history/${id}`, { method: 'DELETE' });
    },

    // ---------------- Reports ----------------
    async generateReport(predictionId) {
      return request(`/api/reports/${predictionId}`, { method: 'POST' });
    },
    async listReports() {
      return request('/api/reports');
    },
    reportDownloadUrl(reportId) {
      return `${API_BASE}/api/reports/${reportId}/download`;
    },
    // Bearer-token auth means a plain <a href> can't be used for the PDF
    // download (the browser won't attach the header), so fetch it as a
    // blob and trigger a save via a temporary object URL instead.
    async downloadReportBlob(reportId) {
      const headers = {};
      if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
      const res = await fetch(`${API_BASE}/api/reports/${reportId}/download`, { headers });
      if (!res.ok) throw new Error(`Failed to download report (${res.status})`);
      return res.blob();
    },

    // ---------------- Dashboard ----------------
    async dashboardStats() {
      return request('/api/dashboard/stats');
    },

    // ---------------- Chatbot ----------------
    async chat(message, history = [], context = null) {
      return request('/api/chat', {
        method: 'POST',
        body: { message, history, context },
        auth: true,
      });
    },
  };

  window.API = API;
})();

