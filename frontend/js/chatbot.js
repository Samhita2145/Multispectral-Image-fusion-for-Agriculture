/**
 * Agri Assistant — AI/LLM-powered floating chatbot widget.
 *
 * Connects to the FastAPI backend at POST /api/chat via fetch().
 * Supports questions on:
 *   - Rice diseases (Healthy, Bacterial Leaf Blight, Brown Spot, Leaf Blast, Leaf Scald, Sheath Blight)
 *   - Symptoms, treatments, and prevention
 *   - Rice agriculture, irrigation, soil health, fertilizers, IPM
 *   - Multispectral imaging (RGB, NIR, Red-Edge) and Image Fusion
 *   - NDVI vegetation index calculation and stress interpretation
 *   - Grounded prediction diagnosis results
 *
 * UI & Session Features:
 *   - Optional & dismissible suggestion chips that do not crowd message area
 *   - Sizing toggle (compact default + expandable enlarged window)
 *   - Clean in-memory session (no stale localStorage history across page loads)
 *   - Multi-turn conversation context retention within active session
 */

(function () {
  'use strict';

  const SUGGESTIONS = [
    'What diseases can this detect?',
    'How does multispectral fusion work?',
    'What is NDVI and how is it calculated?',
    'Symptoms & treatment for Leaf Blast',
    'How to prevent Bacterial Leaf Blight?',
    'What is my latest prediction result?'
  ];

  // Clean in-memory session history (never persisted to localStorage/sessionStorage)
  const chatHistory = [];

  /* ---------------------------------------------------------
     Markup + styles injection
  --------------------------------------------------------- */
  function injectStylesheet() {
    if (document.querySelector('link[data-chatbot-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = resolveAssetPath('css/chatbot.css');
    link.setAttribute('data-chatbot-css', 'true');
    document.head.appendChild(link);
  }

  // Resolve css/js paths correctly whether the current page lives
  // at the frontend root (e.g. index.html) or one level deep.
  function resolveAssetPath(path) {
    const script = document.currentScript || document.querySelector('script[src*="chatbot.js"]');
    if (script) {
      const base = script.getAttribute('src').replace(/js\/chatbot\.js.*$/, '');
      return base + path;
    }
    return path;
  }

  function getApiBaseUrl() {
    return window.API_BASE_URL || (window.API && window.API.base) || 'http://localhost:8000';
  }

  function getAuthToken() {
    if (window.API && typeof window.API.getToken === 'function') {
      return window.API.getToken();
    }
    return localStorage.getItem('mif_auth_token');
  }

  function getCurrentContext() {
    const context = {
      page: document.title || window.location.pathname,
    };

    // Check for prediction data in window or local variables
    const activePrediction = window.lastDdPrediction || window.lastPrediction;
    if (activePrediction) {
      context.prediction = activePrediction;
    }

    return context;
  }

  function buildWidget() {
    if (document.getElementById('chatbotLauncher')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button class="chatbot-launcher" id="chatbotLauncher" type="button" aria-label="Open Agri Assistant chat">
        <span class="chatbot-launcher__badge" id="chatbotBadge"></span>
        <svg class="chatbot-launcher__chat-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 11.5C21 16.19 16.97 20 12 20C10.86 20 9.77 19.8 8.77 19.44L4 20.5L5.3 16.6C4.48 15.28 4 13.75 4 12.1C4 6.98 8.03 3 13 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M17 3.5L17.6 5L19 5.5L17.6 6L17 7.5L16.4 6L15 5.5L16.4 5L17 3.5Z" fill="currentColor"/>
          <path d="M9 11H15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          <path d="M9 14H13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
        <svg class="chatbot-launcher__close-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="chatbot-panel" id="chatbotPanel" role="dialog" aria-label="Agri Assistant chat">
        <div class="chatbot-panel__header">
          <span class="chatbot-panel__avatar">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3C9.79 3 8 4.79 8 7V10.5C8 11.03 7.79 11.54 7.41 11.91L6 13.32C5.11 14.21 5.74 15.75 7 15.75H17C18.26 15.75 18.89 14.21 18 13.32L16.59 11.91C16.21 11.54 16 11.03 16 10.5V7C16 4.79 14.21 3 12 3Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M4 6C4 4 6 2.5 8.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="chatbot-panel__title">
            <strong>Agri Assistant</strong>
            <span><span class="chatbot-panel__status-dot"></span>AI Rice &amp; Crop Advisor</span>
          </span>
          <div class="chatbot-panel__actions">
            <button class="chatbot-panel__expand" id="chatbotExpand" type="button" aria-label="Expand chat size" title="Toggle full size">
              <svg class="chatbot-expand-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 3H21V9M9 21H3V15M21 3L14 10M3 21L10 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg class="chatbot-collapse-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 14H10V20M20 10H14V4M14 10L21 3M10 14L3 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="chatbot-panel__close" id="chatbotClose" type="button" aria-label="Close chat" title="Close chat">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="chatbot-panel__messages" id="chatbotMessages"></div>

        <div class="chatbot-panel__suggestions-bar" id="chatbotSuggestionsBar">
          <span class="chatbot-panel__suggestions-title">Suggested questions</span>
          <button class="chatbot-suggestions__dismiss" id="chatbotDismissSuggestions" type="button" aria-label="Dismiss suggestions" title="Dismiss suggestions">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="chatbot-panel__suggestions" id="chatbotSuggestions"></div>

        <div class="chatbot-panel__input-row">
          <input type="text" id="chatbotInput" placeholder="Ask about rice diseases, NDVI, fusion, or diagnosis…" autocomplete="off">
          <button class="chatbot-panel__send" id="chatbotSend" type="button" aria-label="Send message" title="Send message">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20L21 12L4 4L4 10L15 12L4 14L4 20Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div class="chatbot-panel__footnote">AI-powered assistant for rice crop health, multispectral imaging &amp; disease diagnosis.</div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  /* ---------------------------------------------------------
     Behavior
  --------------------------------------------------------- */
  function initChatbot() {
    injectStylesheet();
    buildWidget();

    const launcher = document.getElementById('chatbotLauncher');
    const panel = document.getElementById('chatbotPanel');
    const closeBtn = document.getElementById('chatbotClose');
    const expandBtn = document.getElementById('chatbotExpand');
    const messages = document.getElementById('chatbotMessages');
    const suggestionsBar = document.getElementById('chatbotSuggestionsBar');
    const suggestionsWrap = document.getElementById('chatbotSuggestions');
    const dismissSuggestionsBtn = document.getElementById('chatbotDismissSuggestions');
    const input = document.getElementById('chatbotInput');
    const sendBtn = document.getElementById('chatbotSend');
    const badge = document.getElementById('chatbotBadge');

    let greeted = false;

    function renderSuggestions() {
      if (!suggestionsWrap) return;
      suggestionsWrap.innerHTML = '';
      SUGGESTIONS.forEach((s) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chatbot-chip';
        chip.textContent = s;
        chip.addEventListener('click', () => {
          hideSuggestions();
          sendMessage(s);
        });
        suggestionsWrap.appendChild(chip);
      });
      if (suggestionsBar) suggestionsBar.style.display = 'flex';
      suggestionsWrap.style.display = 'flex';
    }

    function hideSuggestions() {
      if (suggestionsBar) suggestionsBar.style.display = 'none';
      if (suggestionsWrap) suggestionsWrap.style.display = 'none';
    }

    if (dismissSuggestionsBtn) {
      dismissSuggestionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideSuggestions();
      });
    }

    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('is-expanded');
        const isExp = panel.classList.contains('is-expanded');
        expandBtn.setAttribute('aria-label', isExp ? 'Collapse chat size' : 'Expand chat size');
        expandBtn.setAttribute('title', isExp ? 'Collapse chat' : 'Expand chat');
        if (input) input.focus();
      });
    }

    function addMessage(text, sender) {
      const el = document.createElement('div');
      el.className = `chatbot-msg chatbot-msg--${sender}`;
      el.textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function showTyping() {
      const el = document.createElement('div');
      el.className = 'chatbot-msg chatbot-msg--bot chatbot-msg--typing';
      el.id = 'chatbotTyping';
      el.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() {
      const el = document.getElementById('chatbotTyping');
      if (el) el.remove();
    }

    async function sendMessage(text) {
      const value = (text !== undefined ? text : input.value).trim();
      // Handle empty messages gracefully
      if (!value) return;

      // Hide suggestion chips once user sends a message
      hideSuggestions();

      addMessage(value, 'user');
      chatHistory.push({ role: 'user', content: value });

      input.value = '';
      sendBtn.disabled = true;
      input.disabled = true;

      showTyping();

      const apiBase = getApiBaseUrl();
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const payload = {
        message: value,
        history: chatHistory.slice(0, -1), // prior history turns in current session
        context: getCurrentContext(),
      };

      try {
        const res = await fetch(`${apiBase}/api/chat`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
        });

        let data = null;
        const rawText = await res.text();
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch (e) {
            data = { reply: rawText };
          }
        }

        hideTyping();

        if (!res.ok) {
          const detail =
            (data && (data.detail || data.message)) ||
            (Array.isArray(data) ? data.map((d) => d.msg).join(', ') : null) ||
            `Request failed (${res.status})`;
          throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        }

        const reply = (data && data.reply) ? data.reply : "I received an empty response from the AI assistant.";
        addMessage(reply, 'bot');
        chatHistory.push({ role: 'assistant', content: reply });

      } catch (err) {
        hideTyping();
        console.error('Chatbot request error:', err);
        const errorMsg = `🌾 Sorry, I couldn't reach the backend service: ${err.message || 'Network error'}. Please ensure the backend is running at ${apiBase} and an LLM API key is configured.`;
        addMessage(errorMsg, 'bot');
      } finally {
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
      }
    }

    function openPanel() {
      panel.classList.add('is-open');
      launcher.classList.add('is-open');
      launcher.setAttribute('aria-label', 'Close Agri Assistant chat');
      if (badge) badge.style.display = 'none';

      if (!greeted) {
        greeted = true;
        renderSuggestions();
        setTimeout(() => {
          addMessage("Hi! I'm Agri Assistant 🌾 Ask me about rice diseases, symptoms, treatments, prevention, multispectral imaging, NDVI, or your leaf diagnosis results. Tap a suggestion below or type your own question.", 'bot');
        }, 200);
      }
      setTimeout(() => input && input.focus(), 250);
    }

    function closePanel() {
      panel.classList.remove('is-open');
      launcher.classList.remove('is-open');
      launcher.setAttribute('aria-label', 'Open Agri Assistant chat');
    }

    launcher.addEventListener('click', () => {
      if (panel.classList.contains('is-open')) closePanel();
      else openPanel();
    });

    closeBtn.addEventListener('click', closePanel);

    sendBtn.addEventListener('click', () => sendMessage());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
    });

    // Click-away to close (ignore clicks on the launcher/panel itself)
    document.addEventListener('click', (e) => {
      if (!panel.classList.contains('is-open')) return;
      if (panel.contains(e.target) || launcher.contains(e.target)) return;
      closePanel();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }
})();
