/**
 * TCG Oracle — ElizaOS Plugin v2.0.2
 * ====================================
 * AI-powered trading card market intelligence for ElizaOS agents.
 * Native TypeScript rewrite of the Python G.A.M.E. SDK version.
 *
 * Features:
 * - Search 455K+ TCG products across 25+ games (Pokemon, MTG, Yu-Gi-Oh, etc.)
 * - Japanese two-sided dealer board summary, graded-slab loan terms, daily sports movers board
 * - AI Vision card grading (PSA/Beckett prediction via Qwen VL)
 * - Conformal-calibrated risk forecasts (honest VaR + Safe-Hold/Momentum grades);
 *   Monte Carlo (GBM/Merton) opt-in via the model parameter
 * - Market snapshots / simulate / trending: SUSPENDED since the USD panel froze 2026-09-07
 *   (the oracle answers {"status":"suspended"} and never charges) — actions surface that honestly
 * - License key purchase & verification (Ethereum NFT)
 *
 * @see https://the-undesirables.com
 * @see https://github.com/sailorpepe/elizaos-tcg-oracle-plugin
 */

import { validateTcgOracleConfig } from "./environment.js";
import { MarketMonitorService } from "./services.js";

import type {
  Plugin,
  Action,
  Provider,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  ActionResult,
  ProviderResult,
} from "@elizaos/core";

// ============================================================
// Configuration
// ============================================================

const SUPPORTED_GAMES = [
  "Pokemon",
  "Magic: The Gathering",
  "Yu-Gi-Oh!",
  "Lorcana",
  "One Piece",
  "Flesh and Blood",
  "Star Wars: Unlimited",
  "Dragon Ball Super",
  "Digimon",
  "MetaZoo",
  "Union Arena",
  "Gundam Card Game",
  "LoL Riftbound",
] as const;

const SIMULATION_MODELS = ["conformal", "merton", "gbm"] as const;

// ============================================================
// API Client
// ============================================================

function getBaseUrl(runtime: IAgentRuntime): string {
  return (
    (runtime.getSetting?.("TCG_ORACLE_URL") as string) ||
    process.env.TCG_ORACLE_URL ||
    ""
  );
}

async function callApi(
  baseUrl: string,
  endpoint: string,
  params: Record<string, string | number>
): Promise<{ data?: any; error?: string }> {
  if (!baseUrl) {
    return {
      error:
        "TCG_ORACLE_URL not set. Set it in your character.json settings or as an environment variable. Install the server: pip install undesirables-mcp-server",
    };
  }

  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "elizaos-tcg-oracle-plugin/2.0.2" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { error: `API returned HTTP ${response.status}` };
    }

    const json = (await response.json()) as Record<string, any>;
    if (json && json.status === "suspended") {
      const alts = json.alternatives
        ? Object.entries(json.alternatives as Record<string, string>)
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ")
        : "";
      return {
        error:
          `${endpoint} is SUSPENDED (not charged). ${json.reason || ""} ` +
          `Resumes when: ${json.resumes_when || "unknown"}.` +
          (alts ? ` Live alternatives — ${alts}` : ""),
      };
    }
    return { data: json.data || json };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { error: "TCG Oracle API timed out (30s)" };
    }
    return {
      error: "Failed to connect to TCG Oracle API. Is the server running?",
    };
  }
}

// ============================================================
// Helper: Truncate data safely before JSON.stringify
// ============================================================

function safeStringify(data: any, maxItems = 10): string {
  if (Array.isArray(data)) {
    return JSON.stringify(data.slice(0, maxItems), null, 2);
  }
  return JSON.stringify(data, null, 2).slice(0, 2000);
}

// ============================================================
// ACTION 1: Search TCG Products
// ============================================================

const searchAction: Action = {
  name: "TCG_ORACLE_SEARCH",
  description:
    "Search for trading card products across 25+ games including Pokemon, Magic: The Gathering, Yu-Gi-Oh, Lorcana, One Piece, and more. Returns product names, set info, and the last published USD price (the USD panel froze 2026-09-07 and every row says so in-band) from 455K+ real products.",
  similes: [
    "SEARCH_CARDS",
    "FIND_CARD",
    "CARD_LOOKUP",
    "CARD_SEARCH",
    "TCG_SEARCH",
    "FIND_POKEMON",
    "SEARCH_MTG",
  ],
  parameters: [
    {
      name: "query",
      description: "The card name, set name, or keyword to search for (e.g., 'Charizard', 'Base Set', 'Pikachu VMAX')",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "limit",
      description: "Maximum number of results to return (default: 10, max: 50)",
      required: false,
      schema: { type: "number" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "Search for Charizard cards" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Searching TCG Oracle for Charizard...", action: "TCG_ORACLE_SEARCH" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "What Pikachu VMAX cards are available?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Looking up Pikachu VMAX products...", action: "TCG_ORACLE_SEARCH" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Find me Base Set holographic cards" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Searching for Base Set holographic cards...", action: "TCG_ORACLE_SEARCH" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => {
    return !!getBaseUrl(runtime);
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text || "";

    // Extract search query — strip common prefixes
    const query = text
      .replace(/^(search|find|look up|lookup|what|show me)\s+(for\s+)?/i, "")
      .replace(/\s+cards?\s*$/i, "")
      .trim();

    if (!query) {
      if (callback) await callback({ text: "What card would you like me to search for?" });
      return { success: false, error: "No search query provided" };
    }

    const result = await callApi(getBaseUrl(runtime), "/api/v1/search", {
      query,
      limit: 10,
    });

    if (result.error) {
      if (callback) await callback({ text: `Search failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const summary = safeStringify(result.data);
    const responseText = `Found products matching "${query}":\n\n${summary}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_SEARCH");
    return { success: true, text: responseText, data: { search_results: result.data } };
  },
};

// ============================================================
// ACTION 2: AI Card Grading
// ============================================================

const gradeAction: Action = {
  name: "TCG_ORACLE_GRADE",
  description:
    "Grade a TCG card image using AI vision (Qwen VL model running locally). Predicts PSA and Beckett grading scores by analyzing centering, corners, edges, surface condition, and print quality. Works with Pokemon, MTG, Yu-Gi-Oh, and other TCG cards.",
  similes: [
    "GRADE_CARD",
    "CARD_GRADING",
    "PSA_GRADE",
    "BECKETT_GRADE",
    "RATE_CARD",
    "EVALUATE_CARD",
  ],
  parameters: [
    {
      name: "image_url",
      description: "Direct URL to the card image (PNG, JPG, or WebP)",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "game",
      description: "The TCG game this card belongs to (default: Pokemon)",
      required: false,
      schema: { type: "string" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "Grade this card: https://example.com/charizard.jpg" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Analyzing card image for grading...", action: "TCG_ORACLE_GRADE" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "What PSA grade would this get? https://i.imgur.com/card.png" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Running AI vision grading analysis...", action: "TCG_ORACLE_GRADE" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Rate the condition of this Magic card https://example.com/mtg.jpg" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Evaluating card condition for Beckett grading...", action: "TCG_ORACLE_GRADE" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text || "";

    // Extract URL from message
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) {
      if (callback) await callback({ text: "Please provide a card image URL to grade." });
      return { success: false, error: "No image URL found in message" };
    }

    const result = await callApi(getBaseUrl(runtime), "/api/v1/grade", {
      image_url: urlMatch[0],
      game: "Pokemon",
    });

    if (result.error) {
      if (callback) await callback({ text: `Grading failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const summary = safeStringify(result.data);
    const responseText = `Card grading complete:\n\n${summary}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_GRADE");
    return { success: true, text: responseText, data: { grade_result: result.data } };
  },
};

// ============================================================
// ACTION 3: Conformal-Calibrated Price Forecast (Monte Carlo opt-in)
// ============================================================

const simulateAction: Action = {
  name: "TCG_ORACLE_SIMULATE",
  description:
    "SUSPENDED since 2026-09-07 (frozen USD panel; the oracle returns status=suspended and does not charge — the action reports that). Was: forecast a TCG card's future value with a conformal-calibrated risk model — honest VaR plus Safe-Hold/Momentum letter grades. Monte Carlo (GBM/Merton) is opt-in via the model parameter. Uses real drift and volatility computed from the historical USD panel. Monte Carlo models available opt-in: merton (jump-diffusion) and gbm. Returns percentile bands (5th, 25th, 50th, 75th, 95th) for the forecast period.",
  similes: [
    "SIMULATE_PRICE",
    "PRICE_PREDICTION",
    "FORECAST_PRICE",
    "MONTE_CARLO",
    "PRICE_FORECAST",
    "WHAT_WILL_THIS_BE_WORTH",
  ],
  parameters: [
    {
      name: "card_name",
      description: "Name of the card to simulate",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "current_price",
      description: "Current price in USD",
      required: true,
      schema: { type: "number" },
    },
    {
      name: "model",
      description: "Forecast model (default 'conformal'): 'conformal' (regime-aware split-conformal bands, honest calibrated VaR), or opt into Monte Carlo with 'merton' (jump-diffusion) or 'gbm'",
      required: false,
      schema: { type: "string", enumValues: ["conformal", "merton", "gbm"] },
    },
    {
      name: "days",
      description: "Forecast horizon in days (default: 30)",
      required: false,
      schema: { type: "number" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "Simulate the price of Charizard VMAX at $350 for 60 days" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Running Monte Carlo simulation on Charizard VMAX...", action: "TCG_ORACLE_SIMULATE" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "What will a PSA 10 Base Set Blastoise worth $800 be in 90 days using merton model?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Running Merton jump-diffusion simulation for Blastoise...", action: "TCG_ORACLE_SIMULATE" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Forecast Lorcana Elsa at $25 for 30 days" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Simulating Lorcana Elsa price trajectory...", action: "TCG_ORACLE_SIMULATE" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text || "";

    // Try to extract parameters from text
    const priceMatch = text.match(/\$?([\d,]+(?:\.\d{2})?)/);
    const daysMatch = text.match(/(\d+)\s*days?/i);
    const modelMatch = text.match(/\b(conformal|merton|gbm)\b/i);

    const cardName =
      text
        .replace(/simulate|price|forecast|monte carlo|at|\$[\d,.]+|\d+\s*days?|conformal|merton|gbm/gi, "")
        .replace(/\s+/g, " ")
        .trim() || "Unknown Card";

    const currentPrice = priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : 0;
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    const model = modelMatch ? modelMatch[1].toLowerCase() : "conformal";

    if (currentPrice <= 0) {
      if (callback) await callback({ text: "Please provide a current price for the simulation. Example: 'Simulate Charizard VMAX at $350 for 60 days'" });
      return { success: false, error: "Invalid or missing current price" };
    }

    const result = await callApi(getBaseUrl(runtime), "/api/v1/simulate", {
      card_name: cardName,
      current_price: currentPrice,
      model,
      days,
      simulations: 10000,
    });

    if (result.error) {
      if (callback) await callback({ text: `Simulation failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const summary = safeStringify(result.data);
    const responseText = `Monte Carlo simulation for ${cardName} ($${currentPrice}, ${model} model, ${days} days):\n\n${summary}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_SIMULATE");
    return { success: true, text: responseText, data: { simulation_result: result.data } };
  },
};

// ============================================================
// ACTION 4: Market Snapshot
// ============================================================

const marketAction: Action = {
  name: "TCG_ORACLE_MARKET",
  description:
    "SUSPENDED since 2026-09-07 (frozen USD panel; the oracle returns status=suspended and does not charge — the action reports that and points at the live alternatives: TCG_ORACLE_JP_SUMMARY, TCG_ORACLE_SPORTS_BOARD, TCG_ORACLE_LOAN_PREVIEW). Was: daily USD market snapshot for a game.",
  similes: [
    "MARKET_SNAPSHOT",
    "MARKET_DATA",
    "TCG_MARKET",
    "CARD_MARKET",
    "TOP_MOVERS",
    "PRICE_CHANGES",
  ],
  parameters: [
    {
      name: "game",
      description: "Game name: Pokemon, Magic: The Gathering, Yu-Gi-Oh, Lorcana, One Piece, etc",
      required: false,
      schema: { type: "string" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "Show me the Pokemon market snapshot" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Pulling the latest Pokemon market data...", action: "TCG_ORACLE_MARKET" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "What's happening in the Yu-Gi-Oh market today?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Fetching Yu-Gi-Oh market snapshot...", action: "TCG_ORACLE_MARKET" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Top movers in Magic: The Gathering" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Pulling Magic: The Gathering market data...", action: "TCG_ORACLE_MARKET" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text?.toLowerCase() || "";

    // Detect game from message
    let game = "Pokemon";
    for (const g of SUPPORTED_GAMES) {
      if (text.includes(g.toLowerCase())) {
        game = g;
        break;
      }
    }

    const result = await callApi(getBaseUrl(runtime), "/api/v1/market", { game });

    if (result.error) {
      if (callback) await callback({ text: `Market data failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const summary = safeStringify(result.data, 25);
    const responseText = `Market snapshot for ${game}:\n\n${summary}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_MARKET");
    return { success: true, text: responseText, data: { market_data: result.data } };
  },
};

// ============================================================
// ACTION 5: Grade-or-Not Decision Engine
// ============================================================

const gradeOrNotAction: Action = {
  name: "TCG_ORACLE_GRADE_OR_NOT",
  description:
    "Answers 'will grading this card make me money?' by combining AI grade prediction with PSA fee schedules, shipping costs, and graded market values. Returns a GO/NO-GO verdict with expected ROI and profit scenarios (best case, predicted, worst case).",
  similes: [
    "SHOULD_I_GRADE",
    "GRADE_ROI",
    "GRADING_PROFIT",
    "IS_IT_WORTH_GRADING",
    "GRADE_OR_NOT",
  ],
  parameters: [
    {
      name: "card_name",
      description: "Name of the card to evaluate (e.g., 'Base Set Charizard Holo')",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "predicted_grade",
      description: "Your predicted PSA grade (0 = auto-estimate)",
      required: false,
      schema: { type: "number" },
    },
    {
      name: "raw_price",
      description: "Current raw card value in USD (0 = auto-lookup)",
      required: false,
      schema: { type: "number" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "Should I grade my Base Set Charizard?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Running Grade-or-Not analysis...", action: "TCG_ORACLE_GRADE_OR_NOT" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Is it worth grading a PSA 8 Pikachu VMAX worth $45?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Calculating grading ROI for Pikachu VMAX...", action: "TCG_ORACLE_GRADE_OR_NOT" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text || "";

    // Extract card name
    const cardName = text
      .replace(/^(should i|is it worth|grade or not|grading roi|will grading)\s*/i, "")
      .replace(/\s*(make me money|be profitable|worth it)\s*\??$/i, "")
      .replace(/^(grade|grading)\s*/i, "")
      .replace(/\bmy\b/i, "")
      .trim() || "Unknown Card";

    // Extract price and grade if mentioned
    const priceMatch = text.match(/\$?([\d,]+(?:\.\d{2})?)/);
    const gradeMatch = text.match(/\bpsa\s*(\d+(?:\.\d)?)\b/i) || text.match(/\bgrade\s*(\d+(?:\.\d)?)\b/i);

    const params: Record<string, string | number> = { card_name: cardName };
    if (priceMatch) params.raw_price = parseFloat(priceMatch[1].replace(",", ""));
    if (gradeMatch) params.predicted_grade = parseFloat(gradeMatch[1]);

    const result = await callApi(getBaseUrl(runtime), "/api/v1/grade-or-not", params);

    if (result.error) {
      if (callback) await callback({ text: `Grade-or-Not analysis failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const data = result.data;
    const verdict = data?.verdict || "Unknown";
    const explanation = data?.explanation || "";
    const responseText = `Grade-or-Not verdict for ${cardName}:\n\n${verdict}\n${explanation}\n\nFull analysis:\n${safeStringify(data)}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_GRADE_OR_NOT");
    return { success: true, text: responseText, data: { grade_or_not: data } };
  },
};

// ============================================================
// ACTION 6: Trending Cards
// ============================================================

const trendingAction: Action = {
  name: "TCG_ORACLE_TRENDING",
  description:
    "SUSPENDED since 2026-09-07 (frozen USD panel; the oracle returns status=suspended and does not charge — the action reports that). Was: returns the top trending trading cards by market activity (30-day sales volume, views, and price velocity). Covers all 25 supported TCG games. Useful for spotting market momentum and emerging opportunities.",
  similes: [
    "TRENDING_CARDS",
    "HOT_CARDS",
    "TOP_MOVERS",
    "WHATS_TRENDING",
    "POPULAR_CARDS",
    "MARKET_TRENDS",
  ],
  parameters: [
    {
      name: "game",
      description: "Filter by game name (empty = all games)",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "limit",
      description: "Number of results (default: 25, max: 100)",
      required: false,
      schema: { type: "number" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "What Pokemon cards are trending right now?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Pulling trending Pokemon cards...", action: "TCG_ORACLE_TRENDING" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Show me the hottest cards across all games" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Fetching trending cards across all TCG games...", action: "TCG_ORACLE_TRENDING" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content?.text?.toLowerCase() || "";

    // Detect game from message
    let game = "";
    for (const g of SUPPORTED_GAMES) {
      if (text.includes(g.toLowerCase())) {
        game = g;
        break;
      }
    }

    const params: Record<string, string | number> = { limit: 25 };
    if (game) params.game = game;

    const result = await callApi(getBaseUrl(runtime), "/api/v1/trending", params);

    if (result.error) {
      if (callback) await callback({ text: `Trending cards failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const summary = safeStringify(result.data, 15);
    const responseText = `Trending cards${game ? ` for ${game}` : " across all games"}:\n\n${summary}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_TRENDING");
    return { success: true, text: responseText, data: { trending: result.data } };
  },
};

// ============================================================
// ACTION 7: Japanese two-sided dealer board — summary (free, live)
// ============================================================

const jpSummaryAction: Action = {
  name: "TCG_ORACLE_JP_SUMMARY",
  description:
    "Daily aggregate summary of the Japanese two-sided dealer board (bid AND ask, yen): card/set/game totals, two-sided share, ask price bands, per-game breakdown, day-over-day and week-over-week movement, and the on-chain commitment root. Aggregates only — no per-card names, ids or prices. Free, live (this is the feed the Card Souls call from 2026-09-14).",
  similes: [
    "JAPANESE_MARKET",
    "JP_BOARD",
    "JP_SUMMARY",
    "YEN_MARKET",
    "JAPANESE_CARDS",
    "DEALER_BOARD",
  ],
  parameters: [
    {
      name: "section",
      description: "Optional: narrow the answer to one block — totals, bands, per_game or movement (default: all)",
      required: false,
      schema: { type: "string" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "How is the Japanese card market moving today?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Pulling the Japanese two-sided board summary...", action: "TCG_ORACLE_JP_SUMMARY" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Give me the JP dealer board summary" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Fetching today's Japanese board aggregates...", action: "TCG_ORACLE_JP_SUMMARY" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text?.toLowerCase() || "";
    const sections = ["totals", "bands", "per_game", "movement"];
    const section =
      (options?.section as string) ||
      sections.find((k) => text.includes(k.replace("_", " ")) || text.includes(k)) ||
      "";

    const result = await callApi(getBaseUrl(runtime), "/api/v1/jp/summary", {});

    if (result.error) {
      if (callback) await callback({ text: `Japanese board summary failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const d = result.data || {};
    const t = d.totals || {};
    const dod = d.movement?.day_over_day || {};
    const headline =
      `Japanese two-sided board — ${d.as_of}: ${t.cards} cards / ${t.sets} sets / ${t.games} games, ` +
      `${t.two_sided} two-sided (${Math.round((t.two_sided_share || 0) * 100)}%), median ask ¥${t.median_ask_yen}. ` +
      `Day-over-day: ${dod.asks_changed} asks moved (${dod.up} up / ${dod.down} down).`;
    const body = section && d[section] !== undefined ? { as_of: d.as_of, [section]: d[section], onchain: d.onchain } : d;
    const responseText = `${headline}\n\n${safeStringify(body)}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_JP_SUMMARY");
    return { success: true, text: responseText, data: { jp_summary: d } };
  },
};

// ============================================================
// ACTION 8: Daily sports movers board (free, live)
// ============================================================

const SPORTS_LEAGUES = ["mlb", "nhl", "nfl", "ncaaf", "nba", "ncaab", "wnba"];

const sportsBoardAction: Action = {
  name: "TCG_ORACLE_SPORTS_BOARD",
  description:
    "Daily sports movers board — hot players per live league (MLB, NHL, NFL, NCAAF, NBA, ...) with conformal 7-day context, headshots and the current calibration verdict. Free, live. Name a league to narrow the answer.",
  similes: [
    "SPORTS_MOVERS",
    "HOT_PLAYERS",
    "SPORTS_BOARD",
    "PLAYER_MOVERS",
    "SPORTS_CARDS",
  ],
  parameters: [
    {
      name: "league",
      description: "Optional league filter: mlb, nhl, nfl, ncaaf, nba, ncaab, wnba",
      required: false,
      schema: { type: "string" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "Who are the hot NFL players this week?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Pulling the NFL movers board...", action: "TCG_ORACLE_SPORTS_BOARD" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Show me the sports movers board" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Fetching today's sports board across live leagues...", action: "TCG_ORACLE_SPORTS_BOARD" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text?.toLowerCase() || "";
    const league = SPORTS_LEAGUES.find((l) => new RegExp(`\\b${l}\\b`).test(text));

    const result = await callApi(getBaseUrl(runtime), "/api/v1/sports/board", {});

    if (result.error) {
      if (callback) await callback({ text: `Sports board failed: ${result.error}` });
      return { success: false, error: result.error };
    }

    const d = result.data || {};
    const leagues: Record<string, any> = d.leagues || {};
    const live = Object.keys(leagues);
    let body: any;
    let label: string;
    if (league && leagues[league]) {
      body = leagues[league];
      label = league.toUpperCase();
    } else if (league) {
      body = { live_leagues: live, note: `${league} is not on today's board` };
      label = league.toUpperCase();
    } else {
      body = leagues;
      label = live.map((l) => l.toUpperCase()).join(", ");
    }
    const responseText =
      `Sports movers board (${d.horizon_days || 7}-day horizon) — ${label}. Calibration: ${safeStringify(d.calibration)}\n\n${safeStringify(body, 25)}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_SPORTS_BOARD");
    return { success: true, text: responseText, data: { sports_board: d, league: league || null } };
  },
};

// ============================================================
// ACTION 9: Graded-slab loan terms — free worked derivation
// ============================================================

const loanPreviewAction: Action = {
  name: "TCG_ORACLE_LOAN_PREVIEW",
  description:
    "Graded-slab lending terms (loan-terms v2, live basis): the six-step worked LTV derivation — collateral value, empirical-VaR tail, max LTV, liquidation price, census liquidity tier, APR premium — for a graded card. Give a product_id + grade (e.g. 'PSA 10'); without one it walks the top of today's free board. Free for free-board slabs; other slabs point at the paid /api/v1/loan-terms quote ($0.10, x402).",
  similes: [
    "LOAN_TERMS",
    "CARD_LOAN",
    "LTV",
    "COLLATERAL_VALUE",
    "SLAB_LOAN",
    "LENDING_TERMS",
  ],
  parameters: [
    {
      name: "product_id",
      description: "TCG product id of the card (from TCG_ORACLE_SEARCH)",
      required: false,
      schema: { type: "number" },
    },
    {
      name: "grade",
      description: "Slab grade, e.g. 'PSA 10', 'PSA 9', 'BGS 9.5', 'CGC 10'",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "term_days",
      description: "Loan term in days (default 30)",
      required: false,
      schema: { type: "number" },
    },
  ],
  examples: [
    [
      { name: "{{user1}}", content: { text: "What loan terms would a PSA 10 of product 566544 get?" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Working the graded-slab LTV derivation...", action: "TCG_ORACLE_LOAN_PREVIEW" } } as ActionExample,
    ],
    [
      { name: "{{user1}}", content: { text: "Show me the loan free board" } } as ActionExample,
      { name: "{{agentName}}", content: { text: "Pulling today's rated slab universe and the free-board derivation...", action: "TCG_ORACLE_LOAN_PREVIEW" } } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime) => !!getBaseUrl(runtime),
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text || "";
    const baseUrl = getBaseUrl(runtime);

    let productId = Number(options?.product_id) || 0;
    if (!productId) {
      const m = text.match(/\b(\d{5,7})\b/);
      if (m) productId = Number(m[1]);
    }
    let grade = (options?.grade as string) || "";
    if (!grade) {
      const g = text.match(/\b(PSA|BGS|CGC|SGC)\s*(10|9\.5|9|8\.5|8|7|6|5)\b/i);
      if (g) grade = `${g[1].toUpperCase()} ${g[2]}`;
    }
    const termDays = Number(options?.term_days) || (text.match(/\b(\d{1,3})\s*-?\s*day/i)?.[1] ? Number(text.match(/\b(\d{1,3})\s*-?\s*day/i)![1]) : 30);

    // No slab named: walk the free board (universe → first free_board slab)
    let universeNote = "";
    if (!productId || !grade) {
      const uni = await callApi(baseUrl, "/api/v1/loan-terms/universe", {});
      if (uni.error) {
        if (callback) await callback({ text: `Loan universe failed: ${uni.error}` });
        return { success: false, error: uni.error };
      }
      const cards: any[] = uni.data?.cards || [];
      const pick = cards.find((c) => c.free_board && (!productId || c.product_id === productId));
      if (!pick) {
        const msg = productId
          ? `product ${productId} is not on today's free board — a full quote is the paid /api/v1/loan-terms?product_id=${productId}&grade= ($0.10, x402).`
          : "no free-board slab published today.";
        if (callback) await callback({ text: `Loan preview: ${msg}` });
        return { success: false, error: msg };
      }
      productId = pick.product_id;
      grade = pick.grade;
      universeNote = `Universe ${uni.data?.universe_date}: ${uni.data?.total} rated slabs, ${uni.data?.free_board} on the free board (${uni.data?.method_version}). Showing #${pick.rank} ${pick.name} ${pick.grade}.\n\n`;
    }

    const result = await callApi(baseUrl, `/api/v1/loan-terms/preview/${productId}`, { grade, term_days: termDays });

    if (result.error) {
      const hint = result.error.includes("404")
        ? ` (${productId} ${grade} is not on today's free board — full quote: /api/v1/loan-terms?product_id=${productId}&grade=${encodeURIComponent(grade)}, $0.10 x402)`
        : "";
      if (callback) await callback({ text: `Loan preview failed: ${result.error}${hint}` });
      return { success: false, error: result.error };
    }

    const d = result.data || {};
    const responseText = `${universeNote}Loan terms — ${d.card || productId} ${d.grade || grade}, ${d.term_days || termDays}-day (${d.method_version}):\n\n${safeStringify(d)}`;

    if (callback) await callback({ text: responseText }, "TCG_ORACLE_LOAN_PREVIEW");
    return { success: true, text: responseText, data: { loan_preview: d, product_id: productId, grade } };
  },
};

// ============================================================
// PROVIDER: TCG Oracle Context
// ============================================================

const tcgOracleProvider: Provider = {
  name: "tcg-oracle",
  description: "Provides TCG Oracle market intelligence context to the agent",
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    const baseUrl = getBaseUrl(runtime);
    const status = baseUrl ? "connected" : "not configured";

    return {
      text: `[TCG Oracle v2.0.2]
Status: ${status}
Database: 455K+ products across 25+ games (USD panel FROZEN 2026-09-07 — served as last-published, labelled)
Live feeds: Japanese two-sided dealer board (daily, on-chain root), graded-slab loan terms v2, sports movers board
Models: conformal (default — regime-aware split-conformal bands, honest VaR), merton (jump-diffusion), gbm — Monte Carlo is opt-in
Actions: search, grade, grade-or-not, jp-summary, sports-board, loan-preview (live) · simulate, market, trending (SUSPENDED — oracle answers status=suspended, never charges)
Supported games: ${SUPPORTED_GAMES.join(", ")}
API: ${baseUrl || "TCG_ORACLE_URL not set"}

The agent can search cards, grade card images, check grading ROI, summarise the Japanese two-sided board, pull the sports movers board and work graded-slab loan terms. Simulate / market / trending are suspended until a live USD series exists again.`,
      values: {
        tcgOracleStatus: status,
        tcgOracleUrl: baseUrl || "not set",
        totalProducts: 455000,
      },
    };
  },
};

// ============================================================
// PLUGIN EXPORT
// ============================================================

const tcgOraclePlugin: Plugin = {
  name: "@undesirables/plugin-tcg-oracle",
  description:
    "TCG Oracle — AI-powered trading card market intelligence for ElizaOS agents. " +
    "Covers 455K+ products across 25+ games: set-aware search, AI vision card grading " +
    "with ROI analysis, the Japanese two-sided dealer board summary, graded-slab loan " +
    "terms (empirical-VaR LTV, live basis) and the daily sports movers board. " +
    "USD-panel forecasts, market snapshots and trending are suspended since 2026-09-07 " +
    "(the oracle answers status=suspended and never charges).",
  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    const validation = validateTcgOracleConfig(runtime);
    if (!validation.valid) {
      console.warn(`⚠️ TCG Oracle: ${validation.error}`);
    } else {
      console.log(`✅ TCG Oracle v2.0.2 connected to ${runtime.getSetting?.("TCG_ORACLE_URL")}`);
    }
  },
  actions: [searchAction, gradeAction, simulateAction, marketAction, gradeOrNotAction, trendingAction, jpSummaryAction, sportsBoardAction, loanPreviewAction],
  providers: [tcgOracleProvider],
  evaluators: [],
  services: [MarketMonitorService],
};

export default tcgOraclePlugin;
export { SUPPORTED_GAMES, SIMULATION_MODELS };

