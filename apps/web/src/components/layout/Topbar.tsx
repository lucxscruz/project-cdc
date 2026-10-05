import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const pageNames: Record<string, string> = {
  "/": "Dashboard",
  "/sources": "Sources",
  "/sources/new": "Novo Source",
  "/sinks": "Sinks",
  "/observability": "Observability",
};

export function Topbar() {
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem("cdc-theme") ?? "escuro");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cdc-theme", theme);
  }, [theme]);

  const pageName = pageNames[location.pathname] ?? location.pathname.split("/").pop() ?? "";

  return (
    <header className="topbar">
      <span className="trilha">CDC Platform / <b>{pageName}</b></span>
      <button
        className="icone-botao"
        onClick={() => setTheme(theme === "escuro" ? "claro" : "escuro")}
        aria-label="Alternar tema"
        style={{ marginLeft: "auto" }}
      >
        {theme === "escuro" ? "\u2600" : "\u263E"}
      </button>
      <span className="aovivo" style={{ marginLeft: 0 }}>
        <i className="dot pulsa" />
        <span>auto-refresh 10s</span>
      </span>
    </header>
  );
}
