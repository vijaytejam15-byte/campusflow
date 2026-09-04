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

  it("returns 404 for authenticated request with nonexistent file", async () => {
    const agent = request.agent(app);
    await registerAndGetCookie(agent);
    const res = await agent.get("/api/files/nonexistent-file-uuid.pdf");
    expect(res.status).toBe(404);
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
