"""
Multi-Agent Orchestration via LangGraph.

Agents:
  - TutorAgent     → step-by-step explanation
  - QuizAgent      → MCQ / short-answer generation
  - RevisionAgent  → summary & flash cards
  - PlannerAgent   → study schedule builder
  - InterviewAgent → mock interview simulator
  - DoubtAgent     → deep conceptual Q&A

Router → decides which agent handles the user's intent.
"""

from __future__ import annotations

import json
from typing import Annotated, TypedDict, Literal
from groq import Groq
from langgraph.graph import StateGraph, END
from core.config import settings
import logging

logger = logging.getLogger(__name__)

groq = Groq(api_key=settings.GROQ_API_KEY)


# ── State ─────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    user_id: str
    message: str
    context: str          # RAG-retrieved context
    agent: str            # Which agent is active
    response: str
    metadata: dict


# ── Router ────────────────────────────────────────────────────────────────────

def route_intent(state: AgentState) -> str:
    """
    LLM-based intent classifier.
    Returns which agent should handle the message.
    """
    msg = state["message"].lower()

    # Rule-based fast routing (no LLM cost for obvious cases)
    if any(k in msg for k in ["quiz", "mcq", "question", "test me", "practice"]):
        return "quiz"
    if any(k in msg for k in ["interview", "dsa", "placement", "coding round", "system design"]):
        return "interview"
    if any(k in msg for k in ["summarize", "summary", "revision", "flashcard", "key points"]):
        return "revision"
    if any(k in msg for k in ["schedule", "plan", "study plan", "timetable", "exam on"]):
        return "planner"
    if any(k in msg for k in ["explain", "what is", "how does", "why does", "define"]):
        return "tutor"

    # Fall back to LLM routing
    resp = groq.chat.completions.create(
        model=settings.GROQ_FAST_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Classify the student's message into ONE of: "
                    "tutor, quiz, revision, planner, interview, doubt. "
                    "Respond with only the lowercase word."
                ),
            },
            {"role": "user", "content": state["message"]},
        ],
        max_tokens=5,
        temperature=0,
    )
    intent = resp.choices[0].message.content.strip().lower()
    return intent if intent in ["tutor", "quiz", "revision", "planner", "interview", "doubt"] else "tutor"


# ── Agents ────────────────────────────────────────────────────────────────────

def _call_llm(system: str, user: str, model: str = None, max_tokens: int = 1024) -> str:
    resp = groq.chat.completions.create(
        model=model or settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.4,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content


def tutor_agent(state: AgentState) -> AgentState:
    """Explains concepts step-by-step using retrieved context."""
    answer = _call_llm(
        system=(
            "You are an expert tutor. Using ONLY the provided context, explain the concept "
            "clearly with: 1) Simple definition 2) Key points 3) Real example 4) Summary. "
            "Use markdown. If context is empty, say you need the student to upload relevant notes."
        ),
        user=f"CONTEXT:\n{state['context']}\n\nSTUDENT ASKS: {state['message']}",
    )
    return {**state, "response": answer, "agent": "tutor"}


def quiz_agent(state: AgentState) -> AgentState:
    """Generates structured quiz from context."""
    answer = _call_llm(
        system=(
            "You are a quiz generator. Generate 5 MCQ questions from the provided context. "
            "Format as valid JSON array:\n"
            '[{"q": "...", "options": ["A)..","B)..","C)..","D).."], "answer": "A", "explanation": "..."}]'
            "\nReturn ONLY the JSON array, no preamble."
        ),
        user=f"CONTEXT:\n{state['context']}\n\nTOPIC: {state['message']}",
        max_tokens=1500,
    )
    return {**state, "response": answer, "agent": "quiz"}


def revision_agent(state: AgentState) -> AgentState:
    """Creates concise revision notes."""
    answer = _call_llm(
        system=(
            "You are a revision assistant. From the provided context, create: "
            "1) 10-bullet summary 2) 5 key definitions 3) 3 things most likely to be tested. "
            "Use markdown. Be concise."
        ),
        user=f"CONTEXT:\n{state['context']}\n\nCREATE REVISION NOTES FOR: {state['message']}",
    )
    return {**state, "response": answer, "agent": "revision"}


def planner_agent(state: AgentState) -> AgentState:
    """Builds adaptive study schedule."""
    answer = _call_llm(
        system=(
            "You are a study planner. Build a day-by-day study schedule in markdown table format. "
            "Include: Date | Topic | Duration | Resources | Review time. "
            "Factor in spaced repetition (review after 1d, 3d, 7d)."
        ),
        user=f"CONTEXT (topics from uploaded notes):\n{state['context']}\n\nPLAN REQUEST: {state['message']}",
    )
    return {**state, "response": answer, "agent": "planner"}


def interview_agent(state: AgentState) -> AgentState:
    """Simulates technical interviews."""
    answer = _call_llm(
        system=(
            "You are a senior engineer conducting a technical interview. "
            "Ask 3 interview questions based on the topic. After each question, "
            "include [EXPECTED ANSWER] in a collapsible section. "
            "Topics: DSA, OS, DBMS, System Design, Networks. "
            "End with 'How would you like to proceed? (Answer Q1 / Skip / New Topic)'"
        ),
        user=f"CONTEXT:\n{state['context']}\n\nINTERVIEW TOPIC: {state['message']}",
    )
    return {**state, "response": answer, "agent": "interview"}


def doubt_agent(state: AgentState) -> AgentState:
    """Deep conceptual doubt solving."""
    answer = _call_llm(
        system=(
            "You are an expert at clearing conceptual doubts. "
            "Give a thorough explanation with: analogy, technical detail, common misconceptions, "
            "and a worked example. Use the provided context. If unsure, say so."
        ),
        user=f"CONTEXT:\n{state['context']}\n\nDOUBT: {state['message']}",
        max_tokens=1500,
    )
    return {**state, "response": answer, "agent": "doubt"}


# ── Graph ─────────────────────────────────────────────────────────────────────

def build_agent_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("tutor", tutor_agent)
    graph.add_node("quiz", quiz_agent)
    graph.add_node("revision", revision_agent)
    graph.add_node("planner", planner_agent)
    graph.add_node("interview", interview_agent)
    graph.add_node("doubt", doubt_agent)

    graph.set_conditional_entry_point(
        route_intent,
        {
            "tutor": "tutor",
            "quiz": "quiz",
            "revision": "revision",
            "planner": "planner",
            "interview": "interview",
            "doubt": "doubt",
        },
    )

    for node in ["tutor", "quiz", "revision", "planner", "interview", "doubt"]:
        graph.add_edge(node, END)

    return graph.compile()


# Compiled graph — import this
agent_graph = build_agent_graph()


async def run_agents(
    message: str,
    user_id: str,
    context: str = "",
    metadata: dict = {},
) -> dict:
    """Main entry point for the agent system."""
    state: AgentState = {
        "user_id": user_id,
        "message": message,
        "context": context,
        "agent": "",
        "response": "",
        "metadata": metadata,
    }
    result = await agent_graph.ainvoke(state)
    return {
        "response": result["response"],
        "agent": result["agent"],
    }
