import { SecurityProvider, SuspiciousIp, TrafficPoint } from "./types";

class NotImplementedSecurityProvider implements SecurityProvider {
  constructor(public name: string) {}

  async getTrafficPattern(): Promise<TrafficPoint[]> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }

  async getSuspiciousIps(): Promise<SuspiciousIp[]> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }

  async blockIps(): Promise<{ success: boolean; message: string }> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }
}

export class CloudflareSecurityProvider extends NotImplementedSecurityProvider {
  constructor() {
    super("cloudflare");
  }
}

export class AwsWafSecurityProvider extends NotImplementedSecurityProvider {
  constructor() {
    super("aws-waf");
  }
}
