# @undesirables/plugin-tcg-oracle

> AI-powered trading card market intelligence for ElizaOS agents.

[![npm](https://img.shields.io/npm/v/@undesirables/plugin-tcg-oracle)](https://www.npmjs.com/package/@undesirables/plugin-tcg-oracle)
[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue)](LICENSE)

## What It Does

Gives any ElizaOS agent the ability to:

- **Search** 370K+ real TCG products across 25 games (Pokemon, MTG, Yu-Gi-Oh, Lorcana, One Piece, etc.)
- **Grade** card images using AI vision (Qwen VL) — predicts PSA/Beckett scores
- **Simulate** future card prices with Monte Carlo models (Heston, Merton, Kou)
- **Snapshot** live market data — top movers, price changes, volume trends

## Quick Start

```bash
npm install @undesirables/plugin-tcg-oracle
```

Add to your ElizaOS character:

```json
{
  "plugins": ["@undesirables/plugin-tcg-oracle"],
  "settings": {
    "TCG_ORACLE_URL": "https://oracle.the-undesirables.com"
  }
}
```

## Actions

| Action | Description |
|--------|-------------|
| `TCG_ORACLE_SEARCH` | Search 370K+ products by card name, set, or keyword |
| `TCG_ORACLE_GRADE` | Grade a card image URL — returns PSA/Beckett prediction |
| `TCG_ORACLE_SIMULATE` | Monte Carlo price simulation with 3 stochastic models |
| `TCG_ORACLE_MARKET` | Pull latest daily market snapshot for any of 25 games |

## Supported Games

Pokemon, Magic: The Gathering, Yu-Gi-Oh!, Lorcana, One Piece, Flesh and Blood, Star Wars: Unlimited, Dragon Ball Super, Digimon, MetaZoo, Union Arena, Gundam Card Game, LoL Riftbound

## Configuration

| Setting | Description | Required |
|---------|-------------|----------|
| `TCG_ORACLE_URL` | Base URL of the TCG Oracle API server | Yes |

You can run your own server: `pip install undesirables-mcp-server`

Or use the public API: `https://oracle.the-undesirables.com`

## Architecture

This is a **native TypeScript** ElizaOS plugin. Unlike the legacy Python G.A.M.E. SDK version, it:

- Runs natively in the ElizaOS Node.js runtime (no Python subprocess)
- Uses the ElizaOS v2 API (`ActionResult`, `ProviderResult`, v2 `ActionExample`)
- Calls the TCG Oracle REST API via `fetch()` with proper timeouts
- Supports v2 structured `parameters` for LLM parameter extraction

## Data Source

All market data comes from [TCGCSV](https://tcgcsv.com) — daily snapshots of 25 TCG games, automatically refreshed via GitLab CI cron pipeline.

## Part of The Undesirables

This plugin is part of [The Undesirables](https://the-undesirables.com) ecosystem — 4,444 autonomous AI agents on Ethereum.

- **MCP Server**: [undesirables-mcp-server](https://github.com/sailorpepe/undesirables-mcp-server) (35+ tools, Official MCP Registry)
- **Soul Plugin**: [plugin-undesirables](https://github.com/sailorpepe/plugin-undesirables) (Personality-as-Code)
- **x402 API**: [oracle.the-undesirables.com](https://oracle.the-undesirables.com) (Coinbase Agentic Market)

## License

[BUSL-1.1](LICENSE) — Business Source License 1.1
