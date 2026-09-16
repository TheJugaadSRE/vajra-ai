import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { createApp } from "../src/app";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("checkout-service demo scenario (end-to-end)", () => {
  it("runs the full DETECT..VERIFY loop and resolves the incident after approval", async () => {
    const storeFile = path.join(os.tmpdir(), `vajra-test-${Date.now()}.json`);
    const { app } = createApp(storeFile);

    const startRes = await request(app).post("/api/demo/run-scenario").send({});
    expect(startRes.status).toBe(202);

    // Wait for events to stream in + debounce + mock diagnosis to complete.
    let incidentId: string | null = null;
    for (let i = 0; i < 40 && !incidentId; i++) {
      await sleep(250);
      const list = await request(app).get("/api/incidents");
      if (list.body.length > 0) incidentId = list.body[0].incident_id;
    }
    expect(incidentId).not.toBeNull();

    let status = "";
    for (let i = 0; i < 40; i++) {
      const res = await request(app).get(`/api/incidents/${incidentId}`);
      status = res.body.status;
      if (status === "AWAITING_APPROVAL") break;
      await sleep(250);
    }
    expect(status).toBe("AWAITING_APPROVAL");

    const detail = await request(app).get(`/api/incidents/${incidentId}`);
    expect(detail.body.diagnosis.recommended_action.type).toBe("rollback_deployment");
    expect(detail.body.policy_decision.requires_approval).toBe(true);

    const approveRes = await request(app)
      .post(`/api/incidents/${incidentId}/approve`)
      .send({ decided_by: "test-engineer" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("RESOLVED");
    expect(approveRes.body.verification.status).toBe("RECOVERED");
    expect(approveRes.body.execution.status).toBe("SUCCEEDED");

    fs.rmSync(storeFile, { force: true });
  }, 20000);

  it("runs the bot-attack scenario end-to-end with policy auto-approval (no human approval needed)", async () => {
    const storeFile = path.join(os.tmpdir(), `vajra-test-bot-${Date.now()}.json`);
    const { app } = createApp(storeFile);

    const startRes = await request(app).post("/api/demo/run-scenario").send({ scenario: "bot-attack-incident" });
    expect(startRes.status).toBe(202);

    let incidentId: string | null = null;
    for (let i = 0; i < 40 && !incidentId; i++) {
      await sleep(250);
      const list = await request(app).get("/api/incidents");
      if (list.body.length > 0) incidentId = list.body[0].incident_id;
    }
    expect(incidentId).not.toBeNull();

    let status = "";
    let detail: request.Response | null = null;
    for (let i = 0; i < 40; i++) {
      detail = await request(app).get(`/api/incidents/${incidentId}`);
      status = detail.body.status;
      if (["RESOLVED", "ESCALATED", "CLOSED"].includes(status)) break;
      await sleep(250);
    }

    expect(detail!.body.diagnosis.recommended_action.type).toBe("block_traffic");
    expect(detail!.body.policy_decision.requires_approval).toBe(false);
    expect(detail!.body.simulation).not.toBeNull();
    expect(status).toBe("RESOLVED");
    expect(detail!.body.verification.status).toBe("RECOVERED");

    fs.rmSync(storeFile, { force: true });
  }, 20000);
});
