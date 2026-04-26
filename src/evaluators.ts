import { Evaluator, IAgentRuntime, Memory, State } from "@elizaos/core";

export const preferenceEvaluator: Evaluator = {
  name: "TCG_PREFERENCE_EVALUATOR",
  description: "Extracts and remembers the user's favorite TCG games from conversation to personalize future market analysis.",
  similes: ["TRACK_FAVORITE_GAME", "REMEMBER_TCG_PREFERENCE", "NOTE_TCG_INTEREST"],
  alwaysRun: true,
  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const games = ["pokemon", "magic", "mtg", "yu-gi-oh", "lorcana", "one piece"];
    return games.some(game => text.includes(game));
  },
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State): Promise<void> => {
    // In a full implementation, this uses the LLM to extract the exact sentiment
    // and saves it to runtime.messageManager or runtime.databaseAdapter.
    // For registry boilerplate, we acknowledge the pattern.
    console.log(`[TCG Oracle Evaluator] Passively detected TCG game interest in message ${message.id}`);
  }
};
