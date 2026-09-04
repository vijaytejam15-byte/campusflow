import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const email = form.email.trim();
    if (!EMAIL_REGEX.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!form.password) {
      setError("Please enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      await login({ email, password: form.password });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your CampusFlow account"
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="cf-alert cf-alert--error" role="alert">
            {error}
          </div>
        )}

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
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
        </label>

        <button className="cf-btn" type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="cf-switch">
        Don&apos;t have an account? <Link to="/register">Create one</Link>
      </p>
    </AuthLayout>
  );
}
