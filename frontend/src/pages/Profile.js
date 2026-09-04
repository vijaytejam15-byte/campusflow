import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const emptyForm = {
  name: "",
  phoneNumber: "",
  department: "",
  semester: "",
  avatar: "",
};

export default function Profile() {
  const { updateUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const data = await api.getProfile();
        if (!cancelled) {
          setProfile(data.user);
          setForm({
            name: data.user.name || "",
            phoneNumber: data.user.phoneNumber || "",
            department: data.user.department || "",
            semester: data.user.semester || "",
            avatar: data.user.avatar || "",
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load your profile.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const startEditing = () => {
    setError("");
    setSuccess("");
    setEditing(true);
  };

  const cancelEditing = () => {
    if (profile) {
      setForm({
        name: profile.name || "",
        phoneNumber: profile.phoneNumber || "",
        department: profile.department || "",
        semester: profile.semester || "",
        avatar: profile.avatar || "",
      });
    }
    setError("");
    setEditing(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Name cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      const data = await api.updateProfile({
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        department: form.department.trim(),
        semester: form.semester.trim(),
        avatar: form.avatar.trim(),
      });
      setProfile(data.user);
      updateUser(data.user); // keep navbar / dashboard in sync
      setSuccess("Profile updated successfully.");
      setEditing(false);
    } catch (err) {
      setError(err.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="cf-main">
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading profile" />
        </div>
      </main>
    );
  }

  return (
    <main className="cf-main cf-main--narrow">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Profile</p>
        <h1 className="cf-welcome__title">Your profile</h1>
        <p className="cf-welcome__sub">
          View and update your CampusFlow student profile.
        </p>
      </section>

      {error && (
        <div className="cf-alert cf-alert--error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="cf-alert cf-alert--success" role="status">
          {success}
        </div>
      )}

      <article className="cf-tile">
        {!profile && !error ? (
          <p className="cf-tile__text">No profile data available.</p>
        ) : editing ? (
          <form onSubmit={handleSubmit} noValidate>
            <label className="cf-field">
              <span className="cf-label">Full name</span>
              <input
                type="text"
                className="cf-input"
                value={form.name}
                onChange={update("name")}
                maxLength={100}
                required
              />
            </label>

            <label className="cf-field">
              <span className="cf-label">Email</span>
              <input
                type="email"
                className="cf-input"
                value={profile?.email || ""}
                disabled
                readOnly
              />
              <span className="cf-hint">Email cannot be changed here.</span>
            </label>

            <label className="cf-field">
              <span className="cf-label">Phone number</span>
              <input
                type="tel"
                className="cf-input"
                value={form.phoneNumber}
                onChange={update("phoneNumber")}
                placeholder="+1 555 123 4567"
                maxLength={30}
              />
            </label>

            <label className="cf-field">
              <span className="cf-label">Department</span>
              <input
                type="text"
                className="cf-input"
                value={form.department}
                onChange={update("department")}
                placeholder="Computer Science"
                maxLength={100}
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
              />
            </label>

            <label className="cf-field">
              <span className="cf-label">
                Avatar URL <span className="cf-optional">(optional)</span>
              </span>
              <input
                type="url"
                className="cf-input"
                value={form.avatar}
                onChange={update("avatar")}
                placeholder="https://example.com/avatar.png"
                maxLength={2048}
              />
            </label>

            <div className="cf-form-actions">
              <button
                type="button"
                className="cf-btn cf-btn--ghost"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="cf-btn cf-btn--auto" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="cf-details">
              <div className="cf-details__row">
                <dt>Name</dt>
                <dd>{profile.name}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Email</dt>
                <dd>{profile.email}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Phone</dt>
                <dd>{profile.phoneNumber || "Not provided"}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Department</dt>
                <dd>{profile.department || "Not set"}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Semester</dt>
                <dd>{profile.semester || "Not set"}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Avatar</dt>
                <dd>{profile.avatar || "Not set"}</dd>
              </div>
            </dl>
            <div className="cf-form-actions cf-form-actions--single">
              <button className="cf-btn cf-btn--auto" onClick={startEditing}>
                Edit profile
              </button>
            </div>
          </>
        )}
      </article>
    </main>
  );
}
