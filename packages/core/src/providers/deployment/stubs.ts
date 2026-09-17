import { Deployment, DeploymentProvider } from "./types";

class NotImplementedDeploymentProvider implements DeploymentProvider {
  constructor(public name: string) {}

  async getRecentDeployments(): Promise<Deployment[]> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }

  async rollback(): Promise<{ success: boolean; message: string }> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }

  async restartService(): Promise<{ success: boolean; message: string }> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }

  async scaleService(): Promise<{ success: boolean; message: string }> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }
}

export class ArgoCDDeploymentProvider extends NotImplementedDeploymentProvider {
  constructor() {
    super("argocd");
  }
}

export class JenkinsDeploymentProvider extends NotImplementedDeploymentProvider {
  constructor() {
    super("jenkins");
  }
}

export class KubernetesDeploymentProvider extends NotImplementedDeploymentProvider {
  constructor() {
    super("kubernetes");
  }
}
