import { ReactNode, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from "react-router-dom";
import { dataSourcesAPI } from "@/lib/api";
import { Sparkles, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { DataSourceSelector } from '@/components/DataSourceSelector';
import { FileUploadDialog } from '@/components/FileUploadDialog';
import { DatabaseConnectionDialog } from '@/components/DatabaseConnectionDialog';


interface HeaderProps {
  actions?: ReactNode;
}

export function Header({ actions }: HeaderProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
   const [connectDialogOpen, setConnectDialogOpen] = useState(false);
   const { getToken, isSignedIn, logout } = useAuth();
   const navigate = useNavigate();

   const handleSourceCreated = async (sourceId: string) => {
     try {
       const token = await getToken();
       await dataSourcesAPI.activateSource(sourceId, token);
       navigate("/analytics");
     } catch (error) {
       console.error("Failed to activate new source:", error);
       // Still navigate even if activation fails, as it might have been activated by backend
       navigate("/analytics");
     }
   };

  return (
    <>
      <header className="glass neon-border sticky top-0 z-50 transition-all duration-300">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-4 group transition-all">
            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 tracking-tighter">
                Shopify Analyst
              </h1>
              <p className="text-[10px] text-primary font-bold uppercase tracking-[0.2em]">AI Data Assistant</p>
            </div>
          </Link>

          <nav className="flex items-center gap-3 sm:gap-6">
            {/* Page specific actions */}
            {actions && (
              <div className="flex items-center gap-3 mr-3 border-r pr-6 border-white/10">
                {actions}
              </div>
            )}

            {isSignedIn && (
              <>
                <div className="hidden md:flex items-center gap-2 mr-2">
                  <Link to="/analytics">
                    <Button variant="ghost" size="sm" className="font-bold text-white/70 hover:text-primary hover:bg-primary/10 transition-all rounded-lg px-4">
                      Analytics
                    </Button>
                  </Link>
                  <Link to="/dashboards">
                    <Button variant="ghost" size="sm" className="font-bold text-white/70 hover:text-accent hover:bg-accent/10 transition-all rounded-lg px-4">
                      Dashboards
                    </Button>
                  </Link>
                  <Link to="/blueprint">
                    <Button variant="ghost" size="sm" className="font-bold text-white/70 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all rounded-lg px-4">
                      Blueprint
                    </Button>
                  </Link>
                </div>

                <DataSourceSelector
                  onUploadClick={() => setUploadDialogOpen(true)}
                  onConnectClick={() => setConnectDialogOpen(true)}
                />
              </>
            )}

            <div className="flex items-center gap-3">
              {isSignedIn ? (
                <div className="pl-2 border-l border-white/10">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={logout}
                    className="font-bold text-white/70 hover:text-red-400 hover:bg-red-400/10 transition-all rounded-lg px-4"
                  >
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Link to="/login">
                  <Button size="sm" className="rounded-full px-6 font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
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