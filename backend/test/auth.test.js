
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/server");
const pool = require("../src/config/db");

after(async () => {
  await pool.end();
});

test("health endpoint responds with API status", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.database, "connected");
});

test("registration rejects invalid details", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      full_name: "A",
      email: "wrong-email",
      mobile: "123",
      password: "123"
    });

  assert.equal(response.status, 400);
});

test("registration rejects a missing password", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      full_name: "Test Passenger",
      email: "another@example.com",
      mobile: "9876543210"
    });

  assert.equal(response.status, 400);
});
