import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "◉" },
  { to: "/connectors", label: "Connectors", icon: "⇋" },
  { to: "/connectors/new", label: "New Connector", icon: "+" },
  { to: "/observability", label: "Observability", icon: "◎" },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-gray-100 min-h-screen p-4">
      <h1 className="text-xl font-bold mb-8 px-2">CDC Platform</h1>
      <nav className="space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <span className="text-lg">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
