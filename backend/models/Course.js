const mongoose = require("mongoose");

// Each course belongs to the student (User) who created it, so every user
// manages their own course list. This matches the Dashboard requirement of
// showing "total course count" for the logged-in student.
const courseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    instructor: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    credits: {
      type: Number,
      required: true,
      min: 0,
      max: 12,
    },
    semester: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

courseSchema.index({ owner: 1, code: 1 });

module.exports = mongoose.model("Course", courseSchema);
