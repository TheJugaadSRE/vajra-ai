import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./api/client", () => ({
  listIncidents: () => Promise.resolve([]),
  runDemoScenario: () => Promise.resolve({}),
}));

test("renders the VAJRA AI dashboard heading", async () => {
  render(<App />);
  expect(await screen.findByText(/VAJRA AI — Incident Control Plane/i)).toBeInTheDocument();
});
