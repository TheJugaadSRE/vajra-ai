export interface Ticket {
  ticket_id: string;
  title: string;
  url: string;
}

export interface TicketingProvider {
  name: string;
  createTicket(title: string, description: string, service: string): Promise<Ticket>;
}
