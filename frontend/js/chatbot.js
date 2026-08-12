/**
 * Agri Assistant — frontend-only chatbot widget.
 *
 * There is no backend/LLM wired up here (by design, per the
 * project's current scope), so this runs as a lightweight,
 * keyword-matched knowledge base focused ONLY on:
 *   1) this project (navigation, features, workflow)
 *   2) farming / agriculture / rice-disease topics
 *
 * Anything outside that scope gets a polite redirect instead
 * of a made-up answer. Swap `answerQuery()` for a real API call
 * later (see the note near the bottom) to upgrade this to a
 * true LLM-backed assistant without touching the UI code.
 */

(function () {
  'use strict';

  /* ---------------------------------------------------------
     Knowledge base — keyword-scored rule entries.
     Each entry: keywords[] (lowercase), response (string).
     The entry with the highest keyword-overlap score wins.
  --------------------------------------------------------- */
  const KB = [
    {
      keywords: ['hello', 'hi', 'hey', 'namaste', 'greetings'],
      response: "Hello! I'm Agri Assistant 🌾 Ask me about this platform (image analysis, disease detection, fusion, reports) or general farming topics like irrigation, soil health, fertilizers, or rice diseases."
    },
    {
      keywords: ['thank', 'thanks', 'thank you'],
      response: "You're welcome! Let me know if you have more questions about the project or your crops."
    },
    {
      keywords: ['disease', 'diseases', 'detect', 'detects', 'detection', 'diagnose', 'diagnosis', 'identify disease', 'classify', 'classification', 'symptom', 'symptoms'],
      response: "The 'Disease Detection' page classifies an uploaded rice leaf image into one of six categories: Healthy, Bacterial Leaf Blight, Brown Spot, Leaf Blast, Leaf Scald, or Sheath Blight — along with a severity estimate. Ask me about any one of those diseases for more detail."
    },
    {
      keywords: ['multispectral', 'fusion', 'fuse', 'fused', 'ndvi', 'bands', 'spectral', 'infrared', 'nir'],
      response: "Image fusion combines multiple spectral bands (like visible RGB and near-infrared) into one enhanced image. NDVI-style fusion highlights vegetation stress that isn't visible to the naked eye, so subtle disease or water-stress symptoms show up earlier. You can try this on the 'Image Fusion' page."
    },
    {
      keywords: ['image analysis', 'analyze', 'analyse', 'upload image', 'scan leaf', 'scan my'],
      response: "Head to the 'Image Analysis' page to upload a crop image — the platform analyzes it and surfaces health indicators such as vegetation index and possible disease signs."
    },
    {
      keywords: ['dataset', 'training data', 'explorer', 'images used'],
      response: "The 'Dataset Explorer' page lets you browse the labeled training images used for disease classification — healthy leaves plus five disease categories."
    },
    {
      keywords: ['what is this project', 'what is this platform', 'what is this app', 'what is this website', 'what is this system', 'what does this do', 'tell me about this project', 'about this project', 'multispectral image fusion for agriculture', 'purpose of this'],
      response: "This is the Multispectral Image Fusion For Agriculture platform — a digital-twin style dashboard that fuses RGB and multispectral (e.g. NIR/NDVI) drone or field imagery to help monitor rice crop health and detect leaf diseases early."
    },
    {
      keywords: ['report', 'reports', 'download report', 'summary report'],
      response: "The 'Reports' page compiles your analysis results into a shareable summary, including severity, diagnosis notes, and suggested treatment."
    },
    {
      keywords: ['history', 'past scans', 'previous', 'record'],
      response: "The 'History' page keeps a log of your previous scans and analyses so you can track a field's health over time."
    },
    {
      keywords: ['login', 'log in', 'sign in', 'signin'],
      response: "Use the login page with any email/password (this is a demo — no real backend auth). There's also a 'Sign in with Google' demo button."
    },
    {
      keywords: ['logout', 'log out', 'sign out'],
      response: "You can log out anytime from the profile icon (top-right of the navbar) → 'Log out'."
    },
    {
      keywords: ['bacterial leaf blight', 'bacterial blight', 'blb'],
      response: "Bacterial Leaf Blight: water-soaked lesions along leaf margins; usually severe. Suggested treatment — apply a copper-based bactericide, improve field drainage, and remove badly infected leaves."
    },
    {
      keywords: ['brown spot'],
      response: "Brown Spot: small circular-to-oval brown lesions with a gray/white center scattered across the blade; typically moderate severity. Suggested treatment — apply a mancozeb-based fungicide and ensure balanced potassium nutrition."
    },
    {
      keywords: ['leaf blast', 'blast disease'],
      response: "Leaf Blast: diamond-shaped lesions with defined margins; often severe and spreads quickly. Suggested treatment — apply a tricyclazole-based fungicide promptly and reduce nitrogen application."
    },
    {
      keywords: ['leaf scald'],
      response: "Leaf Scald: alternating tan and brown banding from the leaf tip inward; usually moderate. Suggested treatment — improve field ventilation, monitor spread, and apply fungicide if it progresses."
    },
    {
      keywords: ['sheath blight'],
      response: "Sheath Blight: greenish-gray oval lesions on the leaf sheath near the waterline with irregular borders; moderate severity. Suggested treatment — apply a hexaconazole fungicide and reduce planting density to lower canopy humidity."
    },
    {
      keywords: ['healthy leaf', 'healthy rice', 'no disease'],
      response: "A healthy rice leaf shows uniform chlorophyll distribution with no lesion patterns in both RGB and fused NDVI bands — no treatment needed, just continue routine monitoring."
    },
    {
      keywords: ['irrigation', 'watering', 'water crop', 'drip irrigation', 'water', 'water my', 'water the'],
      response: "For rice, maintaining 2–5 cm of standing water during vegetative growth supports healthy tillering; alternate wetting-and-drying (AWD) can save water while keeping yields stable. Avoid waterlogging near harvest to reduce disease pressure like sheath blight."
    },
    {
      keywords: ['soil health', 'soil quality', 'soil test', 'ph'],
      response: "Good soil health for rice comes from balanced NPK, adequate organic matter, and a slightly acidic-to-neutral pH (around 5.5–6.5). Periodic soil testing helps you avoid over-fertilizing, which can actually increase disease susceptibility."
    },
    {
      keywords: ['fertilizer', 'fertilizers', 'nitrogen', 'npk', 'nutrient'],
      response: "Balanced fertilization matters: excess nitrogen makes rice leaves more susceptible to blast and blight, while adequate potassium improves resistance to brown spot. Split nitrogen doses across growth stages rather than applying it all at once."
    },
    {
      keywords: ['pest', 'pests', 'insect', 'pest control'],
      response: "Integrated Pest Management (IPM) — combining resistant varieties, field monitoring, natural predators, and targeted pesticide use only when thresholds are crossed — is generally more sustainable than routine spraying."
    },
    {
      keywords: ['crop rotation', 'rotation'],
      response: "Rotating rice with a non-host crop (like legumes) for a season can break disease and pest cycles and improve soil nitrogen naturally."
    },
    {
      keywords: ['weather', 'climate', 'season', 'monsoon'],
      response: "Humid, warm conditions with prolonged leaf wetness (common in monsoon season) favor fungal diseases like blast and brown spot, while bacterial blight often spreads faster after wind-driven rain. Good drainage and spacing help reduce risk."
    },
    {
      keywords: ['drone', 'drones', 'multispectral camera', 'sensor'],
      response: "Multispectral drones typically capture bands beyond visible light (like red-edge and near-infrared) to compute vegetation indices such as NDVI, which reveal crop stress before it's visible to the eye — this is the kind of imagery this platform is built to fuse and analyze."
    },
    {
      keywords: ['rice', 'paddy'],
      response: "This platform is focused on rice/paddy crop monitoring — from multispectral image fusion to automated leaf disease detection across six categories. Ask me about a specific disease, or how to use a page like Image Analysis or Reports."
    }
  ];

  const FALLBACK =
    "I can only help with questions about this platform (image analysis, disease detection, fusion, reports, dataset) or general farming/agriculture topics. Could you rephrase your question around one of those?";

  const SUGGESTIONS = [
    'What diseases can this detect?',
    'How does image fusion work?',
    'Tips for healthy soil',
    'How do I log out?'
  ];

  /* ---------------------------------------------------------
     Matching — simple keyword overlap scoring.
  --------------------------------------------------------- */
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function answerQuery(rawText) {
    const text = rawText.toLowerCase().trim();
    if (!text) return FALLBACK;

    let best = null;
    let bestScore = 0;

    KB.forEach((entry) => {
      let score = 0;
      entry.keywords.forEach((kw) => {
        // Word-boundary match so short keywords (e.g. "hi") don't
        // false-positive inside unrelated words (e.g. "this", "history").
        const pattern = new RegExp('\\b' + escapeRegExp(kw) + '\\b', 'i');
        if (pattern.test(text)) score += kw.split(' ').length; // reward multi-word matches
      });
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });

    if (best && bestScore > 0) return best.response;
    return FALLBACK;

    /* ---------------------------------------------------------
       To upgrade this to a real AI-backed assistant later:
       replace this function's body with a fetch() call to your
       own backend endpoint (which in turn calls an LLM API),
       since API keys must never live in frontend code. The rest
       of the widget (UI, history, typing indicator) needs no
       changes.
    --------------------------------------------------------- */
  }

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
  // at the frontend root (e.g. index.html) or one level deep
  // (e.g. assets/about.html).
  function resolveAssetPath(path) {
    const script = document.currentScript || document.querySelector('script[src*="chatbot.js"]');
    if (script) {
      const base = script.getAttribute('src').replace(/js\/chatbot\.js.*$/, '');
      return base + path;
    }
    return path;
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
            <span><span class="chatbot-panel__status-dot"></span>Farming &amp; project help</span>
          </span>
          <button class="chatbot-panel__close" id="chatbotClose" type="button" aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="chatbot-panel__messages" id="chatbotMessages"></div>

        <div class="chatbot-panel__suggestions" id="chatbotSuggestions"></div>

        <div class="chatbot-panel__input-row">
          <input type="text" id="chatbotInput" placeholder="Ask about farming or this project…" autocomplete="off">
          <button class="chatbot-panel__send" id="chatbotSend" type="button" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20L21 12L4 4L4 10L15 12L4 14L4 20Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div class="chatbot-panel__footnote">Answers are limited to farming &amp; this project — demo assistant, not real-time AI.</div>
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
    const messages = document.getElementById('chatbotMessages');
    const suggestionsWrap = document.getElementById('chatbotSuggestions');
    const input = document.getElementById('chatbotInput');
    const sendBtn = document.getElementById('chatbotSend');
    const badge = document.getElementById('chatbotBadge');

    let greeted = false;

    function renderSuggestions() {
      suggestionsWrap.innerHTML = '';
      SUGGESTIONS.forEach((s) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chatbot-chip';
        chip.textContent = s;
        chip.addEventListener('click', () => sendMessage(s));
        suggestionsWrap.appendChild(chip);
      });
    }

    function addMessage(text, sender) {
      const el = document.createElement('div');
      el.className = `chatbot-msg chatbot-msg--${sender}`;
      el.textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
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

    function sendMessage(text) {
      const value = (text !== undefined ? text : input.value).trim();
      if (!value) return;

      addMessage(value, 'user');
      input.value = '';
      sendBtn.disabled = true;

      showTyping();
      setTimeout(() => {
        hideTyping();
        addMessage(answerQuery(value), 'bot');
        sendBtn.disabled = false;
        input.focus();
      }, 500 + Math.random() * 400);
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
          addMessage("Hi! I'm Agri Assistant 🌾 Ask me about the platform's features (image fusion, disease detection, reports) or general rice-farming topics. Tap a suggestion below or type your own question.", 'bot');
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
