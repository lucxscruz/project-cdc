import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Connectors } from "./pages/Connectors";
import { ConnectorDetail } from "./pages/ConnectorDetail";

// Placeholder components for pages to be implemented in Tasks 10-11
function NewConnectorPage() {
  return <p className="text-gray-500">New Connector Wizard — coming soon (Task 10)</p>;
}

function ObservabilityPage() {
  return <p className="text-gray-500">Observability — coming soon (Task 11)</p>;
}

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
            <Route path="/connectors" element={<Connectors />} />
            <Route path="/connectors/new" element={<NewConnectorPage />} />
            <Route path="/connectors/:name" element={<ConnectorDetail />} />
            <Route path="/observability" element={<ObservabilityPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
