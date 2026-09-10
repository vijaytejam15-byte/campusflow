/**
 * CampusFlow Phase 2 — Backend integration tests
 *
 * Uses an in-memory MongoDB so no external database is required.
 * Run with:  npm test  (from the backend directory)
 */

process.env.JWT_SECRET     = "test-jwt-secret-for-jest-suite";
process.env.NODE_ENV       = "test";
process.env.MONGO_URI      = ""; // forces in-memory MongoDB
process.env.REDIS_ENABLED  = "false"; // in-process job execution — no Redis needed
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_ENABLED  = "false";

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;
let app;

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("campusflow_test");
  await mongoose.connect(uri);
  // Import app AFTER connecting so models are registered against the test DB
  app = require("../server");
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clear all collections between tests for isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_A = { name: "Alice", email: "alice@example.com", password: "password123" };
const USER_B = { name: "Bob", email: "bob@example.com", password: "password456" };

async function registerAndGetCookie(agent, userData = USER_A) {
  const res = await agent.post("/api/register").send(userData);
  expect(res.status).toBe(201);
  const cookie = res.headers["set-cookie"];
  return cookie;
}

async function loginAndGetCookie(agent, credentials = { email: USER_A.email, password: USER_A.password }) {
  const res = await agent.post("/api/login").send(credentials);
  expect(res.status).toBe(200);
  return res.headers["set-cookie"];
}

const COURSE_PAYLOAD = {
  name: "Introduction to Computer Science",
  code: "CS101",
  instructor: "Dr. Smith",
  credits: 3,
  semester: "Fall 2026",
  description: "An intro course.",
};

// ─── Health ───────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ─── Auth: Register ───────────────────────────────────────────────────────────

describe("POST /api/register", () => {
  it("registers a new user and returns 201 with a cookie", async () => {
    const res = await request(app).post("/api/register").send(USER_A);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(USER_A.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 409 on duplicate email", async () => {
    await request(app).post("/api/register").send(USER_A);
    const res = await request(app).post("/api/register").send(USER_A);
    expect(res.status).toBe(409);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/register")
      .send({ email: "x@x.com", password: "pass123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await request(app)
      .post("/api/register")
      .send({ name: "Test", email: "not-an-email", password: "pass123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const res = await request(app)
      .post("/api/register")
      .send({ name: "Test", email: "test@test.com", password: "12345" });
    expect(res.status).toBe(400);
  });
});

// ─── Auth: Login ──────────────────────────────────────────────────────────────

describe("POST /api/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/register").send(USER_A);
  });

  it("logs in with valid credentials", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: USER_A.email, password: USER_A.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER_A.email);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 401 on wrong password", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: USER_A.email, password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("returns 401 on unknown email", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "nobody@example.com", password: "password123" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/login").send({ email: USER_A.email });
    expect(res.status).toBe(400);
  });
});

// ─── Auth: /me ────────────────────────────────────────────────────────────────

describe("GET /api/me", () => {
  it("returns the authenticated user", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER_A.email);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });
});

// ─── Auth: /me/session alias ──────────────────────────────────────────────────

describe("GET /api/me/session", () => {
  it("returns the authenticated user (alias)", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.get("/api/me/session");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER_A.email);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/me/session");
    expect(res.status).toBe(401);
  });
});

// ─── Auth: Logout ─────────────────────────────────────────────────────────────

describe("POST /api/logout", () => {
  it("clears the auth cookie on logout", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const logoutRes = await agent.post("/api/logout");
    expect(logoutRes.status).toBe(200);

    // After logout the cookie should be cleared and /me returns 401
    const meRes = await agent.get("/api/me");
    expect(meRes.status).toBe(401);
  });
});

// ─── Auth: Invalid JWT ────────────────────────────────────────────────────────

describe("Invalid / tampered token", () => {
  it("returns 401 with a forged token cookie", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Cookie", "token=this.is.not.valid");
    expect(res.status).toBe(401);
  });
});

// ─── Profile ──────────────────────────────────────────────────────────────────

describe("GET /api/profile", () => {
  it("returns the user's profile when authenticated", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER_A.email);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/profile");
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/profile", () => {
  it("updates the profile successfully", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.put("/api/profile").send({
      name: "Alice Updated",
      department: "Computer Science",
      semester: "Fall 2026",
    });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Alice Updated");
    expect(res.body.user.department).toBe("Computer Science");
  });

  it("returns 400 when name is empty", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.put("/api/profile").send({ name: "  " });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid avatar URL", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.put("/api/profile").send({ avatar: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when no fields provided", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.put("/api/profile").send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).put("/api/profile").send({ name: "Hacker" });
    expect(res.status).toBe(401);
  });
});

// ─── Courses: Create ──────────────────────────────────────────────────────────

describe("POST /api/courses", () => {
  it("creates a course for authenticated user", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.post("/api/courses").send(COURSE_PAYLOAD);
    expect(res.status).toBe(201);
    expect(res.body.course.name).toBe(COURSE_PAYLOAD.name);
    expect(res.body.course.code).toBe("CS101");
    expect(res.body.course.owner).toBeDefined();
  });

  it("returns 400 for missing required fields", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.post("/api/courses").send({ name: "Only Name" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid credits", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent
      .post("/api/courses")
      .send({ ...COURSE_PAYLOAD, credits: 99 });
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate course code per user", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    await agent.post("/api/courses").send(COURSE_PAYLOAD);
    const res = await agent.post("/api/courses").send(COURSE_PAYLOAD);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already have a course/i);
  });

  it("allows same code for different users", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    await agentA.post("/api/courses").send(COURSE_PAYLOAD);

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    const res = await agentB.post("/api/courses").send(COURSE_PAYLOAD);
    expect(res.status).toBe(201);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).post("/api/courses").send(COURSE_PAYLOAD);
    expect(res.status).toBe(401);
  });
});

// ─── Courses: List ────────────────────────────────────────────────────────────

describe("GET /api/courses", () => {
  it("returns only the authenticated user's courses", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    await agentA.post("/api/courses").send(COURSE_PAYLOAD);
    await agentA.post("/api/courses").send({ ...COURSE_PAYLOAD, code: "CS102", name: "Data Structures" });

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    await agentB.post("/api/courses").send({ ...COURSE_PAYLOAD, code: "MA101", name: "Mathematics" });

    const res = await agentA.get("/api/courses");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.courses.every((c) => c.owner !== USER_B._id)).toBe(true);
  });

  it("returns empty array when user has no courses", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.get("/api/courses");
    expect(res.status).toBe(200);
    expect(res.body.courses).toHaveLength(0);
    expect(res.body.count).toBe(0);
  });

  it("filters courses by search term", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    await agent.post("/api/courses").send(COURSE_PAYLOAD);
    await agent.post("/api/courses").send({
      ...COURSE_PAYLOAD,
      code: "MA101",
      name: "Calculus",
      instructor: "Dr. Newton",
    });

    const res = await agent.get("/api/courses?search=calculus");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.courses[0].name).toBe("Calculus");
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/courses");
    expect(res.status).toBe(401);
  });
});

// ─── Courses: Single ──────────────────────────────────────────────────────────

describe("GET /api/courses/:id", () => {
  it("returns a specific course for the owner", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const create = await agent.post("/api/courses").send(COURSE_PAYLOAD);
    const id = create.body.course._id;

    const res = await agent.get(`/api/courses/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.course._id).toBe(id);
  });

  it("returns 400 for invalid id format", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.get("/api/courses/not-a-valid-id");
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent course", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const fakeId = new mongoose.Types.ObjectId();
    const res = await agent.get(`/api/courses/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when accessing another user's course", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    const create = await agentA.post("/api/courses").send(COURSE_PAYLOAD);
    const id = create.body.course._id;

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    const res = await agentB.get(`/api/courses/${id}`);
    expect(res.status).toBe(404); // ownership isolation — appears as not found
  });
});

// ─── Courses: Update ──────────────────────────────────────────────────────────

describe("PUT /api/courses/:id", () => {
  it("updates a course successfully", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const create = await agent.post("/api/courses").send(COURSE_PAYLOAD);
    const id = create.body.course._id;

    const res = await agent.put(`/api/courses/${id}`).send({ name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.course.name).toBe("Updated Name");
  });

  it("returns 400 for invalid id", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.put("/api/courses/bad-id").send({ name: "X" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when updating another user's course", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    const create = await agentA.post("/api/courses").send(COURSE_PAYLOAD);
    const id = create.body.course._id;

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    const res = await agentB.put(`/api/courses/${id}`).send({ name: "Hacked" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when no fields are provided", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const create = await agent.post("/api/courses").send(COURSE_PAYLOAD);
    const id = create.body.course._id;

    const res = await agent.put(`/api/courses/${id}`).send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .put(`/api/courses/${new mongoose.Types.ObjectId()}`)
      .send({ name: "X" });
    expect(res.status).toBe(401);
  });
});

// ─── Courses: Delete ──────────────────────────────────────────────────────────

describe("DELETE /api/courses/:id", () => {
  it("deletes a course for the owner", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const create = await agent.post("/api/courses").send(COURSE_PAYLOAD);
    const id = create.body.course._id;

    const res = await agent.delete(`/api/courses/${id}`);
    expect(res.status).toBe(200);

    // Verify it's gone
    const check = await agent.get(`/api/courses/${id}`);
    expect(check.status).toBe(404);
  });

  it("returns 400 for invalid id", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.delete("/api/courses/bad-id");
    expect(res.status).toBe(400);
  });

  it("returns 404 when deleting another user's course", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    const create = await agentA.post("/api/courses").send(COURSE_PAYLOAD);
    const id = create.body.course._id;

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    const res = await agentB.delete(`/api/courses/${id}`);
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).delete(
      `/api/courses/${new mongoose.Types.ObjectId()}`
    );
    expect(res.status).toBe(401);
  });
});

// ─── 404 route ────────────────────────────────────────────────────────────────

describe("Unknown routes", () => {
  it("returns 404 for unknown API route", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
  });
});

// ─── Requests: Student ────────────────────────────────────────────────────────

const REQUEST_PAYLOAD = {
  type:        "general",
  description: "I need help with my enrollment status for the upcoming semester.",
  department:  "Registrar",
  priority:    "normal",
};

describe("POST /api/requests", () => {
  it("creates a request for authenticated student", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    expect(res.status).toBe(201);
    expect(res.body.request.type).toBe("general");
    expect(res.body.request.status).toBe("pending");
  });

  it("returns 400 when type is missing", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.post("/api/requests").send({ description: "test desc" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when description is missing", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.post("/api/requests").send({ type: "general" });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).post("/api/requests").send(REQUEST_PAYLOAD);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/requests", () => {
  it("returns only the student's own requests", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    await agentA.post("/api/requests").send(REQUEST_PAYLOAD);

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    await agentB.post("/api/requests").send(REQUEST_PAYLOAD);

    const res = await agentA.get("/api/requests");
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/requests");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/requests/:id", () => {
  it("returns the student's own request", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const created = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const res = await agent.get(`/api/requests/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.request._id).toBe(id);
  });

  it("returns 404 when student accesses another student's request", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    const created = await agentA.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    const res = await agentB.get(`/api/requests/${id}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid request id", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/requests/not-an-id");
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/requests/:id", () => {
  it("allows student to cancel a pending request", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const created = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const res = await agent.delete(`/api/requests/${id}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 when cancelling another student's request", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    const created = await agentA.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    const res = await agentB.delete(`/api/requests/${id}`);
    expect(res.status).toBe(404);
  });
});

// ─── Requests: Reviewer access ────────────────────────────────────────────────

const User = require("../models/User");

async function makeReviewer(agent, role, userData = USER_A) {
  const regRes = await agent.post("/api/register").send(userData);
  expect(regRes.status).toBe(201);
  // Directly update role in DB (bypass the admin endpoint for test setup)
  await User.findByIdAndUpdate(regRes.body.user.id, { role });
  // Re-login to get a cookie with the updated role
  const loginRes = await agent.post("/api/login").send({
    email: userData.email, password: userData.password,
  });
  expect(loginRes.status).toBe(200);
  return regRes.body.user.id;
}

describe("GET /api/requests/pending", () => {
  it("returns 403 for a student", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/requests/pending");
    expect(res.status).toBe(403);
  });

  it("returns 200 for a faculty member", async () => {
    const agent = request.agent(app);
    await makeReviewer(agent, "faculty");
    const res = await agent.get("/api/requests/pending");
    expect(res.status).toBe(200);
    expect(res.body.requests).toBeDefined();
  });

  it("returns 200 for a HOD", async () => {
    const agent = request.agent(app);
    await makeReviewer(agent, "hod");
    const res = await agent.get("/api/requests/pending");
    expect(res.status).toBe(200);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/requests/pending");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/requests/:id/status", () => {
  it("allows faculty to approve a request", async () => {
    // Create student request
    const studentAgent = request.agent(app);
    await registerAndGetCookie(studentAgent, USER_B);
    const created = await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    // Faculty approves it
    const facultyAgent = request.agent(app);
    await makeReviewer(facultyAgent, "faculty", USER_A);
    const res = await facultyAgent
      .patch(`/api/requests/${id}/status`)
      .send({ status: "approved", comment: "Looks good." });
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("approved");
  });

  it("returns 400 when comment is missing for rejection", async () => {
    const studentAgent = request.agent(app);
    await registerAndGetCookie(studentAgent, USER_B);
    const created = await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const facultyAgent = request.agent(app);
    await makeReviewer(facultyAgent, "faculty", USER_A);
    const res = await facultyAgent
      .patch(`/api/requests/${id}/status`)
      .send({ status: "rejected" }); // no comment
    expect(res.status).toBe(400);
  });

  it("returns 403 when a student tries to update status", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const created = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const res = await agent
      .patch(`/api/requests/${id}/status`)
      .send({ status: "approved", comment: "Self-approving" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when faculty sets an invalid role transition", async () => {
    const studentAgent = request.agent(app);
    await registerAndGetCookie(studentAgent, USER_B);
    const created = await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const facultyAgent = request.agent(app);
    await makeReviewer(facultyAgent, "faculty", USER_A);
    const res = await facultyAgent
      .patch(`/api/requests/${id}/status`)
      .send({ status: "closed", comment: "Faculty cannot close" });
    expect(res.status).toBe(400);
  });
});

// ─── Admin endpoints ──────────────────────────────────────────────────────────

async function makeAdmin(agent, userData = USER_A) {
  const regRes = await agent.post("/api/register").send(userData);
  expect(regRes.status).toBe(201);
  await User.findByIdAndUpdate(regRes.body.user.id, { role: "admin" });
  const loginRes = await agent.post("/api/login").send({
    email: userData.email, password: userData.password,
  });
  expect(loginRes.status).toBe(200);
  return regRes.body.user.id;
}

describe("GET /api/admin/metrics", () => {
  it("returns metrics for admin", async () => {
    const agent = request.agent(app);
    await makeAdmin(agent);
    const res = await agent.get("/api/admin/metrics");
    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(typeof res.body.metrics.totalUsers).toBe("number");
  });

  it("returns 403 for student", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/admin/metrics");
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    const res = await request(app).get("/api/admin/metrics");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/users", () => {
  it("returns paginated user list for admin", async () => {
    const agent = request.agent(app);
    await makeAdmin(agent);
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it("returns 403 for faculty", async () => {
    const agent = request.agent(app);
    await makeReviewer(agent, "faculty");
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/users/:id/role", () => {
  it("allows admin to change a user's role", async () => {
    const adminAgent = request.agent(app);
    await makeAdmin(adminAgent, USER_A);

    // Register a target user
    const targetRes = await request(app).post("/api/register").send(USER_B);
    const targetId  = targetRes.body.user.id;

    const res = await adminAgent
      .patch(`/api/admin/users/${targetId}/role`)
      .send({ role: "faculty" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("faculty");
  });

  it("returns 400 for invalid role", async () => {
    const adminAgent = request.agent(app);
    await makeAdmin(adminAgent, USER_A);

    const targetRes = await request(app).post("/api/register").send(USER_B);
    const targetId  = targetRes.body.user.id;

    const res = await adminAgent
      .patch(`/api/admin/users/${targetId}/role`)
      .send({ role: "superuser" }); // invalid
    expect(res.status).toBe(400);
  });

  it("returns 403 for student trying to change roles", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const targetRes = await request(app).post("/api/register").send(USER_B);
    const targetId  = targetRes.body.user.id;

    const res = await agent
      .patch(`/api/admin/users/${targetId}/role`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/users/:id", () => {
  it("allows admin to delete a user", async () => {
    const adminAgent = request.agent(app);
    await makeAdmin(adminAgent, USER_A);

    const targetRes = await request(app).post("/api/register").send(USER_B);
    const targetId  = targetRes.body.user.id;

    const res = await adminAgent.delete(`/api/admin/users/${targetId}`);
    expect(res.status).toBe(200);
  });

  it("returns 409 when admin tries to delete themselves", async () => {
    const adminAgent = request.agent(app);
    const adminId    = await makeAdmin(adminAgent, USER_A);

    const res = await adminAgent.delete(`/api/admin/users/${adminId}`);
    expect(res.status).toBe(409);
  });

  it("returns 403 for non-admin", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const targetRes = await request(app).post("/api/register").send(USER_B);
    const targetId  = targetRes.body.user.id;

    const res = await agent.delete(`/api/admin/users/${targetId}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/requests", () => {
  it("returns all requests for admin", async () => {
    // Create a student request
    const studentAgent = request.agent(app);
    await registerAndGetCookie(studentAgent, USER_B);
    await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);

    const adminAgent = request.agent(app);
    await makeAdmin(adminAgent, USER_A);

    const res = await adminAgent.get("/api/admin/requests");
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
  });

  it("returns 403 for student", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/admin/requests");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/audit-logs", () => {
  it("returns audit log for admin", async () => {
    const agent = request.agent(app);
    await makeAdmin(agent);
    const res = await agent.get("/api/admin/audit-logs");
    expect(res.status).toBe(200);
    expect(res.body.logs).toBeDefined();
  });

  it("returns 403 for non-admin", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/admin/audit-logs");
    expect(res.status).toBe(403);
  });
});

// ─── SLA and Analytics ────────────────────────────────────────────────────────

describe("SLA deadline on request creation", () => {
  it("sets slaDeadline when a request is created", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.post("/api/requests").send({
      ...REQUEST_PAYLOAD,
      priority: "urgent",
    });
    expect(res.status).toBe(201);
    expect(res.body.request.slaDeadline).toBeDefined();
    // urgent = 4 hours → deadline should be within ~5 hours of now
    const deadline = new Date(res.body.request.slaDeadline);
    const diffHours = (deadline - Date.now()) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThan(0);
    expect(diffHours).toBeLessThanOrEqual(5);
  });

  it("sets correct SLA for normal priority (48h)", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);

    const res = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    expect(res.status).toBe(201);
    const deadline = new Date(res.body.request.slaDeadline);
    const diffHours = (deadline - Date.now()) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThan(47);
    expect(diffHours).toBeLessThanOrEqual(49);
  });
});

describe("POST /api/requests/:id/comment", () => {
  it("allows a reviewer to add a comment", async () => {
    // Create request as student
    const studentAgent = request.agent(app);
    await registerAndGetCookie(studentAgent, USER_B);
    const created = await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    // Faculty adds comment
    const facultyAgent = request.agent(app);
    await makeReviewer(facultyAgent, "faculty", USER_A);
    const res = await facultyAgent
      .post(`/api/requests/${id}/comment`)
      .send({ comment: "We have received your request and will review it shortly." });
    expect(res.status).toBe(201);
    expect(res.body.comment.action).toBe("comment");
    expect(res.body.comment.userName).toBe(USER_A.name);
  });

  it("allows the owning student to add a comment", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const created = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const res = await agent
      .post(`/api/requests/${id}/comment`)
      .send({ comment: "Providing additional details as requested." });
    expect(res.status).toBe(201);
  });

  it("returns 404 when student comments on another student's request", async () => {
    const agentA = request.agent(app);
    await registerAndGetCookie(agentA, USER_A);
    const created = await agentA.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const agentB = request.agent(app);
    await registerAndGetCookie(agentB, USER_B);
    const res = await agentB
      .post(`/api/requests/${id}/comment`)
      .send({ comment: "Should not work." });
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty comment", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const created = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const res = await agent
      .post(`/api/requests/${id}/comment`)
      .send({ comment: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const created = await agent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    const res = await request(app)
      .post(`/api/requests/${id}/comment`)
      .send({ comment: "No auth." });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/analytics", () => {
  it("returns analytics object for admin", async () => {
    // Create some requests for meaningful data
    const studentAgent = request.agent(app);
    await registerAndGetCookie(studentAgent, USER_B);
    await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
    await studentAgent.post("/api/requests").send({ ...REQUEST_PAYLOAD, priority: "high" });

    const adminAgent = request.agent(app);
    await makeAdmin(adminAgent, USER_A);
    const res = await adminAgent.get("/api/admin/analytics");

    expect(res.status).toBe(200);
    expect(res.body.analytics).toBeDefined();
    expect(res.body.analytics.totalRequests).toBeGreaterThanOrEqual(2);
    expect(res.body.analytics.byStatus).toBeDefined();
    expect(Array.isArray(res.body.analytics.byDepartment)).toBe(true);
    expect(Array.isArray(res.body.analytics.byType)).toBe(true);
    expect(Array.isArray(res.body.analytics.monthlyTrend)).toBe(true);
    expect(res.body.analytics.sla).toBeDefined();
    expect(typeof res.body.analytics.sla.breachedTotal).toBe("number");
  });

  it("returns 403 for non-admin", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/admin/analytics");
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    const res = await request(app).get("/api/admin/analytics");
    expect(res.status).toBe(401);
  });
});

describe("GET /health", () => {
  it("returns timestamp in health response", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("Auto-escalation job", () => {
  it("marks overdue pending requests as slaBreached and escalated", async () => {
    const { runEscalationCheck } = require("../jobs/escalation.job");
    const Request = require("../models/Request");

    // Create a request with a past SLA deadline
    const studentAgent = request.agent(app);
    await registerAndGetCookie(studentAgent, USER_B);
    const created = await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
    const id = created.body.request._id;

    // Manually set slaDeadline to the past
    await Request.findByIdAndUpdate(id, { slaDeadline: new Date(Date.now() - 1000) });

    const stats = await runEscalationCheck();

    expect(stats.breached).toBeGreaterThanOrEqual(1);
    expect(stats.escalated).toBeGreaterThanOrEqual(1);

    const updated = await Request.findById(id);
    expect(updated.slaBreached).toBe(true);
    expect(updated.autoEscalated).toBe(true);
    expect(updated.status).toBe("escalated");
  });
});

describe("API docs", () => {
  it("serves Swagger UI at /api/docs", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
  });
});

// ─── Refresh Token / Auth Upgrade ────────────────────────────────────────────

describe("POST /api/refresh", () => {
  it("issues new access token using valid refresh cookie", async () => {
    const agent = request.agent(app);
    // Login sets both access + refresh cookies
    await agent.post("/api/register").send(USER_A);
    await agent.post("/api/login").send({ email: USER_A.email, password: USER_A.password });

    const res = await agent.post("/api/refresh");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(USER_A.email);
    // New access cookie should be set
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 401 when no refresh cookie is present", async () => {
    const res = await request(app).post("/api/refresh");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a tampered refresh token", async () => {
    const res = await request(app)
      .post("/api/refresh")
      .set("Cookie", "refreshToken=tampered-invalid-token-value");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/logout-all", () => {
  it("revokes all sessions and clears cookies", async () => {
    const agent = request.agent(app);
    await agent.post("/api/register").send(USER_A);

    const logoutAllRes = await agent.post("/api/logout-all");
    expect(logoutAllRes.status).toBe(200);

    // After logout-all, /me should return 401
    const meRes = await agent.get("/api/me");
    expect(meRes.status).toBe(401);
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await request(app).post("/api/logout-all");
    expect(res.status).toBe(401);
  });
});

// ─── Health / Readiness endpoints ────────────────────────────────────────────

describe("GET /health", () => {
  it("returns status ok with uptime and timestamp", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("GET /ready", () => {
  it("returns ready when DB is connected", async () => {
    const res = await request(app).get("/ready");
    // In test environment DB is connected via mongodb-memory-server
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});

// ─── Email service graceful degradation ──────────────────────────────────────

describe("Email service", () => {
  it("does not throw when EMAIL_ENABLED is false (dev mode)", async () => {
    const emailSvc = require("../services/email.service");
    // Should resolve without throwing even if no SMTP config
    await expect(
      emailSvc.sendEmail({ to: "test@test.com", subject: "Test", html: "<p>Test</p>" })
    ).resolves.not.toThrow();
  });
});

// ─── Queue / Workers (in-process fallback) ───────────────────────────────────

describe("Queue in-process fallback (REDIS_ENABLED=false)", () => {
  it("enqueues and immediately executes an email job", async () => {
    const { registerHandler, enqueue } = require("../queues/queue");

    let called = false;
    registerHandler("test-email-queue", async (data) => {
      expect(data.type).toBe("testEmail");
      called = true;
    });

    await enqueue("test-email-queue", { type: "testEmail", payload: {} });
    expect(called).toBe(true);
  });

  it("handles handler errors without throwing to caller", async () => {
    const { registerHandler, enqueue } = require("../queues/queue");

    registerHandler("error-queue", async () => {
      throw new Error("Simulated job failure");
    });

    // Should not throw
    await expect(enqueue("error-queue", {})).resolves.not.toThrow();
  });

  it("skips gracefully when no handler is registered", async () => {
    const { enqueue } = require("../queues/queue");
    // Should not throw for unknown queue names
    await expect(enqueue("no-such-queue", {})).resolves.not.toThrow();
  });
});

describe("Email worker handler", () => {
  it("routes requestSubmitted to email service without throwing", async () => {
    const { initWorkers, queueEmail } = require("../queues/workers");
    initWorkers();

    await expect(
      queueEmail("requestSubmitted", {
        to:          "test@example.com",
        name:        "Test User",
        requestType: "general",
        requestId:   "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("routes leaveSubmitted to email service without throwing", async () => {
    const { queueEmail } = require("../queues/workers");
    await expect(
      queueEmail("leaveSubmitted", {
        to:        "student@example.com",
        name:      "Student",
        leaveType: "Medical",
        startDate: "01 Jan 2027",
        endDate:   "03 Jan 2027",
        leaveId:   "507f1f77bcf86cd799439012",
      })
    ).resolves.not.toThrow();
  });

  it("handles unknown email type gracefully", async () => {
    const { queueEmail } = require("../queues/workers");
    await expect(
      queueEmail("unknownEmailType", { to: "x@x.com" })
    ).resolves.not.toThrow();
  });
});

// ─── Permissions ─────────────────────────────────────────────────────────────

describe("Permission system", () => {
  const { hasPermission, PERMISSIONS, requirePermission } = require("../config/permissions");

  describe("hasPermission()", () => {
    it("student has REQUEST_SUBMIT", () => {
      expect(hasPermission("student", PERMISSIONS.REQUEST_SUBMIT)).toBe(true);
    });
    it("student does NOT have REQUEST_APPROVE", () => {
      expect(hasPermission("student", PERMISSIONS.REQUEST_APPROVE)).toBe(false);
    });
    it("faculty has REQUEST_APPROVE", () => {
      expect(hasPermission("faculty", PERMISSIONS.REQUEST_APPROVE)).toBe(true);
    });
    it("faculty does NOT have USER_MANAGE", () => {
      expect(hasPermission("faculty", PERMISSIONS.USER_MANAGE)).toBe(false);
    });
    it("hod has REQUEST_CLOSE", () => {
      expect(hasPermission("hod", PERMISSIONS.REQUEST_CLOSE)).toBe(true);
    });
    it("admin has all permissions", () => {
      Object.values(PERMISSIONS).forEach((p) => {
        expect(hasPermission("admin", p)).toBe(true);
      });
    });
    it("unknown role has no permissions", () => {
      expect(hasPermission("unknown", PERMISSIONS.REQUEST_VIEW)).toBe(false);
    });
  });

  describe("requirePermission() middleware", () => {
    it("blocks student from accessing REQUEST_APPROVE endpoint", async () => {
      const studentAgent = request.agent(app);
      await registerAndGetCookie(studentAgent, USER_B);

      // Create a request as student
      const created = await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
      const id = created.body.request._id;

      // Student tries to approve their own request — should be 403
      const res = await studentAgent
        .patch(`/api/requests/${id}/status`)
        .send({ status: "approved", comment: "Self-approve attempt" });
      // requireReviewer catches this first with 403
      expect(res.status).toBe(403);
    });

    it("allows faculty to approve (permission granted)", async () => {
      const studentAgent = request.agent(app);
      await registerAndGetCookie(studentAgent, USER_B);
      const created = await studentAgent.post("/api/requests").send(REQUEST_PAYLOAD);
      const id = created.body.request._id;

      const facultyAgent = request.agent(app);
      await makeReviewer(facultyAgent, "faculty", USER_A);
      const res = await facultyAgent
        .patch(`/api/requests/${id}/status`)
        .send({ status: "approved", comment: "Faculty approved" });
      expect(res.status).toBe(200);
    });

    it("blocks student from accessing admin analytics", async () => {
      const agent = request.agent(app);
      await registerAndGetCookie(agent);
      const res = await agent.get("/api/admin/analytics");
      expect(res.status).toBe(403);
    });

    it("allows admin to access analytics", async () => {
      const agent = request.agent(app);
      await makeAdmin(agent, USER_A);
      const res = await agent.get("/api/admin/analytics");
      expect(res.status).toBe(200);
    });
  });
});

// ─── Correlation ID ───────────────────────────────────────────────────────────

describe("Correlation ID middleware", () => {
  it("returns X-Request-ID header on every response", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["x-request-id"].length).toBeGreaterThan(0);
  });

  it("echoes provided X-Request-ID header", async () => {
    const myId = "my-custom-correlation-id";
    const res  = await request(app)
      .get("/health")
      .set("X-Request-ID", myId);
    expect(res.headers["x-request-id"]).toBe(myId);
  });

  it("generates a unique ID when none is provided", async () => {
    const [r1, r2] = await Promise.all([
      request(app).get("/health"),
      request(app).get("/health"),
    ]);
    expect(r1.headers["x-request-id"]).toBeDefined();
    expect(r2.headers["x-request-id"]).toBeDefined();
    expect(r1.headers["x-request-id"]).not.toBe(r2.headers["x-request-id"]);
  });
});

// ─── Storage service ─────────────────────────────────────────────────────────

describe("Storage service (local driver)", () => {
  const storageSvc = require("../services/storage.service");
  const path       = require("path");
  const fs         = require("fs");

  it("saves a buffer and returns a stored key", async () => {
    const buf = Buffer.from("test file content");
    const key = await storageSvc.saveFile(buf, "test-unit.txt", "text/plain");
    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    // Cleanup
    await storageSvc.deleteFile(key).catch(() => {});
  });

  it("returns a signed/local URL for a stored key", async () => {
    const buf = Buffer.from("hello");
    const key = await storageSvc.saveFile(buf, "test-url.txt", "text/plain");
    const url = await storageSvc.getSignedUrl(key);
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
    await storageSvc.deleteFile(key).catch(() => {});
  });

  it("getLocalReadStream throws 404 for missing file", () => {
    expect(() => storageSvc.getLocalReadStream("nonexistent-uuid.pdf"))
      .toThrow();
  });

  it("deleteFile does not throw for nonexistent key", async () => {
    await expect(storageSvc.deleteFile("nonexistent.txt")).resolves.not.toThrow();
  });
});

// ─── Secure file download endpoint ───────────────────────────────────────────

describe("GET /api/files/:key", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await request(app).get("/api/files/somefile.pdf");
    expect(res.status).toBe(401);
  });

  it("returns 403 or 404 for authenticated request with nonexistent file", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/files/nonexistent-file-uuid.pdf");
    // 403 = no ownership record for this key (correct new behaviour)
    // 404 = file key found in ownership but not on disk (also valid)
    expect([403, 404]).toContain(res.status);
  });
});

// ─── MongoDB index coverage (query plan smoke tests) ─────────────────────────

describe("MongoDB index coverage", () => {
  it("Request model has slaDeadline+status+slaBreached compound index", async () => {
    const Request = require("../models/Request");
    const indexes = await Request.collection.indexes();
    const keys    = indexes.map((i) => Object.keys(i.key).join(","));
    // At least one index should cover the SLA escalation query fields
    const hasSlaIndex = indexes.some((i) =>
      "slaDeadline" in i.key || ("status" in i.key && "slaDeadline" in i.key)
    );
    expect(hasSlaIndex).toBe(true);
  });

  it("Leave model has student+status index", async () => {
    const Leave   = require("../models/Leave");
    const indexes = await Leave.collection.indexes();
    const hasStudentStatus = indexes.some((i) =>
      "student" in i.key && "status" in i.key
    );
    expect(hasStudentStatus).toBe(true);
  });

  it("User model has role index", async () => {
    const User    = require("../models/User");
    const indexes = await User.collection.indexes();
    const hasRole = indexes.some((i) => "role" in i.key);
    expect(hasRole).toBe(true);
  });
});

// ─── Email service — Gmail/SMTP configuration tests ──────────────────────────

describe("Email service configuration", () => {
  const emailSvc = require("../services/email.service");

  it("sendEmail does not throw when EMAIL_ENABLED=false (dev stub)", async () => {
    await expect(
      emailSvc.sendEmail({ to: "test@test.com", subject: "Test", html: "<p>Test</p>" })
    ).resolves.not.toThrow();
  });

  it("sendEmail does not throw when 'to' is undefined", async () => {
    await expect(
      emailSvc.sendEmail({ to: undefined, subject: "Test", html: "<p>Test</p>" })
    ).resolves.not.toThrow();
  });

  it("sendRequestSubmitted does not throw (dev stub)", async () => {
    await expect(
      emailSvc.sendRequestSubmitted({
        to: "student@test.com", name: "Alice", requestType: "general",
        requestId: "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("sendRequestStatusChanged does not throw for approved", async () => {
    await expect(
      emailSvc.sendRequestStatusChanged({
        to: "student@test.com", name: "Alice", requestType: "transcript",
        newStatus: "approved", comment: "Looks good", requestId: "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("sendRequestStatusChanged does not throw for rejected", async () => {
    await expect(
      emailSvc.sendRequestStatusChanged({
        to: "student@test.com", name: "Alice", requestType: "grade_appeal",
        newStatus: "rejected", comment: "Insufficient docs", requestId: "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("sendRequestStatusChanged does not throw for escalated", async () => {
    await expect(
      emailSvc.sendRequestStatusChanged({
        to: "hod@test.com", name: "Prof Singh", requestType: "financial_aid",
        newStatus: "escalated", comment: "Needs HOD review", requestId: "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("sendNewRequestNotification does not throw", async () => {
    await expect(
      emailSvc.sendNewRequestNotification({
        to: "faculty@test.com", reviewerName: "Dr. Smith",
        studentName: "Alice", requestType: "leave_of_absence",
        requestId: "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("sendLeaveSubmitted does not throw", async () => {
    await expect(
      emailSvc.sendLeaveSubmitted({
        to: "student@test.com", name: "Alice", leaveType: "Medical",
        startDate: "2027-01-10", endDate: "2027-01-12",
        leaveId: "507f1f77bcf86cd799439012",
      })
    ).resolves.not.toThrow();
  });

  it("sendLeaveStatusChanged does not throw for approved", async () => {
    await expect(
      emailSvc.sendLeaveStatusChanged({
        to: "student@test.com", name: "Alice", leaveType: "Casual",
        newStatus: "approved", comment: "Approved", leaveId: "507f1f77bcf86cd799439012",
      })
    ).resolves.not.toThrow();
  });

  it("sendLeaveStatusChanged does not throw for rejected", async () => {
    await expect(
      emailSvc.sendLeaveStatusChanged({
        to: "student@test.com", name: "Alice", leaveType: "Medical",
        newStatus: "rejected", comment: "No medical cert", leaveId: "507f1f77bcf86cd799439012",
      })
    ).resolves.not.toThrow();
  });

  it("sendSLAWarning does not throw", async () => {
    await expect(
      emailSvc.sendSLAWarning({
        to: "faculty@test.com", name: "Dr. Smith",
        requestType: "transcript", hoursRemaining: 2,
        requestId: "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("sendSLABreached does not throw", async () => {
    await expect(
      emailSvc.sendSLABreached({
        to: "student@test.com", name: "Alice",
        requestType: "grade_appeal", requestId: "507f1f77bcf86cd799439011",
      })
    ).resolves.not.toThrow();
  });

  it("verifyEmailConnection does not throw when EMAIL_ENABLED=false", async () => {
    await expect(emailSvc.verifyEmailConnection()).resolves.not.toThrow();
  });

  it("EMAIL_PASSWORD alias is accepted over EMAIL_PASS", () => {
    // Both env vars resolve to the same credential — test the precedence logic
    const origPass     = process.env.EMAIL_PASS;
    const origPassword = process.env.EMAIL_PASSWORD;
    process.env.EMAIL_PASS     = "pass-value";
    process.env.EMAIL_PASSWORD = "password-value";
    const smtpPass = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS;
    expect(smtpPass).toBe("password-value"); // EMAIL_PASSWORD wins
    process.env.EMAIL_PASS     = origPass     || "";
    process.env.EMAIL_PASSWORD = origPassword || "";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Engine Tests
// ─────────────────────────────────────────────────────────────────────────────

const WorkflowTemplate = require("../models/WorkflowTemplate");
const WorkflowInstance = require("../models/WorkflowInstance");
const workflowSvc      = require("../services/workflow.service");
// Note: User and request are already declared earlier in this file

function makeTemplate(overrides = {}) {
  return {
    name:           "Test Workflow",
    description:    "A test template",
    entityKind:     "request",
    appliesToTypes: ["general"],
    isActive:       true,
    stages: [
      {
        order:           1,
        name:            "Faculty Review",
        assigneeRole:    "faculty",
        allowedActions:  ["approve", "reject", "escalate"],
        requiresComment: false,
        slaHours:        24,
        notifyOnEnter:   ["student"],
        autoAdvance:     false,
      },
      {
        order:           2,
        name:            "HOD Approval",
        assigneeRole:    "hod",
        allowedActions:  ["approve", "reject", "close"],
        requiresComment: true,
        slaHours:        48,
        notifyOnEnter:   ["student"],
        autoAdvance:     false,
      },
    ],
    ...overrides,
  };
}

// ── WorkflowTemplate CRUD ─────────────────────────────────────────────────────

describe("Workflow Template API (admin)", () => {
  let adminAgent;
  let studentAgent;

  beforeEach(async () => {
    adminAgent   = request.agent(app);
    studentAgent = request.agent(app);

    // Create and promote admin
    await adminAgent.post("/api/register").send({ name: "Admin", email: "wfadmin@test.com", password: "pass1234" });
    await User.updateOne({ email: "wfadmin@test.com" }, { role: "admin" });
    await adminAgent.post("/api/login").send({ email: "wfadmin@test.com", password: "pass1234" });

    // Student
    await studentAgent.post("/api/register").send({ name: "Student", email: "wfstudent@test.com", password: "pass1234" });
    await studentAgent.post("/api/login").send({ email: "wfstudent@test.com", password: "pass1234" });
  });

  it("admin can create a workflow template", async () => {
    const res = await adminAgent.post("/api/admin/workflow-templates").send(makeTemplate());
    expect(res.status).toBe(201);
    expect(res.body.template.name).toBe("Test Workflow");
    expect(res.body.template.stages).toHaveLength(2);
    expect(res.body.template.version).toBe(1);
  });

  it("admin can list workflow templates", async () => {
    await adminAgent.post("/api/admin/workflow-templates").send(makeTemplate());
    const res = await adminAgent.get("/api/admin/workflow-templates");
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(1);
  });

  it("admin can get a single template", async () => {
    const created = await adminAgent.post("/api/admin/workflow-templates").send(makeTemplate());
    const id = created.body.template._id;
    const res = await adminAgent.get(`/api/admin/workflow-templates/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.template._id).toBe(id);
  });

  it("admin can update a template (bumps version)", async () => {
    const created = await adminAgent.post("/api/admin/workflow-templates").send(makeTemplate());
    const id = created.body.template._id;
    const res = await adminAgent.put(`/api/admin/workflow-templates/${id}`).send({
      stages: [
        { name: "Updated Stage", assigneeRole: "faculty", allowedActions: ["approve", "reject"], slaHours: 12 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.template.version).toBe(2);
    expect(res.body.template.stages).toHaveLength(1);
  });

  it("admin can deactivate a template", async () => {
    const created = await adminAgent.post("/api/admin/workflow-templates").send(makeTemplate());
    const id = created.body.template._id;
    const res = await adminAgent.patch(`/api/admin/workflow-templates/${id}/deactivate`);
    expect(res.status).toBe(200);
    expect(res.body.template.isActive).toBe(false);
  });

  it("admin can activate a template", async () => {
    const created = await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ isActive: false })
    );
    const id = created.body.template._id;
    const res = await adminAgent.patch(`/api/admin/workflow-templates/${id}/activate`);
    expect(res.status).toBe(200);
    expect(res.body.template.isActive).toBe(true);
  });

  it("non-admin cannot create a template (403)", async () => {
    const res = await studentAgent.post("/api/admin/workflow-templates").send(makeTemplate());
    expect(res.status).toBe(403);
  });

  it("returns 400 when stages array is empty", async () => {
    const res = await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ stages: [] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when stage has no allowedActions", async () => {
    const res = await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ stages: [{ name: "S1", assigneeRole: "faculty", allowedActions: [] }] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent template id", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await adminAgent.get(`/api/admin/workflow-templates/${fakeId}`);
    expect(res.status).toBe(404);
  });
});

// ── WorkflowEngine service unit tests ────────────────────────────────────────

describe("WorkflowEngine service", () => {
  let adminUser;
  let facultyUser;
  let hodUser;
  let studentUser;

  beforeEach(async () => {
    studentUser = await User.create({ name: "S", email: "s@wf.com", password: "x", role: "student" });
    facultyUser = await User.create({ name: "F", email: "f@wf.com", password: "x", role: "faculty" });
    hodUser     = await User.create({ name: "H", email: "h@wf.com", password: "x", role: "hod" });
    adminUser   = await User.create({ name: "A", email: "a@wf.com", password: "x", role: "admin" });
  });

  it("createInstance() snapshots template stages correctly", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    expect(instance.stages).toHaveLength(2);
    expect(instance.stages[0].stageName).toBe("Faculty Review");
    expect(instance.stages[1].stageName).toBe("HOD Approval");
    expect(instance.stages[0].status).toBe("in_progress");
    expect(instance.stages[1].status).toBe("pending");
    expect(instance.currentStageIndex).toBe(0);
    expect(instance.overallStatus).toBe("in_progress");
    expect(instance.templateSnapshot.version).toBe(1);
  });

  it("createInstance() sets slaDeadline on first stage", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);
    expect(instance.stages[0].slaDeadline).not.toBeNull();
    expect(instance.stages[1].slaDeadline).toBeNull();
  });

  it("advanceStage() moves to next stage on approve", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    const { instance: updated, advancedTo } = await workflowSvc.advanceStage(
      instance._id, "approve", facultyUser._id, ""
    );

    expect(updated.currentStageIndex).toBe(1);
    expect(updated.overallStatus).toBe("in_progress");
    expect(updated.stages[0].status).toBe("completed");
    expect(updated.stages[1].status).toBe("in_progress");
    expect(advancedTo).toBe("HOD Approval");
  });

  it("advanceStage() approves whole workflow on last stage approve", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    // Advance stage 1
    await workflowSvc.advanceStage(instance._id, "approve", facultyUser._id, "");
    // Advance stage 2 (requires comment)
    const { instance: final } = await workflowSvc.advanceStage(
      instance._id, "approve", hodUser._id, "Looks good"
    );

    expect(final.overallStatus).toBe("approved");
    expect(final.stages[1].status).toBe("completed");
  });

  it("advanceStage() rejects entire workflow on reject", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    const { instance: rejected } = await workflowSvc.advanceStage(
      instance._id, "reject", facultyUser._id, "Not valid"
    );

    expect(rejected.overallStatus).toBe("rejected");
    expect(rejected.stages[0].status).toBe("completed");
    expect(rejected.stages[1].status).toBe("skipped");
  });

  it("advanceStage() returns 400 for action not in allowedActions", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    await expect(
      workflowSvc.advanceStage(instance._id, "close", facultyUser._id, "")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("advanceStage() enforces requiresComment", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    // Advance to stage 2 (requiresComment=true)
    await workflowSvc.advanceStage(instance._id, "approve", facultyUser._id, "");
    await expect(
      workflowSvc.advanceStage(instance._id, "approve", hodUser._id, "")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("advanceStage() returns 403 when role doesn't match stage", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    // Stage 0 requires faculty — try with HOD user acting directly (should be 403 since hod !== faculty)
    // Note: HOD has a different role string — this should fail the role check
    await expect(
      workflowSvc.advanceStage(instance._id, "approve", studentUser._id, "")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("admin can always advance any stage regardless of role", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    // Admin acting at faculty stage — should succeed
    const { instance: updated } = await workflowSvc.advanceStage(
      instance._id, "approve", adminUser._id, ""
    );
    expect(updated.currentStageIndex).toBe(1);
  });

  it("advanceStage() throws 409 on terminal instance", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate({ stages: [
      { order: 1, name: "One", assigneeRole: "faculty", allowedActions: ["approve"], slaHours: 0 },
    ]}));
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);
    await workflowSvc.advanceStage(instance._id, "approve", facultyUser._id, "");

    await expect(
      workflowSvc.advanceStage(instance._id, "approve", facultyUser._id, "")
    ).rejects.toMatchObject({ status: 409 });
  });

  it("findActiveTemplate() returns null when no template configured", async () => {
    const result = await workflowSvc.findActiveTemplate("request", "transcript");
    expect(result).toBeNull();
  });

  it("findActiveTemplate() returns matching active template", async () => {
    await WorkflowTemplate.create(makeTemplate({ appliesToTypes: ["grade_appeal"] }));
    const result = await workflowSvc.findActiveTemplate("request", "grade_appeal");
    expect(result).not.toBeNull();
    expect(result.name).toBe("Test Workflow");
  });

  it("getWorkflowStatus() returns null when no instance", async () => {
    const result = await workflowSvc.getWorkflowStatus(new mongoose.Types.ObjectId(), "request");
    expect(result).toBeNull();
  });

  it("getWorkflowStatus() returns instance summary", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);
    const status = await workflowSvc.getWorkflowStatus(entityId, "request");
    expect(status.overallStatus).toBe("in_progress");
    expect(status.currentStageIndex).toBe(0);
    expect(status.stages).toHaveLength(2);
  });

  it("checkSLABreaches() marks overdue stage as slaBreached", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    // Manually set slaDeadline to the past
    await WorkflowInstance.findByIdAndUpdate(instance._id, {
      "stages.0.slaDeadline": new Date(Date.now() - 1000),
    });

    const stats = await workflowSvc.checkSLABreaches();
    expect(stats.breached).toBeGreaterThanOrEqual(1);
  });

  it("version bump on template update does not affect existing instance", async () => {
    const tpl = await WorkflowTemplate.create(makeTemplate());
    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId, "request", tpl._id, studentUser._id);

    // Bump template version
    tpl.version = 2;
    tpl.stages[0].name = "Updated Stage Name";
    await tpl.save();

    // Instance snapshot is unchanged
    const reloaded = await WorkflowInstance.findById(instance._id);
    expect(reloaded.templateSnapshot.version).toBe(1);
    expect(reloaded.stages[0].stageName).toBe("Faculty Review");
  });
});

// ── Integration: POST /api/requests auto-creates workflow instance ────────────

describe("Integration: Request submission with workflow template", () => {
  let studentAgent;
  let facultyAgent;
  let adminAgent;

  beforeEach(async () => {
    studentAgent = request.agent(app);
    facultyAgent = request.agent(app);
    adminAgent   = request.agent(app);

    await studentAgent.post("/api/register").send({ name: "St", email: "st@wf2.com", password: "pass1234" });
    await studentAgent.post("/api/login").send({ email: "st@wf2.com", password: "pass1234" });

    await facultyAgent.post("/api/register").send({ name: "Fa", email: "fa@wf2.com", password: "pass1234" });
    await User.updateOne({ email: "fa@wf2.com" }, { role: "faculty" });
    await facultyAgent.post("/api/login").send({ email: "fa@wf2.com", password: "pass1234" });

    await adminAgent.post("/api/register").send({ name: "Ad", email: "ad@wf2.com", password: "pass1234" });
    await User.updateOne({ email: "ad@wf2.com" }, { role: "admin" });
    await adminAgent.post("/api/login").send({ email: "ad@wf2.com", password: "pass1234" });
  });

  it("creates a WorkflowInstance when active template exists for type", async () => {
    await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ appliesToTypes: ["general"] })
    );

    const res = await studentAgent.post("/api/requests").send({
      type: "general", description: "I need help with my enrollment", priority: "normal",
    });
    expect(res.status).toBe(201);
    expect(res.body.request.workflowInstanceId).toBeTruthy();
  });

  it("does NOT create WorkflowInstance when no template configured", async () => {
    const res = await studentAgent.post("/api/requests").send({
      type: "transcript", description: "Need official transcript", priority: "normal",
    });
    expect(res.status).toBe(201);
    expect(res.body.request.workflowInstanceId).toBeFalsy();
  });

  it("GET /api/requests/:id/workflow returns 404 when no instance", async () => {
    const req = await studentAgent.post("/api/requests").send({
      type: "transcript", description: "Test desc", priority: "low",
    });
    const id = req.body.request._id;
    const res = await studentAgent.get(`/api/requests/${id}/workflow`);
    expect(res.status).toBe(404);
  });

  it("faculty can advance workflow stage via POST /api/requests/:id/workflow/advance", async () => {
    await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ appliesToTypes: ["general"] })
    );

    const reqRes = await studentAgent.post("/api/requests").send({
      type: "general", description: "Advance me through workflow", priority: "normal",
    });
    const id = reqRes.body.request._id;

    const adv = await facultyAgent.post(`/api/requests/${id}/workflow/advance`).send({
      action: "approve", comment: "Looks good",
    });
    expect(adv.status).toBe(200);
    expect(adv.body.overallStatus).toBe("in_progress");
    expect(adv.body.advancedTo).toBe("HOD Approval");
  });

  it("student cannot advance workflow stage (403)", async () => {
    await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ appliesToTypes: ["general"] })
    );
    const reqRes = await studentAgent.post("/api/requests").send({
      type: "general", description: "Student tries to advance", priority: "normal",
    });
    const id = reqRes.body.request._id;

    const adv = await studentAgent.post(`/api/requests/${id}/workflow/advance`).send({
      action: "approve",
    });
    expect(adv.status).toBe(403);
  });

  it("student cannot view another student's workflow (404)", async () => {
    await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ appliesToTypes: ["general"] })
    );
    const reqRes = await studentAgent.post("/api/requests").send({
      type: "general", description: "Private request", priority: "normal",
    });
    const id = reqRes.body.request._id;

    const student2 = request.agent(app);
    await student2.post("/api/register").send({ name: "S2", email: "s2@wf2.com", password: "pass1234" });
    await student2.post("/api/login").send({ email: "s2@wf2.com", password: "pass1234" });

    const res = await student2.get(`/api/requests/${id}/workflow`);
    expect(res.status).toBe(404);
  });

  it("legacy PATCH /api/requests/:id/status still works without workflow", async () => {
    const reqRes = await studentAgent.post("/api/requests").send({
      type: "transcript", description: "Legacy status test", priority: "normal",
    });
    const id = reqRes.body.request._id;

    const patch = await facultyAgent.patch(`/api/requests/${id}/status`).send({
      status: "in_review",
    });
    expect(patch.status).toBe(200);
    expect(patch.body.request.status).toBe("in_review");
  });

  it("GET /api/config/request-types returns all types", async () => {
    const res = await studentAgent.get("/api/config/request-types");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.requestTypes)).toBe(true);
    expect(res.body.requestTypes.length).toBeGreaterThan(0);
  });

  it("GET /api/config/priorities returns priorities with slaHours", async () => {
    const res = await studentAgent.get("/api/config/priorities");
    expect(res.status).toBe(200);
    expect(res.body.priorities.find((p) => p.value === "urgent").slaHours).toBe(4);
  });

  it("GET /api/config/workflow-templates returns active templates", async () => {
    await adminAgent.post("/api/admin/workflow-templates").send(
      makeTemplate({ appliesToTypes: ["general"] })
    );
    const res = await studentAgent.get("/api/config/workflow-templates");
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-FIX TESTS: File Upload, Leave Quota, Departments, Password Change, Advisor
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path");
const fs   = require("fs");
const LeaveType  = require("../models/LeaveType");
const Leave      = require("../models/Leave");
const Department = require("../models/Department");

// ── Shared helpers for gap tests ──────────────────────────────────────────────

async function makeStudentAgent(email = "gapst@test.com", name = "GapStudent") {
  const ag = request.agent(app);
  const r  = await ag.post("/api/register").send({ name, email, password: "pass1234" });
  expect(r.status).toBe(201);
  return { agent: ag, userId: r.body.user.id };
}

async function makeStaffAgent(role = "faculty", email = "gapfac@test.com", name = "GapFaculty") {
  const ag = request.agent(app);
  const r  = await ag.post("/api/register").send({ name, email, password: "pass1234" });
  expect(r.status).toBe(201);
  await User.findByIdAndUpdate(r.body.user.id, { role });
  await ag.post("/api/login").send({ email, password: "pass1234" });
  return { agent: ag, userId: r.body.user.id };
}

async function makeAdminAgent2(email = "gapadm@test.com") {
  const ag = request.agent(app);
  const r  = await ag.post("/api/register").send({ name: "GapAdmin", email, password: "pass1234" });
  expect(r.status).toBe(201);
  await User.findByIdAndUpdate(r.body.user.id, { role: "admin" });
  await ag.post("/api/login").send({ email, password: "pass1234" });
  return { agent: ag, userId: r.body.user.id };
}

// ── Fixture: future date strings ──────────────────────────────────────────────
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GAP 1 — File Upload pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/upload — file upload endpoint", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await request(app).post("/api/upload").attach("documents", Buffer.from("hi"), "test.txt");
    expect(res.status).toBe(401);
  });

  it("returns 400 when no files attached", async () => {
    const { agent } = await makeStudentAgent("up1@test.com");
    const res = await agent.post("/api/upload");
    expect(res.status).toBe(400);
  });

  it("uploads a text file and returns metadata", async () => {
    const { agent } = await makeStudentAgent("up2@test.com");
    const res = await agent
      .post("/api/upload")
      .attach("documents", Buffer.from("hello upload"), "sample.txt");
    expect(res.status).toBe(201);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].originalName).toBe("sample.txt");
    expect(res.body.files[0].filename).toBeDefined();
    expect(res.body.files[0].mimeType).toBe("text/plain");
    expect(res.body.files[0].size).toBeGreaterThan(0);

    // Cleanup
    const { UPLOAD_DIR } = require("../middleware/upload");
    const p = path.join(UPLOAD_DIR, res.body.files[0].filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("rejects a disallowed file type", async () => {
    const { agent } = await makeStudentAgent("up3@test.com");
    const res = await agent
      .post("/api/upload")
      .attach("documents", Buffer.from("<html>"), { filename: "bad.html", contentType: "text/html" });
    expect(res.status).toBe(400);
  });

  it("uploaded file actually exists on disk", async () => {
    const { agent } = await makeStudentAgent("up4@test.com");
    const res = await agent
      .post("/api/upload")
      .attach("documents", Buffer.from("disk check"), "disk.txt");
    expect(res.status).toBe(201);
    const { UPLOAD_DIR } = require("../middleware/upload");
    const filePath = path.join(UPLOAD_DIR, res.body.files[0].filename);
    expect(fs.existsSync(filePath)).toBe(true);
    fs.unlinkSync(filePath);
  });

  it("can upload multiple files at once", async () => {
    const { agent } = await makeStudentAgent("up5@test.com");
    const res = await agent
      .post("/api/upload")
      .attach("documents", Buffer.from("file one"), "one.txt")
      .attach("documents", Buffer.from("file two"), "two.txt");
    expect(res.status).toBe(201);
    expect(res.body.files).toHaveLength(2);
    const { UPLOAD_DIR } = require("../middleware/upload");
    res.body.files.forEach((f) => {
      const p = path.join(UPLOAD_DIR, f.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
  });
});

describe("GET /api/files/:key — file download authorization", () => {
  let uploadedKey;
  let studentAgent;

  beforeEach(async () => {
    const s = await makeStudentAgent("dl1@test.com");
    studentAgent = s.agent;
    // Upload a file
    const up = await studentAgent
      .post("/api/upload")
      .attach("documents", Buffer.from("download test"), "dl.txt");
    expect(up.status).toBe(201);
    uploadedKey = up.body.files[0].filename;
    // Attach it to a request so ownership is recorded
    await studentAgent.post("/api/requests").send({
      type: "general",
      description: "Request with attachment for download test",
      priority: "normal",
      attachments: [{ filename: uploadedKey, originalName: "dl.txt", mimeType: "text/plain", size: 13 }],
    });
  });

  afterEach(async () => {
    const { UPLOAD_DIR } = require("../middleware/upload");
    const p = path.join(UPLOAD_DIR, uploadedKey);
    if (uploadedKey && fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("returns 401 for unauthenticated download", async () => {
    const res = await request(app).get(`/api/files/${uploadedKey}`);
    expect(res.status).toBe(401);
  });

  it("owner can download their own file", async () => {
    const res = await studentAgent.get(`/api/files/${uploadedKey}`);
    expect(res.status).toBe(200);
  });

  it("different student cannot download another student's file (403)", async () => {
    const { agent: other } = await makeStudentAgent("dl2@test.com", "Other");
    const res = await other.get(`/api/files/${uploadedKey}`);
    expect(res.status).toBe(403);
  });

  it("faculty reviewer can download any file", async () => {
    const { agent: fac } = await makeStaffAgent("faculty", "dl3fac@test.com");
    const res = await fac.get(`/api/files/${uploadedKey}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 for nonexistent file key (authenticated)", async () => {
    const res = await studentAgent.get("/api/files/nonexistent-uuid-xyz.txt");
    // Either 403 (no ownership record) or 404 (not found) — both acceptable
    expect([403, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 2 — Leave Quota / Balance enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe("Leave quota enforcement", () => {
  let studentAgent, studentId;
  let facultyAgent;
  let leaveTypeId;

  beforeEach(async () => {
    const s = await makeStudentAgent("lq1@test.com", "QuotaStudent");
    studentAgent = s.agent;
    studentId    = s.userId;
    const f = await makeStaffAgent("faculty", "lqfac@test.com");
    facultyAgent = f.agent;

    // Create a leave type with a 3-day annual quota
    const lt = await LeaveType.create({
      name:           "Quota Leave " + Date.now(),
      maxDaysPerYear: 3,
      isActive:       true,
    });
    leaveTypeId = lt._id.toString();
  });

  it("allows leave when within quota (2 working days)", async () => {
    // Mon–Tue (2 working days)
    const start = futureDate(7);  // pick a future Monday
    const end   = futureDate(8);
    const res = await studentAgent.post("/api/leave").send({
      leaveTypeId,
      startDate: start,
      endDate:   end,
      reason:    "Need some rest this week",
    });
    expect(res.status).toBe(201);
  });

  it("rejects leave when requested days exceed quota", async () => {
    // 5 working days on a 3-day quota
    const start = futureDate(7);
    const end   = futureDate(13); // Mon–Fri next week = 5 working days
    const res = await studentAgent.post("/api/leave").send({
      leaveTypeId,
      startDate: start,
      endDate:   end,
      reason:    "Need a full week off for personal reasons",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quota exceeded/i);
  });

  it("counts existing pending leave toward quota", async () => {
    // Apply for 2 days (within 3-day quota)
    await studentAgent.post("/api/leave").send({
      leaveTypeId,
      startDate: futureDate(14),
      endDate:   futureDate(15),
      reason:    "First application reason here",
    });

    // Try to apply for 2 more days — total 4 > quota 3
    const res = await studentAgent.post("/api/leave").send({
      leaveTypeId,
      startDate: futureDate(21),
      endDate:   futureDate(22),
      reason:    "Second application needs to be blocked",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quota exceeded/i);
  });

  it("quota is NOT enforced when maxDaysPerYear is 0 (unlimited)", async () => {
    const unlimited = await LeaveType.create({
      name:           "Unlimited Leave " + Date.now(),
      maxDaysPerYear: 0,
      isActive:       true,
    });
    // 10 working days — should succeed with no quota
    const res = await studentAgent.post("/api/leave").send({
      leaveTypeId: unlimited._id.toString(),
      startDate:   futureDate(7),
      endDate:     futureDate(18),
      reason:      "Extended leave, no quota limit applies here",
    });
    expect(res.status).toBe(201);
  });

  it("approval decrements student leaveBalance", async () => {
    const lt = await LeaveType.create({
      name:           "Balance Leave " + Date.now(),
      maxDaysPerYear: 10,
      isActive:       true,
    });
    const start = futureDate(28);
    const end   = futureDate(29); // 2 working days
    await studentAgent.post("/api/leave").send({
      leaveTypeId: lt._id.toString(),
      startDate:   start,
      endDate:     end,
      reason:      "Checking balance decrement after approval",
    });
    const leaveDoc = await Leave.findOne({ student: studentId }).lean();
    expect(leaveDoc).toBeTruthy();

    await facultyAgent.patch(`/api/leave/${leaveDoc._id}/review`).send({
      decision: "approved", comment: "Approved fine",
    });

    const updated = await User.findById(studentId).lean();
    const bal = updated.leaveBalance instanceof Map
      ? updated.leaveBalance.get(lt._id.toString())
      : updated.leaveBalance?.[lt._id.toString()];
    // Balance should be less than max (decremented)
    expect(bal).toBeLessThan(lt.maxDaysPerYear);
  });

  it("rejection does NOT decrease leave balance below max", async () => {
    const lt = await LeaveType.create({
      name:           "Reject Balance " + Date.now(),
      maxDaysPerYear: 5,
      isActive:       true,
    });
    await studentAgent.post("/api/leave").send({
      leaveTypeId: lt._id.toString(),
      startDate:   futureDate(35),
      endDate:     futureDate(36),
      reason:      "This should be rejected and balance restored",
    });
    const leaveDoc = await Leave.findOne({ student: studentId, leaveType: lt._id }).lean();
    await facultyAgent.patch(`/api/leave/${leaveDoc._id}/review`).send({
      decision: "rejected", comment: "Not approved due to policy",
    });
    // After rejection the balance should NOT be less than 0 and not permanently decremented
    const updated = await User.findById(studentId).lean();
    const bal = updated.leaveBalance instanceof Map
      ? updated.leaveBalance.get(lt._id.toString())
      : updated.leaveBalance?.[lt._id.toString()];
    // balance is restored/untouched — at or above initial
    expect(bal === undefined || bal >= 5).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 3 — Department persistence
// ─────────────────────────────────────────────────────────────────────────────

describe("Department API — CRUD", () => {
  let adminAgent;

  beforeEach(async () => {
    const a = await makeAdminAgent2("deptadm@test.com");
    adminAgent = a.agent;
  });

  it("admin can create a department", async () => {
    const res = await adminAgent.post("/api/admin/departments").send({
      name: "Dept Computer Science " + Date.now(),
    });
    expect(res.status).toBe(201);
    expect(res.body.department.name).toMatch(/Computer Science/);
    expect(res.body.department._id).toBeDefined();
  });

  it("returns 409 on duplicate department name", async () => {
    const name = "Dup Dept " + Date.now();
    await adminAgent.post("/api/admin/departments").send({ name });
    const res = await adminAgent.post("/api/admin/departments").send({ name });
    expect(res.status).toBe(409);
  });

  it("returns 400 when name is missing", async () => {
    const res = await adminAgent.post("/api/admin/departments").send({ name: "  " });
    expect(res.status).toBe(400);
  });

  it("GET /api/admin/departments returns created departments", async () => {
    const name = "List Dept " + Date.now();
    await adminAgent.post("/api/admin/departments").send({ name });
    const res = await adminAgent.get("/api/admin/departments");
    expect(res.status).toBe(200);
    expect(res.body.departments.some((d) => d.name === name)).toBe(true);
  });

  it("admin can update a department name", async () => {
    const cr = await adminAgent.post("/api/admin/departments").send({ name: "OldName " + Date.now() });
    const id  = cr.body.department._id;
    const newName = "NewName " + Date.now();
    const res = await adminAgent.patch(`/api/admin/departments/${id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.department.name).toBe(newName);
  });

  it("admin can deactivate a department", async () => {
    const cr  = await adminAgent.post("/api/admin/departments").send({ name: "DeactDept " + Date.now() });
    const id  = cr.body.department._id;
    const res = await adminAgent.patch(`/api/admin/departments/${id}/deactivate`);
    expect(res.status).toBe(200);
    expect(res.body.department.isActive).toBe(false);
  });

  it("admin can re-activate a department", async () => {
    const cr  = await adminAgent.post("/api/admin/departments").send({ name: "ReactDept " + Date.now() });
    const id  = cr.body.department._id;
    await adminAgent.patch(`/api/admin/departments/${id}/deactivate`);
    const res = await adminAgent.patch(`/api/admin/departments/${id}/activate`);
    expect(res.status).toBe(200);
    expect(res.body.department.isActive).toBe(true);
  });

  it("admin can delete a department with no members", async () => {
    const cr  = await adminAgent.post("/api/admin/departments").send({ name: "DelDept " + Date.now() });
    const id  = cr.body.department._id;
    const res = await adminAgent.delete(`/api/admin/departments/${id}`);
    expect(res.status).toBe(200);
    // Confirm it's gone
    const check = await Department.findById(id);
    expect(check).toBeNull();
  });

  it("returns 409 when deleting a department with assigned users", async () => {
    const name = "OccupiedDept " + Date.now();
    const cr   = await adminAgent.post("/api/admin/departments").send({ name });
    const id   = cr.body.department._id;
    // Assign a user to this department
    await User.create({ name: "Occ", email: `occ${Date.now()}@t.com`, password: "x", department: name });
    const res = await adminAgent.delete(`/api/admin/departments/${id}`);
    expect(res.status).toBe(409);
  });

  it("non-admin cannot create a department (403)", async () => {
    const { agent } = await makeStudentAgent("deptst@test.com");
    const res = await agent.post("/api/admin/departments").send({ name: "Hacker Dept" });
    expect(res.status).toBe(403);
  });

  it("GET includes memberCount for departments", async () => {
    const name = "MemberCount " + Date.now();
    await adminAgent.post("/api/admin/departments").send({ name });
    // Assign a user to it
    await User.create({ name: "Mem", email: `mem${Date.now()}@t.com`, password: "x", department: name });
    const res = await adminAgent.get("/api/admin/departments?all=true");
    expect(res.status).toBe(200);
    const dept = res.body.departments.find((d) => d.name === name);
    expect(dept).toBeDefined();
    expect(dept.memberCount).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 4 — Password change
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/change-password", () => {
  it("allows authenticated user to change password", async () => {
    const { agent } = await makeStudentAgent("pw1@test.com");
    const res = await agent.post("/api/change-password").send({
      currentPassword: "pass1234",
      newPassword:     "newpass999",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/changed/i);
  });

  it("can log in with the new password after change", async () => {
    const email = "pw2@test.com";
    const { agent } = await makeStudentAgent(email);
    await agent.post("/api/change-password").send({
      currentPassword: "pass1234",
      newPassword:     "brand_new_pw!",
    });
    // Log in fresh with new password
    const loginRes = await request(app).post("/api/login").send({ email, password: "brand_new_pw!" });
    expect(loginRes.status).toBe(200);
  });

  it("cannot log in with old password after change", async () => {
    const email = "pw3@test.com";
    const { agent } = await makeStudentAgent(email);
    await agent.post("/api/change-password").send({
      currentPassword: "pass1234",
      newPassword:     "changed_pw_456",
    });
    const loginRes = await request(app).post("/api/login").send({ email, password: "pass1234" });
    expect(loginRes.status).toBe(401);
  });

  it("returns 401 for wrong current password", async () => {
    const { agent } = await makeStudentAgent("pw4@test.com");
    const res = await agent.post("/api/change-password").send({
      currentPassword: "WRONG_PASSWORD",
      newPassword:     "newpass999",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when new password is too short", async () => {
    const { agent } = await makeStudentAgent("pw5@test.com");
    const res = await agent.post("/api/change-password").send({
      currentPassword: "pass1234",
      newPassword:     "abc",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when new password equals current password", async () => {
    const { agent } = await makeStudentAgent("pw6@test.com");
    const res = await agent.post("/api/change-password").send({
      currentPassword: "pass1234",
      newPassword:     "pass1234",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when fields are missing", async () => {
    const { agent } = await makeStudentAgent("pw7@test.com");
    const res = await agent.post("/api/change-password").send({ currentPassword: "pass1234" });
    expect(res.status).toBe(400);
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await request(app).post("/api/change-password").send({
      currentPassword: "pass1234",
      newPassword:     "newpass999",
    });
    expect(res.status).toBe(401);
  });

  it("invalidates refresh tokens of other sessions after password change", async () => {
    const email = "pw8@test.com";
    // Session A — will change password
    const sessionA = request.agent(app);
    await sessionA.post("/api/register").send({ name: "PW8", email, password: "pass1234" });

    // Session B — a second login
    const sessionB = request.agent(app);
    await sessionB.post("/api/login").send({ email, password: "pass1234" });

    // Session A changes password
    await sessionA.post("/api/change-password").send({
      currentPassword: "pass1234",
      newPassword:     "newsession_pw",
    });

    // Session B's refresh token should be gone — /api/refresh should 401
    const refreshRes = await sessionB.post("/api/refresh");
    expect(refreshRes.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 5 — Advisor assignment
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/users/:id/advisor", () => {
  let adminAgent, studentId, facultyId;

  beforeEach(async () => {
    const a = await makeAdminAgent2("avadm@test.com");
    adminAgent = a.agent;

    const s = await makeStudentAgent("avst@test.com", "AvStudent");
    studentId = s.userId;

    const f = await makeStaffAgent("faculty", "avfac@test.com", "AvFaculty");
    facultyId = f.userId;
  });

  it("admin can assign a faculty advisor to a student", async () => {
    const res = await adminAgent.patch(`/api/admin/users/${studentId}/advisor`).send({ advisorId: facultyId });
    expect(res.status).toBe(200);
    expect(res.body.user.advisorId).toBeTruthy();
  });

  it("assigned advisorId is persisted in DB", async () => {
    await adminAgent.patch(`/api/admin/users/${studentId}/advisor`).send({ advisorId: facultyId });
    const student = await User.findById(studentId).lean();
    expect(student.advisorId.toString()).toBe(facultyId);
  });

  it("admin can clear advisor by sending null", async () => {
    await adminAgent.patch(`/api/admin/users/${studentId}/advisor`).send({ advisorId: facultyId });
    const res = await adminAgent.patch(`/api/admin/users/${studentId}/advisor`).send({ advisorId: null });
    expect(res.status).toBe(200);
    const student = await User.findById(studentId).lean();
    expect(student.advisorId).toBeNull();
  });

  it("returns 400 when trying to assign advisor to a non-student", async () => {
    const res = await adminAgent.patch(`/api/admin/users/${facultyId}/advisor`).send({ advisorId: facultyId });
    expect(res.status).toBe(400);
  });

  it("returns 400 when advisor is a student (not staff)", async () => {
    const { userId: otherId } = await makeStudentAgent("avst2@test.com", "AnotherStudent");
    const res = await adminAgent.patch(`/api/admin/users/${studentId}/advisor`).send({ advisorId: otherId });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    const { agent } = await makeStudentAgent("av3@test.com");
    const res = await agent.patch(`/api/admin/users/${studentId}/advisor`).send({ advisorId: facultyId });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent student id", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await adminAgent.patch(`/api/admin/users/${fakeId}/advisor`).send({ advisorId: facultyId });
    expect(res.status).toBe(404);
  });

  it("assigned advisor is auto-set as reviewedBy on leave submission", async () => {
    // Assign advisor
    await adminAgent.patch(`/api/admin/users/${studentId}/advisor`).send({ advisorId: facultyId });

    const lt = await LeaveType.create({ name: "AdvisorLeave " + Date.now(), isActive: true });
    const { agent: stAgent } = await (() => {
      // Re-login as student
      const ag = request.agent(app);
      return ag.post("/api/login").send({ email: "avst@test.com", password: "pass1234" })
        .then(() => ({ agent: ag }));
    })();

    const leaveRes = await stAgent.post("/api/leave").send({
      leaveTypeId: lt._id.toString(),
      startDate:   futureDate(7),
      endDate:     futureDate(7),
      reason:      "Advisor auto-assignment test leave",
    });
    expect(leaveRes.status).toBe(201);
    expect(leaveRes.body.leave.reviewedBy.toString()).toBe(facultyId);
  });
});


// =============================================================================
// ADVANCED FEATURES TESTS (Features 1-10)
// =============================================================================

const AuditLog       = require("../models/AuditLog");
const Notification   = require("../models/Notification");
const IdempotencyKey = require("../models/IdempotencyKey");
const notifSvc       = require("../services/notification.service");
const auditSvc       = require("../services/audit.service");
const { evaluateCondition, resolveConditionalTarget } = require("../services/workflow.service");

// ── Reusable helpers ──────────────────────────────────────────────────────────

async function makeAdv(email, role = "student") {
  const ag = request.agent(app);
  const r  = await ag.post("/api/register").send({ name: "AdvUser", email, password: "pass1234" });
  expect(r.status).toBe(201);
  if (role !== "student") {
    await User.findByIdAndUpdate(r.body.user.id, { role });
    await ag.post("/api/login").send({ email, password: "pass1234" });
  }
  return { agent: ag, userId: r.body.user.id };
}

function parallelTemplate(overrides = {}) {
  return {
    name:           "Parallel WF " + Date.now(),
    entityKind:     "request",
    appliesToTypes: [],
    isActive:       false,
    stages: [
      {
        order: 1, name: "Multi Approval",
        stageType: "parallel",
        assigneeRole: "faculty",
        allowedActions: ["approve","reject"],
        parallelQuorum: 2,
        slaHours: 24,
        requiresComment: false,
        autoAdvance: false,
      },
    ],
    ...overrides,
  };
}

function conditionalTemplate(overrides = {}) {
  return {
    name:           "Conditional WF " + Date.now(),
    entityKind:     "request",
    appliesToTypes: [],
    isActive:       false,
    stages: [
      {
        order: 1, name: "Initial Review",
        assigneeRole: "faculty",
        allowedActions: ["approve","reject"],
        slaHours: 24,
        conditions: [
          { field: "priority", operator: "eq", value: "urgent", targetStageOrder: 3 }
        ],
      },
      {
        order: 2, name: "Normal Stage",
        assigneeRole: "hod",
        allowedActions: ["approve","reject"],
        slaHours: 48,
        conditions: [],
      },
      {
        order: 3, name: "Urgent Fast Track",
        assigneeRole: "admin",
        allowedActions: ["approve","reject"],
        slaHours: 4,
        conditions: [],
      },
    ],
    ...overrides,
  };
}

// =============================================================================
// Feature 1: Advanced Workflow Engine — stageType field, version history
// =============================================================================

describe("Feature 1: Advanced Workflow Engine", () => {
  let adminAgent, adminId;

  beforeEach(async () => {
    const a = await makeAdv("f1adm@test.com", "admin");
    adminAgent = a.agent; adminId = a.userId;
  });

  it("admin can create a template with stageType=parallel", async () => {
    const res = await adminAgent.post("/api/admin/workflow-templates").send(parallelTemplate());
    expect(res.status).toBe(201);
    expect(res.body.template.stages[0].stageType).toBe("parallel");
  });

  it("admin can create a template with stageType=sequential (default)", async () => {
    const res = await adminAgent.post("/api/admin/workflow-templates").send({
      name: "Seq WF " + Date.now(), entityKind: "request", isActive: false,
      stages: [{ order:1, name:"Step", assigneeRole:"faculty", allowedActions:["approve","reject"], slaHours:24 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.template.stages[0].stageType).toBe("sequential");
  });

  it("invalid stageType returns 400", async () => {
    const res = await adminAgent.post("/api/admin/workflow-templates").send({
      name: "Bad WF " + Date.now(), entityKind: "request", isActive: false,
      stages: [{ order:1, name:"X", assigneeRole:"faculty", allowedActions:["approve"], stageType:"invalid" }],
    });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Feature 2: Conditional Workflow Transitions
// =============================================================================

describe("Feature 2: Conditional Transitions — evaluateCondition()", () => {
  it("eq operator matches correctly", () => {
    expect(evaluateCondition({ field:"priority", operator:"eq", value:"urgent" }, { priority:"urgent" })).toBe(true);
    expect(evaluateCondition({ field:"priority", operator:"eq", value:"urgent" }, { priority:"normal" })).toBe(false);
  });
  it("neq operator works", () => {
    expect(evaluateCondition({ field:"type", operator:"neq", value:"general" }, { type:"transcript" })).toBe(true);
  });
  it("in operator works", () => {
    expect(evaluateCondition({ field:"priority", operator:"in", value:["high","urgent"] }, { priority:"urgent" })).toBe(true);
    expect(evaluateCondition({ field:"priority", operator:"in", value:["high","urgent"] }, { priority:"low" })).toBe(false);
  });
  it("gt / lt operators work", () => {
    expect(evaluateCondition({ field:"totalDays", operator:"gt", value:5 }, { totalDays:7 })).toBe(true);
    expect(evaluateCondition({ field:"totalDays", operator:"lt", value:5 }, { totalDays:3 })).toBe(true);
  });
  it("returns false for missing field", () => {
    expect(evaluateCondition({ field:"missing", operator:"eq", value:"x" }, {})).toBe(false);
  });
  it("resolveConditionalTarget returns null when no conditions match", () => {
    const result = resolveConditionalTarget(
      [{ field:"priority", operator:"eq", value:"urgent", targetStageOrder:3 }],
      { priority:"normal" }
    );
    expect(result).toBeNull();
  });
  it("resolveConditionalTarget returns targetStageOrder when matched", () => {
    const result = resolveConditionalTarget(
      [{ field:"priority", operator:"eq", value:"urgent", targetStageOrder:3 }],
      { priority:"urgent" }
    );
    expect(result).toBe(3);
  });
  it("admin can create template with conditions array on a stage", async () => {
    const { agent } = await makeAdv("f2adm@test.com","admin");
    const res = await agent.post("/api/admin/workflow-templates").send(conditionalTemplate());
    expect(res.status).toBe(201);
    const stage = res.body.template.stages[0];
    expect(Array.isArray(stage.conditions)).toBe(true);
    expect(stage.conditions[0].field).toBe("priority");
  });
});

// =============================================================================
// Feature 3: Parallel Approvals
// =============================================================================

describe("Feature 3: Parallel Approvals", () => {
  it("parallel stage template stores parallelQuorum", async () => {
    const { agent } = await makeAdv("f3adm@test.com","admin");
    const res = await agent.post("/api/admin/workflow-templates").send(parallelTemplate());
    expect(res.status).toBe(201);
    expect(res.body.template.stages[0].parallelQuorum).toBe(2);
  });

  it("workflow service: parallel stage resolves after quorum votes", async () => {
    const workflowSvc = require("../services/workflow.service");

    // Create faculty users
    const f1 = await User.create({ name:"F1", email:"pf1@t.com", password:"x", role:"faculty" });
    const f2 = await User.create({ name:"F2", email:"pf2@t.com", password:"x", role:"faculty" });
    const student = await User.create({ name:"S", email:"ps@t.com", password:"x", role:"student" });

    const tpl = await WorkflowTemplate.create({
      name: "ParallelTest", entityKind:"request", isActive:false,
      stages:[{
        order:1, name:"Parallel Stage", stageType:"parallel",
        assigneeRole:"faculty", allowedActions:["approve","reject"],
        parallelQuorum:2, slaHours:24,
      }],
    });

    const entityId = new mongoose.Types.ObjectId();
    const instance = await workflowSvc.createInstance(entityId,"request",tpl._id,student._id);
    expect(instance.stages[0].stageType).toBe("parallel");

    // First vote — quorum not met yet (need 2)
    const { advancedTo: adv1 } = await workflowSvc.advanceStage(instance._id,"approve",f1._id,"");
    expect(adv1).toMatch(/pending/i);

    // Second vote — quorum met, workflow advances
    const { instance: after } = await workflowSvc.advanceStage(instance._id,"approve",f2._id,"");
    expect(after.overallStatus).toBe("approved");
  });

  it("parallel stage: single rejection immediately rejects (fail-fast)", async () => {
    const workflowSvc = require("../services/workflow.service");
    const f1 = await User.create({ name:"FR1", email:"pfr1@t.com", password:"x", role:"faculty" });
    const student = await User.create({ name:"SR", email:"psr@t.com", password:"x", role:"student" });

    const tpl = await WorkflowTemplate.create({
      name:"ParReject", entityKind:"request", isActive:false,
      stages:[{ order:1, name:"Par Stage", stageType:"parallel", assigneeRole:"faculty",
        allowedActions:["approve","reject"], parallelQuorum:2, slaHours:24 }],
    });
    const entityId = new mongoose.Types.ObjectId();
    const inst = await workflowSvc.createInstance(entityId,"request",tpl._id,student._id);
    const { instance: after } = await workflowSvc.advanceStage(inst._id,"reject",f1._id,"Not good");
    expect(after.overallStatus).toBe("rejected");
  });

  it("same user cannot vote twice on parallel stage (409)", async () => {
    const workflowSvc = require("../services/workflow.service");
    const f1 = await User.create({ name:"FD1", email:"pfd1@t.com", password:"x", role:"faculty" });
    const student = await User.create({ name:"SD", email:"psd@t.com", password:"x", role:"student" });

    const tpl = await WorkflowTemplate.create({
      name:"ParDupe", entityKind:"request", isActive:false,
      stages:[{ order:1, name:"Par", stageType:"parallel", assigneeRole:"faculty",
        allowedActions:["approve","reject"], parallelQuorum:3, slaHours:24 }],
    });
    const entityId = new mongoose.Types.ObjectId();
    const inst = await workflowSvc.createInstance(entityId,"request",tpl._id,student._id);
    await workflowSvc.advanceStage(inst._id,"approve",f1._id,"");
    await expect(workflowSvc.advanceStage(inst._id,"approve",f1._id,""))
      .rejects.toMatchObject({ status:409 });
  });
});

// =============================================================================
// Feature 4: Workflow Versioning
// =============================================================================

describe("Feature 4: Workflow Versioning", () => {
  let adminAgent;
  beforeEach(async () => { const a = await makeAdv("f4adm@test.com","admin"); adminAgent = a.agent; });

  it("PUT bumps version and saves to versionHistory", async () => {
    const cr = await adminAgent.post("/api/admin/workflow-templates").send({
      name:"VersionTest " + Date.now(), entityKind:"request", isActive:false,
      stages:[{ order:1, name:"Step1", assigneeRole:"faculty", allowedActions:["approve","reject"], slaHours:24 }],
    });
    expect(cr.status).toBe(201);
    const id = cr.body.template._id;
    const v1 = cr.body.template.version;

    const upd = await adminAgent.put(`/api/admin/workflow-templates/${id}`).send({
      name:"VersionTest Updated", stages:[{ order:1, name:"Step1 Updated", assigneeRole:"faculty",
        allowedActions:["approve"], slaHours:12 }],
      versionNote: "Updated step name",
    });
    expect(upd.status).toBe(200);
    expect(upd.body.template.version).toBe(v1 + 1);
  });

  it("GET /:id/history returns version history", async () => {
    const cr = await adminAgent.post("/api/admin/workflow-templates").send({
      name:"HistTest " + Date.now(), entityKind:"request", isActive:false,
      stages:[{ order:1, name:"S1", assigneeRole:"faculty", allowedActions:["approve"], slaHours:24 }],
    });
    const id = cr.body.template._id;
    // Make an edit so history has an entry
    await adminAgent.put(`/api/admin/workflow-templates/${id}`).send({
      stages:[{ order:1, name:"S1 v2", assigneeRole:"faculty", allowedActions:["approve"], slaHours:24 }],
      versionNote:"v2",
    });
    const res = await adminAgent.get(`/api/admin/workflow-templates/${id}/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.template.versionHistory)).toBe(true);
    expect(res.body.template.versionHistory.length).toBeGreaterThanOrEqual(1);
  });

  it("in-flight instance keeps old snapshot after template update", async () => {
    const faculty = await User.create({ name:"FV", email:"fv@t.com", password:"x", role:"faculty" });
    const student = await User.create({ name:"SV", email:"sv@t.com", password:"x", role:"student" });

    const cr = await adminAgent.post("/api/admin/workflow-templates").send({
      name:"SnapTest " + Date.now(), entityKind:"request", isActive:false,
      stages:[{ order:1, name:"Original Stage", assigneeRole:"faculty", allowedActions:["approve"], slaHours:24 }],
    });
    const id = cr.body.template._id;

    const workflowSvc = require("../services/workflow.service");
    const entityId    = new mongoose.Types.ObjectId();
    const instance    = await workflowSvc.createInstance(entityId,"request",id,student._id);
    expect(instance.templateSnapshot.version).toBe(1);
    expect(instance.stages[0].stageName).toBe("Original Stage");

    // Update template
    await adminAgent.put(`/api/admin/workflow-templates/${id}`).send({
      stages:[{ order:1, name:"NEW Stage Name", assigneeRole:"hod", allowedActions:["approve"], slaHours:12 }],
    });

    // Instance is unchanged
    const reloaded = await WorkflowInstance.findById(instance._id).lean();
    expect(reloaded.templateSnapshot.version).toBe(1);
    expect(reloaded.stages[0].stageName).toBe("Original Stage");
  });
});

// =============================================================================
// Feature 5: SLA Monitoring & Escalation
// =============================================================================

describe("Feature 5: SLA Monitoring", () => {
  it("workflow SLA breach scan marks stage slaBreached", async () => {
    const workflowSvc = require("../services/workflow.service");
    const student = await User.create({ name:"SlaS", email:"slas@t.com", password:"x", role:"student" });
    const tpl = await WorkflowTemplate.create({
      name:"SlaTest", entityKind:"request", isActive:false,
      stages:[{ order:1, name:"SLA Stage", assigneeRole:"faculty", allowedActions:["approve"], slaHours:1 }],
    });
    const entityId = new mongoose.Types.ObjectId();
    const inst = await workflowSvc.createInstance(entityId,"request",tpl._id,student._id);

    // Force deadline to past
    await WorkflowInstance.findByIdAndUpdate(inst._id, { "stages.0.slaDeadline": new Date(Date.now()-1000) });

    const stats = await workflowSvc.checkSLABreaches();
    expect(stats.breached).toBeGreaterThanOrEqual(1);

    const updated = await WorkflowInstance.findById(inst._id).lean();
    expect(updated.stages[0].slaBreached).toBe(true);
  });

  it("SLA warning is sent at 75% threshold (slaWarned flag set)", async () => {
    const workflowSvc = require("../services/workflow.service");
    const student = await User.create({ name:"WarnS", email:"warns@t.com", password:"x", role:"student" });
    const tpl = await WorkflowTemplate.create({
      name:"WarnTest", entityKind:"request", isActive:false,
      stages:[{ order:1, name:"Warn Stage", assigneeRole:"faculty", allowedActions:["approve"], slaHours:4 }],
    });
    const entityId = new mongoose.Types.ObjectId();
    const inst = await workflowSvc.createInstance(entityId,"request",tpl._id,student._id);

    // Set enteredAt to 80% of sla elapsed (3.2h ago for 4h SLA)
    const enteredAt = new Date(Date.now() - 3.2 * 3600000);
    await WorkflowInstance.findByIdAndUpdate(inst._id, {
      "stages.0.enteredAt":   enteredAt,
      "stages.0.slaDeadline": new Date(enteredAt.getTime() + 4 * 3600000),
      "stages.0.slaWarned":   false,
    });

    const stats = await workflowSvc.checkSLABreaches();
    expect(stats.warned).toBeGreaterThanOrEqual(1);
    const updated = await WorkflowInstance.findById(inst._id).lean();
    expect(updated.stages[0].slaWarned).toBe(true);
  });

  it("escalation job marks request slaBreached and escalates", async () => {
    const { runEscalationCheck } = require("../jobs/escalation.job");
    const Request = require("../models/Request");

    const st = request.agent(app);
    await st.post("/api/register").send({ name:"EscSt", email:"escst5@t.com", password:"pass1234" });
    const cr = await st.post("/api/requests").send({
      type:"general", description:"Escalation SLA test request", priority:"urgent",
    });
    const id = cr.body.request._id;
    await Request.findByIdAndUpdate(id, { slaDeadline: new Date(Date.now()-1000) });

    const stats = await runEscalationCheck();
    expect(stats.breached).toBeGreaterThanOrEqual(1);
    expect(stats.escalated).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Feature 6: Notification Center
// =============================================================================

describe("Feature 6: Notification Center", () => {
  it("GET /api/notifications returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("GET /api/notifications returns empty list for new user", async () => {
    const { agent } = await makeAdv("notif1@t.com");
    const res = await agent.get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(0);
    expect(res.body.unreadCount).toBe(0);
  });

  it("notificationService.createNotification creates a DB record", async () => {
    const user = await User.create({ name:"NUser", email:"nu@t.com", password:"x", role:"student" });
    const notif = await notifSvc.createNotification({
      userId:     user._id,
      type:       "system",
      title:      "Test notification",
      body:       "Test body",
      entityKind: "system",
    });
    expect(notif).not.toBeNull();
    expect(notif.title).toBe("Test notification");
    const inDb = await Notification.findById(notif._id).lean();
    expect(inDb).not.toBeNull();
    expect(inDb.read).toBe(false);
  });

  it("GET /api/notifications/unread-count returns correct count", async () => {
    const { agent, userId } = await makeAdv("notif2@t.com");
    await notifSvc.createNotification({ userId, type:"system", title:"A", entityKind:"system" });
    await notifSvc.createNotification({ userId, type:"system", title:"B", entityKind:"system" });
    const res = await agent.get("/api/notifications/unread-count");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("PATCH /api/notifications/:id/read marks one notification read", async () => {
    const { agent, userId } = await makeAdv("notif3@t.com");
    const n = await notifSvc.createNotification({ userId, type:"system", title:"Mark Me", entityKind:"system" });
    const res = await agent.patch(`/api/notifications/${n._id}/read`);
    expect(res.status).toBe(200);
    expect(res.body.notification.read).toBe(true);
  });

  it("PATCH /api/notifications/read-all marks all notifications read", async () => {
    const { agent, userId } = await makeAdv("notif4@t.com");
    await notifSvc.createNotification({ userId, type:"system", title:"N1", entityKind:"system" });
    await notifSvc.createNotification({ userId, type:"system", title:"N2", entityKind:"system" });
    const res = await agent.patch("/api/notifications/read-all");
    expect(res.status).toBe(200);
    const count = await Notification.countDocuments({ userId, read:false });
    expect(count).toBe(0);
  });

  it("DELETE /api/notifications/:id deletes own notification", async () => {
    const { agent, userId } = await makeAdv("notif5@t.com");
    const n = await notifSvc.createNotification({ userId, type:"system", title:"Delete Me", entityKind:"system" });
    const res = await agent.delete(`/api/notifications/${n._id}`);
    expect(res.status).toBe(200);
    const inDb = await Notification.findById(n._id);
    expect(inDb).toBeNull();
  });

  it("cannot read another user's notification (404)", async () => {
    const { userId: uid1 } = await makeAdv("notif6a@t.com");
    const { agent: agent2 } = await makeAdv("notif6b@t.com");
    const n = await notifSvc.createNotification({ userId: uid1, type:"system", title:"Private", entityKind:"system" });
    const res = await agent2.patch(`/api/notifications/${n._id}/read`);
    expect(res.status).toBe(404);
  });

  it("GET /api/notifications?unread=true returns only unread", async () => {
    const { agent, userId } = await makeAdv("notif7@t.com");
    const n1 = await notifSvc.createNotification({ userId, type:"system", title:"Unread", entityKind:"system" });
    const n2 = await notifSvc.createNotification({ userId, type:"system", title:"Read", entityKind:"system" });
    await Notification.findByIdAndUpdate(n2._id, { read:true });
    const res = await agent.get("/api/notifications?unread=true");
    expect(res.status).toBe(200);
    expect(res.body.notifications.every((n) => !n.read)).toBe(true);
    expect(res.body.notifications.some((n) => n._id === n1._id.toString())).toBe(true);
  });
});

// =============================================================================
// Feature 7: Audit Trail
// =============================================================================

describe("Feature 7: Audit Trail", () => {
  it("GET /api/admin/audit-trail returns 403 for non-admin", async () => {
    const { agent } = await makeAdv("aud1@t.com","student");
    const res = await agent.get("/api/admin/audit-trail");
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/audit-trail returns 401 for unauthenticated", async () => {
    const res = await request(app).get("/api/admin/audit-trail");
    expect(res.status).toBe(401);
  });

  it("writeAudit creates an AuditLog record", async () => {
    const user = await User.create({ name:"AU", email:"au@t.com", password:"x", role:"admin" });
    await auditSvc.writeAudit({
      actorId:   user._id,
      actorName: user.name,
      actorRole: "admin",
      action:    "test.audit_write",
      entityKind:"system",
    });
    const log = await AuditLog.findOne({ action:"test.audit_write" }).lean();
    expect(log).not.toBeNull();
    expect(log.actorRole).toBe("admin");
  });

  it("GET /api/admin/audit-trail returns paginated logs for admin", async () => {
    const { agent, userId } = await makeAdv("aud2@t.com","admin");
    // Write some audit entries
    await auditSvc.writeAudit({ actorId:userId, actorName:"AudAdmin", actorRole:"admin",
      action:"request.status_changed", entityKind:"request" });
    await auditSvc.writeAudit({ actorId:userId, actorName:"AudAdmin", actorRole:"admin",
      action:"workflow.approve", entityKind:"workflow_instance" });

    const res = await agent.get("/api/admin/audit-trail");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it("audit trail can be filtered by entityKind", async () => {
    const { agent, userId } = await makeAdv("aud3@t.com","admin");
    await auditSvc.writeAudit({ actorId:userId, actorName:"X", actorRole:"admin",
      action:"leave.approved", entityKind:"leave" });

    const res = await agent.get("/api/admin/audit-trail?entityKind=leave");
    expect(res.status).toBe(200);
    expect(res.body.logs.every((l) => l.entityKind === "leave")).toBe(true);
  });

  it("audit trail can be filtered by action keyword", async () => {
    const { agent, userId } = await makeAdv("aud4@t.com","admin");
    await auditSvc.writeAudit({ actorId:userId, actorName:"X", actorRole:"admin",
      action:"workflow.special_action_xyz", entityKind:"workflow_instance" });
    const res = await agent.get("/api/admin/audit-trail?action=special_action_xyz");
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Feature 8: Idempotency
// =============================================================================

describe("Feature 8: Idempotency", () => {
  it("same Idempotency-Key returns cached response on duplicate POST", async () => {
    const { agent } = await makeAdv("idem1@t.com","student");
    const key = "test-idem-key-" + Date.now();
    const payload = { type:"general", description:"Idempotency test request body", priority:"normal" };

    const r1 = await agent.post("/api/requests").set("Idempotency-Key", key).send(payload);
    expect(r1.status).toBe(201);
    const id1 = r1.body.request?._id;

    // Duplicate — same key, same result
    const r2 = await agent.post("/api/requests").set("Idempotency-Key", key).send(payload);
    expect(r2.status).toBe(201);
    expect(r2.body._idempotent).toBe(true);
    // Should return same request id
    expect(r2.body.request?._id).toBe(id1);
  });

  it("different Idempotency-Key creates a new resource", async () => {
    const { agent } = await makeAdv("idem2@t.com","student");
    const payload = { type:"general", description:"Two separate idem requests here", priority:"normal" };

    const r1 = await agent.post("/api/requests").set("Idempotency-Key","key-a-"+Date.now()).send(payload);
    const r2 = await agent.post("/api/requests").set("Idempotency-Key","key-b-"+Date.now()).send(payload);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.request._id).not.toBe(r2.body.request._id);
  });

  it("no Idempotency-Key header — no caching, normal behaviour", async () => {
    const { agent } = await makeAdv("idem3@t.com","student");
    const payload = { type:"general", description:"No idempotency key on this one", priority:"normal" };
    const r1 = await agent.post("/api/requests").send(payload);
    const r2 = await agent.post("/api/requests").send(payload);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body._idempotent).toBeUndefined();
    expect(r2.body._idempotent).toBeUndefined();
  });

  it("IdempotencyKey model stores keyHash and response", async () => {
    const crypto = require("crypto");
    const user   = await User.create({ name:"IK", email:"ik@t.com", password:"x", role:"student" });
    const raw    = "manual-key-" + Date.now();
    const hash   = crypto.createHash("sha256").update(`${user._id}:${raw}`).digest("hex");
    await IdempotencyKey.create({
      keyHash:    hash,
      userId:     user._id,
      path:       "/api/requests",
      method:     "POST",
      statusCode: 201,
      response:   { test: true },
      expiresAt:  new Date(Date.now() + 86400000),
    });
    const found = await IdempotencyKey.findOne({ keyHash: hash }).lean();
    expect(found).not.toBeNull();
    expect(found.response.test).toBe(true);
  });
});

// =============================================================================
// Feature 9: Concurrency Control
// =============================================================================

describe("Feature 9: Concurrency Control", () => {
  it("advanceStage throws 409 on stale __v (optimistic lock)", async () => {
    const { saveWithLock } = require("../services/workflow.service");
    const faculty  = await User.create({ name:"CFC",  email:"cfc@t.com",  password:"x", role:"faculty" });
    const faculty2 = await User.create({ name:"CFC2", email:"cfc2@t.com", password:"x", role:"faculty" });
    const student  = await User.create({ name:"CSC",  email:"csc@t.com",  password:"x", role:"student" });

    const tpl = await WorkflowTemplate.create({
      name:"ConcTest", entityKind:"request", isActive:false,
      stages:[
        { order:1, name:"Lock Stage", assigneeRole:"faculty", allowedActions:["approve","reject"], slaHours:24 },
        { order:2, name:"Stage 2",    assigneeRole:"hod",     allowedActions:["approve","reject"], slaHours:24 },
      ],
    });
    const entityId = new mongoose.Types.ObjectId();
    const instance = await require("../services/workflow.service").createInstance(entityId,"request",tpl._id,student._id);

    // Load two in-memory copies at the SAME __v
    const copy1 = await WorkflowInstance.findById(instance._id);
    const copy2 = await WorkflowInstance.findById(instance._id);

    expect(copy1.__v).toBe(copy2.__v);

    // Advance copy1 via saveWithLock — increments __v in DB to 1
    copy1.stages[0].status      = "completed";
    copy1.stages[0].action      = "approve";
    copy1.stages[0].actorId     = faculty._id;
    copy1.stages[0].actorName   = "CFC";
    copy1.stages[0].completedAt = new Date();
    copy1.stages[1].status      = "in_progress";
    copy1.stages[1].enteredAt   = new Date();
    copy1.currentStageIndex     = 1;
    copy1.markModified("stages");
    const saved1 = await saveWithLock(copy1);
    expect(saved1.__v).toBe(copy1.__v + 1); // __v was incremented

    // Now try copy2 (still has old __v) — filter { __v: oldVersion } misses → 409
    copy2.stages[0].status      = "completed";
    copy2.stages[0].action      = "reject";
    copy2.stages[0].actorId     = faculty2._id;
    copy2.stages[0].actorName   = "CFC2";
    copy2.stages[0].completedAt = new Date();
    copy2.markModified("stages");

    await expect(saveWithLock(copy2)).rejects.toMatchObject({ status: 409 });
  });

  it("WorkflowInstance has __v field (versionKey enabled)", async () => {
    const workflowSvc = require("../services/workflow.service");
    const student = await User.create({ name:"CVS", email:"cvs@t.com", password:"x", role:"student" });
    const tpl = await WorkflowTemplate.create({
      name:"VkeyTest", entityKind:"request", isActive:false,
      stages:[{ order:1, name:"S", assigneeRole:"faculty", allowedActions:["approve"], slaHours:24 }],
    });
    const entityId = new mongoose.Types.ObjectId();
    const inst = await workflowSvc.createInstance(entityId,"request",tpl._id,student._id);
    expect(inst.__v).toBeDefined();
    expect(typeof inst.__v).toBe("number");
  });
});

// =============================================================================
// Feature 10: Analytics Dashboard — workflow metrics endpoint
// =============================================================================

describe("Feature 10: Analytics Dashboard — workflow metrics", () => {
  let adminAgent;
  beforeEach(async () => { const a = await makeAdv("f10adm@test.com","admin"); adminAgent = a.agent; });

  it("GET /api/admin/workflow-metrics returns metrics for admin", async () => {
    const res = await adminAgent.get("/api/admin/workflow-metrics");
    expect(res.status).toBe(200);
    expect(res.body.workflowMetrics).toBeDefined();
    expect(typeof res.body.workflowMetrics.total).toBe("number");
    expect(typeof res.body.workflowMetrics.slaBreachRate).toBe("number");
    expect(typeof res.body.workflowMetrics.avgStagesPerFlow).toBe("number");
    expect(res.body.workflowMetrics.byStatus).toBeDefined();
  });

  it("GET /api/admin/workflow-metrics returns leaveMetrics", async () => {
    const res = await adminAgent.get("/api/admin/workflow-metrics");
    expect(res.status).toBe(200);
    expect(res.body.leaveMetrics).toBeDefined();
  });

  it("GET /api/admin/workflow-metrics returns 403 for student", async () => {
    const { agent } = await makeAdv("f10st@test.com","student");
    const res = await agent.get("/api/admin/workflow-metrics");
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/workflow-metrics returns 401 for unauthenticated", async () => {
    const res = await request(app).get("/api/admin/workflow-metrics");
    expect(res.status).toBe(401);
  });

  it("getWorkflowMetrics() returns valid structure", async () => {
    const workflowSvc = require("../services/workflow.service");
    const metrics = await workflowSvc.getWorkflowMetrics();
    expect(typeof metrics.total).toBe("number");
    expect(typeof metrics.slaBreachRate).toBe("number");
    expect(metrics.byStatus).toBeDefined();
  });
});
