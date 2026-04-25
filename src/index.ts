/**
 * TCG Oracle — ElizaOS Plugin v1.0.0
 * ====================================
 * AI-powered trading card market intelligence for ElizaOS agents.
 * Native TypeScript rewrite of the Python G.A.M.E. SDK version.
 *
 * Features:
 * - Search 370K+ TCG products across 25 games (Pokemon, MTG, Yu-Gi-Oh, etc.)
 * - AI Vision card grading (PSA/Beckett prediction via Qwen VL)
 * - Monte Carlo price simulation (Heston, Merton, Kou stochastic models)
 * - Real-time market snapshots from TCGCSV daily data
 * - License key purchase & verification (Ethereum NFT)
 *
 * @see https://the-undesirables.com
 * @see https://github.com/sailorpepe/elizaos-tcg-oracle-plugin
 */

import { validateTcgOracleConfig } from "./environment.js";

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

const SIMULATION_MODELS = ["heston", "merton", "kou"] as const;

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
      headers: { "User-Agent": "elizaos-tcg-oracle-plugin/1.0.0" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { error: `API returned HTTP ${response.status}` };
    }

    const json = (await response.json()) as Record<string, any>;
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
    "Search for trading card products across 25 games including Pokemon, Magic: The Gathering, Yu-Gi-Oh, Lorcana, One Piece, and more. Returns product names, set info, and current market prices from 370K+ real products sourced from TCGCSV daily.",
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
// ACTION 3: Monte Carlo Price Simulation
// ============================================================

const simulateAction: Action = {
  name: "TCG_ORACLE_SIMULATE",
  description:
    "Run Monte Carlo simulation on a TCG card's price to predict future value. Uses real drift and volatility computed from TCGCSV historical data. Supports three stochastic models: Heston (stochastic volatility), Merton (jump-diffusion), and Kou (double-exponential jumps). Returns percentile bands (5th, 25th, 50th, 75th, 95th) for the forecast period.",
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
      description: "Stochastic model: 'heston', 'merton', or 'kou'",
      required: false,
      schema: { type: "string", enumValues: ["heston", "merton", "kou"] },
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
    const modelMatch = text.match(/\b(heston|merton|kou)\b/i);

    const cardName =
      text
        .replace(/simulate|price|forecast|monte carlo|at|\$[\d,.]+|\d+\s*days?|heston|merton|kou/gi, "")
        .replace(/\s+/g, " ")
        .trim() || "Unknown Card";

    const currentPrice = priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : 0;
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    const model = modelMatch ? modelMatch[1].toLowerCase() : "heston";

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
    "Retrieve the latest daily market data snapshot from TCGCSV for a specific game. Returns top movers, price changes, volume data, and market trends. Data is refreshed daily via automated pipeline.",
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
      text: `[TCG Oracle]
Status: ${status}
Database: 370,158 products across 25 games
Data source: TCGCSV daily snapshots
Models: Heston (stochastic vol), Merton (jump-diffusion), Kou (double-exp)
Supported games: ${SUPPORTED_GAMES.join(", ")}
API: ${baseUrl || "TCG_ORACLE_URL not set"}

The agent can search cards, grade card images, simulate prices via Monte Carlo, and pull market snapshots.`,
      values: {
        tcgOracleStatus: status,
        tcgOracleUrl: baseUrl || "not set",
        totalProducts: 370158,
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
    "Covers 370K+ products across 25 games with Monte Carlo price simulation " +
    "(Heston/Merton/Kou), AI vision card grading, and real-time market snapshots. " +
    "Powered by TCGCSV daily data pipeline.",
  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    const validation = validateTcgOracleConfig(runtime);
    if (!validation.valid) {
      console.warn(`⚠️ TCG Oracle: ${validation.error}`);
    } else {
      console.log(`✅ TCG Oracle connected to ${runtime.getSetting?.("TCG_ORACLE_URL")}`);
    }
  },
  actions: [searchAction, gradeAction, simulateAction, marketAction],
  providers: [tcgOracleProvider],
  evaluators: [],
};

export default tcgOraclePlugin;
export { SUPPORTED_GAMES, SIMULATION_MODELS };
