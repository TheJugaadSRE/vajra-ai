import { Deployment, DeploymentProvider } from "./types";

export class MockDeploymentProvider implements DeploymentProvider {
  name = "mock";
  private deployments: Deployment[] = [
    {
      version: "1.4.82",
      service: "checkout-service",
      environment: "production",
      deployed_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      deployed_by: "ci-pipeline",
      change_summary: "Reduced checkout-db connection pool size from 50 to 10 as part of cost optimization",
    },
  ];

  async getRecentDeployments(service: string, environment: string, sinceMinutes: number): Promise<Deployment[]> {
    const cutoff = Date.now() - sinceMinutes * 60 * 1000;
    return this.deployments.filter(
      (d) => d.service === service && d.environment === environment && new Date(d.deployed_at).getTime() >= cutoff
    );
  }

  async rollback(service: string, environment: string, toVersion: string) {
    return {
      success: true,
      message: `${service} in ${environment} rolled back to ${toVersion} via ArgoCD (simulated)`,
    };
  }

  async restartService(service: string, environment: string) {
    return { success: true, message: `${service} in ${environment} restarted (simulated)` };
  }

  async scaleService(service: string, environment: string, replicas: number) {
    return { success: true, message: `${service} in ${environment} scaled to ${replicas} replicas (simulated)` };
  }
}
