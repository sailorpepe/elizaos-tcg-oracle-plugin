import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("plugin-tcg-oracle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Plugin Structure", () => {
    it("should export a valid ElizaOS v2 plugin", async () => {
      const plugin = (await import("../index.js")).default;

      expect(plugin.name).toBe("@undesirables/plugin-tcg-oracle");
      expect(plugin.actions.length).toBeGreaterThan(0);
      expect(plugin.providers).toBeDefined();
      expect(plugin.providers?.length).toBeGreaterThan(0);
      expect(plugin.evaluators).toBeDefined();
      expect(plugin.evaluators?.length).toBe(0);
      expect(plugin.services).toBeDefined();
      expect(plugin.services?.length).toBe(1);
    });

    it("should have correct action names", async () => {
      const plugin = (await import("../index.js")).default;
      const names = plugin.actions!.map((a: any) => a.name);

      expect(names).toContain("TCG_ORACLE_SEARCH");
      expect(names).toContain("TCG_ORACLE_GRADE");
      expect(names).toContain("TCG_ORACLE_SIMULATE");
      expect(names).toContain("TCG_ORACLE_MARKET");
    });

    it("should have a named provider", async () => {
      const plugin = (await import("../index.js")).default;
      const provider = plugin.providers![0];

      expect(provider.name).toBe("tcg-oracle");
      expect(provider.description).toBeTruthy();
      expect(typeof provider.get).toBe("function");
    });

    it("actions should have examples with v2 format (name + content)", async () => {
      const plugin = (await import("../index.js")).default;

      for (const action of plugin.actions!) {
        expect(action.examples).toBeDefined();
        expect(action.examples!.length).toBeGreaterThanOrEqual(1);
        for (const exampleGroup of action.examples!) {
          for (const example of exampleGroup) {
            expect(example).toHaveProperty("name");
            expect(example).toHaveProperty("content");
          }
        }
      }
    });

    it("all actions should have structured parameters", async () => {
      const plugin = (await import("../index.js")).default;

      for (const action of plugin.actions!) {
        expect(action.parameters).toBeDefined();
        expect(action.parameters!.length).toBeGreaterThanOrEqual(1);
        for (const param of action.parameters!) {
          expect(param).toHaveProperty("name");
          expect(param).toHaveProperty("description");
          expect(param).toHaveProperty("schema");
        }
      }
    });

    it("all actions should have similes for discoverability", async () => {
      const plugin = (await import("../index.js")).default;

      for (const action of plugin.actions!) {
        expect(action.similes).toBeDefined();
        expect(action.similes!.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("Action Validation", () => {
    it("search action should reject when TCG_ORACLE_URL is not set", async () => {
      const plugin = (await import("../index.js")).default;
      const searchAction = plugin.actions!.find((a: any) => a.name === "TCG_ORACLE_SEARCH");

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue(""),
        agentId: "test-agent",
      };

      const isValid = await searchAction!.validate!(mockRuntime as any);
      expect(isValid).toBe(false);
    });

    it("search action should accept when TCG_ORACLE_URL is set", async () => {
      const plugin = (await import("../index.js")).default;
      const searchAction = plugin.actions!.find((a: any) => a.name === "TCG_ORACLE_SEARCH");

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue("https://oracle.the-undesirables.com"),
        agentId: "test-agent",
      };

      const isValid = await searchAction!.validate!(mockRuntime as any);
      expect(isValid).toBe(true);
    });
  });

  describe("API Client Error Handling", () => {
    it("search handler should return error when API is unreachable", async () => {
      const plugin = (await import("../index.js")).default;
      const searchAction = plugin.actions!.find((a: any) => a.name === "TCG_ORACLE_SEARCH");

      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue("https://oracle.the-undesirables.com"),
        agentId: "test-agent",
      };

      const mockMessage = {
        content: { text: "Search for Charizard" },
      };

      let callbackText = "";
      const mockCallback = vi.fn(async (response: any) => {
        callbackText = response.text;
      });

      const result = await searchAction!.handler!(
        mockRuntime as any,
        mockMessage as any,
        undefined,
        undefined,
        mockCallback
      );

      expect(result).toBeDefined();
      expect((result as any).success).toBe(false);
    });

    it("search handler should handle API timeout (AbortError)", async () => {
      const plugin = (await import("../index.js")).default;
      const searchAction = plugin.actions!.find((a: any) => a.name === "TCG_ORACLE_SEARCH");

      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue("https://oracle.the-undesirables.com"),
        agentId: "test-agent",
      };

      const mockMessage = {
        content: { text: "Search for Charizard" },
      };

      const mockCallback = vi.fn();

      const result = await searchAction!.handler!(
        mockRuntime as any,
        mockMessage as any,
        undefined,
        undefined,
        mockCallback
      );

      expect(result).toBeDefined();
      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain("timed out");
    });

    it("grade handler should reject messages without image URLs", async () => {
      const plugin = (await import("../index.js")).default;
      const gradeAction = plugin.actions!.find((a: any) => a.name === "TCG_ORACLE_GRADE");

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue("https://oracle.the-undesirables.com"),
        agentId: "test-agent",
      };

      const mockMessage = {
        content: { text: "Grade my card please" },
      };

      const mockCallback = vi.fn();

      const result = await gradeAction!.handler!(
        mockRuntime as any,
        mockMessage as any,
        undefined,
        undefined,
        mockCallback
      );

      expect(result).toBeDefined();
      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain("No image URL");
    });

    it("simulate handler should reject when no price is provided", async () => {
      const plugin = (await import("../index.js")).default;
      const simAction = plugin.actions!.find((a: any) => a.name === "TCG_ORACLE_SIMULATE");

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue("https://oracle.the-undesirables.com"),
        agentId: "test-agent",
      };

      const mockMessage = {
        content: { text: "Simulate Charizard price" },
      };

      const mockCallback = vi.fn();

      const result = await simAction!.handler!(
        mockRuntime as any,
        mockMessage as any,
        undefined,
        undefined,
        mockCallback
      );

      expect(result).toBeDefined();
      expect((result as any).success).toBe(false);
    });
  });

  describe("Provider", () => {
    it("should return connected status when URL is configured", async () => {
      const plugin = (await import("../index.js")).default;
      const provider = plugin.providers![0];

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue("https://oracle.the-undesirables.com"),
        agentId: "test-agent",
      };

      const result = await provider.get!(mockRuntime as any, {} as any, {} as any);

      expect(result.text).toContain("connected");
      expect(result.values?.tcgOracleStatus).toBe("connected");
    });

    it("should return not configured status when URL is missing", async () => {
      const plugin = (await import("../index.js")).default;
      const provider = plugin.providers![0];

      const mockRuntime = {
        getSetting: vi.fn().mockReturnValue(""),
        agentId: "test-agent",
      };

      const result = await provider.get!(mockRuntime as any, {} as any, {} as any);

      expect(result.text).toContain("not configured");
      expect(result.values?.tcgOracleStatus).toBe("not configured");
    });
  });
});
