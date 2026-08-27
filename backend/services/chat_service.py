"""
Chat Service: Handles AI/LLM interactions for the Agri Assistant chatbot.

Supports multiple LLM providers via standard HTTP requests:
1. Google Gemini (GEMINI_API_KEY or GOOGLE_API_KEY)
2. OpenAI (OPENAI_API_KEY)
3. Anthropic (ANTHROPIC_API_KEY)
4. Groq (GROQ_API_KEY)

Domain knowledge covers:
- Rice leaf diseases, symptoms, treatment, prevention
- Rice agriculture, irrigation, soil health, fertilizers, IPM
- Multispectral imaging (RGB, NIR, Red-Edge) and image fusion
- NDVI calculation, vegetation stress indicators
- Actual ML model details and real user prediction data grounding
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
import requests
from sqlalchemy.orm import Session

from models.prediction import Prediction
from models.user import User
from schemas import ChatMessage, ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)
else:
    load_dotenv()


# -------------------------------------------------------------------
# System Prompt - Domain Knowledge & Grounding
# -------------------------------------------------------------------
BASE_SYSTEM_PROMPT = """
You are "Agri Assistant" 🌾, the AI assistant for the "Multispectral Image Fusion for Agriculture" project.

Your role is to provide useful, accurate, and practical assistance ONLY for topics related to agriculture and the features of this project.

==================================================
1. ALLOWED TOPICS
==================================================

You may answer questions related to:

A. AGRICULTURE
- Rice cultivation
- Rice crop management
- Rice diseases and symptoms
- Rice pests
- Disease prevention and management
- Irrigation and water management
- Soil health
- Fertilizers and nutrients
- Crop stress
- Integrated Pest Management (IPM)
- General agricultural practices

B. RICE LEAF DISEASES
You may explain symptoms, causes, prevention, and general management of diseases such as:
- Healthy Rice Leaf
- Bacterial Leaf Blight
- Brown Spot
- Leaf Blast / Rice Blast
- Leaf Scald
- Sheath Blight
- Other rice-related diseases when relevant

C. MULTISPECTRAL IMAGING
You may explain:
- RGB images
- NIR / Near-Infrared imagery
- Red-Edge bands
- Multispectral imaging
- Image fusion
- RGB + NIR fusion
- Pseudo-NIR images
- Spectral information
- Vegetation stress detection
- Early disease/stress detection

D. NDVI
You may explain:
- NDVI
- NDVI calculation
- NIR and Red bands
- NDVI interpretation
- Vegetation health
- Crop stress
- Why NDVI is useful in agriculture

Formula:
NDVI = (NIR - Red) / (NIR + Red)

Never invent an NDVI value for a user's image or prediction.

E. PROJECT'S MACHINE LEARNING SYSTEM
You may explain:
- Disease classification
- Machine learning predictions
- RGB-only model
- RGB + Pseudo-NIR / multispectral model
- Model confidence
- Prediction results
- Image analysis
- How the project's ML pipeline works

The project uses:
- Scikit-learn Gradient Boosting classifier
- StandardScaler
- Image/spectral features
- RGB and multispectral/Pseudo-NIR information

If actual prediction data is provided by the application, explain that data accurately.

==================================================
2. PROJECT-SPECIFIC GROUNDING
==================================================

This chatbot is part of the "Multispectral Image Fusion for Agriculture" platform.

When answering questions about the user's uploaded image, disease prediction, confidence score, NDVI, or scan:

- ONLY use prediction information actually provided by the application.
- NEVER invent a disease name.
- NEVER invent a confidence percentage.
- NEVER invent an NDVI value.
- NEVER claim that an image was analyzed if the application did not provide an analysis result.
- If prediction information is unavailable, clearly say that no prediction/analysis result is currently available.
- Do not pretend to see or analyze an uploaded image unless image-analysis information has actually been supplied to you.

==================================================
3. STRICT AGRICULTURE-ONLY GUARDRAIL
==================================================

You MUST stay within the scope of agriculture and this project.

If the user asks about an unrelated topic, politely refuse and redirect them to agriculture/project-related questions.

For example:

User:
"What is the capital of France?"

Response:
"I'm your Agri Assistant, so I can help with agriculture, rice diseases, crop health, multispectral imaging, NDVI, and this project's analysis features. Please ask me an agriculture-related question."

Other unrelated topics that should be refused include:
- General programming questions unrelated to this project
- Movies and entertainment
- Sports
- Politics
- General history
- General mathematics
- General science unrelated to agriculture
- Personal advice unrelated to agriculture
- Jokes or entertainment requests
- Financial advice
- Unrelated technology questions
- Requests to write unrelated essays, stories, or code

==================================================
4. PROJECT-RELATED TECHNOLOGY IS ALLOWED
==================================================

Technology questions ARE allowed when they directly relate to this project.

Examples:
- "How does the backend process an image?"
- "What is the role of NIR in our project?"
- "How does the disease classifier work?"
- "Why are RGB and NIR images fused?"
- "How does the chatbot work?"
- "What model is used for disease classification?"
- "How is NDVI calculated in our system?"
- "How does the frontend communicate with the backend?"

Answer these because they are directly related to the project.

However, if the technology question is unrelated to this project, redirect the user back to agriculture/project topics.

==================================================
5. DO NOT HALLUCINATE PROJECT INFORMATION
==================================================

Never make up:
- Model accuracy
- Dataset size
- Number of classes
- Prediction results
- Confidence scores
- NDVI values
- Image-analysis results
- Backend endpoints
- Database information
- Features that are not actually implemented

If the information is not available in the provided project context, say:

"I don't have enough information from the current project data to answer that accurately."

==================================================
6. MEDICAL / SAFETY BOUNDARY
==================================================

Agricultural disease-management information is allowed.

When discussing pesticides, fungicides, herbicides, or other agricultural chemicals:

- Provide general information only.
- Recommend following the product label.
- Recommend local agricultural extension/agronomy guidance.
- Do not invent dosage or application rates.
- Do not claim that a chemical treatment is guaranteed to cure a disease.

==================================================
7. ANSWER STYLE
==================================================

Give answers that are:

- Clear
- Concise
- Practical
- Agriculture-focused
- Easy for farmers and students to understand

Use:
- Short paragraphs
- Bullet points
- Numbered steps
- Tables when useful
- Bold important terms

Do not unnecessarily mention that you are an AI.

==================================================
8. HANDLING AMBIGUOUS QUESTIONS
==================================================

If a question could reasonably be related to agriculture, interpret it in an agricultural/project context when possible.

Example:

"What is blast?"

Interpret this as rice blast disease and explain it.

If the intended meaning is unclear, ask a short clarification question.

==================================================
9. CHATBOT IDENTITY
==================================================

You are:

"Agri Assistant"

You support the:

"Multispectral Image Fusion for Agriculture" platform.

Your primary areas are:

🌾 Rice Agriculture
🦠 Rice Disease Detection
📷 Multispectral Image Analysis
🔬 RGB/NIR Image Fusion
🌱 Crop Health
📊 NDVI
🤖 Machine Learning Prediction
💬 Agricultural Assistance

Stay focused on these areas.

==================================================
10. FINAL RULE
==================================================

Before answering every question, determine:

1. Is this related to agriculture?
OR
2. Is this directly related to the Multispectral Image Fusion for Agriculture project?

If YES:
Answer helpfully.

If NO:
Politely refuse and redirect the user to agriculture/project-related topics.

Never answer unrelated questions simply because you know the answer."""


def _is_valid_key(key: Optional[str]) -> bool:
    if not key:
        return False
    k = key.strip()
    if not k or k.startswith("YOUR_") or k.startswith("your_") or "change-this" in k or k.startswith("your-"):
        return False
    return True


def _detect_provider() -> Tuple[str, str, str]:
    """
    Detects which LLM provider to use based on available environment variables.
    Returns (provider, api_key, model_name).
    """
    if os.path.exists(ENV_PATH):
        load_dotenv(ENV_PATH)

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    custom_model = os.getenv("LLM_MODEL", "").strip()

    provider = "none"
    api_key = ""
    model = ""

    if _is_valid_key(gemini_key):
        provider = "gemini"
        api_key = gemini_key.strip()
        model = custom_model or os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    elif _is_valid_key(openai_key):
        provider = "openai"
        api_key = openai_key.strip()
        model = custom_model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    elif _is_valid_key(anthropic_key):
        provider = "anthropic"
        api_key = anthropic_key.strip()
        model = custom_model or os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
    elif _is_valid_key(groq_key):
        provider = "groq"
        api_key = groq_key.strip()
        model = custom_model or os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

    # Safe diagnostic logging (never log the actual key)
    logger.info(
        f"Chatbot config -> GEMINI_API_KEY configured: {_is_valid_key(gemini_key)}, "
        f"selected provider: {provider}, selected model: {model}"
    )

    return provider, api_key, model


def _build_context_prompt(
    context: Optional[Dict[str, Any]],
    current_user: Optional[User],
    db: Optional[Session],
) -> str:
    """
    Builds contextual information about the current user, active page, and latest prediction.
    """
    sections = []

    # 1. User state
    if current_user:
        sections.append(f"User: Logged in as {current_user.name} ({current_user.email})")
    else:
        sections.append("User: Guest / Not logged in")

    # 2. Client context (e.g. current page, client-side prediction)
    if context:
        page = context.get("page")
        if page:
            sections.append(f"Active Page: {page}")

        client_pred = context.get("prediction")
        if client_pred and isinstance(client_pred, dict):
            sections.append(
                f"Current Page Prediction Data:\n"
                f"- Predicted Class: {client_pred.get('predicted_class') or client_pred.get('name')}\n"
                f"- Confidence: {client_pred.get('confidence')}%\n"
                f"- Model Used: {client_pred.get('model_used', 'standard')}\n"
                f"- NDVI Mean: {client_pred.get('ndvi_mean', client_pred.get('ndvi', {}).get('mean', 'N/A'))}"
            )

    # 3. Database latest prediction (if user is authenticated and no client prediction was provided)
    if current_user and db and not (context and context.get("prediction")):
        latest_pred = (
            db.query(Prediction)
            .filter(Prediction.user_id == current_user.id)
            .order_by(Prediction.created_at.desc())
            .first()
        )
        if latest_pred:
            ndvi_info = (
                f"Mean: {latest_pred.ndvi_mean:.3f}, Min: {latest_pred.ndvi_min:.3f}, Max: {latest_pred.ndvi_max:.3f}"
                if latest_pred.ndvi_mean is not None
                else "Unavailable (RGB-only upload)"
            )
            sections.append(
                f"User's Most Recent Saved Prediction (ID #{latest_pred.id}, {latest_pred.created_at.strftime('%Y-%m-%d %H:%M')}):\n"
                f"- Predicted Class: {latest_pred.predicted_class}\n"
                f"- Confidence: {latest_pred.confidence:.1f}%\n"
                f"- Model Used: {latest_pred.model_used}\n"
                f"- NDVI Stats: {ndvi_info}"
            )
        else:
            sections.append("User's Prediction History: No previous leaf analyses in database yet.")

    if not sections:
        return ""

    return "\n--- CURRENT SESSION & APPLICATION CONTEXT ---\n" + "\n".join(sections) + "\n---------------------------------------------\n"


def _call_gemini(api_key: str, model: str, system_prompt: str, history: List[ChatMessage], message: str) -> str:
    contents = []
    if history:
        for item in history[-10:]:
            role = "user" if item.role in ("user", "human") else "model"
            contents.append({"role": role, "parts": [{"text": item.content}]})

    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 1024,
        },
    }

    # Build list of candidate models starting with user-configured model.
    # Prefer currently available Gemini Flash IDs (gemini-2.0-flash / 1.5-flash
    # are deprecated / unavailable for many API keys).
    models_to_try = [model]
    for fallback in ("gemini-3.6-flash", "gemini-flash-latest"):
        if fallback not in models_to_try:
            models_to_try.append(fallback)

    last_err = ""
    for m in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"
        # Brief retries help with intermittent Windows DNS (Errno 11001) failures.
        for attempt in range(3):
            try:
                resp = requests.post(url, json=payload, timeout=45)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text", "").strip()
                    last_err = "Gemini returned an empty response"
                    break
                try:
                    err_data = resp.json()
                    last_err = err_data.get("error", {}).get("message", resp.text)
                except Exception:
                    last_err = resp.text

                # If model is 404 (deprecated / not found), continue to next fallback
                if resp.status_code == 404:
                    break
                raise RuntimeError(f"Gemini API error ({resp.status_code}): {last_err}")
            except requests.exceptions.Timeout:
                last_err = "Request timed out"
                if attempt < 2:
                    continue
                break
            except requests.exceptions.ConnectionError as e:
                last_err = str(e)
                if attempt < 2:
                    continue
                break
            except RuntimeError:
                raise
            except Exception as e:
                last_err = str(e)
                break

    raise RuntimeError(f"Gemini API error: {last_err or 'Failed to generate response'}")



def _call_openai(api_key: str, model: str, system_prompt: str, history: List[ChatMessage], message: str) -> str:
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    url = f"{base_url}/chat/completions"

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for item in history[-10:]:
            role = "assistant" if item.role in ("assistant", "bot", "model") else "user"
            messages.append({"role": role, "content": item.content})
    messages.append({"role": "user", "content": message})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 1024,
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if not resp.ok:
        try:
            err_msg = resp.json().get("error", {}).get("message", resp.text)
        except Exception:
            err_msg = resp.text
        raise RuntimeError(f"OpenAI API error ({resp.status_code}): {err_msg}")

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("OpenAI API returned no choices.")

    return choices[0].get("message", {}).get("content", "").strip()


def _call_anthropic(api_key: str, model: str, system_prompt: str, history: List[ChatMessage], message: str) -> str:
    url = "https://api.anthropic.com/v1/messages"

    messages = []
    if history:
        for item in history[-10:]:
            role = "assistant" if item.role in ("assistant", "bot", "model") else "user"
            messages.append({"role": role, "content": item.content})
    messages.append({"role": "user", "content": message})

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": messages,
        "temperature": 0.3,
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if not resp.ok:
        try:
            err_msg = resp.json().get("error", {}).get("message", resp.text)
        except Exception:
            err_msg = resp.text
        raise RuntimeError(f"Anthropic API error ({resp.status_code}): {err_msg}")

    data = resp.json()
    contents = data.get("content", [])
    if not contents:
        raise RuntimeError("Anthropic API returned no content.")

    return contents[0].get("text", "").strip()


def _call_groq(api_key: str, model: str, system_prompt: str, history: List[ChatMessage], message: str) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for item in history[-10:]:
            role = "assistant" if item.role in ("assistant", "bot", "model") else "user"
            messages.append({"role": role, "content": item.content})
    messages.append({"role": "user", "content": message})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 1024,
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if not resp.ok:
        try:
            err_msg = resp.json().get("error", {}).get("message", resp.text)
        except Exception:
            err_msg = resp.text
        raise RuntimeError(f"Groq API error ({resp.status_code}): {err_msg}")

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("Groq API returned no choices.")

    return choices[0].get("message", {}).get("content", "").strip()


def generate_chat_response(
    request: ChatRequest,
    current_user: Optional[User] = None,
    db: Optional[Session] = None,
) -> ChatResponse:
    """
    Orchestrates LLM selection, system prompt augmentation, and message generation.
    """
    provider, api_key, model = _detect_provider()

    # If no provider API key is set in environment
    if provider == "none" or not api_key:
        return ChatResponse(
            reply=(
                "🌾 **Agri Assistant Setup Required**\n\n"
                "To enable AI responses, please set an API key for your chosen LLM provider in `backend/.env`:\n\n"
                "- `GEMINI_API_KEY=your_key` (Google Gemini)\n"
                "- `OPENAI_API_KEY=your_key` (OpenAI)\n"
                "- `ANTHROPIC_API_KEY=your_key` (Anthropic Claude)\n"
                "- `GROQ_API_KEY=your_key` (Groq)\n\n"
                "Once added to `.env`, restart the backend server."
            ),
            provider="none",
            model="none",
        )

    # Build full prompt with real application context
    context_str = _build_context_prompt(request.context, current_user, db)
    full_system_prompt = f"{BASE_SYSTEM_PROMPT}\n{context_str}"

    history = request.history or []
    message = request.message.strip()

    try:
        if provider == "gemini":
            reply = _call_gemini(api_key, model, full_system_prompt, history, message)
        elif provider == "openai":
            reply = _call_openai(api_key, model, full_system_prompt, history, message)
        elif provider == "anthropic":
            reply = _call_anthropic(api_key, model, full_system_prompt, history, message)
        elif provider == "groq":
            reply = _call_groq(api_key, model, full_system_prompt, history, message)
        else:
            reply = "Unsupported LLM provider configured."

        return ChatResponse(reply=reply, provider=provider, model=model)

    except Exception as e:
        logger.error(f"Chat generation failed with provider {provider}: {e}")
        return ChatResponse(
            reply=(
                f"🌾 I encountered an issue contacting the AI service ({provider}): {str(e)}.\n\n"
                "Please verify your API key and network connection."
            ),
            provider=provider,
            model=model,
        )
