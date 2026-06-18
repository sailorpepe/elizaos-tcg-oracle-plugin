<div align="center">

![TCG Oracle Banner](./images/banner.jpg)

# @undesirables/plugin-tcg-oracle

**Give any ElizaOS agent real trading card market intelligence — search, grade, and forecast.**

[![npm](https://img.shields.io/npm/v/@undesirables/plugin-tcg-oracle?style=flat-square)](https://www.npmjs.com/package/@undesirables/plugin-tcg-oracle)
[![npm downloads](https://img.shields.io/npm/dm/@undesirables/plugin-tcg-oracle?style=flat-square)](https://www.npmjs.com/package/@undesirables/plugin-tcg-oracle)
[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-red?style=flat-square)](LICENSE)
[![ElizaOS](https://img.shields.io/badge/ElizaOS-Compatible-5A67D8?style=flat-square&logo=data:image/svg+xml;base64,&logoColor=white)](https://elizaos.ai)
[![Games](https://img.shields.io/badge/Games-Pok%C3%A9mon%20%C2%B7%20MTG%20%C2%B7%20Yu--Gi--Oh!-ff14a0?style=flat-square)](https://tcgcsv.com)

[npm](https://www.npmjs.com/package/@undesirables/plugin-tcg-oracle) · [TCG Oracle API](https://the-undesirables.com/docs) · [Kaggle Dataset](https://www.kaggle.com/datasets/sailorpepe/tcg-market-intelligence)

</div>

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Quick Start](#quick-start)
- [Actions](#actions)
- [How It Works](#how-it-works)
- [Supported Games](#supported-games-25)
- [How the Data Works](#how-the-data-works)
- [Self-Hosting](#self-hosting)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Related Projects](#related-projects)
- [License & Commercial Use](#-license--commercial-use)

---

## Why This Exists

The trading card market is worth **$50 billion** and growing. Millions of people buy, sell, and grade cards every day. But the tools available to them are fragmented: you check prices on one site, send cards to PSA for $50+ and wait weeks for a grade, and have no way to forecast whether a card is going up or down.

This plugin gives your ElizaOS agent the ability to do all of that in one conversation:

1. **"Search for Charizard cards"** → Instantly searches 370K+ real products across 25 games
2. **"Grade this card"** → AI vision analyzes centering, corners, edges, surface → predicts PSA/Beckett score
3. **"Simulate Charizard VMAX at $350 for 60 days"** → Runs a calibrated conformal risk forecast → returns honest VaR + percentile price bands
4. **"Show me the Pokemon market"** → Pulls the latest daily market snapshot with top movers and volume trends

No API keys required from third parties. You just point it at the TCG Oracle server (self-hosted or public).

---

## Quick Start

```bash
npm install @undesirables/plugin-tcg-oracle
```

Add to your ElizaOS character file:

```json
{
  "plugins": ["@undesirables/plugin-tcg-oracle"],
  "settings": {
    "TCG_ORACLE_URL": "https://oracle.the-undesirables.com"
  }
}
```

Start your agent:

```bash
elizaos start --character your-character.json
```

That's it. Your agent can now search cards, grade images, and run simulations.

---

## Actions

| Action | What It Does | Example Prompt |
|--------|-------------|----------------|
| `TCG_ORACLE_SEARCH` | Search 370K+ products by card name, set, or keyword | "Search for Base Set Charizard" |
| `TCG_ORACLE_GRADE` | Grade a card image URL — returns PSA/Beckett prediction | "Grade this card: https://..." |
| `TCG_ORACLE_SIMULATE` | Calibrated risk forecast — honest VaR (conformal default; Monte Carlo opt-in) | "Simulate Charizard at $350 for 60 days" |
| `TCG_ORACLE_MARKET` | Pull the latest daily market snapshot for any game | "Show me the Pokemon market" |
| `TCG_ORACLE_GRADE_OR_NOT` | Grade-or-Not ROI engine — "will grading this make me money?" | "Should I grade my Charizard?" |
| `TCG_ORACLE_TRENDING` | Trending cards by 30-day sales volume and price velocity | "What Pokemon cards are trending?" |
| `TCG_ORACLE_ARB_GRADE` | Grading arbitrage scanner — finds profitable cards to grade | "Find me profitable cards to grade" |

---

## How It Works

```
┌────────────────────────────────────────────────────────────────┐
│                        ElizaOS Agent                           │
│                                                                │
│  User: "Simulate Charizard VMAX at $350 for 60 days"          │
│                         │                                      │
│                         ▼                                      │
│              ┌─────────────────────┐                           │
│              │  Action Router      │                           │
│              │  (LLM selects best  │                           │
│              │   action + params)  │                           │
│              └────────┬────────────┘                           │
└───────────────────────┼────────────────────────────────────────┘
                        │  fetch() + 30s timeout
                        ▼
┌────────────────────────────────────────────────────────────────┐
│                    TCG Oracle API Server                        │
│                                                                │
│  /api/v1/search ─────── 370K+ products (TCGCSV)               │
│  /api/v1/grade ──────── Vision LLM + OpenCV → PSA/BGS score   │
│  /api/v1/simulate ───── Conformal forecast + card grades      │
│  /api/v1/market ─────── Daily snapshot + top movers            │
│  /api/v1/trending ───── 30-day volume + price velocity         │
│  /api/v1/arb-grade ──── Grading ROI scanner                   │
│  /api/v1/grade-or-not ─ PSA fee × grade × value = GO/NO-GO   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Supported Games (25)

Pokémon · Magic: The Gathering · Yu-Gi-Oh! · Disney Lorcana · One Piece · Flesh and Blood · Star Wars: Unlimited · Dragon Ball Super · Digimon · MetaZoo · Union Arena · Gundam Card Game · LoL Riftbound · and 12 more via TCGCSV

---

## How the Data Works

All market data comes from [TCGCSV](https://tcgcsv.com) — a community project that snapshots pricing data daily for 25 TCG games. Our GitLab CI pipeline automatically refreshes this data every 24 hours. The full dataset (370K+ products) is also available on [Kaggle](https://www.kaggle.com/datasets/sailorpepe/tcg-market-intelligence).

**Risk model — conformal calibration (default):**

Price forecasts default to a **regime-aware split-conformal** model: distribution-free bands calibrated on real cross-card price history, so the published downside risk (VaR) is *honest* — out-of-sample, a "5% loss" actually happens about 5% of the time — and fully **deterministic**, so anyone can reproduce the exact numbers. Each card also gets two letter grades: **Safe-Hold** (downside protection) and **Momentum** (direction). Monte Carlo models (GBM and Merton jump-diffusion) remain available via `model=`, seeded from the public **drand** randomness beacon for provably-fair draws. Forecast responses include the model parameters (e.g. `drift_mu`, `diffusion_sigma`, `regime`) for full transparency.

---

## Self-Hosting

You can run your own TCG Oracle server instead of using the public API:

```bash
pip install undesirables-mcp-server
undesirables-mcp --workspace ./my-workspace
```

Then point `TCG_ORACLE_URL` to `http://localhost:8000`.

---

## Configuration

| Setting | Description | Required |
|---------|-------------|----------|
| `TCG_ORACLE_URL` | Base URL of the TCG Oracle API | Yes |

---

## Architecture

This is a **native TypeScript** ElizaOS plugin. It runs natively in the ElizaOS Node.js runtime — no Python subprocess, no external CLI tools. It calls the TCG Oracle REST API via `fetch()` with 30-second timeouts and structured `parameters` for v2 LLM parameter extraction.

---

## Related Projects

- [undesirables-mcp-server](https://github.com/sailorpepe/undesirables-mcp-server) — 36-tool MCP server (Glama Registry, PyPI)
- [plugin-undesirables](https://github.com/sailorpepe/plugin-undesirables) — Soul personality plugin for ElizaOS
- [tcg-oracle-tools](https://pypi.org/project/tcg-oracle-tools/) — Python SDK for TCG market analysis

---

## 📝 License & Commercial Use

This project is licensed under the **[Business Source License 1.1 (BUSL-1.1)](LICENSE)**.

We build in public and support the developer ecosystem — but we also protect the infrastructure and IP of **The Undesirables LLC**.

### ✅ What You CAN Do (Free)

- **Personal & Educational Use** — Download, modify, and run locally for learning, research, or personal projects.
- **Non-Competing Applications** — Integrate our packages into your app, provided your app does not offer TCG market intelligence, pricing aggregation, AI card grading, or on-chain price oracle services as its primary function.
- **MCP / Agent Integration** — Connect your AI agent to our tools for non-commercial use.
- **Community Contributions** — Security audits, bug fixes, and PRs are always welcome.

### 🚫 What You CANNOT Do (Use Limitation)

- **Competing Service** — You may not use this code to operate a competing TCG market intelligence, pricing aggregation, AI card grading, or on-chain price oracle service.
- **Commercial Resale** — You may not wrap our API, data pipelines, or AI models into a paid service without a commercial license.
- **Hosted SaaS** — You may not host this software as a service for third parties without written permission.

### 🔓 Open-Source Conversion

On **June 1, 2030** (or 4 years after the first public release of each version), this code automatically converts to the **MIT License** — fully open source, forever.

### 🤝 Commercial Licensing

Building a commercial product? Want guaranteed API access or white-label integration? Contact us:

📧 **theundesirables7@gmail.com** · 🐦 **[@undesirables_ai](https://x.com/undesirables_ai)**

© 2026 The Undesirables LLC

---

<div align="center">

⭐ **If this project helped you, please star this repo** — it helps others find it.

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
