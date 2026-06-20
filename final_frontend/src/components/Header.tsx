import { ReactNode, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link, useLocation } from "react-router-dom";
import { dataSourcesAPI } from "@/lib/api";
import { Button } from '@/components/ui/button';
import { DataSourceSelector } from '@/components/DataSourceSelector';
import { FileUploadDialog } from '@/components/FileUploadDialog';
import { DatabaseConnectionDialog } from '@/components/DatabaseConnectionDialog';
import { cn } from "@/lib/utils";

interface HeaderProps {
  actions?: ReactNode;
}

export function Header({ actions }: HeaderProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const { getToken, isSignedIn, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSourceCreated = async (sourceId: string) => {
    try {
      const token = await getToken();
      await dataSourcesAPI.activateSource(sourceId, token);
      navigate("/analytics");
    } catch (error) {
      console.error("Failed to activate new source:", error);
      navigate("/analytics");
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="border-b border-outline-variant bg-surface-dim/85 backdrop-blur-md sticky top-0 z-50 transition-all duration-300">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3.5 group transition-all">
            <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:scale-105 transition-transform duration-300">
              {/* Custom technical radar/geometric SVG */}
              <svg className="h-5.5 w-5.5 animate-pulse text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold tracking-tight text-white group-hover:text-primary transition-colors leading-none">
                DATA ANALYST AGENT
              </h1>
              <p className="text-[8px] text-outline font-mono uppercase tracking-[0.25em] mt-0.5">Analyst Workspace</p>
            </div>
          </Link>

          <nav className="flex items-center gap-4">
            {isSignedIn && (
              <div className="hidden md:flex items-center gap-2">
                <Link to="/analytics">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-wider transition-all rounded-[4px] px-3 py-1.5 h-8 border",
                      isActive("/analytics") 
                        ? "text-primary bg-primary/10 border-primary/20 font-bold" 
                        : "text-on-surface-variant hover:text-white hover:bg-white/5 border-transparent"
                    )}
                  >
                    Analytics
                  </Button>
                </Link>
                <Link to="/forensics">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-wider transition-all rounded-[4px] px-3 py-1.5 h-8 border",
                      isActive("/forensics") 
                        ? "text-primary bg-primary/10 border-primary/20 font-bold" 
                        : "text-on-surface-variant hover:text-white hover:bg-white/5 border-transparent"
                    )}
                  >
                    Forensics
                  </Button>
                </Link>
                <Link to="/dashboards">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-wider transition-all rounded-[4px] px-3 py-1.5 h-8 border",
                      isActive("/dashboards") || location.pathname.startsWith("/dashboard/")
                        ? "text-primary bg-primary/10 border-primary/20 font-bold" 
                        : "text-on-surface-variant hover:text-white hover:bg-white/5 border-transparent"
                    )}
                  >
                    Dashboards
                  </Button>
                </Link>
                <Link to="/blueprint">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-wider transition-all rounded-[4px] px-3 py-1.5 h-8 border",
                      isActive("/blueprint") 
                        ? "text-primary bg-primary/10 border-primary/20 font-bold" 
                        : "text-on-surface-variant hover:text-white hover:bg-white/5 border-transparent"
                    )}
                  >
                    Blueprint
                  </Button>
                </Link>
              </div>
            )}

            {/* Page specific actions */}
            {actions && (
              <div className="flex items-center gap-3 mr-1 border-r pr-4 border-outline-variant">
                {actions}
              </div>
            )}

            {/* Live System Status Widget */}
            <div className="hidden lg:flex items-center gap-3.5 border-l border-outline-variant pl-4 h-6">
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
              </div>
            </div>

            {isSignedIn && (
              <DataSourceSelector
                onUploadClick={() => setUploadDialogOpen(true)}
                onConnectClick={() => setConnectDialogOpen(true)}
              />
            )}

            <div className="flex items-center gap-2">
              {isSignedIn ? (
                <div className="pl-2 border-l border-outline-variant">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      logout();
                      navigate('/');
                    }}
                    className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant hover:text-red-400 hover:bg-red-500/10 transition-all rounded-[4px] px-3 h-8"
                  >
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Link to="/login">
                  <Button size="sm" className="font-mono text-[10px] uppercase tracking-wider rounded-[4px] bg-primary hover:opacity-90 text-on-primary font-bold px-4 h-8 transition-all active:scale-95">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Dialogs */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={(sourceId) => {
          handleSourceCreated(sourceId);
        }}
      />

      <DatabaseConnectionDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        onSuccess={(sourceId) => {
          handleSourceCreated(sourceId);
        }}
      />
    </>
  );
}