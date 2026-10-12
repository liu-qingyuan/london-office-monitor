# London Office Monitor

**English** | [简体中文](README.zh-CN.md)

A runnable London office-market monitoring proof of concept: **Python handles source provenance, definitions, queries and calculations; the official Codex Python SDK calls constrained business tools; deck.gl + MapLibre provide the interactive map.** It does not depend on personal Pi Agent configuration, integrate LiteLLM, or promise interchangeable runtimes.

## Scope and honest limitations

- Eleven historical City / West End prime-rent and vacancy observations from Savills **2024 / 2025 year-end** reports. Separately, the bundled user-approved eight-dimension, source-bounded research contains **132 records** (120 original + 12 verified 2026 facts), **21 sources, 105 short evidence excerpts, three Python comparisons**, and **seven excluded fields** whose licensing/evidence gaps are recorded without publishing numbers.
- Python compares periods, distinguishes percentage rent changes from vacancy percentage-point changes, preserves both publisher-reported year-on-year figures and computed differences, and exposes missing/conflicting values with the original excerpt.
- An explorable London 3D map fills the viewport, with native pan/zoom/rotation/pitch, submarket hover/focus, scale and overview reset. A **visionOS-inspired glass icon rail** on the right initially displays nine navigation icons; hover/focus expands labels in the same rail and leaving collapses them. There is no orb or separate pop-up menu; clicking opens content. Sections cover submarkets, rents, vacancy and availability, leasing, supply, macro, demand, news and map layers. The eight market sections show accepted research with its actual window, geography, source and limitations. Map layers still use only the original three metrics and do not imply complete or live market coverage. A separate top Agent capsule expands to show Python values/charts/calculations and AI interpretation, with expandable actual tool inputs/outputs. Rounded translucent floating panels and source-value SVG charts are implemented over the full-screen map.
- Canary Wharf and Midtown / Fringe remain missing when comparable definitions are unavailable. All four map areas are hand-drawn selection geometry, **not official reporting boundaries or building-level statistics**.
- Annual/Q4 flows, stocks, forecasts, UK/sample context and named events in the eight-dimension research retain distinct windows and populations; they do not inherit map selection or year-end filters and are not assigned to buildings. Historical extracts are **not live or comprehensive current-market coverage**. Official-index detection, bounded macOS scheduling, and a read-only monitoring card in News exist, but detected links are leads rather than verified live news or automatically updated market figures. No precise report GIS, measured building-height coverage, or automatic publication of new reports is claimed. OpenFreeMap / OpenMapTiles 3D buildings are spatial background only, not per-building rent or vacancy; missing heights are not invented.
- Rents retain the source's £/sq ft unit; a billing period is not added where the source does not state one. Prime achieved, headline/top, Grade A, and different vacancy populations are not interchangeable.

## Implementation entry point and current status

**The user accepted the map-stage performance result; further software-rendering optimization is deferred.** Map-stage baseline `0177481`: 27 Python checks plus type checking passed in **1.21 s**; on the tested Apple M5 Pro / Metal, the complete real-map regression passed **33/33 in 53.66 s**. The SwiftShader complete run timed out unfinished (16 passed, four explicitly skipped, 13 unexecuted), not a complete GREEN. A later historical GPU run recorded 35/35 in 58 s; **neither is a new full-map run for this source-discovery update**. The original failures, samples and qualifications are in [`docs/verification.md`](docs/verification.md). No new 60-second full-regression target or substitute limit is imposed for this stage.

Issues [#3 hot interactions](https://github.com/liu-qingyuan/london-office-monitor/issues/3) and [#4 cold start/degradation](https://github.com/liu-qingyuan/london-office-monitor/issues/4) are closed. [#5 verification feedback](https://github.com/liu-qingyuan/london-office-monitor/issues/5) remains open, `ready-for-human`, explicitly deferred pending another user decision, not in the automatic implementation queue. The latest decision is [Spec #2](https://github.com/liu-qingyuan/london-office-monitor/issues/2) / its [repository mirror](docs/specs/map-performance.md). Work stays on `main`, without a new branch, worktree or Ralph loop. Map-stage acceptance does not establish a new live-model test, cross-hardware guarantee, or closure of Issue #1's separate original criteria. Approval to ingest the eight-dimension research and update the existing application does not authorize future automatic publication or paid calls.

The coding agent's development permissions differ from the in-app market Agent's six read-only tools; see [`AGENTS.md`](AGENTS.md). At task startup, read the current Ticket body and comments, [`GLOSSARY.md`](GLOSSARY.md), [`docs/contracts.md`](docs/contracts.md), and relevant [`docs/adr/`](docs/adr/); identify scope and known failures. Tool availability is not authorization to expand scope.

| Module / responsibility | Entry points | Boundary |
|---|---|---|
| Data and sources | `london_office/data.py`, `london_office/research_intake.py`, `london_office/source_pool.py`, `data/README.md` | Immutable baseline, explicitly admitted research overlay and unverified metadata stay separate |
| Source discovery | `london_office/authorization.py`, `london_office/discovery.py`, `london_office/discovery_bridge.py`, `docs/features/source-discovery.md` | User-approved finite web grants, backend expiry checks; metadata through Codex Adapter |
| Official monitoring | `london_office/official_watch.py`, `london_office/monitor_schedule.py`, `london_office/monitoring_status.py`, `frontend/src/monitoring.ts` | Official index / bounded macOS scheduling; read-only News archive, coarse keyword screening, no market-figure writes |
| Market | `london_office/market.py` | Python values, definitions, comparisons, missing/conflict; HTTP and tools share the business surface |
| HTTP interface | `london_office/app.py`, `london_office/tools.py` | Existing business JSON / six tools plus separate discovery contract; no SDK objects sent to UI |
| Workspace | `frontend/src/main.ts`, `frontend/src/types.ts` | Navigation, detail and answer scope; consumes Python facts rather than recomputing metrics |
| Map | `frontend/src/map.ts` | Private dimension/spatial/render lifecycle; real buildings are spatial background only |
| Codex Adapter | `london_office/runtime.py`, `london_office/settings.py`, `london_office/mcp_server.py` | In-app SDK, authentication, tool permissions and answer validation; no personal config |
| Presentation | `presentation/README.md`, `presentation/kimi-prompt-zh-CN.md`, `presentation/kimi-prompt-en.md`, `presentation/materials/` | Only Kimi creates/edits the PPT; other AI supplies prompts, real screenshots and descriptions, not a presentation |

For a captured slowdown, first preserve a minimal real-input reproduction and run a targeted profile before changing code. Run the shortest necessary check for routine edits, not the full suite each time. Use the existing commands below and `frontend/package.json` / `frontend/playwright.config.ts`; do not invent a runner. Type checking alone does not verify HTTP contracts, permissions or visible-frame latency.

## Quick start

Requires Python 3.12 or 3.13, Node.js 22.12+ (25.9.0 tested), and npm. Dependency installation requires network access. The free OpenFreeMap basemap needs no map key. `uv.lock` and `frontend/package-lock.json` pin versions; SDK/runtime is `0.162.0`.

**Supported operating systems:** the application is adapted to the official Codex runtime's **macOS, Linux and native Windows**. SerpAPI validates keys over HTTPS independently of OS. Both CLI and web backend accept environment variables; macOS Keychain is optional local storage, not a prerequisite.

| Backend OS | Implementation and verification boundary |
|---|---|
| macOS | Native machine and CI passed; use dedicated Keychain item if already configured, or an environment variable |
| Linux | Native Ubuntu CI passed; same environment-variable path and POSIX receipt locking |
| Windows (native Python) | Native CI passed; environment variable, `.venv/Scripts/python.exe` and Windows receipt locking; no Mac, Bash or WSL required |

The [portable CI workflow](.github/workflows/portability.yml) had a [first native run](https://github.com/liu-qingyuan/london-office-monitor/actions/runs/38155388215) **6/6 passed** at `a0c98a5`: Python 3.12/3.13 on each OS, 54 Python tests per combination, production build and seven UI smoke tests, including unauthenticated fixed-SDK startup, HTTP/MCP and budget contention. See [`docs/verification.md`](docs/verification.md) for scope and exclusions. This does not prove real-account login/search/model, every filesystem, the full map or cross-hardware performance; CI VM times are not the local quick/focused budgets. The following `uv` install/start commands work in Bash or Windows PowerShell.

### Automated cross-platform CI

GitHub's standard macOS, Ubuntu and Windows runners install pinned dependencies and run checks; you do not need three computers. Standard runners are free for this public repository. CI uses unauthenticated startup, offline business/SDK fixtures, build and UI smoke only: not your SerpAPI/Codex keys, real search or model generation.

- Push or open a PR to trigger it. For a manual run: **Actions → Portable runtime → Run workflow → main → Run workflow**.
- If GitHub CLI is available: `gh workflow run portability.yml --ref main`, then `gh run list --workflow portability.yml`.
- Six combinations (three OS × two Python versions) run in parallel; initial installation often takes minutes. Green means these checks passed at that commit, not live-model or full-map acceptance.

**Historical metrics, map and ordinary market questions do not require a SerpAPI key.** Only Google source discovery does; before using it, see [SerpAPI key setup and use](#serpapi-key-setup-and-use).

```bash
# From the repository root
uv sync --frozen --python 3.12
cd frontend
npm ci
npm run build
cd ..
uv run london-office serve --no-agent
```

Open **http://127.0.0.1:8017**. Offline mode means no model call; metrics use the bundled real historical snapshot. If the network basemap fails, labelled illustrative geometry and the metric list remain. This mode is not a live-model test.

Without `uv`, create a standard virtual environment in the project. macOS/Linux:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
.venv/bin/python -m pip install --no-deps -e .
.venv/bin/python -m london_office serve --no-agent
```

Windows PowerShell (with the Python 3.12 launcher; your Python 3.13 is also supported):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe -m pip install --no-deps -e .
.\.venv\Scripts\python.exe -m london_office serve --no-agent
```

The frontend still requires `npm ci` and `npm run build`. No global Codex installation is needed: the Python SDK uses the pinned CLI runtime.

## Using the map

- Drag to pan, scroll to zoom, right-drag to rotate/pitch; touchscreens use native map gestures.
- Hover an illustrative area for name, current metric, period and unit; click to focus and update detail. Hover/focus expands labels inside the right-hand rail and leaving collapses them; only click opens a section. The desktop rail stays fixed on the right; text expands left without moving icon coordinates. Enter selects and Escape collapses. On narrow screens the same icons form a horizontally scrollable rail: first touch reveals a label, next touch explicitly selects. Leaving the rail does not close opened content; Close or Escape returns to the map.
- Map-bottom controls zoom, rotate, tilt, switch to overhead and reset to **Overview**; the left compass resets north and the information button explains spatial provenance and limits.
- Changing metric/period does not reset the camera. Two-period bar charts plot only actual available values: missing is neither a zero bar nor an estimate.
- Expand integrated detail for year-specific short original excerpts and citations. Ask a question in the top **Ask about this market…** capsule: focus/suggestions do not send model requests; only Arrow or Enter submits. Answers normally include values, charts, Python comparison, sources and qualitative AI interpretation. Expand **Tools used** for exact inputs, return summary and full JSON. Answer scope follows evidence rather than borrowing the selected map label; **View on map** explicitly focuses the relevant area. Closing/Escape hides but preserves content; an already-open detail remains; hiding does not cancel an explicitly submitted request. **Research intake** stages your uploaded original material and scalar candidates; its separate batch approval admits eligible evidence, leaves ambiguities/conflicts for decisions, and blocks missing originals. It never turns search snippets into market facts.
- Basemap failure is labelled while real market data and illustrative selections remain; no static screenshot/fake city stands in for the 3D service.

The map stage includes integrated left detail, selection, real-building coloring and regression coverage. Further optimization is deferred. That map iteration added no HTTP contract, data, research/publication capability or model calls; source discovery is the separate increment below. Visual/interaction references are the user's `test1.png` and [Apple visionOS Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars): CSS blur, translucency, highlight and shadow, not native Apple Liquid Glass or full optical refraction. The prior chat's real business `output` extension remains. Old PPT/ZIP artifacts were not regenerated; old screenshots do not describe the new UI. Visual and business acceptance remain with the user.

## Enable the Agent with your own account

```bash
uv run london-office login          # Complete SDK login in your own browser
# If browser callback is unavailable: uv run london-office login --device
uv run london-office status
uv run london-office models         # Check models available to your account; no generation
uv run london-office chat           # Multi-turn CLI, exit to finish
uv run london-office serve          # On-demand web chat, localhost only
```

The default model is `gpt-6.1-sol`; actual availability depends on your account. If unavailable, choose `LONDON_MODEL` explicitly from `models` output; there is no automatic paid fallback. Ordinary chat and legacy discovery default to at most ten interaction turns per process, 120 s per turn, with no automatic model retry. Explicit web discovery uses its finite grant's caller-turn cap instead, so approving a new grant does not require a restart. A single SDK interaction can contain multiple internal model/tool requests; these limits are not token or cost caps.

The SDK keeps authentication outside the repository in its dedicated `~/.local/share/london-office-monitor/codex` directory. Code neither reads nor copies personal `~/.codex` configuration/credentials. Subscription mode explicitly blocks inherited `OPENAI_API_KEY` / `CODEX_API_KEY`; the SerpAPI key is removed from the SDK environment too. Ordinary questions allow only six project read-only tools, no shell, web search or multi-agent use. Explicit source discovery uses the isolated profile below without broadening ordinary chat permissions. Tool evidence is written under ignored `var/runs/`; conversations are memory-only and disappear on restart.

**API-key mode is separate usage-based billing from a subscription.** Enable only if you personally accept its costs:

```bash
export LONDON_AUTH_MODE=api-key
export OPENAI_API_KEY='YOUR_OWN_KEY'  # Your terminal only; never commit, screenshot or deliver
uv run london-office chat
```

`LONDON_CODEX_HOME` can designate another dedicated directory outside the repository; personal `~/.codex` and in-repository directories are rejected. Other settings are in `london_office/settings.py`. Personal Pi/global configuration and `.env` files are not automatically loaded as runtime policy.

## Explicit source discovery

The Agent panel defaults to **Historical market**. Switch to **Discover sources**, enter a question, set finite Google/caller-turn limits and an expiry, then click **Authorize this allowance and search**. Arrow/Enter only uses an existing active grant; it never grants or renews one. **View source pool** only reads archived candidates: no search or model call. Full search returns and AI screening are separate. Eight-dimensional topics express search intent; old items, URL variants and noise remain, not evidence of market coverage. Titles/dates/snippets are unverified and never overwrite accepted historical metrics or map values. See [`docs/contracts.md`](docs/contracts.md) and [`docs/features/source-discovery.md`](docs/features/source-discovery.md).

### SerpAPI key setup and use

SerpAPI powers this feature's **Google search path**. It is neither an OpenAI/Codex nor a map key, and cannot replace the web Agent's Codex login. **SerpAPI validates the key server-side over HTTPS; validation does not require macOS.** Keychain is merely an optional way to store/read the key locally.

| Action | Where the SerpAPI key comes from | Other prerequisites |
|---|---|---|
| `sources` / **View source pool** | None | Read-only; no search/model |
| CLI `collect-sources` | `SERPAPI_API_KEY` first, otherwise the dedicated macOS Keychain item | Approved Google budget; no model login |
| Web **Discover sources** | Parent backend's `SERPAPI_API_KEY`, or dedicated macOS Keychain if unset; MCP only proxies constrained search | Approved Google/Codex budget and Codex subscription login |

#### 1. Get a key and check prerequisites

- Register/sign in to [SerpAPI](https://serpapi.com/) with **your own account**, then retrieve your key on its [API key page](https://serpapi.com/manage-api-key). Do not request or use the author's key.
- The current implementation accepts only an **Active Free Plan with price 0 and remaining monthly and hourly search allowances**. It checks SerpAPI's Account API before searching. Paid plans, uncertain allowance or exhausted allowance are rejected, without automatic upgrade/retry. Your account dashboard is authoritative.
- Explicitly approve finite local search limits in the web panel (step 4). The backend saves authorization and starts; **this is not a purchase receipt**. No transferable authorization ships with the repository or ZIP. Account quota alone does not authorize execution; old receipts are never copied, zeroed or renewed by restarting. CLI collection still requires its own approved receipt.
- Network access uses standard proxy settings (e.g. `HTTPS_PROXY`) or direct access if none is set. For a separate endpoint set `LONDON_SERPAPI_PROXY=http://your-proxy:port`; an explicitly empty value forces direct access. CLI and web share this backend behavior; redirects, automatic retries and endpoint fallback remain disabled.

#### 2. Configure the CLI key: environment or Keychain

If the dedicated macOS Keychain item already exists, **do not re-enter the key**: with `SERPAPI_API_KEY` unset the backend reuses it. Otherwise set an environment variable for the CLI and web backend on any of the three systems. Set it in the **same terminal that starts the backend**; `.env` is not loaded automatically. Bash/zsh (prompt without echo or key in shell history):

```bash
printf 'SerpAPI API key: '
read -r -s SERPAPI_API_KEY
printf '\n'
export SERPAPI_API_KEY
```

Windows PowerShell (no plaintext key in command history):

```powershell
$secret = Read-Host 'SerpAPI API key' -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $secret)
$env:SERPAPI_API_KEY = $credential.Password
Remove-Variable secret, credential
```

After preparing the key, network and approved budget, use the following Bash command for an **actual Google request**. In PowerShell write the same arguments on one line, for example `uv run london-office collect-sources --query 'Savills Central London office research' --topic rents --budget-file "$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"`:

```bash
uv run london-office collect-sources \
  --query 'Savills Central London office research' \
  --topic rents \
  --budget-file "$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"

uv run london-office sources         # Read saved candidate pool, no new search
```

Supported repeatable `--topic` values: `rents`, `vacancy`, `leasing`, `supply`, `submarkets`, `macro`, `demand`, `news`. Candidate records default to `var/discovery/records/`, search evidence to `var/discovery/evidence/`; neither updates the official market snapshot. On Bash/zsh, `unset SERPAPI_API_KEY` clears this terminal's variable afterwards but does not delete a Keychain item. Never put the key in source, README, receipt, screenshot, delivery package or web question field.

#### 3. Optional dedicated macOS Keychain item

Mac users may store the key in this dedicated item instead of an environment variable; Linux/Windows users skip this section. This is a **one-time setup**; existing users need not repeat it. Normal backend reuse neither prints the key nor sends it to the model or copies personal configuration.

For first-time setup on macOS, put `-w` last and enter your own key at the prompt, never inline in a shell command:

```bash
/usr/bin/security add-generic-password \
  -a london-office-research-lab \
  -s london-office-research-lab.serpapi \
  -w
```

These are fixed lookup identifiers in the code, not your SerpAPI email. If the item already exists, update its password in **Keychain Access** using service `london-office-research-lab.serpapi` and account `london-office-research-lab`. Do not change the account to your email or grant every application access. First use may prompt you to approve this project's backend access.

#### 4. Authorize in the browser

Real search requires **your Codex subscription login, your free SerpAPI account/key, and explicit finite local authorization**. Configure the key once as above and start `uv run london-office serve` from the repository root (not `--no-agent` or API-key billing).

1. Open **http://127.0.0.1:8017**, expand the Agent panel and choose **Discover sources**.
2. Enter a question. Set Google starts and subscription caller turns (each 1–100), and validity (1–1440 minutes).
3. Click **Authorize this allowance and search**. The panel displays active/exhausted/expired/invalid state, starts, remaining counts and backend expiry. Each search is bound to its grant. No budget JSON editing or restart is needed.
4. After exhaustion/expiry, only another explicit approval creates a new grant. Old counters remain. This authorizes neither ordinary market-model questions nor research admission, and caller turns are not internal HTTP/token/cost caps.

<details>
<summary>Optional legacy terminal receipt setup (not required for browser authorization)</summary>

**Approve and create a separate legacy file only if using that configuration path.** The following multi-line command works in Bash/zsh or PowerShell. It uses only Python's standard library and creates local configuration; it does not search, call a model or read credentials. Defaults authorize at most **one free-quota Google search and one subscription source-discovery caller turn**. Edit these two positive integer caps *before confirmation* if you personally approve different finite limits. Only entering `I AUTHORIZE` creates a new uniquely named file; any other response creates no file and starts no search. The file is **not** a purchase ticket or an implicit paid/renewable authorization.

```bash
uv run python -X utf8 -c '
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

google_cap = 1
discovery_turn_cap = 1
if not (type(google_cap) is int and type(discovery_turn_cap) is int and google_cap > 0 and discovery_turn_cap > 0):
    raise SystemExit("Caps must be explicit positive integers; no authorization file created.")
confirmation = input(f"Authorize up to {google_cap} free-quota Google searches and {discovery_turn_cap} subscription discovery caller turns locally; no metered API or automatic market publication. Type I AUTHORIZE: ")
if confirmation.strip() != "I AUTHORIZE":
    raise SystemExit("Not authorized; no file created and no search started.")
folder = Path("var/runs/discovery-authorized")
folder.mkdir(parents=True, exist_ok=True)
budget = folder / ("budget-" + uuid4().hex + ".json")
receipt = {
    "authorization": f"Local operator explicitly approved up to {google_cap} free-quota Google searches and {discovery_turn_cap} subscription source-discovery caller turns; no paid fallback, automatic renewal or market publication.",
    "authorized_at": datetime.now(timezone.utc).isoformat(),
    "serpapi_search_http_start_cap": google_cap,
    "serpapi_search_http_starts": 0,
    "account_http_starts": 0,
    "codex_turn_start_cap": discovery_turn_cap,
    "codex_turn_starts": 0,
    "codex_native_discovery_turn_start_cap": discovery_turn_cap,
    "codex_native_discovery_turn_starts": 0,
    "codex_market_validation_turn_start_cap": 0,
    "codex_market_validation_turn_starts": 0,
    "jobs": {}
}
with budget.open("x", encoding="utf-8") as output:
    json.dump(receipt, output, ensure_ascii=False, indent=2)
print("Authorization file:", budget.resolve())
'
```

**Connect the backend and start it.** Replace the placeholder with the actual path printed above; `YOUR_AUTHORIZED_RECEIPT.json` is not an existing repository file. Start in the **same terminal where variables are set**. If the old service already owns port 8017, stop it with Ctrl+C in its original terminal, then launch the newly configured service. Refreshing the page, changing `.env`, or exporting a variable in a different terminal cannot change a running backend. Bash/zsh:

```bash
export LONDON_AUTH_MODE=subscription  # Web discovery does not support api-key auth mode
export LONDON_DISCOVERY_BUDGET_FILE="$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"
uv run london-office serve           # Do not add --no-agent; build the frontend first
```

Windows PowerShell:

```powershell
$env:LONDON_AUTH_MODE = 'subscription'
$env:LONDON_DISCOVERY_BUDGET_FILE = "$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"
uv run london-office serve
```

The parent backend holds the actual key; discovery MCP gets only a short-lived local search invocation capability for the request. `SERPAPI_API_KEY` remains scrubbed from the SDK/model and MCP environments, never placed in tool input, SDK settings/arguments or files. Ordinary market chat's six-tool boundary remains unchanged. See [ADR 0003](docs/adr/0003-portable-discovery-backend.md).

Open/refresh **http://127.0.0.1:8017**, choose **Discover sources** in the Agent panel, enter your request and explicitly submit. **View source pool** only reads existing leads. `http://127.0.0.1:8017/api/catalog` shows `agent.discovery_configured: true` when the backend sees a configured file path; it does **not** prove file validity, login or remaining quota.

The example authorizes discovery only: `codex_market_validation_turn_start_cap=0` means **no ordinary model-driven market Q&A** is authorized by it. Map, Python market queries and source-pool reading remain available. To authorize model market questions, the operator must explicitly allocate a market-validation cap and a model total cap in their own new approval; discovery approval cannot implicitly broaden permissions. One caller turn may include multiple internal model/tool requests, and native search's internal HTTP count cannot be hard-capped by this file. It is not a token or monetary cap.

</details>

#### Troubleshooting

| Symptom / error | What to check |
|---|---|
| `discovery_authorization_required` | Set finite limits in the web panel and explicitly approve them; a key or page refresh alone cannot authorize a search |
| `discovery_authorization_expired` | The backend stopped new execution. A new explicit web approval is required; old counts are retained |
| `search_key_unavailable` | Check the CLI/backend's terminal variable or Mac Keychain identifiers and access permission, without printing the key |
| `free_quota_unconfirmed` | Confirm Active Free Plan, price and monthly/hourly remaining allowance in your SerpAPI dashboard; do not work around this with a paid plan |
| Authorized calls exhausted / `search_budget_exhausted` / `model_budget_exhausted` | Continue reading the pool, or explicitly approve another finite web grant. No restart, counter reset or automatic retry |
| `google_discovery_failed` / `search_http_error` / `search_provider_error` | Check network/configured proxy, key validity and service status; evidence stays in the dedicated run directory; no automatic retry |
| `discovery_bridge_unavailable` | The request's backend bridge is closed/unreachable. Do not put the key in SDK/model configuration or auto-retry |
| Native results visible but Google unconfirmed | Inspect **Actual Google tool execution** for the actual Google-tool error. Native Web Search success does not prove SerpAPI works |

A failed/timed-out started search or caller turn may still consume its authorized count. These setup instructions are not a live-search acceptance result. Historical market functions remain usable without a key/budget.

### Research intake: separate batch approval

In the Agent panel, click **Research intake**. Add your own original PDF/HTML/TXT (at most 5 MB per file and per batch in total), a public HTTPS source URL and publisher/usage metadata. Add each scalar reported statistic with its exact short quotation, value-and-unit anchor, geography, window, definition and any stated denominator/billing period. This is manual evidence-backed staging, not automatic URL fetching or AI extraction; uploading does not authenticate a publisher.

**Stage this batch only · do not admit** preserves the bytes/hash and assessment without publishing. **Authorize admission for this batch** is a different permission from search: eligible, non-conflicting facts are admitted automatically; ambiguous/same-definition conflicts require a reasoned accept/reject; unmatched originals, unsupported numbers/kinds and duplicates cannot be accepted. Conflicting reported values remain separate and labelled, with related automatic comparisons disabled. Changing content requires a new immutable batch and approval.

Accepted research is re-read immediately by the existing market queries/six read-only tools and UI, without restart. The original snapshot, map values, geometry and camera remain unchanged. User-supplied provenance and caveats remain visible. State/materials live only in ignored `var/research/` (or a dedicated `LONDON_RESEARCH_DIR`); they are not shipped. Approval endpoints are user-only, not model tools. See [the contract and eight local design diagrams](docs/architecture/web-authorization-and-intake.md).

### Official monitoring in the UI

Open **News & events** from the right rail. Its **Official source monitoring** card shows last check, whether a schedule runs, started turns/cap, two official sources and report links. **Refresh status** only reads the local archive: it neither searches nor calls a model nor installs/triggers a job.

The backend reads `var/monitoring/ui-config.json`: `{"schema_version":1,"schedule_config":"var/monitoring/your-dedicated-directory/schedule.json"}`. The path refers only to an existing authorized configuration inside this repository; no budget or transferable execution permission ships with it. Unconfigured, stopped, failed and unknown-date states are presented honestly. Scheduling is macOS-only. After the user cancelled the seven-day deployment, an additional real native 30-second/one-turn check returned HTTP 200 for both sources and removed its label. The card's recorded state is **stopped, 1/1**, last check Shanghai 07:48:43; it is not continuous monitoring. The original 32-start budget / 09:00 expiry was historical, not a current authorization.

Display applies coarse office-CRE keyword screening to official HTTPS sources, retaining original archives and omitted links, without AI. Index edition is not publication date or measurement window: a September 2026 monthly index, for example, reported August 2026. Twelve 2026 facts were separately accepted: four UK interest-rate/GDP/labor facts and eight Savills August monthly/YTD/rent/structure facts. Relevant research panels show **Latest verified update** with their own excerpts, windows and sources; the original 120 historical records stay. The 2024/2025 map is not replaced by monthly figures. The local 8017 service was rebuilt/reloaded for that update; later tracked snapshot/source-code edits still require a reload; separately approved intake batches do not. See [monitoring feature](docs/features/source-monitoring.md) and [read-only UI contract](docs/architecture/monitoring-status-ui.md).

### Current source-discovery verification

Web grants are created only by explicit user approval, never passively or by automatic renewal. **The historical user-authorized, single real source-discovery verification** connected configuration to the 8017 backend. Run `native-fb929a8b2187477980a1ba8d9c84738e` returned HTTP 200; both Google and native paths were `completed_metadata_only`. Its **Google 1/1** and **subscription-model caller turn 1/1** were consumed: no retry or API-key fallback is authorized. One native search was visible; AI selected two official publisher indexes, **not the specific original report requested**. The pool grew **554 → 579 distinct URL strings (+25 exact URLs)**; Google returned 27 URL occurrences and native search 12. Snippets/index links are not publishable market facts. The formal snapshot and previous official-ledger hash remained unchanged. Real inputs, run and UI evidence: `artifacts/discovery/20261012-one-shot/`.

The previous `187 distinct URL strings / 247 occurrences` UI demonstration in `artifacts/discovery/20261011-source-first/` is **historical**, not the current pool size or a reusable budget. Its historical quick checks: **115 Python tests plus type checking passed in 2.42 s**; focused source UI **4/4 in 10.84 s**, covering synthetic error and screening. One real browser/API run independently establishes both metadata paths. **No complete map performance suite was rerun for this update**; earlier 33/33 Metal and later historical 35/35 runs are not its latest full-suite GREEN. Nor was ordinary live-model market Q&A exercised in this one-shot source validation. Source-content/definition verification and precise spatial linkage remain separate future work; the user requested a feature-scale increment, not new Specs/Tickets/Ralph.

## Python queries, provenance and verification

```bash
uv run london-office query --area city --metric prime_rent --period 2025-YE
uv run london-office compare --area west_end
uv run london-office brief --area city
uv run london-office verify savills-2025-q4
uv run london-office inspect your-own-market-report.pdf  # Extraction only; no automatic acceptance as a real metric
uv run python -m unittest discover -s tests -v
cd frontend
PLAYWRIGHT_BROWSERS_PATH=./.pw-browsers npx playwright install chromium
npm run test:e2e                     # Original entry: isolated server/SwiftShader, real Python API, no model
npm run check:quick                  # ≤10 s: Python + types; offline, not a live-model test
# ≤30 s: pass affected test files/-g; includes production build, server, browser and evidence
OFFICE_USER_RENDERER=1 npm run check:focused -- tests/left-detail.spec.ts -g 'same-size selections|buildings and labels'
npm run check:focused -- tests/left-detail.spec.ts -g 'buildings and labels' --workers 1
# Optional complete real-business/map checks; original command retains its 60-s cutoff, no longer a hard stage gate
OFFICE_USER_RENDERER=1 npm run check:full  # Historical GPU 35/35, 58 s; not rerun for latest source update; no model
npm run check:full                       # SwiftShader comparison; prior cutoff RED, not a complete pass
# Three independent fixed-input user samples; repeat with 390 instead of 1600 for the other viewport
# --workers=1 isolates performance samples; normal animation/production build; software renderer is not equivalent
OFFICE_USER_RENDERER=1 OFFICE_PERFORMANCE_REPEAT=1 npm run check:focused -- tests/left-detail.spec.ts -g 'hot user-renderer selection 1600' --workers 1
OFFICE_USER_RENDERER=1 OFFICE_PERFORMANCE_REPEAT=1 npm run check:focused -- tests/cold-start.spec.ts -g 'cold startup 1600' --workers 1
cd ..
uv run python scripts/live_smoke.py  # After login, really runs three model turns with actual tools and itemized checks
# Optionally, with Agent-enabled serve in another terminal, actually call two model turns:
node scripts/live_ui.mjs             # Independent Chromium; subscription, actual UI, multiple turns and source assertions
# No model allowance consumed: with this project's serve running, screenshot/replay a saved real Run
node scripts/capture_agent_ui.mjs    # Explicitly labelled replay; intercepts /api/chat before the backend
```

The Market module is independently testable. Synthetic missing/conflict/zero-baseline cases live only in temporary test directories, not production data. `verify` rechecks allowlisted source excerpts; it does not discover the latest report or automatically refresh the snapshot. See [`data/README.md`](data/README.md) for fields, usage limits and geographic gaps; [`docs/contracts.md`](docs/contracts.md) for interfaces.

## Kimi presentation and code delivery

**Kimi alone creates and edits the PPT. Other AI maintains prompts, real screenshots and material notes; it does not generate, render or edit presentation output.** For initial production upload suitable screenshots from [`presentation/materials/`](presentation/materials/) (prefer the current hero/chart), and use the [Chinese prompt](presentation/kimi-prompt-zh-CN.md) or [English prompt](presentation/kimi-prompt-en.md). To **revise an existing Kimi presentation**, upload the old PPT, four updated floating-panel/chart images and original-material form image listed in the Presentation README, then use the [Chinese update prompt](presentation/kimi-update-zh-CN.md) or [English revision prompt](presentation/kimi-update-en.md). Keep the six-slide concept, replace outdated fixed-sidebar screenshots first, describe frosted floating panels/source charts above the full-screen map, and explain finite browser search consent and separately approved original-material intake alongside official-index detection, bounded macOS scheduling and the read-only News card. The admitted-batch demo uses explicitly synthetic material, not market facts. Do not repaint a stopped status as always-on or treat links as verified live prices. Materials also cover the eight dimensions, architecture, map/language and AI; sources and limits: [`presentation/README.md`](presentation/README.md).

The user downloads Kimi's result into `artifacts/presentation/kimi-final/`; revisions go back to Kimi. Previous generator/print scripts, tests and dedicated dependencies have been removed. Frozen prior ZIP/PPT and dated verification archives remain but are not current product descriptions.

**Package the code ZIP separately, then manually upload it and the chosen Kimi PPT to Drive:**

```bash
uv run python scripts/package_delivery.py --snapshot
```

Each run creates a distinct `artifacts/delivery/london-office-monitor-<UTC timestamp>-snapshot/` without overwriting older packages. Running without arguments also uses this code-snapshot flow; old presentation/acceptance attachments are not prerequisites. ZIP contents: public source, explicitly allowed static inputs, complete and incremental Kimi prompts in both languages, eleven reviewed UI images (including explicitly synthetic intake-demo material), `START-HERE.md` and a SHA-256 manifest. It **does not produce/edit/include a PPT, slide PDF or HTML, or automatically include Kimi's result**. Packaging needs Python and Git but starts no browser/application; extracted code still needs dependencies, a frontend build and the recipient's own model account.

Credentials, personal settings, environments, budget receipts, original full reports, run directories and old `artifacts/` are excluded. Non-allowlisted images are not included; linked source/output directories are rejected. Historical images/replay fixtures are not fresh tests. Packaging performs no product acceptance, model/search call, automatic upload or sharing-permission change; all three verification categories remain `Not yet verified`. If public source changes during packaging, stop and rerun after edits finish. See the [presentation feature](docs/features/presentation.md). **Drive distributes files; it does not host a public application.**

## Further iterations

Data owns source/normalization/evidence; Market owns definitions and comparisons; Codex Adapter alone owns SDK/authentication/threads/event conversion; UI consumes business JSON only. Another runtime would require a new validated Adapter, not recalculation in UI or SDK objects passed to it. See `docs/adr/` and `GLOSSARY.md`.

The full map/data/search/AI-Agent ambition is in the [architecture overview](docs/architecture/search-data-map-agent.md) and [ADR 0002](docs/adr/0002-four-capabilities-and-spatial-mapping.md). Source discovery was added under a specific user authorization; complete spatial mapping remains proposed. Arbitrary geolocation and unattended source acceptance are not implemented. Bundled research and explicitly approved intake overlays are available to existing query/brief/six tools and eight panels. Search metadata alone is never publishable; tracked snapshot changes still require restart, while accepted intake batches refresh dynamically. Old model sessions cannot silently mix accepted research versions. Software-rendering map work is deferred by user decision.

GitHub Issues alone handle requirements/triage/backlog; PRs receive normal review. Default five labels and Chinese conventions are in `docs/agents/`. `AGENTS.md` contains the public startup conventions. The previously authorized Ralph run ended; Issue #5 remains deferred, not automatically resumed, split or expanded. New data definitions, dependencies, contracts, paid calls and publication/sharing permissions require prior approval.
