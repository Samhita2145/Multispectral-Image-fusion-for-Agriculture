"""
Chatbot service for the "Agriculture Assistant" feature.

Design goals (see the task this was built for):
  - Never expose the API key to the browser -- it only ever lives here,
    read from the CHATBOT_API_KEY environment variable.
  - Never crash the backend if the external AI provider is unavailable,
    misconfigured, or errors out -- always return a usable reply.
  - Stay independent of the existing prediction pipeline: this module
    doesn't import ml_service and the /api/predict flow doesn't import
    this module either.

Supports two providers via CHATBOT_PROVIDER ("anthropic" [default] or
"openai"), selected by a simple env var so this can be swapped without
code changes. If CHATBOT_API_KEY isn't set, or the provider call fails
for any reason (network, auth, rate limit, timeout...), get_reply() falls
back to a small local rule-based answer instead of erroring out -- the
existing frontend widget already ships a similar local knowledge base, so
this keeps behavior consistent even when nothing is configured yet.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("chatbot")

CHATBOT_API_KEY = os.getenv("CHATBOT_API_KEY", "").strip()
CHATBOT_PROVIDER = os.getenv("CHATBOT_PROVIDER", "anthropic").strip().lower()
CHATBOT_MODEL = os.getenv(
    "CHATBOT_MODEL",
    "claude-3-5-haiku-20241022" if CHATBOT_PROVIDER == "anthropic" else "gpt-4o-mini",
).strip()
REQUEST_TIMEOUT_SECONDS = float(os.getenv("CHATBOT_TIMEOUT_SECONDS", "20"))

SYSTEM_PROMPT = """You are the "Agriculture Assistant" for the Multispectral Image Fusion for \
Agriculture project -- a rice-leaf disease detection tool that classifies leaf photos \
into one of six classes using a trained Gradient Boosting model:
  Bacterial Leaf Blight, Brown Spot, Healthy Rice Leaf, Leaf Blast, Leaf scald, Sheath Blight.

Your job:
- Explain rice leaf diseases (symptoms, general causes, prevention, general crop care)
  for the six classes above.
- Explain how this project works: RGB-only prediction vs. RGB + Pseudo-NIR fusion
  prediction, NDVI (Normalized Difference Vegetation Index) and what it measures,
  and what "confidence" means in a classifier's output.
- Explain a specific prediction result in plain language when the user provides one.

Ground rules:
- A model prediction is NOT a guaranteed diagnosis. Always frame results as "the model's
  best guess" / "the class the model assigned the highest probability to" -- never as a
  confirmed fact. For example, a 64% confidence means the model assigned Class X the
  highest probability among the six classes at 64%, not that the plant definitely has
  that disease. Encourage the user to confirm serious cases with a local agronomist or
  plant pathologist before acting (e.g. applying chemicals).
- Keep answers concise, friendly, and focused on agriculture / this project. If asked
  something totally unrelated, briefly redirect back to what you can help with.
- Do not invent statistics you weren't given. If you don't know a specific number for
  this project, say so instead of guessing."""

# ---------------------------------------------------------------
# Local fallback (used when no API key is configured, or the API call fails)
# ---------------------------------------------------------------
_FALLBACK_KB = [
    (("bacterial", "blight", "blb"), "Bacterial Leaf Blight causes water-soaked lesions along leaf margins that turn "
     "yellow-white and dry out. It's typically a severe infection. General approach: copper-based bactericide, "
     "better field drainage, remove badly infected leaves, avoid excess nitrogen. This isn't a substitute for a "
     "local agronomist's confirmation."),
    (("brown spot",), "Brown Spot shows as small circular-to-oval brown lesions with a gray/white center. Usually "
     "moderate severity. General approach: balanced potassium nutrition, a mancozeb-based fungicide, and "
     "certified/treated seed."),
    (("leaf blast", "blast"), "Leaf Blast produces diamond-shaped lesions with gray centers and brown margins, and "
     "can spread quickly -- often severe. General approach: avoid excess nitrogen, a tricyclazole-based fungicide "
     "at first sign, and blast-resistant varieties where available."),
    (("leaf scald", "scald"), "Leaf Scald shows alternating tan and reddish-brown bands running from the leaf tip "
     "inward. Usually moderate. General approach: better airflow/spacing, avoid leaf injury, remove crop debris "
     "after harvest."),
    (("sheath blight",), "Sheath Blight causes oval greenish-gray lesions on the leaf sheath near the waterline. "
     "Usually moderate. General approach: reduce planting density, manage nitrogen, and rotate crops."),
    (("healthy",), "A healthy rice leaf shows uniform green color with no lesions or unusual banding, in both RGB "
     "and (if available) the NDVI signal. No treatment needed -- keep up routine monitoring."),
    (("ndvi",), "NDVI (Normalized Difference Vegetation Index) compares near-infrared and red light reflectance to "
     "estimate plant vigor/chlorophyll health: (NIR - Red) / (NIR + Red). Higher values generally mean healthier, "
     "denser vegetation; lower or negative values can flag stress. This project computes real NDVI only when a "
     "Pseudo-NIR image is supplied alongside the RGB photo."),
    (("confidence",), "The model's \"confidence\" is the probability it assigned to its top-predicted class out of "
     "all six possible classes. It reflects how sure the model is given the input image -- it is not a medical/"
     "diagnostic certainty, and lower confidence usually means the visual symptoms were ambiguous or overlapped "
     "with another class."),
    (("fusion", "rgb+nir", "pseudo-nir", "pseudo nir"), "RGB-only prediction uses just the visible-light photo. "
     "RGB + Pseudo-NIR fusion prediction adds a near-infrared band, which lets the model (and NDVI) pick up on "
     "vegetation stress that isn't visible to the naked eye, generally improving accuracy over RGB alone."),
]
_FALLBACK_DEFAULT = (
    "I'm the Agriculture Assistant for this project. I can help explain the six rice-leaf disease classes "
    "(Bacterial Leaf Blight, Brown Spot, Healthy Rice Leaf, Leaf Blast, Leaf scald, Sheath Blight), what NDVI "
    "and confidence scores mean, and how RGB-only vs. RGB+Pseudo-NIR fusion prediction works. What would you "
    "like to know?"
)


def _fallback_reply(message: str) -> str:
    text = (message or "").lower()
    for keywords, response in _FALLBACK_KB:
        if any(kw in text for kw in keywords):
            return response
    return _FALLBACK_DEFAULT


def _build_user_message(message: str, prediction: Optional[dict]) -> str:
    if not prediction:
        return message
    predicted_class = prediction.get("predicted_class")
    confidence = prediction.get("confidence")
    probabilities = prediction.get("probabilities")
    context_lines = [f"[Context -- the user's latest prediction from this app:"]
    if predicted_class is not None:
        context_lines.append(f"predicted_class={predicted_class}")
    if confidence is not None:
        context_lines.append(f"confidence={confidence}%")
    if probabilities:
        context_lines.append(f"probabilities={probabilities}")
    context_lines.append("]")
    return f"{message}\n\n{' '.join(context_lines)}"


def _call_anthropic(user_message: str) -> str:
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": CHATBOT_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": CHATBOT_MODEL,
            "max_tokens": 500,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_message}],
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()
    parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    reply = "".join(parts).strip()
    if not reply:
        raise ValueError("Empty reply from Anthropic API")
    return reply


def _call_openai(user_message: str) -> str:
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {CHATBOT_API_KEY}",
            "content-type": "application/json",
        },
        json={
            "model": CHATBOT_MODEL,
            "max_tokens": 500,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()
    reply = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
    if not reply:
        raise ValueError("Empty reply from OpenAI API")
    return reply


def get_reply(message: str, prediction: Optional[dict] = None) -> str:
    """Returns a chatbot reply for `message`. Never raises -- on any
    configuration or provider error, logs it and falls back to a local
    rule-based answer so the endpoint always returns something useful."""
    if not CHATBOT_API_KEY:
        logger.info("CHATBOT_API_KEY not set; using local fallback reply.")
        return _fallback_reply(message)

    user_message = _build_user_message(message, prediction)

    try:
        if CHATBOT_PROVIDER == "openai":
            return _call_openai(user_message)
        return _call_anthropic(user_message)
    except httpx.TimeoutException:
        logger.warning("Chatbot provider request timed out.")
    except httpx.HTTPStatusError as e:
        logger.warning("Chatbot provider returned HTTP %s: %s", e.response.status_code, e.response.text[:300])
    except Exception as e:  # noqa: BLE001 -- deliberately broad: never let this crash the request
        logger.warning("Chatbot provider call failed: %s", e)

    return _fallback_reply(message) + (
        "\n\n(Note: the AI assistant service is temporarily unavailable, so this is a general answer.)"
    )
