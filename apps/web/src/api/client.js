import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";

const client = axios.create({ baseURL: API_BASE });

export const listIncidents = () => client.get("/api/incidents").then((r) => r.data);
export const getIncident = (id) => client.get(`/api/incidents/${id}`).then((r) => r.data);
export const getSimilarIncidents = (id) => client.get(`/api/incidents/${id}/similar`).then((r) => r.data);
export const approveIncident = (id, decided_by, comment) =>
  client.post(`/api/incidents/${id}/approve`, { decided_by, comment }).then((r) => r.data);
export const rejectIncident = (id, decided_by, comment) =>
  client.post(`/api/incidents/${id}/reject`, { decided_by, comment }).then((r) => r.data);
export const runDemoScenario = () => client.post("/api/demo/run-scenario", {}).then((r) => r.data);
export const getHealth = () => client.get("/api/health").then((r) => r.data);
