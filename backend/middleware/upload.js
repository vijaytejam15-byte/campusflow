/**
 * upload.js — Secure file upload middleware using Multer.
 *
 * Storage strategy:
 *   Development: local disk at ./uploads/  (created automatically)
 *   Production:  swap storageEngine below for an S3/GCS multer storage adapter
 *                without changing any route code.
 *
 * Validations enforced:
 *   • Allowed MIME types: PDF, Word, images (JPEG/PNG), plain text
 *   • Max file size: 5 MB per file
 *   • Max 5 files per request
 *   • Unique filenames (UUID) to prevent collisions and path traversal
 */

const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const { v4: uuidv4 } = require("uuid");
const logger = require("../config/logger");

const UPLOAD_DIR  = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const MAX_SIZE_MB  = Number(process.env.MAX_FILE_SIZE_MB) || 5;
const MAX_FILES    = Number(process.env.MAX_FILES)        || 5;

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

const storageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const safe     = `${uuidv4()}${ext}`;
    cb(null, safe);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(
      new Error(`File type "${file.mimetype}" is not allowed. Allowed: PDF, Word, JPEG, PNG, TXT`),
      { status: 400 }
    ));
  }
}

const upload = multer({
  storage:  storageEngine,
  limits:   { fileSize: MAX_SIZE_MB * 1024 * 1024, files: MAX_FILES },
  fileFilter,
});

/**
 * Middleware: upload up to MAX_FILES files under the field name "documents"
 * Attaches req.uploadedFiles: [{ filename, originalName, mimeType, size }]
 */
function uploadDocuments(req, res, next) {
  upload.array("documents", MAX_FILES)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const msg = err.code === "LIMIT_FILE_SIZE"
          ? `File too large. Maximum size is ${MAX_SIZE_MB} MB`
          : err.message;
        return res.status(400).json({ message: msg });
      }
      logger.warn("[Upload] File rejected", { error: err.message });
      return res.status(err.status || 400).json({ message: err.message });
    }

    req.uploadedFiles = (req.files || []).map((f) => ({
      filename:     f.filename,
      originalName: f.originalname.slice(0, 255),
      mimeType:     f.mimetype,
      size:         f.size,
      path:         f.path,
    }));

    next();
  });
}

/**
 * Serve a file securely — only to authenticated users who own the resource.
 * Call after verifying ownership in the route handler.
 */
function serveFile(filename, res) {
  const filePath = path.join(UPLOAD_DIR, path.basename(filename));
  if (!filePath.startsWith(UPLOAD_DIR)) {
    return res.status(400).json({ message: "Invalid filename" });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }
  res.sendFile(filePath);
}

module.exports = { uploadDocuments, serveFile, UPLOAD_DIR };
