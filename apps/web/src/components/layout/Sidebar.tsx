import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/sources", label: "Sources", end: false },
  { to: "/sinks", label: "Sinks", end: false },
  { to: "/observability", label: "Observability", end: false },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-name">
          <b>CDC Platform</b>
          <small>Control room</small>
        </span>
      </div>
      <div className="nav-label">Workspace</div>
      <nav className="nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => isActive ? "active" : ""}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-rodape">
        <b><i className="dot" /> Local dev</b>
        <small>localhost</small>
      </div>
    </aside>
  );
}
