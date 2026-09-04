import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phoneNumber: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    if (!form.name.trim()) return "Please enter your name.";
    if (!EMAIL_REGEX.test(form.email.trim()))
      return "Please enter a valid email address.";
    if (form.password.length < 6)
      return "Password must be at least 6 characters.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phoneNumber: form.phoneNumber.trim(),
      });
      setSuccess("Account created! Redirecting to your dashboard...");
      // Registration signs the user in (cookie set), so go straight in.
      setTimeout(() => navigate("/dashboard", { replace: true }), 800);
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join CampusFlow to manage your campus life"
    >
      <form onSubmit={handleSubmit} noValidate>
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

        <label className="cf-field">
          <span className="cf-label">Full name</span>
          <input
            type="text"
            className="cf-input"
            value={form.name}
            onChange={update("name")}
            placeholder="Ada Lovelace"
            autoComplete="name"
            required
          />
        </label>

        <label className="cf-field">
          <span className="cf-label">Email</span>
          <input
            type="email"
            className="cf-input"
            value={form.email}
            onChange={update("email")}
            placeholder="you@university.edu"
            autoComplete="email"
            required
          />
        </label>

        <label className="cf-field">
          <span className="cf-label">Password</span>
          <input
            type="password"
            className="cf-input"
            value={form.password}
            onChange={update("password")}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            required
          />
        </label>

        <label className="cf-field">
          <span className="cf-label">
            Phone number <span className="cf-optional">(optional)</span>
          </span>
          <input
            type="tel"
            className="cf-input"
            value={form.phoneNumber}
            onChange={update("phoneNumber")}
            placeholder="+1 555 123 4567"
            autoComplete="tel"
          />
        </label>

        <button className="cf-btn" type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="cf-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
