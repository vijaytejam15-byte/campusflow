import React from "react";

// Two-panel auth shell: a branded panel on the left and the form card on the right.
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="cf-auth">
      <aside className="cf-auth__brand">
        <div className="cf-brand">
          <span className="cf-brand__mark" aria-hidden="true">
            CF
          </span>
          <span className="cf-brand__name">CampusFlow</span>
        </div>
        <div className="cf-auth__brandbody">
          <h1 className="cf-auth__headline">
            Your campus, organized in one place.
          </h1>
          <p className="cf-auth__tagline">
            Courses, schedules, and student life — all flowing together.
          </p>
        </div>
        <p className="cf-auth__foot">© {new Date().getFullYear()} CampusFlow</p>
      </aside>

      <main className="cf-auth__panel">
        <div className="cf-card">
          <header className="cf-card__head">
            <h2 className="cf-card__title">{title}</h2>
            {subtitle && <p className="cf-card__subtitle">{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
