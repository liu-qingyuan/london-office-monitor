Create a six-slide, 16:9, editable product introduction deck in English, and provide a PDF. Deliver the finished files, not just an outline. Kimi is responsible for creating and revising the presentation; material prepared by other AIs is input only.

Project: London Office Monitor. Audience: business teams and project reviewers. Focus on what the product offers, how people use it, and how evidence is handled—not a report dominated by rent statistics.

I am uploading five genuine screenshots:
- `map-zh-Hans.png`: a local no-model capture from the frozen delivered code snapshot, showing the Chinese interface, area details and eight-dimensional navigation.
- `ai-answer-historical.png`: a historical real AI interaction, showing Python facts, comparisons and AI interpretation.
- `source-discovery-historical.png`: a historical real source-discovery interaction, showing unverified metadata leads.
- `official-monitoring-desktop.png` and `official-monitoring-mobile.png`: existing real read-only News captures from 12 October 2026, showing official-check archives and a stopped task—not permanent operation or fresh complete acceptance.

These screenshots do not establish complete acceptance of the current product version. Preserve their actual content and explain it with English annotations, including the Chinese screenshot. Do not fabricate UI or rewrite results. If an attachment is unavailable, ask for it explicitly rather than generating a replacement screenshot.

## Six slides

### 1 | What the product is
Use the genuine map as the main visual. Explain: explore areas on a London map, understand the market through eight research dimensions, and trace evidence through AI-assisted questions. Business uses include area familiarisation, historical comparisons, research lookup, discovery of source leads and bounded official-source checks.

### 2 | Eight dimensions and the questions they support
Use a readable eight-part matrix:
- Submarkets: area context and available indicators.
- Rents: distinct Prime and Grade A definitions and source material.
- Vacancy and availability: source-specific information and explicit gaps.
- Leasing activity: take-up and named transaction records.
- Supply pipeline: actual completions, development and forecasts.
- Macroeconomics: national interest-rate, GDP and employment context.
- Demand drivers: descriptive demand, ESG and hybrid-working material.
- News and events: historical events with sources/windows, plus publication leads and read-only status from two official indexes.

There are now 132 research records, 21 sources and 105 short evidence items. The original 120 historical records remain; 12 explicitly admitted source-verified facts appear under Latest verified update: four UK macro facts and eight Savills August 2026 office facts covering Grade A rents, monthly/YTD take-up and area shares. September edition is not the August observation window. This is not exhaustive live coverage or building observations and does not add a 2026-YE map. Independent availability rates and representative demand surveys still have gaps.

### 3 | Architecture and evidence-led AI
Draw a simple architecture diagram using the actual implementation:
- TypeScript web interface: workspace, language selection and MapLibre + deck.gl map; free OpenFreeMap provides the spatial basemap.
- Python FastAPI: HTTP interface.
- Python Market: queries, calculations, period comparisons, missing-data and definition checks.
- Versioned JSON / GeoJSON: historical indicators, admitted research, sources and short evidence excerpts.
- Official Codex Python SDK: invokes six project-specific read-only business tools via the project's MCP and produces qualitative interpretation.

Ordinary map queries return directly from Python. AI questions obtain evidence through approved tools. Python supplies numerical facts; the model cannot rewrite those values. The six tools cover catalog lookup, market queries, period comparisons, research briefs, source details and allowlisted source verification.

Source discovery is a separate restricted profile in the same Codex Adapter: Google metadata / native Web Search → unverified candidate pool. It does not automatically overwrite the formal snapshot. Add a separate branch: macOS launchd → bounded checks/HTTP authorisation guards → Savills Central London monthly-report and Crown Estate news indexes → local detection archives → read-only GET /api/monitoring → News card. Official checks use neither a model nor SerpAPI and do not automatically ingest data. Do not invent a vector database, RAG framework, multi-agent system or automatic ingestion architecture.

### 4 | Using the map, areas and languages
Annotate the map screenshot with numbered callouts: drag to pan, scroll to zoom, right-drag to rotate and tilt; hover for a tooltip, click an area to focus and update details; expand a year's source to inspect its short excerpt.

The four illustrative areas are City, West End, Canary Wharf and Midtown / Fringe. Map layers currently offer three core indicators: average prime achieved rent, average Grade A rent and overall vacancy rate. Users can select the 2024 or 2025 year-end reports. Missing values are not zero and are not filled from another geography.

The right-hand navigation has eight market dimensions plus Map layers. Hover / focus reveals labels; explicit clicks open content. The upper-left selector supports English, Simplified Chinese and Traditional Chinese. Changing UI language does not automatically translate every original source or model response.

The Official source monitoring card at the top of News shows the latest valid check, actual schedule state, run starts/limit and official links. Refresh status reads archives; it does not start checks, search, call a model or change market data. New card labels and source titles currently remain English; do not claim full translation.

Research retains its own time windows and geography; not every record can be mapped to a building. Selection polygons are hand-drawn, not authoritative GIS boundaries. Buildings provide spatial context only. There is no land-title, land-valuation, comprehensive measured-height or building-level market-indicator lookup.

### 5 | Using AI and checking an answer
Use the historical answer screenshot to explain: sign in with your own account → open the top question entry → type a business question and explicitly submit → inspect Python facts, comparisons, sources and separate AI interpretation.

Example: “How did City average prime achieved rent change between the two year-end reports?” Tools used expands actual tool inputs and outputs. View on map locates only answers with relevant map evidence. Explain tool panels not visible in the screenshot in text; do not fabricate an expanded UI.

Ordinary chat has only six read-only market tools; shell access, arbitrary Web Search and multi-agent capabilities are disabled. Opening the page or changing area, navigation or language does not automatically invoke a model. Real Agent use requires the user's own login and available model. Local `--no-agent` mode still provides historical information and the map, but is not an AI execution test. The application runs on localhost; distributing files through Drive does not host an online application.

### 6 | Up-to-date sources: explicit discovery and official checks
Use the source-discovery screenshot: switch the Agent panel to Discover sources and explicitly submit a request → budget-constrained Google metadata tooling and native Web Search → AI screening of leads → inspect the source candidate pool. View source pool reads saved inventory and does not initiate a new search.

Explicit discovery requires the user's own model account, SerpAPI configuration and approved budget. Alongside it, explain official checks of only two preset HTTPS indexes: first establish a baseline, then distinguish new links, no new links and failures. Native macOS scheduling is bounded by interval, run limit, expiry and independently authorised HTTP quota; Windows/Linux scheduling is unsupported. News reads status and links with rough official-host/office-CRE keyword filtering, not AI; original archives and omitted counts remain intact.

Existing real scheduling acceptance used 60 seconds/two rounds, after which the task was removed. Preserve stopped in the screenshot; the second round had no new link, so do not invent a live publication. Checks do not automatically download full reports, verify or publish new market observations. Edition is not a publication date or observation window; unknown remains unknown. Admitted research and the 2024/2025 map do not update automatically. Do not promise permanent monitoring, an exhaustive live news feed or new execution authorisation.

## Design and factual boundaries

Use a modern commercial-property / technology product style: genuine large visuals, strong titles, ample whitespace and concise copy. Avoid dense card grids or code-heavy slides. Body text must be readable when projected. Use native editable shapes for architecture and operational annotations; put sources and details in speaker notes or small captions.

Crop screenshots sensibly, retaining historical / unverified labels and basemap attribution. Do not invent statistics, performance results, coverage rates, passed acceptance gates, features or model-accuracy claims. If rent values are shown, retain the source unit £/sq ft; the billing period is not stated, so do not add “per annum.” Do not interchange rent definitions, vacancy and availability cohorts. Forecasts are not actual completions; descriptive ESG shares are not causal evidence or representative surveys.

Present current capabilities rather than adding features or automatic publishing authority. If a claim cannot be supported, leave it explicit or ask—do not describe it as implemented.
