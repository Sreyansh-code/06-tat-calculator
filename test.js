const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { makeSeed } = require("./data");
const express = require("express");
const { perStudentStore } = require("./isolation");

// Helper to start an isolated test server
function setupTestServer() {
  const app = express();
  app.use(express.json());
  app.use(perStudentStore(makeSeed));

  function toLookupKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function isBusinessDay(date, holidaySet) {
    const day = date.getDay();
    if (day === 0 || day === 6) return false;
    if (holidaySet.has(toLookupKey(date))) return false;
    return true;
  }

  function addBusinessDays(startDateStr, tatDays, holidaySet) {
    let current = new Date(`${startDateStr}T00:00:00`);
    let added = 0;
    while (added < tatDays) {
      current.setDate(current.getDate() + 1);
      if (isBusinessDay(current, holidaySet)) {
        added++;
      }
    }
    return current;
  }

  app.get("/api/holidays", (req, res) => {
    res.json(req.store.holidays);
  });

  app.post("/api/tat", (req, res) => {
    const { startDate, tatDays } = req.body || {};
    const numTatDays = Number(tatDays);

    if (
      !startDate ||
      typeof startDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      isNaN(numTatDays) ||
      numTatDays < 1
    ) {
      return res.status(400).json({
        error: "startDate (YYYY-MM-DD) and tatDays (positive integer) are required"
      });
    }

    const holidaySet = new Set(req.store.holidays.map((h) => h.date));
    const dueDate = addBusinessDays(startDate, numTatDays, holidaySet);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = dueDate < today;

    res.json({
      dueDate: toLookupKey(dueDate),
      businessDaysUsed: numTatDays,
      overdue: overdue
    });
  });

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

async function makeRequest(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {})
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null });
          } catch (e) {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

test("TAT Calculator Test Suite", async (t) => {
  let serverObj;
  let port;

  t.before(async () => {
    serverObj = await setupTestServer();
    port = serverObj.port;
  });

  t.after(() => {
    if (serverObj && serverObj.server) {
      serverObj.server.close();
    }
  });

  await t.test("GET /api/holidays returns fixed holidays including Christmas", async () => {
    const res = await makeRequest(port, "GET", "/api/holidays");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.equal(res.data.length, 4);
    assert.ok(res.data.some((h) => h.date === "2026-12-25" && h.name === "Christmas"));
  });

  await t.test("POST /api/tat validates missing or invalid inputs (HTTP 400)", async () => {
    const res1 = await makeRequest(port, "POST", "/api/tat", {});
    assert.equal(res1.status, 400);

    const res2 = await makeRequest(port, "POST", "/api/tat", { startDate: "invalid-date", tatDays: 5 });
    assert.equal(res2.status, 400);

    const res3 = await makeRequest(port, "POST", "/api/tat", { startDate: "2026-07-01", tatDays: -2 });
    assert.equal(res3.status, 400);
  });

  await t.test("POST /api/tat computes standard business days (Monday + 1 day -> Tuesday)", async () => {
    const res = await makeRequest(port, "POST", "/api/tat", { startDate: "2026-07-06", tatDays: 1 });
    assert.equal(res.status, 200);
    assert.equal(res.data.dueDate, "2026-07-07");
    assert.equal(res.data.businessDaysUsed, 1);
    assert.equal(typeof res.data.overdue, "boolean");
  });

  await t.test("POST /api/tat skips weekends (Friday + 1 day -> Monday)", async () => {
    const res = await makeRequest(port, "POST", "/api/tat", { startDate: "2026-07-10", tatDays: 1 });
    assert.equal(res.status, 200);
    assert.equal(res.data.dueDate, "2026-07-13");
    assert.equal(res.data.businessDaysUsed, 1);
  });

  await t.test("POST /api/tat skips holidays (Friday Jan 23 + 1 day -> Tuesday Jan 27 due to Jan 26 Republic Day)", async () => {
    const res = await makeRequest(port, "POST", "/api/tat", { startDate: "2026-01-23", tatDays: 1 });
    assert.equal(res.status, 200);
    assert.equal(res.data.dueDate, "2026-01-27");
  });

  await t.test("POST /api/tat correctly flags past dates as overdue", async () => {
    const res = await makeRequest(port, "POST", "/api/tat", { startDate: "2020-01-01", tatDays: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.data.overdue, true);
  });
});
