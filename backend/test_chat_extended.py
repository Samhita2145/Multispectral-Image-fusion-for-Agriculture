"""
Extended tests for Chatbot context injection, prediction grounding, and multi-turn chat.
"""
import os
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.database import get_db
from models.prediction import Prediction
from models.user import User

client = TestClient(app)


def test_prediction_context_grounding():
    """Verify that prediction context is provided to the LLM without inventing data."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "Based on your diagnosis, the model identified Leaf Blast with 89.5% confidence."}
                    ]
                }
            }
        ]
    }

    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key"}, clear=False):
        with patch("requests.post", return_value=mock_response) as mock_post:
            res = client.post("/api/chat", json={
                "message": "What did the model detect in my last analysis?",
                "context": {
                    "page": "Disease Detection",
                    "prediction": {
                        "predicted_class": "Leaf Blast",
                        "confidence": 89.5,
                        "model_used": "fusion",
                        "ndvi_mean": 0.452
                    }
                }
            })
            assert res.status_code == 200
            data = res.json()
            assert "Leaf Blast" in data["reply"]

            # Inspect payload sent to Gemini to ensure prediction context was injected in systemInstruction
            call_kwargs = mock_post.call_args[1]
            sent_json = call_kwargs["json"]
            system_instruction_text = sent_json["systemInstruction"]["parts"][0]["text"]
            assert "Leaf Blast" in system_instruction_text
            assert "89.5" in system_instruction_text
            assert "0.452" in system_instruction_text


def test_no_prediction_context_grounding():
    """When no prediction context exists, system prompt instructs not to hallucinate."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "You have not performed a leaf scan yet. Please upload a photo on the Disease Detection page."}
                    ]
                }
            }
        ]
    }

    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key"}, clear=False):
        with patch("requests.post", return_value=mock_response) as mock_post:
            res = client.post("/api/chat", json={
                "message": "What is my disease prediction?"
            })
            assert res.status_code == 200
            data = res.json()
            assert "not performed a leaf scan" in data["reply"]

            # Verify prompt contains the no-hallucination instruction
            call_kwargs = mock_post.call_args[1]
            sent_json = call_kwargs["json"]
            system_instruction_text = sent_json["systemInstruction"]["parts"][0]["text"]
            assert "NEVER invent, guess, or fabricate disease prediction results" in system_instruction_text


def test_multi_turn_history_preservation():
    """Test that multi-turn history is formatted and sent to provider."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "For Bacterial Leaf Blight, you should apply copper oxychloride bactericide."}
                    ]
                }
            }
        ]
    }

    history = [
        {"role": "user", "content": "What diseases do you detect?"},
        {"role": "assistant", "content": "I detect Bacterial Leaf Blight, Brown Spot, Leaf Blast, Leaf Scald, and Sheath Blight."},
        {"role": "user", "content": "Tell me more about the first one."}
    ]

    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key"}, clear=False):
        with patch("requests.post", return_value=mock_response) as mock_post:
            res = client.post("/api/chat", json={
                "message": "How do I treat it?",
                "history": history
            })
            assert res.status_code == 200

            call_kwargs = mock_post.call_args[1]
            sent_json = call_kwargs["json"]
            contents = sent_json["contents"]
            assert len(contents) == 4  # 3 history items + 1 current message
            assert contents[0]["parts"][0]["text"] == "What diseases do you detect?"
            assert contents[3]["parts"][0]["text"] == "How do I treat it?"


if __name__ == "__main__":
    test_prediction_context_grounding()
    print("[PASS] Prediction context grounding passed")
    test_no_prediction_context_grounding()
    print("[PASS] No-prediction anti-hallucination passed")
    test_multi_turn_history_preservation()
    print("[PASS] Multi-turn history preservation passed")
    print("\nAll extended tests passed!")
