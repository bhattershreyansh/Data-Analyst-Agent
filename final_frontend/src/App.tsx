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
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import { Show, RedirectToSignIn, useAuth } from "@clerk/react";
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
  if (!isLoaded) return null; // Wait for Clerk to load
  if (isSignedIn) return <Navigate to="/analytics" replace />;
  return <Home />;
};

// Wraps a page so that unauthenticated users are sent to Clerk sign-in
const Protected = ({ children }: { children: React.ReactNode }) => (
  <>
    <Show when="signed-in">{children}</Show>
    <Show when="signed-out"><RedirectToSignIn /></Show>
  </>
);

const ProtectedNotFound = () => (
  <Protected><NotFound /></Protected>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-right" />
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<HomeOrRedirect />} />
                <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
                <Route path="/dashboards" element={<Protected><Dashboards /></Protected>} />
                <Route path="/dashboard/:id" element={<Protected><DashboardView /></Protected>} />
                <Route path="/blueprint" element={<Protected><SchemaBlueprint /></Protected>} />
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