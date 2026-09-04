const express = require("express");
const mongoose = require("mongoose");

const Course = require("../models/Course");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const LIMITS = {
  name: 150,
  code: 20,
  instructor: 100,
  semester: 30,
  description: 2000,
};

// `partial: true` is used for PUT, where any subset of fields may be sent.
function validateCourseInput(body, { partial = false } = {}) {
  const errors = [];
  const fields = {};

  const provided = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const shouldCheck = (key) => (partial ? provided(key) : true);

  if (shouldCheck("name")) {
    const v = provided("name") ? String(body.name).trim() : "";
    if (!v) errors.push("Course name is required");
    else if (v.length > LIMITS.name) errors.push(`Course name must be under ${LIMITS.name} characters`);
    if (provided("name")) fields.name = v;
  }

  if (shouldCheck("code")) {
    const v = provided("code") ? String(body.code).trim().toUpperCase() : "";
    if (!v) errors.push("Course code is required");
    else if (v.length > LIMITS.code) errors.push(`Course code must be under ${LIMITS.code} characters`);
    if (provided("code")) fields.code = v;
  }

  if (shouldCheck("instructor")) {
    const v = provided("instructor") ? String(body.instructor).trim() : "";
    if (!v) errors.push("Instructor is required");
    else if (v.length > LIMITS.instructor) {
      errors.push(`Instructor must be under ${LIMITS.instructor} characters`);
    }
    if (provided("instructor")) fields.instructor = v;
  }

  if (shouldCheck("credits")) {
    if (!provided("credits") || body.credits === null || body.credits === "") {
      errors.push("Credits is required");
    } else {
      const v = Number(body.credits);
      if (Number.isNaN(v) || v < 0 || v > 12) {
        errors.push("Credits must be a number between 0 and 12");
      } else {
        fields.credits = v;
      }
    }
  }

  if (shouldCheck("semester")) {
    const v = provided("semester") ? String(body.semester).trim() : "";
    if (!v) errors.push("Semester is required");
    else if (v.length > LIMITS.semester) errors.push(`Semester must be under ${LIMITS.semester} characters`);
    if (provided("semester")) fields.semester = v;
  }

  if (provided("description")) {
    const v = String(body.description).trim();
    if (v.length > LIMITS.description) {
      errors.push(`Description must be under ${LIMITS.description} characters`);
    }
    fields.description = v;
  }

  return { errors, fields };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/courses?search=term — list the authenticated user's own courses
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = { owner: req.userId };

    if (search && String(search).trim()) {
      const term = escapeRegex(String(search).trim().slice(0, 100));
      const regex = new RegExp(term, "i");
      query.$or = [{ name: regex }, { code: regex }, { instructor: regex }];
    }

    const courses = await Course.find(query).sort({ createdAt: -1 });
    res.json({ courses, count: courses.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/courses/:id — a single course, only if owned by the requester
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id" });
    }
    const course = await Course.findOne({ _id: req.params.id, owner: req.userId });
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    res.json({ course });
  } catch (error) {
    next(error);
  }
});

// POST /api/courses — create a course owned by the authenticated user
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { errors, fields } = validateCourseInput(req.body || {});
    if (errors.length) {
      return res.status(400).json({ message: errors.join(", ") });
    }

    // Enforce per-user uniqueness of course code
    const existing = await Course.findOne({ owner: req.userId, code: fields.code });
    if (existing) {
      return res.status(409).json({ message: "You already have a course with this code" });
    }

    const course = new Course({ ...fields, owner: req.userId });
    await course.save();

    res.status(201).json({ message: "Course created", course });
  } catch (error) {
    next(error);
  }
});

// PUT /api/courses/:id — update, only if owned by the requester
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id" });
    }

    const { errors, fields } = validateCourseInput(req.body || {}, { partial: true });
    if (errors.length) {
      return res.status(400).json({ message: errors.join(", ") });
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ message: "No course fields provided" });
    }

    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      fields,
      { new: true, runValidators: true }
    );
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json({ message: "Course updated", course });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/courses/:id — delete, only if owned by the requester
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id" });
    }

    const course = await Course.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json({ message: "Course deleted" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
