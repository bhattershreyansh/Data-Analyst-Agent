import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Analytics from "./pages/Analytics";
import Dashboards from "./pages/Dashboards";
import DashboardView from "./pages/DashboardView";
import SchemaBlueprint from "./pages/SchemaBlueprint";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import { Show, SignInButton, UserButton } from "@clerk/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, BarChart3, ShieldCheck, Zap } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ProtectedNotFound = () => (
    <>
      <Show when="signed-in">
        <NotFound />
      </Show>
      <Show when="signed-out">
        <Navigate to="/" replace />
      </Show>
    </>
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
                <Route path="/" element={<Home />} />
                <Route path="/analytics" element={
                  <Show when="signed-in">
                    <Analytics />
                  </Show>
                } />
                <Route path="/dashboards" element={
                  <Show when="signed-in">
                    <Dashboards />
                  </Show>
                } />
                <Route path="/dashboard/:id" element={
                  <Show when="signed-in">
                    <DashboardView />
                  </Show>
                } />
                <Route path="/blueprint" element={
                  <Show when="signed-in">
                    <SchemaBlueprint />
                  </Show>
                } />
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