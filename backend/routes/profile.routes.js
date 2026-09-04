const express = require("express");

const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const publicUser = require("../utils/publicUser");

const router = express.Router();

const MAX_LEN = {
  name: 100,
  phoneNumber: 30,
  department: 100,
  semester: 30,
  avatar: 2048,
};

// Only these fields may ever be edited through this endpoint. Email and
// password are intentionally excluded so Phase 1 auth cannot be tampered
// with via the profile form.
function validateProfileInput(body) {
  const errors = [];
  const fields = {};

  if (body.name !== undefined) {
    const v = String(body.name).trim();
    if (!v) errors.push("Name cannot be empty");
    else if (v.length > MAX_LEN.name) errors.push(`Name must be under ${MAX_LEN.name} characters`);
    fields.name = v;
  }

  if (body.phoneNumber !== undefined) {
    const v = String(body.phoneNumber).trim();
    if (v.length > MAX_LEN.phoneNumber) {
      errors.push(`Phone number must be under ${MAX_LEN.phoneNumber} characters`);
    }
    fields.phoneNumber = v;
  }

  if (body.department !== undefined) {
    const v = String(body.department).trim();
    if (v.length > MAX_LEN.department) {
      errors.push(`Department must be under ${MAX_LEN.department} characters`);
    }
    fields.department = v;
  }

  if (body.semester !== undefined) {
    const v = String(body.semester).trim();
    if (v.length > MAX_LEN.semester) {
      errors.push(`Semester must be under ${MAX_LEN.semester} characters`);
    }
    fields.semester = v;
  }

  if (body.avatar !== undefined) {
    const v = String(body.avatar).trim();
    if (v.length > MAX_LEN.avatar) {
      errors.push(`Avatar URL must be under ${MAX_LEN.avatar} characters`);
    } else if (v && !/^https?:\/\//i.test(v)) {
      errors.push("Avatar must be a valid URL starting with http:// or https://");
    }
    fields.avatar = v;
  }

  return { errors, fields };
}

// GET /api/profile — view own profile
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/profile — edit own profile only
router.put("/", requireAuth, async (req, res, next) => {
  try {
    const { errors, fields } = validateProfileInput(req.body || {});
    if (errors.length) {
      return res.status(400).json({ message: errors.join(", ") });
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ message: "No profile fields provided" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    Object.assign(user, fields);
    await user.save();

    res.json({ message: "Profile updated", user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
