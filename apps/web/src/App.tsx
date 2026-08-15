import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Connectors } from "./pages/Connectors";
import { ConnectorDetail } from "./pages/ConnectorDetail";
import { NewConnector } from "./pages/NewConnector";
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
            <Route path="/connectors" element={<Connectors />} />
            <Route path="/connectors/new" element={<NewConnector />} />
            <Route path="/connectors/:name" element={<ConnectorDetail />} />
            <Route path="/observability" element={<Observability />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
