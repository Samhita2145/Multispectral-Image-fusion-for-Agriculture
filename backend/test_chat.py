"""
Test suite for the AI Chatbot integration and existing API endpoints.
Run with: python test_chat.py or pytest test_chat.py
"""
import io
import os
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import numpy as np
from PIL import Image

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.database import Base, engine, get_db
from models.prediction import Prediction
from models.user import User

client = TestClient(app)


def test_health_endpoints():
    """Verify both / and /api/health work."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert res_root.json()["status"] == "ok"

    res_health = client.get("/api/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "ok"


def test_chat_empty_message():
    """Verify empty message is rejected with 422 Unprocessable Entity."""
    res = client.post("/api/chat", json={"message": "   "})
    assert res.status_code == 422


def test_chat_no_key_configured():
    """When no LLM API key is set in env, return friendly setup instructions."""
    with patch.dict(os.environ, {
        "GEMINI_API_KEY": "",
        "GOOGLE_API_KEY": "",
        "OPENAI_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "GROQ_API_KEY": "",
    }, clear=False):
        res = client.post("/api/chat", json={"message": "What is brown spot?"})
        assert res.status_code == 200
        data = res.json()
        assert "reply" in data
        assert "Agri Assistant Setup Required" in data["reply"]
        assert data["provider"] == "none"


def test_chat_gemini_mocked():
    """Test successful Gemini API response handling."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "Brown spot is a fungal disease caused by Bipolaris oryzae. It produces small oval brown spots with yellow halos."}
                    ]
                }
            }
        ]
    }

    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key", "GEMINI_MODEL": "gemini-2.5-flash"}, clear=False):
        with patch("requests.post", return_value=mock_response) as mock_post:
            res = client.post("/api/chat", json={
                "message": "What causes brown spot in rice?",
                "history": [
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "Hello! How can I help?"}
                ],
                "context": {"page": "Disease Detection"}
            })
            assert res.status_code == 200
            data = res.json()
            assert data["provider"] == "gemini"
            assert data["model"] == "gemini-2.0-flash"
            assert "Bipolaris oryzae" in data["reply"]
            assert mock_post.called


def test_chat_openai_mocked():
    """Test successful OpenAI API response handling."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "NDVI measures vegetation vigor using the formula (NIR - Red) / (NIR + Red)."
                }
            }
        ]
    }

    with patch.dict(os.environ, {
        "GEMINI_API_KEY": "",
        "GOOGLE_API_KEY": "",
        "OPENAI_API_KEY": "test_openai_key",
        "OPENAI_MODEL": "gpt-4o-mini"
    }, clear=False):
        with patch("requests.post", return_value=mock_response) as mock_post:
            res = client.post("/api/chat", json={
                "message": "How is NDVI calculated?"
            })
            assert res.status_code == 200
            data = res.json()
            assert data["provider"] == "openai"
            assert "(NIR - Red)" in data["reply"]
            assert mock_post.called


def test_chat_anthropic_mocked():
    """Test successful Anthropic API response handling."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "content": [
            {
                "type": "text",
                "text": "Bacterial Leaf Blight is treated using copper-based bactericides and balanced nitrogen fertilization."
            }
        ]
    }

    with patch.dict(os.environ, {
        "GEMINI_API_KEY": "",
        "GOOGLE_API_KEY": "",
        "OPENAI_API_KEY": "",
        "ANTHROPIC_API_KEY": "test_anthropic_key",
        "ANTHROPIC_MODEL": "claude-3-5-haiku-20241022"
    }, clear=False):
        with patch("requests.post", return_value=mock_response) as mock_post:
            res = client.post("/api/chat", json={
                "message": "How do I treat Bacterial Leaf Blight?"
            })
            assert res.status_code == 200
            data = res.json()
            assert data["provider"] == "anthropic"
            assert "copper-based bactericides" in data["reply"]
            assert mock_post.called


def test_chat_groq_mocked():
    """Test successful Groq API response handling."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Image fusion combines RGB spatial details with Near-Infrared spectral sensitivity."
                }
            }
        ]
    }

    with patch.dict(os.environ, {
        "GEMINI_API_KEY": "",
        "GOOGLE_API_KEY": "",
        "OPENAI_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "GROQ_API_KEY": "test_groq_key",
        "GROQ_MODEL": "llama-3.1-8b-instant"
    }, clear=False):
        with patch("requests.post", return_value=mock_response) as mock_post:
            res = client.post("/api/chat", json={
                "message": "Explain image fusion."
            })
            assert res.status_code == 200
            data = res.json()
            assert data["provider"] == "groq"
            assert "Image fusion" in data["reply"]
            assert mock_post.called


def test_chat_api_error_handling():
    """Test graceful handling when LLM provider returns a 429 rate limit or 500 error."""
    mock_response = MagicMock()
    mock_response.ok = False
    mock_response.status_code = 429
    mock_response.json.return_value = {"error": {"message": "Rate limit exceeded"}}
    mock_response.text = "Rate limit exceeded"

    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}, clear=False):
        with patch("requests.post", return_value=mock_response):
            res = client.post("/api/chat", json={"message": "Hello"})
            assert res.status_code == 200
            data = res.json()
            assert "encountered an issue" in data["reply"]


def test_existing_auth_and_prediction():
    """Verify existing auth and prediction flow still works intact."""
    # Register a test user
    email = f"chattest_{os.urandom(4).hex()}@example.com"
    reg_res = client.post("/api/auth/register", json={
        "name": "Chat Tester",
        "email": email,
        "password": "Password123"
    })
    assert reg_res.status_code in (200, 201)
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify auth /me
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

    # Test /api/predict with synthetic RGB image
    img = Image.new("RGB", (128, 128), color=(45, 120, 45))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    pred_res = client.post(
        "/api/predict",
        headers=headers,
        files={"rgb_image": ("test_leaf.jpg", buf, "image/jpeg")}
    )
    assert pred_res.status_code == 200
    pred_data = pred_res.json()
    assert "predicted_class" in pred_data
    assert "confidence" in pred_data
    assert pred_data["model_used"] == "rgb_only"

    # Test history retrieval
    hist_res = client.get("/api/history", headers=headers)
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1


if __name__ == "__main__":
    print("Running tests...")
    test_health_endpoints()
    print("[PASS] Health endpoints passed")
    test_chat_empty_message()
    print("[PASS] Chat empty message validation passed")
    test_chat_no_key_configured()
    print("[PASS] Chat setup notice when key missing passed")
    test_chat_gemini_mocked()
    print("[PASS] Chat Gemini provider passed")
    test_chat_openai_mocked()
    print("[PASS] Chat OpenAI provider passed")
    test_chat_anthropic_mocked()
    print("[PASS] Chat Anthropic provider passed")
    test_chat_groq_mocked()
    print("[PASS] Chat Groq provider passed")
    test_chat_api_error_handling()
    print("[PASS] Chat error handling passed")
    test_existing_auth_and_prediction()
    print("[PASS] Existing auth, prediction, history passed")
    print("\nAll tests passed successfully!")

