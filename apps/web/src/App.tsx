import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Sources } from "./pages/Sources";
import { NewSource } from "./pages/NewSource";
import { ConnectorDetail } from "./pages/ConnectorDetail";
import { Sinks } from "./pages/Sinks";
import { Observability } from "./pages/Observability";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/sources/new" element={<NewSource />} />
            <Route path="/connectors/:name" element={<ConnectorDetail />} />
            <Route path="/sinks" element={<Sinks />} />
            <Route path="/observability" element={<Observability />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
