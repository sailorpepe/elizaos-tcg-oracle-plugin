import type { IAgentRuntime } from "@elizaos/core";

/**
 * Validates that the TCG Oracle plugin has all required configuration.
 * Called during plugin init and before each action.
 */
export function validateTcgOracleConfig(
  runtime: IAgentRuntime
): { valid: boolean; error?: string } {
  const url =
    (runtime.getSetting?.("TCG_ORACLE_URL") as string) ||
    process.env.TCG_ORACLE_URL ||
    "";

  if (!url) {
    return {
      valid: false,
      error:
        "TCG_ORACLE_URL is required. Set it in your character.json settings " +
        "or as an environment variable. Example: https://oracle.the-undesirables.com",
    };
  }

  try {
    new URL(url);
  } catch {
    return {
      valid: false,
      error: `TCG_ORACLE_URL is not a valid URL: "${url}"`,
    };
  }

  return { valid: true };
}
