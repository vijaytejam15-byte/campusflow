import React, { useRef } from "react";

/**
 * FileUploader — lets students attach documents to a request or leave.
 *
 * Architecture
 * ────────────
 * Files are selected client-side.  Each entry in the `files` array is:
 *
 *   {
 *     originalName : string   — original filename shown in the UI
 *     mimeType     : string
 *     size         : number   — bytes
 *     _file        : File     — the raw File object (used for upload)
 *     filename     : string   — server-assigned filename after upload,
 *                               or a temp client-side key before upload
 *     uploaded     : boolean  — true once server confirmed the file
 *   }
 *
 * The parent component (CreateRequest / ApplyLeave) calls
 * `uploadFiles(fileList)` from api.js to POST the files to
 * POST /api/upload before submitting the main form.  After upload, it
 * replaces the entry's `filename` with the server key and sets
 * `uploaded = true`.  Only the `{ filename, originalName, mimeType, size }`
 * subset is sent in the JSON body to the request / leave route.
 *
 * Props
 * ─────
 * files           {object[]}  controlled file list (see shape above)
 * onFilesChange   {function}  called with updated array
 * maxFiles        {number}    max attachments (default 5)
 * maxSizeMB       {number}    max size per file in MB (default 5)
 * accept          {string}    MIME types / extensions
 * disabled        {boolean}
 */

const DEFAULT_ACCEPT    = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt";
const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_MB    = 5;

export default function FileUploader({
  files        = [],
  onFilesChange,
  maxFiles     = DEFAULT_MAX_FILES,
  maxSizeMB    = DEFAULT_MAX_MB,
  accept       = DEFAULT_ACCEPT,
  disabled     = false,
}) {
  const inputRef              = useRef(null);
  const [dragOver, setDragOver] = React.useState(false);

  const maxBytes = maxSizeMB * 1024 * 1024;

  function processFiles(rawFiles) {
    const incoming = Array.from(rawFiles);
    const errors   = [];
    const valid    = [];

    for (const f of incoming) {
      if (files.length + valid.length >= maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed.`);
        break;
      }
      if (f.size > maxBytes) {
        errors.push(`"${f.name}" exceeds the ${maxSizeMB} MB limit.`);
        continue;
      }
      // Prevent exact duplicates (same name + size)
      const isDupe = files.some(
        (ex) => ex.originalName === f.name && ex.size === f.size
      );
      if (isDupe) continue;

      valid.push({
        // Temporary client-side key — replaced with server key after upload
        filename:     `pending-${Date.now()}-${f.name}`,
        originalName: f.name,
        mimeType:     f.type,
        size:         f.size,
        _file:        f,       // raw File object — needed for FormData upload
        uploaded:     false,
      });
    }

    if (errors.length) {
      // eslint-disable-next-line no-alert
      alert(errors.join("\n"));
    }

    if (valid.length) {
      onFilesChange([...files, ...valid]);
    }
  }

  const handleInputChange = (e) => {
    processFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) processFiles(e.dataTransfer.files);
  };

  const removeFile = (idx) => {
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  const formatSize = (bytes) => {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="cf-uploader">
      {/* Drop zone */}
      <div
        className={`cf-uploader__zone${dragOver ? " cf-uploader__zone--over" : ""}${disabled ? " cf-uploader__zone--disabled" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload files"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          style={{ display: "none" }}
          onChange={handleInputChange}
          disabled={disabled}
        />
        <span className="cf-uploader__icon" aria-hidden="true">📎</span>
        <span className="cf-uploader__label">
          {files.length >= maxFiles
            ? `Maximum ${maxFiles} files attached`
            : "Drag files here or click to browse"}
        </span>
        <span className="cf-uploader__hint">
          {accept.replace(/\./g, "").toUpperCase().split(",").join(", ")} · max {maxSizeMB} MB each
        </span>
      </div>

      {/* Attached file list */}
      {files.length > 0 && (
        <ul className="cf-uploader__list" aria-label="Attached files">
          {files.map((f, idx) => (
            <li key={idx} className="cf-uploader__item">
              <span className="cf-uploader__item-name" title={f.originalName}>
                {f.originalName}
              </span>
              <span className="cf-uploader__item-size">{formatSize(f.size)}</span>
              {f.uploaded && (
                <span className="cf-uploader__item-ok" aria-label="Uploaded" title="Uploaded">✓</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  className="cf-uploader__remove"
                  aria-label={`Remove ${f.originalName}`}
                  onClick={() => removeFile(idx)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
