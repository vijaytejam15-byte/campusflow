/**
 * publicUser — return a safe user object, never exposing the password hash.
 * The role field is included so the frontend can enforce role-based routing.
 */
function publicUser(user) {
  // leaveBalance can be:
  //   - a Mongoose Map (full document)  → has .entries() iterable
  //   - a plain object  (lean document) → iterable via Object.entries
  //   - undefined/null  (old documents before schema update)
  let leaveBalance = {};
  try {
    const lb = user.leaveBalance;
    if (!lb) {
      leaveBalance = {};
    } else if (typeof lb.entries === "function") {
      // Mongoose Map
      leaveBalance = Object.fromEntries(lb);
    } else if (lb.constructor === Object || lb instanceof Map) {
      leaveBalance = lb instanceof Map
        ? Object.fromEntries(lb)
        : lb;
    } else {
      leaveBalance = {};
    }
  } catch {
    leaveBalance = {};
  }

  return {
    id:           user._id,
    name:         user.name,
    email:        user.email,
    role:         user.role         || "student",
    phoneNumber:  user.phoneNumber  || "",
    department:   user.department   || "",
    semester:     user.semester     || "",
    avatar:       user.avatar       || "",
    rollNumber:   user.rollNumber   || "",
    year:         user.year         || "",
    advisorId:    user.advisorId    || null,
    leaveBalance,
    createdAt:    user.createdAt,
    updatedAt:    user.updatedAt,
  };
}

module.exports = publicUser;
