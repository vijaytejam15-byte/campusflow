import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

const emptyForm = {
  name: "",
  code: "",
  instructor: "",
  credits: "",
  semester: "",
  description: "",
};

function CourseModal({ mode, initialValues, onClose, onSubmit, onDelete }) {
  const [form, setForm] = useState(initialValues || emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(mode === "create");

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim() || !form.code.trim() || !form.instructor.trim() || !form.semester.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    const creditsNum = Number(form.credits);
    if (form.credits === "" || Number.isNaN(creditsNum) || creditsNum < 0 || creditsNum > 12) {
      setError("Credits must be a number between 0 and 12.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        code: form.code.trim(),
        instructor: form.instructor.trim(),
        credits: creditsNum,
        semester: form.semester.trim(),
        description: form.description.trim(),
      });
    } catch (err) {
      setError(err.message || "Could not save the course.");
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (err) {
      setError(err.message || "Could not delete the course.");
      setDeleting(false);
    }
  };

  const isView = mode === "view" && !isEditing;

  return (
    <div className="cf-modal-overlay" role="dialog" aria-modal="true">
      <div className="cf-modal">
        <header className="cf-modal__head">
          <h2 className="cf-modal__title">
            {mode === "create" ? "Add course" : isView ? "Course details" : "Edit course"}
          </h2>
          <button
            type="button"
            className="cf-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {error && (
          <div className="cf-alert cf-alert--error" role="alert">
            {error}
          </div>
        )}

        {isView ? (
          <>
            <dl className="cf-details">
              <div className="cf-details__row">
                <dt>Name</dt>
                <dd>{form.name}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Code</dt>
                <dd>{form.code}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Instructor</dt>
                <dd>{form.instructor}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Credits</dt>
                <dd>{form.credits}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Semester</dt>
                <dd>{form.semester}</dd>
              </div>
              {form.description && (
                <div className="cf-details__row cf-details__row--block">
                  <dt>Description</dt>
                  <dd>{form.description}</dd>
                </div>
              )}
            </dl>

            {confirmingDelete ? (
              <div className="cf-confirm">
                <p className="cf-confirm__text">Delete this course? This can&apos;t be undone.</p>
                <div className="cf-form-actions">
                  <button
                    type="button"
                    className="cf-btn cf-btn--ghost"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btn--danger cf-btn--auto"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Confirm delete"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="cf-form-actions">
                <button
                  type="button"
                  className="cf-btn cf-btn--danger cf-btn--ghost-danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btn--auto"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label className="cf-field">
              <span className="cf-label">Course name</span>
              <input
                type="text"
                className="cf-input"
                value={form.name}
                onChange={update("name")}
                maxLength={150}
                required
              />
            </label>

            <div className="cf-field-row">
              <label className="cf-field">
                <span className="cf-label">Course code</span>
                <input
                  type="text"
                  className="cf-input"
                  value={form.code}
                  onChange={update("code")}
                  placeholder="CS101"
                  maxLength={20}
                  required
                />
              </label>
              <label className="cf-field">
                <span className="cf-label">Credits</span>
                <input
                  type="number"
                  className="cf-input"
                  value={form.credits}
                  onChange={update("credits")}
                  min={0}
                  max={12}
                  step="0.5"
                  required
                />
              </label>
            </div>

            <label className="cf-field">
              <span className="cf-label">Instructor</span>
              <input
                type="text"
                className="cf-input"
                value={form.instructor}
                onChange={update("instructor")}
                maxLength={100}
                required
              />
            </label>

            <label className="cf-field">
              <span className="cf-label">Semester</span>
              <input
                type="text"
                className="cf-input"
                value={form.semester}
                onChange={update("semester")}
                placeholder="Fall 2026"
                maxLength={30}
                required
              />
            </label>

            <label className="cf-field">
              <span className="cf-label">
                Description <span className="cf-optional">(optional)</span>
              </span>
              <textarea
                className="cf-input cf-textarea"
                value={form.description}
                onChange={update("description")}
                maxLength={2000}
                rows={3}
              />
            </label>

            <div className="cf-form-actions">
              <button
                type="button"
                className="cf-btn cf-btn--ghost"
                onClick={mode === "view" ? () => setIsEditing(false) : onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="cf-btn cf-btn--auto" type="submit" disabled={saving}>
                {saving ? "Saving..." : mode === "create" ? "Create course" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // { mode: 'create' | 'view', course? }
  const debounceRef = useRef(null);

  const loadCourses = useCallback(async (term) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getCourses(term);
      setCourses(data.courses || []);
    } catch (err) {
      setError(err.message || "Could not load courses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses("");
  }, [loadCourses]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadCourses(value);
    }, 350);
  };

  const openCreate = () => setModal({ mode: "create" });
  const openView = (course) => setModal({ mode: "view", course });
  const closeModal = () => setModal(null);

  const handleCreate = async (values) => {
    const data = await api.createCourse(values);
    setCourses((prev) => [data.course, ...prev]);
    setModal(null);
  };

  const handleUpdate = async (id, values) => {
    const data = await api.updateCourse(id, values);
    setCourses((prev) => prev.map((c) => (c._id === id ? data.course : c)));
    setModal(null);
  };

  const handleDelete = async (id) => {
    await api.deleteCourse(id);
    setCourses((prev) => prev.filter((c) => c._id !== id));
    setModal(null);
  };

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Courses</p>
        <h1 className="cf-welcome__title">Your courses</h1>
        <p className="cf-welcome__sub">
          Add, edit, and track the courses you&apos;re taking this term.
        </p>
      </section>

      <div className="cf-toolbar">
        <input
          type="search"
          className="cf-input cf-search"
          placeholder="Search by name, code, or instructor…"
          value={search}
          onChange={handleSearchChange}
          aria-label="Search courses"
        />
        <button type="button" className="cf-btn cf-btn--auto" onClick={openCreate}>
          + Add course
        </button>
      </div>

      {loading ? (
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading courses" />
        </div>
      ) : error ? (
        <div className="cf-empty cf-empty--error">
          <p className="cf-empty__title">Something went wrong</p>
          <p className="cf-empty__text">{error}</p>
          <button className="cf-btn cf-btn--auto" onClick={() => loadCourses(search)}>
            Try again
          </button>
        </div>
      ) : courses.length === 0 ? (
        <div className="cf-empty">
          <p className="cf-empty__title">
            {search ? "No courses match your search" : "No courses yet"}
          </p>
          <p className="cf-empty__text">
            {search
              ? "Try a different name, code, or instructor."
              : "Add your first course to get started."}
          </p>
          {!search && (
            <button className="cf-btn cf-btn--auto" onClick={openCreate}>
              + Add course
            </button>
          )}
        </div>
      ) : (
        <div className="cf-course-grid">
          {courses.map((course) => (
            <article
              key={course._id}
              className="cf-course-card"
              onClick={() => openView(course)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") openView(course);
              }}
            >
              <div className="cf-course-card__head">
                <span className="cf-badge">{course.code}</span>
                <span className="cf-course-card__credits">{course.credits} cr</span>
              </div>
              <h3 className="cf-course-card__title">{course.name}</h3>
              <p className="cf-course-card__meta">{course.instructor}</p>
              <p className="cf-course-card__meta cf-course-card__meta--muted">
                {course.semester}
              </p>
            </article>
          ))}
        </div>
      )}

      {modal && modal.mode === "create" && (
        <CourseModal
          mode="create"
          initialValues={emptyForm}
          onClose={closeModal}
          onSubmit={handleCreate}
        />
      )}

      {modal && modal.mode === "view" && (
        <CourseModal
          mode="view"
          initialValues={{
            name: modal.course.name,
            code: modal.course.code,
            instructor: modal.course.instructor,
            credits: modal.course.credits,
            semester: modal.course.semester,
            description: modal.course.description || "",
          }}
          onClose={closeModal}
          onSubmit={(values) => handleUpdate(modal.course._id, values)}
          onDelete={() => handleDelete(modal.course._id)}
        />
      )}
    </main>
  );
}
