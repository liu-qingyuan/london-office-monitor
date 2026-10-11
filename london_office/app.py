"""Same-origin local application; SDK objects never cross its HTTP Interface."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .data import ROOT
from .market import Market
from .runtime import AgentError, CodexAdapter
from .settings import Settings
from .source_pool import SourcePool, TOPICS


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


def _require_local_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and urlparse(origin).hostname not in {"localhost", "127.0.0.1"}:
        raise AgentError("origin_not_allowed", "Agent requests must originate from the local application.")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    market = Market()
    adapter = CodexAdapter(settings)

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
            "origin_not_allowed":403, "model_budget_exhausted":429, "discovery_permission_exceeded":502}
        return JSONResponse({"status":"error", "error":{"code":error.code,"message":error.message}}, status_code=statuses.get(error.code, 503))

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        return JSONResponse({"status":"error", "error":{"code":"invalid_request","message":"Request does not match the v1 Interface (required fields, types or length)."}}, status_code=422)

    @app.get("/api/catalog")
    def catalog():
        return {**market.catalog(), "discovery_topics": [{"id": key, "label": label} for key, label in TOPICS.items()], "agent":{"runtime":"codex-python-sdk",
            "enabled":settings.agent_enabled,"model":settings.model,"auth_mode":settings.auth_mode,
            "discovery_configured": settings.discovery_budget_file is not None}}

    @app.get("/api/market")
    def market_query(metric: str = "prime_rent", period: str = "2025-YE", area: str | None = None):
        try:
            return market.query(area=area, metric=metric, period=period)
        except ValueError as error:
            return JSONResponse({"status":"error", "error":{"code":"invalid_market_query","message":str(error)}}, status_code=422)

    @app.get("/api/discovery")
    def discovery_inventory():
        return SourcePool(settings.discovery_dir).view()

    @app.post("/api/discovery")
    async def discover(body: DiscoveryRequest, request: Request):
        _require_local_origin(request)
        context = body.context.model_dump(exclude_none=True) if body.context else None
        return await asyncio.to_thread(adapter.discover, body.question, topic_ids=body.topic_ids, context=context)

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
