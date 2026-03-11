"""
Progress API — Quiz history, weak areas, interview history, study stats.
"""
import logging
from collections import Counter
from fastapi import APIRouter, Depends
from supabase import create_client

from app.core.config import get_settings
from app.core.security import get_current_user_id
from app.models.schemas import ProgressSummary

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/summary", response_model=ProgressSummary)
def get_progress_summary(user_id: str = Depends(get_current_user_id)):
    """Get a summary of the user's learning progress."""
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # Quiz results
    quiz_result = (
        supabase.table("quiz_results")
        .select("score_percent, weak_areas, topic, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    quiz_data = quiz_result.data or []

    # Interview sessions
    interview_result = (
        supabase.table("interview_sessions")
        .select("overall_score, topic, created_at, status")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    interview_data = interview_result.data or []

    # Calculate stats
    total_quizzes = len(quiz_data)
    avg_score = (
        sum(q["score_percent"] for q in quiz_data) / total_quizzes
        if total_quizzes > 0
        else 0.0
    )

    # Weak areas from quiz results
    all_weak = []
    for q in quiz_data:
        all_weak.extend(q.get("weak_areas") or [])

    weak_counter = Counter(all_weak)
    strong_topics = [t for t, _ in weak_counter.most_common() if _ == 0]
    weak_topics = [t for t, count in weak_counter.most_common(5) if count > 0]

    # High-scoring topics = strong
    high_score_topics = [q["topic"] for q in quiz_data if q["score_percent"] >= 80]
    strong_topics = list(set(high_score_topics))[:5]

    # Recent activity (last 10 items combined)
    recent_activity = []
    for q in quiz_data[:5]:
        recent_activity.append({
            "type": "quiz",
            "topic": q["topic"],
            "score": q["score_percent"],
            "date": q["created_at"],
        })
    for i in interview_data[:5]:
        recent_activity.append({
            "type": "interview",
            "topic": i["topic"],
            "score": i.get("overall_score", 0),
            "date": i["created_at"],
        })

    # Sort by date desc
    recent_activity.sort(key=lambda x: x["date"], reverse=True)

    return ProgressSummary(
        total_quizzes=total_quizzes,
        average_score=round(avg_score, 2),
        total_interviews=len(interview_data),
        weak_topics=weak_topics[:5],
        strong_topics=strong_topics[:5],
        recent_activity=recent_activity[:10],
        study_streak_days=0,  # Placeholder — implement with daily login tracking
    )
