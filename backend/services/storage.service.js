/**
 * storage.service.js — Cloud-agnostic file storage.
 *
 * STORAGE_DRIVER env var controls which backend is used:
 *   local  (default) — local disk, suitable for development
 *   s3               — AWS S3 or any S3-compatible service (MinIO, Cloudflare R2, etc.)
 *
 * Both backends share the same interface:
 *   saveFile(buffer, filename, mimeType)  → storedKey (string)
 *   deleteFile(storedKey)
 *   getSignedUrl(storedKey, expiresInSec) → presigned download URL
 *
 * Secure signed URLs expire after STORAGE_SIGNED_URL_TTL seconds (default 300).
 * Files are never served directly from a public URL.
 *
 * SECURITY: S3 credentials come from environment variables only, never hardcoded.
 */

const path   = require("path");
const fs     = require("fs");
const logger = require("../config/logger");

const DRIVER      = process.env.STORAGE_DRIVER       || "local";
const SIGNED_TTL  = Number(process.env.STORAGE_SIGNED_URL_TTL) || 300; // seconds

// ── Local storage ─────────────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");

if (DRIVER === "local" && !fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function localSave(buffer, filename) {
  const dest = path.join(UPLOAD_DIR, path.basename(filename));
  fs.writeFileSync(dest, buffer);
  return filename; // storedKey = filename
}

async function localDelete(storedKey) {
  const p = path.join(UPLOAD_DIR, path.basename(storedKey));
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/**
 * For local storage, signed URLs are just backend API paths.
 * The actual serving is handled by the /api/files/:key route which checks auth.
 */
async function localSignedUrl(storedKey) {
  const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${FRONTEND}/api/files/${encodeURIComponent(path.basename(storedKey))}`;
}

function localReadStream(storedKey) {
  const p = path.join(UPLOAD_DIR, path.basename(storedKey));
  if (!fs.existsSync(p)) throw Object.assign(new Error("File not found"), { status: 404 });
  return fs.createReadStream(p);
}

// ── S3 storage ─────────────────────────────────────────────────────────────────

function getS3Client() {
  const { S3Client } = require("@aws-sdk/client-s3");
  return new S3Client({
    region:   process.env.AWS_REGION     || "us-east-1",
    endpoint: process.env.AWS_ENDPOINT   || undefined, // for MinIO / R2
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: !!process.env.AWS_ENDPOINT, // required for MinIO
  });
}

const S3_BUCKET = process.env.S3_BUCKET || "campusflow-uploads";

async function s3Save(buffer, filename, mimeType) {
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const s3 = getS3Client();
  await s3.send(new PutObjectCommand({
    Bucket:      S3_BUCKET,
    Key:         filename,
    Body:        buffer,
    ContentType: mimeType,
    // Files are private by default
    ACL:         "private",
  }));
  return filename; // storedKey = S3 object key
}

async function s3Delete(storedKey) {
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: storedKey }));
}

async function s3SignedUrl(storedKey) {
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl }     = require("@aws-sdk/s3-request-presigner");
  const s3  = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: storedKey });
  return getSignedUrl(s3, cmd, { expiresIn: SIGNED_TTL });
}

// ── Public interface ──────────────────────────────────────────────────────────

/**
 * Save a file buffer.
 * @param {Buffer}  buffer
 * @param {string}  filename   unique filename (e.g. UUID + ext)
 * @param {string}  mimeType
 * @returns {Promise<string>}  storedKey to persist in DB
 */
async function saveFile(buffer, filename, mimeType) {
  try {
    if (DRIVER === "s3") return await s3Save(buffer, filename, mimeType);
    return await localSave(buffer, filename);
  } catch (err) {
    logger.error("[Storage] Save failed", { filename, error: err.message });
    throw err;
  }
}

/**
 * Delete a stored file.
 */
async function deleteFile(storedKey) {
  try {
    if (DRIVER === "s3") return await s3Delete(storedKey);
    return await localDelete(storedKey);
  } catch (err) {
    logger.error("[Storage] Delete failed", { storedKey, error: err.message });
  }
}

/**
 * Generate a short-lived signed/authenticated URL for downloading a file.
 * For local storage, returns a backend API URL (auth checked by route).
 */
async function getSignedUrl(storedKey) {
  if (DRIVER === "s3") return s3SignedUrl(storedKey);
  return localSignedUrl(storedKey);
}

/**
 * Read a local file as a stream (used by the download route for local storage).
 * For S3, redirect to the signed URL instead.
 */
function getLocalReadStream(storedKey) {
  return localReadStream(storedKey);
}

module.exports = { saveFile, deleteFile, getSignedUrl, getLocalReadStream, DRIVER, SIGNED_TTL };
