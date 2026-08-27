from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.database import get_db
from models.user import User
from schemas import ChatRequest, ChatResponse
from security import get_optional_current_user
from services import chat_service

router = APIRouter(prefix="/api", tags=["chat"])


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Chat with Agri Assistant AI",
    description=(
        "Processes conversational messages regarding rice leaf diseases (Healthy, BLB, Brown Spot, "
        "Leaf Blast, Leaf Scald, Sheath Blight), symptoms, treatments, prevention, rice agronomy, "
        "multispectral imaging, NDVI vegetation index calculation, and real prediction diagnosis results. "
        "Uses the configured LLM API (Gemini, OpenAI, Anthropic, or Groq) with secure server-side keys."
    ),
)
def chat(
    request: ChatRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    try:
        response = chat_service.generate_chat_response(
            request=request,
            current_user=current_user,
            db=db,
        )
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat processing failed: {str(e)}",
        )
