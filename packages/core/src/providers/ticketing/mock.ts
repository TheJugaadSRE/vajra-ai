import { randomUUID } from "crypto";
import { Ticket, TicketingProvider } from "./types";

export class MockTicketingProvider implements TicketingProvider {
  name = "mock";

  async createTicket(title: string, description: string, service: string): Promise<Ticket> {
    const ticket_id = `VAJRA-${randomUUID().slice(0, 6).toUpperCase()}`;
    return { ticket_id, title, url: `https://tickets.example.local/${ticket_id}` };
  }
}
