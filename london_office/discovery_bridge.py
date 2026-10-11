"""Request-scoped loopback Adapter; SerpAPI credentials stay in the parent backend.

The MCP child receives only a short-lived search capability. Topic/context/receipt
remain parent-owned; this is not a key retrieval or arbitrary HTTP proxy Interface.
"""
from __future__ import annotations

import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import secrets
import threading
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from .discovery import DiscoveryError, DiscoveryTools, _NoRedirect

_MAX_REQUEST = 8192
_MAX_RESPONSE = 16 * 1024 * 1024


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False

    def handle_error(self, request, client_address):
        # A disconnected MCP must not put request headers/capabilities in logs.
        pass


class GoogleSearchBridge:
    """Own one discovery request's authenticated search route until close()."""
    def __init__(self, tools: DiscoveryTools):
        self._token = secrets.token_urlsafe(32)
        self._state_lock = threading.Lock()
        self._attempted = self._closed = False
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def setup(self):
                super().setup()
                self.connection.settimeout(5)

            def send_json(self, status, payload):
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                if len(body) > _MAX_RESPONSE:
                    status = 502
                    body = b'{"error":{"code":"discovery_bridge_failed","message":"Search response exceeds the local bridge limit; no retry."}}'
                try:
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except OSError:
                    pass  # An already-started search keeps its receipt/archive.

            def fail(self, status, code, message):
                self.send_json(status, {"error": {"code": code, "message": message}})

            def do_POST(self):
                if self.path != "/google" or not hmac.compare_digest(
                    self.headers.get("Authorization", ""), "Bearer " + bridge._token
                ):
                    return self.fail(403, "discovery_bridge_denied", "Local search capability is invalid.")
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length <= _MAX_REQUEST or self.headers.get("Transfer-Encoding"):
                        raise ValueError
                    payload = json.loads(self.rfile.read(length))
                    if (not isinstance(payload, dict) or set(payload) != {"query"}
                        or not isinstance(payload["query"], str) or not payload["query"].strip()
                        or len(payload["query"]) > 500):
                        raise ValueError
                except (ValueError, UnicodeError, OSError):
                    return self.fail(400, "invalid_search_query", "Only a bounded query JSON is accepted.")
                with bridge._state_lock:
                    if bridge._closed or bridge._attempted:
                        return self.fail(409, "discovery_query_limit", "This discovery request already attempted Google; no retry.")
                    bridge._attempted = True
                try:
                    result = tools.call("google_search_sources", payload)
                except DiscoveryError as error:
                    return self.fail(422, error.code, error.message)
                except Exception:
                    return self.fail(502, "discovery_bridge_failed", "Backend search failed; no retry or credential details returned.")
                self.send_json(200, result)

        self._server = _Server(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever,
            kwargs={"poll_interval": 0.05}, name="london-office-google-bridge", daemon=True)
        try:
            self._thread.start()
        except Exception:
            self._server.server_close()
            raise

    @property
    def mcp_env(self) -> dict[str, str]:
        return {"LONDON_GOOGLE_BRIDGE_URL": f"http://127.0.0.1:{self._server.server_port}/google",
            "LONDON_GOOGLE_BRIDGE_TOKEN": self._token}

    def close(self):
        with self._state_lock:
            if self._closed:
                return
            self._closed = True
        try:
            self._server.shutdown()
        finally:
            self._server.server_close()
            self._thread.join(timeout=1)


class GoogleBridgeClient:
    """DiscoveryTools Adapter for MCP; cannot obtain a key or alter operator scope."""
    def __init__(self, url: str, token: str):
        try:
            target = urlsplit(url)
            valid = (target.scheme == "http" and target.hostname == "127.0.0.1"
                and target.port is not None and target.path == "/google"
                and not target.username and not target.password and not target.query and not target.fragment)
        except ValueError:
            valid = False
        if not valid or not token:
            raise DiscoveryError("discovery_bridge_unavailable", "A request-scoped loopback search capability is required.")
        self._url, self._token = url, token

    def list_tools(self) -> list[dict]:
        return DiscoveryTools.list_tools()

    def call(self, name: str, arguments: dict) -> dict:
        if name != "google_search_sources" or not isinstance(arguments, dict) or set(arguments) != {"query"}:
            raise DiscoveryError("discovery_tool_not_allowed", "Only google_search_sources(query) is allowed in this profile.")
        request = Request(self._url, data=json.dumps(arguments).encode("utf-8"), method="POST",
            headers={"Authorization": "Bearer " + self._token, "Content-Type": "application/json"})
        opener = build_opener(ProxyHandler({}), _NoRedirect())
        try:
            try:
                response = opener.open(request, timeout=95)
            except HTTPError as error:
                response = error
            with response:
                raw = response.read(_MAX_RESPONSE + 1)
                if len(raw) > _MAX_RESPONSE:
                    raise ValueError
                payload = json.loads(raw)
                if not isinstance(payload, dict):
                    raise ValueError
                if "error" in payload:
                    error = payload["error"]
                    if not isinstance(error, dict) or not all(isinstance(error.get(k), str) for k in ["code", "message"]):
                        raise ValueError
                    raise DiscoveryError(error["code"], error["message"])
                if response.status != 200 or payload.get("schema_version") != 1:
                    raise ValueError
                return payload
        except DiscoveryError:
            raise
        except Exception:
            raise DiscoveryError("discovery_bridge_unavailable", "Local backend search could not complete; no retry.") from None
