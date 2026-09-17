import { SecurityProvider, SuspiciousIp, TrafficPoint } from "./types";

const ATTACK_TRAFFIC: TrafficPoint[] = [
  { time: "-10m", requests_per_minute: 210 },
  { time: "-8m", requests_per_minute: 260 },
  { time: "-6m", requests_per_minute: 420 },
  { time: "-4m", requests_per_minute: 1250 },
  { time: "-2m", requests_per_minute: 2870 },
  { time: "now", requests_per_minute: 3540 },
];

const NORMAL_TRAFFIC: TrafficPoint[] = ATTACK_TRAFFIC.map((p) => ({ ...p, requests_per_minute: 190 + Math.round(Math.random() * 40) }));

const SUSPICIOUS_IPS: SuspiciousIp[] = [
  { ip: "185.34.12.88", requests_per_minute: 12432, threat_score: 91 },
  { ip: "92.188.44.201", requests_per_minute: 9120, threat_score: 84 },
  { ip: "103.44.21.90", requests_per_minute: 8401, threat_score: 78 },
  { ip: "14.201.90.18", requests_per_minute: 7322, threat_score: 71 },
  { ip: "77.109.12.200", requests_per_minute: 6004, threat_score: 66 },
];

/** Deterministic, stateful mock — same before/after pattern as MockObservabilityProvider:
 * traffic looks attacked until blockIps() is called for that service/environment. */
export class MockSecurityProvider implements SecurityProvider {
  name = "mock";
  private blocked = new Map<string, boolean>();

  private isBlocked(service: string, environment: string): boolean {
    return this.blocked.get(`${service}:${environment}`) ?? false;
  }

  async getTrafficPattern(service: string, environment: string): Promise<TrafficPoint[]> {
    return this.isBlocked(service, environment) ? NORMAL_TRAFFIC : ATTACK_TRAFFIC;
  }

  async getSuspiciousIps(service: string, environment: string): Promise<SuspiciousIp[]> {
    return this.isBlocked(service, environment) ? [] : SUSPICIOUS_IPS;
  }

  async blockIps(service: string, environment: string, ips: string[]): Promise<{ success: boolean; message: string }> {
    this.blocked.set(`${service}:${environment}`, true);
    return { success: true, message: `Blocked ${ips.length || SUSPICIOUS_IPS.length} IP(s) via WAF rule (simulated)` };
  }
}
