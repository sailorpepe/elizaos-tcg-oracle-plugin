import { Service, IAgentRuntime } from "@elizaos/core";

export class MarketMonitorService extends Service {
  // Use a string getter to satisfy ElizaOS ServiceType constraints if needed,
  // or define static serviceType depending on the core version.
  static serviceType = "TCG_MARKET_MONITOR";

  get capabilityDescription(): string {
    return "Monitors TCG market data for price spikes and trending cards";
  }

  static async start(runtime: IAgentRuntime): Promise<MarketMonitorService> {
    const service = new MarketMonitorService();
    await service.initialize(runtime);
    return service;
  }

  private monitorInterval: NodeJS.Timeout | null = null;

  async initialize(_runtime: IAgentRuntime): Promise<void> {
    console.log("[TCG Oracle Service] Market Monitor Service initialized.");
    // Example: Start background polling for market spikes every hour
    // this.monitorInterval = setInterval(() => this.pollMarket(), 1000 * 60 * 60);
  }

  async stop(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    console.log("[TCG Oracle Service] Market Monitor Service stopped.");
  }

  private pollMarket() {
    console.log("[TCG Oracle Service] Background task: Polling TCG market for price spikes...");
  }
}
