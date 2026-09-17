import { Ticket, TicketingProvider } from "./types";

class NotImplementedTicketingProvider implements TicketingProvider {
  constructor(public name: string) {}

  async createTicket(): Promise<Ticket> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }
}

export class JiraTicketingProvider extends NotImplementedTicketingProvider {
  constructor() {
    super("jira");
  }
}

export class ServiceNowTicketingProvider extends NotImplementedTicketingProvider {
  constructor() {
    super("servicenow");
  }
}
