export interface TrafficPoint {
  time: string;
  requests_per_minute: number;
}

export interface SuspiciousIp {
  ip: string;
  requests_per_minute: number;
  threat_score: number;
}

export interface SecurityProvider {
  name: string;
  getTrafficPattern(service: string, environment: string): Promise<TrafficPoint[]>;
  getSuspiciousIps(service: string, environment: string): Promise<SuspiciousIp[]>;
  blockIps(service: string, environment: string, ips: string[]): Promise<{ success: boolean; message: string }>;
}
