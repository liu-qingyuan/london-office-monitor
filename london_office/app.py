"""Same-origin local application; SDK objects never cross its HTTP Interface."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from typing import Literal
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .data import ROOT
from .market import Market
from .monitoring_status import monitoring_status
from .runtime import AgentError, CodexAdapter
from .settings import Settings
from .source_pool import SourcePool, TOPICS
from .discovery import DiscoveryError
from .research_intake import ResearchIntake, ResearchIntakeError


class MapContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    area_id: str | None = None
    metric: str | None = None
    period: str | None = None


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    session_id: str | None = Field(default=None, max_length=100)
    context: MapContext | None = None


class DiscoveryContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    area_id: str | None = None


class DiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    topic_ids: list[str] = Field(default_factory=lambda: list(TOPICS), min_length=1, max_length=8)
    context: DiscoveryContext | None = None
    authorization_id: str | None = Field(default=None, max_length=100)


class DiscoveryAuthorizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    google_cap: int = Field(strict=True, ge=1, le=100)
    model_turn_cap: int = Field(strict=True, ge=1, le=100)
    valid_for_minutes: int = Field(strict=True, ge=1, le=1440)
    request_id: str = Field(min_length=1, max_length=100)


class IntakeBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    documents: list[dict] = Field(min_length=1, max_length=20)
    candidates: list[dict] = Field(min_length=1, max_length=100)


class BatchAuthorizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content_revision: str = Field(pattern=r"^[a-f0-9]{64}$")


class CandidateDecisionRequest(BatchAuthorizationRequest):
    candidate_id: str = Field(min_length=1, max_length=240)
    decision: Literal["accept", "reject"]
    reason: str = Field(min_length=1, max_length=600)


def _require_local_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and urlparse(origin).hostname not in {"localhost", "127.0.0.1"}:
        raise AgentError("origin_not_allowed", "Agent requests must originate from the local application.")


def _require_user_origin(request: Request):
    """New state writes are user-only, exact same-origin JSON, never model tools."""
    origin = urlparse(request.headers.get("origin", ""))
    actual = urlparse(str(request.base_url))
    if (origin.scheme != actual.scheme or origin.netloc != actual.netloc or origin.path not in {"", "/"}
            or origin.query or origin.fragment or origin.username or origin.password
            or request.headers.get("x-office-user-action") != "confirm"
            or request.headers.get("content-type", "").split(";", 1)[0].lower() != "application/json"):
        raise AgentError("origin_not_allowed", "Approval must be an explicit JSON action from this exact local application origin.")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    market = Market(research_dir=settings.research_dir)
    adapter = CodexAdapter(settings)
    intake = ResearchIntake(settings.research_dir)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await asyncio.to_thread(adapter.close)

    app = FastAPI(title="London Office Monitor", version="0.1.0", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    @app.exception_handler(AgentError)
    async def agent_error(request, error):
        statuses = {"unknown_session":404, "session_busy":409, "turn_budget_exhausted":429,
            "turn_timeout":504, "invalid_question":422, "invalid_context":422,
            "invalid_answer":502, "invalid_citation":502, "unsupported_number":502,
            "no_business_tool":502, "missing_citation":502, "no_selected_evidence":502,
            "origin_not_allowed":403, "model_budget_exhausted":429, "search_budget_exhausted":429,
            "discovery_authorization_expired":403, "authorization_request_conflict":409,
            "invalid_discovery_authorization":422, "research_changed":409, "discovery_permission_exceeded":502}
        return JSONResponse({"status":"error", "error":{"code":error.code,"message":error.message}}, status_code=statuses.get(error.code, 503))

    @app.exception_handler(DiscoveryError)
    async def discovery_error(request, error):
        return await agent_error(request, AgentError(error.code, error.message))

    @app.exception_handler(ResearchIntakeError)
    async def intake_error(request, error):
        statuses = {"unknown_batch":404, "unknown_candidate":404, "stale_content_revision":409,
            "batch_not_authorized":403, "invalid_intake_state":503, "invalid_document_state":503}
        return JSONResponse({"status":"error", "error":{"code":error.code,"message":error.message}}, status_code=statuses.get(error.code, 422))

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        return JSONResponse({"status":"error", "error":{"code":"invalid_request","message":"Request does not match the v1 Interface (required fields, types or length)."}}, status_code=422)

    @app.get("/api/catalog")
    def catalog():
        return {**market.catalog(), "discovery_topics": [{"id": key, "label": label} for key, label in TOPICS.items()], "agent":{"runtime":"codex-python-sdk",
            "enabled":settings.agent_enabled,"model":settings.model,"auth_mode":settings.auth_mode,
            "discovery_configured": adapter.authorization.status()["status"] != "not_configured"}}

    @app.get("/api/market")
    def market_query(metric: str = "prime_rent", period: str = "2025-YE", area: str | None = None):
        try:
            return market.query(area=area, metric=metric, period=period)
        except ValueError as error:
            return JSONResponse({"status":"error", "error":{"code":"invalid_market_query","message":str(error)}}, status_code=422)

    @app.get("/api/monitoring")
    def monitoring():
        return monitoring_status(ROOT / "var/monitoring")

    @app.get("/api/discovery")
    def discovery_inventory():
        return SourcePool(settings.discovery_dir).view()

    @app.get("/api/discovery/authorization")
    def discovery_authorization_status():
        return adapter.authorization.status()

    @app.post("/api/discovery/authorization")
    def authorize_discovery(body: DiscoveryAuthorizationRequest, request: Request):
        _require_user_origin(request)
        if settings.auth_mode != "subscription":
            raise AgentError("discovery_subscription_required", "Discovery authorization permits subscription mode only; no paid fallback.")
        return adapter.authorization.authorize(**body.model_dump())

    @app.post("/api/discovery")
    async def discover(body: DiscoveryRequest, request: Request):
        _require_local_origin(request)
        if body.authorization_id is not None:
            _require_user_origin(request)
        context = body.context.model_dump(exclude_none=True) if body.context else None
        return await asyncio.to_thread(adapter.discover, body.question, topic_ids=body.topic_ids, context=context, authorization_id=body.authorization_id)

    @app.get("/api/research/batches")
    def research_batches():
        return intake.view()

    @app.get("/api/research/batches/{batch_id}")
    def research_batch(batch_id: str):
        return intake.view(batch_id)

    @app.post("/api/research/batches")
    def stage_research(body: IntakeBatchRequest, request: Request):
        _require_user_origin(request)
        return intake.create_batch(body.documents, body.candidates)

    @app.post("/api/research/batches/{batch_id}/authorize")
    def authorize_research(batch_id: str, body: BatchAuthorizationRequest, request: Request):
        _require_user_origin(request)
        return intake.authorize_batch(batch_id, body.content_revision)

    @app.post("/api/research/batches/{batch_id}/decisions")
    def decide_research(batch_id: str, body: CandidateDecisionRequest, request: Request):
        _require_user_origin(request)
        return intake.decide(batch_id=batch_id, **body.model_dump())

    @app.post("/api/chat")
    async def chat(body: ChatRequest, request: Request):
        _require_local_origin(request)
        context = body.context.model_dump(exclude_none=True) if body.context else None
        return await asyncio.to_thread(adapter.ask, body.question, session_id=body.session_id, context=context)

    dist = ROOT / "frontend/dist"
    if dist.is_dir() and (dist / "index.html").is_file():
        assets = dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        def home():
            return FileResponse(dist / "index.html")
    else:
        @app.get("/")
        def not_built():
            return JSONResponse({"status":"error", "error":{"code":"frontend_not_built","message":"Run `npm ci && npm run build` in frontend/, then restart. Python market endpoints already work."}}, status_code=503)
    return app
