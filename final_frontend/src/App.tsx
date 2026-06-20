import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Analytics from "./pages/Analytics";
import Dashboards from "./pages/Dashboards";
import DashboardView from "./pages/DashboardView";
import SchemaBlueprint from "./pages/SchemaBlueprint";
import ForensicsMonitor from "./pages/ForensicsMonitor";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Footer } from "@/components/Footer";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Redirects already-signed-in users away from the landing page
const HomeOrRedirect = () => {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Navigate to="/analytics" replace />;
  return <Home />;
};

const ProtectedNotFound = () => (
  <ProtectedRoute><NotFound /></ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-right" />
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pb-9">
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<HomeOrRedirect />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                <Route path="/forensics" element={<ProtectedRoute><ForensicsMonitor /></ProtectedRoute>} />
                <Route path="/dashboards" element={<ProtectedRoute><Dashboards /></ProtectedRoute>} />
                <Route path="/dashboard/:id" element={<ProtectedRoute><DashboardView /></ProtectedRoute>} />
                <Route path="/blueprint" element={<ProtectedRoute><SchemaBlueprint /></ProtectedRoute>} />
                <Route path="*" element={<ProtectedNotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;