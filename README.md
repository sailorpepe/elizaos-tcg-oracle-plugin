# @undesirables/plugin-tcg-oracle

![TCG Oracle Banner](./images/banner.jpg)

[![npm](https://img.shields.io/npm/v/@undesirables/plugin-tcg-oracle)](https://www.npmjs.com/package/@undesirables/plugin-tcg-oracle)
[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue)](LICENSE)

> Give any ElizaOS agent real trading card market intelligence — search 370K+ products, grade cards with AI vision, and simulate future prices with Monte Carlo models.

---

## Why This Exists

The trading card market is worth **$50 billion** and growing. Millions of people buy, sell, and grade cards every day. But the tools available to them are fragmented: you check prices on one site, send cards to PSA for $50+ and wait weeks for a grade, and have no way to forecast whether a card is going up or down.

This plugin gives your ElizaOS agent the ability to do all of that in one conversation:

1. **"Search for Charizard cards"** → Instantly searches 370K+ real products across 25 games
2. **"Grade this card"** → AI vision analyzes centering, corners, edges, surface → predicts PSA/Beckett score
3. **"Simulate Charizard VMAX at $350 for 60 days"** → Runs 10,000 Monte Carlo simulations using Heston, Merton, or Kou stochastic models → returns percentile price bands
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
| `TCG_ORACLE_SIMULATE` | Monte Carlo price forecast with 3 stochastic models | "Simulate Charizard at $350 for 60 days" |
| `TCG_ORACLE_MARKET` | Pull the latest daily market snapshot for any game | "Show me the Pokemon market" |

---

## Supported Games (25)

Pokémon · Magic: The Gathering · Yu-Gi-Oh! · Disney Lorcana · One Piece · Flesh and Blood · Star Wars: Unlimited · Dragon Ball Super · Digimon · MetaZoo · Union Arena · Gundam Card Game · LoL Riftbound · and 12 more via TCGCSV

---

## How the Data Works

All market data comes from [TCGCSV](https://tcgcsv.com) — a community project that snapshots pricing data daily for 25 TCG games. Our GitLab CI pipeline automatically refreshes this data every 24 hours. The full dataset (370K+ products) is also available on [Kaggle](https://www.kaggle.com/datasets/sailorpepe/tcg-market-intelligence).

**Monte Carlo models explained:**
- **Heston** — Models volatility itself as stochastic (volatility changes over time). Best for cards with unpredictable hype cycles.
- **Merton** — Adds random jumps to the price process. Best for cards that can spike on tournament results or reprints.
- **Kou** — Uses double-exponential jump distribution. Best for modeling asymmetric risk (big upside spikes vs gradual decline).

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

## License

[BUSL-1.1](LICENSE) — Business Source License 1.1. Copyright © 2026 The Undesirables LLC.
