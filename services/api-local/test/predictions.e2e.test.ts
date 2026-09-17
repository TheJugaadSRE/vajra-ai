import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { createApp } from "../src/app";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Predictive Failure Engine (end-to-end)", () => {
  it("forecasts payment-service's connection pool exhaustion and lets an engineer investigate proactively", async () => {
    const storeFile = path.join(os.tmpdir(), `vajra-test-predict-${Date.now()}.json`);
    const { app } = createApp(storeFile);

    const listRes = await request(app).get("/api/predictions");
    expect(listRes.status).toBe(200);
    const warning = listRes.body.find((p: any) => p.service === "payment-service" && p.metric === "db_connection_pool_available");
    expect(warning).toBeDefined();
    expect(warning.status).toBe("WARNING");
    expect(warning.minutes_until_breach).toBeGreaterThan(0);

    const investigateRes = await request(app).post(`/api/predictions/${warning.prediction_id}/investigate`).send({});
    expect(investigateRes.status).toBe(200);
    const incidentId = investigateRes.body.incident.incident_id;
    expect(investigateRes.body.prediction.status).toBe("INVESTIGATING");
    expect(investigateRes.body.prediction.linked_incident_id).toBe(incidentId);

    let status = "";
    let detail: request.Response | null = null;
    for (let i = 0; i < 40; i++) {
      detail = await request(app).get(`/api/incidents/${incidentId}`);
      status = detail.body.status;
      if (status === "AWAITING_APPROVAL") break;
      await sleep(250);
    }
    expect(status).toBe("AWAITING_APPROVAL");
    expect(detail!.body.diagnosis.recommended_action.type).toBe("restart_service");

    const approveRes = await request(app).post(`/api/incidents/${incidentId}/approve`).send({ decided_by: "test-engineer" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("RESOLVED");

    // Rescanning should keep the prediction pinned to INVESTIGATING rather than re-flagging it as a fresh WARNING.
    const rescanRes = await request(app).get("/api/predictions");
    const stillTracked = rescanRes.body.find((p: any) => p.prediction_id === warning.prediction_id);
    expect(stillTracked.status).toBe("INVESTIGATING");

    fs.rmSync(storeFile, { force: true });
  }, 20000);
});
