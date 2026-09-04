/**
 * swagger.js — OpenAPI 3.0 documentation for the CampusFlow API.
 *
 * Served at GET /api/docs  (Swagger UI)
 * Raw spec at  GET /api/docs/json
 */
const swaggerJsdoc  = require("swagger-jsdoc");
const swaggerUi     = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title:       "CampusFlow API",
      version:     "2.0.0",
      description: [
        "REST API for CampusFlow — a university request management system.",
        "",
        "**Authentication:** All protected endpoints require a valid JWT stored in an",
        "HTTP-only cookie (`token`). Obtain the cookie by calling `POST /api/login`.",
        "",
        "**Roles:** `student` | `faculty` | `hod` | `admin`",
      ].join("\n"),
      contact: { name: "CampusFlow Team" },
    },
    servers: [
      { url: "http://localhost:5000", description: "Local development" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in:   "cookie",
          name: "token",
          description: "HTTP-only JWT cookie. Set automatically after login.",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id:          { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            name:        { type: "string", example: "Alice Student" },
            email:       { type: "string", example: "alice@university.edu" },
            role:        { type: "string", enum: ["student","faculty","hod","admin"] },
            department:  { type: "string", example: "Computer Science" },
            semester:    { type: "string", example: "Fall 2026" },
            phoneNumber: { type: "string", example: "+1 555 123 4567" },
            avatar:      { type: "string", example: "https://example.com/avatar.png" },
            createdAt:   { type: "string", format: "date-time" },
          },
        },
        Request: {
          type: "object",
          properties: {
            _id:         { type: "string" },
            student:     { $ref: "#/components/schemas/User" },
            type:        { type: "string", enum: ["transcript","enrollment_verification","leave_of_absence","grade_appeal","financial_aid","course_withdrawal","general"] },
            description: { type: "string" },
            department:  { type: "string" },
            priority:    { type: "string", enum: ["low","normal","high","urgent"] },
            status:      { type: "string", enum: ["pending","in_review","approved","rejected","escalated","closed"] },
            slaDeadline: { type: "string", format: "date-time" },
            slaBreached: { type: "boolean" },
            autoEscalated: { type: "boolean" },
            staffNote:   { type: "string" },
            assignedTo:  { $ref: "#/components/schemas/User" },
            comments:    { type: "array", items: { $ref: "#/components/schemas/Comment" } },
            createdAt:   { type: "string", format: "date-time" },
          },
        },
        Comment: {
          type: "object",
          properties: {
            _id:            { type: "string" },
            userName:       { type: "string" },
            role:           { type: "string" },
            comment:        { type: "string" },
            action:         { type: "string", enum: ["comment","approve","reject","escalate","reopen","close"] },
            statusSnapshot: { type: "string" },
            createdAt:      { type: "string", format: "date-time" },
          },
        },
        Course: {
          type: "object",
          properties: {
            _id:         { type: "string" },
            name:        { type: "string" },
            code:        { type: "string" },
            instructor:  { type: "string" },
            credits:     { type: "number" },
            semester:    { type: "string" },
            description: { type: "string" },
            owner:       { type: "string" },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: { type: "string", example: "Validation error" },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            total:      { type: "integer" },
            page:       { type: "integer" },
            limit:      { type: "integer" },
            totalPages: { type: "integer" },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }],
    tags: [
      { name: "Auth",        description: "Register, login, logout, session" },
      { name: "Profile",     description: "View and update your profile" },
      { name: "Courses",     description: "Course CRUD (per user)" },
      { name: "Requests",    description: "Student request workflow" },
      { name: "Admin",       description: "Admin-only management endpoints" },
      { name: "Analytics",   description: "Admin analytics and reporting" },
      { name: "System",      description: "Health check" },
    ],
    paths: {
      // ── System ──────────────────────────────────────────────────────────────
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          security: [],
          responses: {
            200: { description: "Service is healthy", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "ok" } } } } } },
          },
        },
      },

      // ── Auth ────────────────────────────────────────────────────────────────
      "/api/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new student account",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name","email","password"],
                  properties: {
                    name:        { type: "string", example: "Alice Student" },
                    email:       { type: "string", example: "alice@university.edu" },
                    password:    { type: "string", minLength: 6 },
                    phoneNumber: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Registered and logged in. Auth cookie set." },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            409: { description: "Email already registered" },
          },
        },
      },
      "/api/login": {
        post: {
          tags: ["Auth"],
          summary: "Login with email and password",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email","password"],
                  properties: {
                    email:    { type: "string" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful. Auth cookie set." },
            400: { description: "Missing fields" },
            401: { description: "Invalid credentials" },
          },
        },
      },
      "/api/me": {
        get: {
          tags: ["Auth"],
          summary: "Get current authenticated user",
          responses: {
            200: { description: "Current user", content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } } },
            401: { description: "Not authenticated" },
          },
        },
      },
      "/api/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout and clear session cookie",
          responses: {
            200: { description: "Logged out" },
          },
        },
      },

      // ── Profile ─────────────────────────────────────────────────────────────
      "/api/profile": {
        get: {
          tags: ["Profile"],
          summary: "View your profile",
          responses: {
            200: { description: "Profile", content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } } },
            401: { description: "Not authenticated" },
          },
        },
        put: {
          tags: ["Profile"],
          summary: "Update your profile",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name:        { type: "string" },
                    phoneNumber: { type: "string" },
                    department:  { type: "string" },
                    semester:    { type: "string" },
                    avatar:      { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Profile updated" },
            400: { description: "Validation error" },
            401: { description: "Not authenticated" },
          },
        },
      },

      // ── Courses ─────────────────────────────────────────────────────────────
      "/api/courses": {
        get: {
          tags: ["Courses"],
          summary: "List your courses",
          parameters: [{ name: "search", in: "query", schema: { type: "string" } }],
          responses: {
            200: { description: "Course list" },
            401: { description: "Not authenticated" },
          },
        },
        post: {
          tags: ["Courses"],
          summary: "Create a course",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name","code","instructor","credits","semester"],
                  properties: {
                    name:       { type: "string" },
                    code:       { type: "string" },
                    instructor: { type: "string" },
                    credits:    { type: "number", minimum: 0, maximum: 12 },
                    semester:   { type: "string" },
                    description:{ type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Course created" },
            400: { description: "Validation error" },
            409: { description: "Duplicate course code" },
          },
        },
      },

      // ── Requests ────────────────────────────────────────────────────────────
      "/api/requests": {
        get: {
          tags: ["Requests"],
          summary: "Student: list own requests",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "type",   in: "query", schema: { type: "string" } },
            { name: "page",   in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit",  in: "query", schema: { type: "integer", default: 10 } },
          ],
          responses: {
            200: { description: "Paginated request list" },
            401: { description: "Not authenticated" },
          },
        },
        post: {
          tags: ["Requests"],
          summary: "Student: submit a new request",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type","description"],
                  properties: {
                    type:        { type: "string", enum: ["transcript","enrollment_verification","leave_of_absence","grade_appeal","financial_aid","course_withdrawal","general"] },
                    description: { type: "string", minLength: 1, maxLength: 3000 },
                    department:  { type: "string" },
                    priority:    { type: "string", enum: ["low","normal","high","urgent"], default: "normal" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Request submitted" },
            400: { description: "Validation error" },
            401: { description: "Not authenticated" },
          },
        },
      },
      "/api/requests/pending": {
        get: {
          tags: ["Requests"],
          summary: "Reviewer: get pending requests queue",
          description: "**Required roles:** faculty, hod, admin. Results are scoped by role and department.",
          parameters: [
            { name: "type",     in: "query", schema: { type: "string" } },
            { name: "priority", in: "query", schema: { type: "string" } },
            { name: "search",   in: "query", schema: { type: "string" } },
            { name: "page",     in: "query", schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Pending requests" },
            401: { description: "Not authenticated" },
            403: { description: "Reviewer role required" },
          },
        },
      },
      "/api/requests/{id}/status": {
        patch: {
          tags: ["Requests"],
          summary: "Reviewer: update request status",
          description: "**Required roles:** faculty, hod, admin",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status:  { type: "string", enum: ["in_review","approved","rejected","escalated","closed"] },
                    comment: { type: "string", maxLength: 2000 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Request updated" },
            400: { description: "Invalid transition or missing comment" },
            403: { description: "Reviewer role required" },
            404: { description: "Request not found" },
            409: { description: "Already in terminal status" },
          },
        },
      },
      "/api/requests/{id}/comment": {
        post: {
          tags: ["Requests"],
          summary: "Add a comment to a request",
          description: "Any authenticated user can comment. Students can only comment on their own requests.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["comment"],
                  properties: {
                    comment: { type: "string", maxLength: 2000 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Comment added" },
            400: { description: "Empty or too-long comment" },
            404: { description: "Request not found" },
          },
        },
      },

      // ── Admin ────────────────────────────────────────────────────────────────
      "/api/admin/metrics": {
        get: {
          tags: ["Admin"],
          summary: "Get system-wide metrics",
          description: "**Required role:** admin",
          responses: {
            200: { description: "Metrics object" },
            403: { description: "Admin only" },
          },
        },
      },
      "/api/admin/analytics": {
        get: {
          tags: ["Analytics"],
          summary: "Get detailed analytics for the admin dashboard",
          description: "**Required role:** admin. Returns department breakdown, type breakdown, monthly trends, approval rate, average processing time, SLA metrics.",
          responses: {
            200: { description: "Analytics object" },
            403: { description: "Admin only" },
          },
        },
      },
      "/api/admin/users": {
        get: {
          tags: ["Admin"],
          summary: "List all users",
          description: "**Required role:** admin",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "role",   in: "query", schema: { type: "string" } },
            { name: "page",   in: "query", schema: { type: "integer" } },
            { name: "limit",  in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Paginated user list" }, 403: { description: "Admin only" } },
        },
        post: {
          tags: ["Admin"],
          summary: "Create a user account",
          description: "**Required role:** admin",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name","email","password"],
                  properties: {
                    name: { type: "string" }, email: { type: "string" },
                    password: { type: "string" }, role: { type: "string" }, department: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "User created" }, 409: { description: "Email exists" } },
        },
      },
      "/api/admin/users/{id}/role": {
        patch: {
          tags: ["Admin"],
          summary: "Change a user's role",
          description: "**Required role:** admin",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["student","faculty","hod","admin"] } } },
              },
            },
          },
          responses: { 200: { description: "Role updated" }, 400: { description: "Invalid role" }, 409: { description: "Cannot change own role" } },
        },
      },
      "/api/admin/users/{id}": {
        delete: {
          tags: ["Admin"],
          summary: "Delete a user account",
          description: "**Required role:** admin",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "User deleted" }, 409: { description: "Cannot delete own account" } },
        },
      },
      "/api/admin/audit-logs": {
        get: {
          tags: ["Admin"],
          summary: "Get paginated audit log",
          description: "**Required role:** admin",
          parameters: [
            { name: "action", in: "query", schema: { type: "string" } },
            { name: "role",   in: "query", schema: { type: "string" } },
            { name: "page",   in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Audit log entries" }, 403: { description: "Admin only" } },
        },
      },
      "/api/admin/requests": {
        get: {
          tags: ["Admin"],
          summary: "List all requests system-wide",
          description: "**Required role:** admin",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "type",   in: "query", schema: { type: "string" } },
            { name: "page",   in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "All requests" }, 403: { description: "Admin only" } },
        },
      },
    },
  },
  apis: [], // paths defined inline above; no jsdoc scanning needed
};

const spec = swaggerJsdoc(options);

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(spec, {
    customSiteTitle: "CampusFlow API Docs",
    customCss: ".swagger-ui .topbar { background-color: #4f46e5; }",
  }),
  spec,
};
