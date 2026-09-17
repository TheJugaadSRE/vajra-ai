export interface Deployment {
  version: string;
  service: string;
  environment: string;
  deployed_at: string;
  deployed_by: string;
  change_summary: string;
}

export interface DeploymentProvider {
  name: string;
  getRecentDeployments(service: string, environment: string, sinceMinutes: number): Promise<Deployment[]>;
  rollback(service: string, environment: string, toVersion: string): Promise<{ success: boolean; message: string }>;
  restartService(service: string, environment: string): Promise<{ success: boolean; message: string }>;
  scaleService(service: string, environment: string, replicas: number): Promise<{ success: boolean; message: string }>;
}
