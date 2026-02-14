import { ReactNode, useState } from 'react';
import { Moon, Sun, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { Link } from 'react-router-dom';
import { DataSourceSelector } from '@/components/DataSourceSelector';
import { FileUploadDialog } from '@/components/FileUploadDialog';
import { DatabaseConnectionDialog } from '@/components/DatabaseConnectionDialog';

interface HeaderProps {
  actions?: ReactNode;
}

export function Header({ actions }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);

  return (
    <>
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                Lumina AI
              </h1>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Intelligent Insights</p>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4">
            {/* Page specific actions */}
            {actions && (
              <div className="flex items-center gap-2 mr-2 border-r pr-4 border-border/50">
                {actions}
              </div>
            )}

            <Link to="/">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                Analytics
              </Button>
            </Link>
            <Link to="/dashboards">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                Dashboards
              </Button>
            </Link>

            {/* Data Source Selector */}
            <DataSourceSelector
              onUploadClick={() => setUploadDialogOpen(true)}
              onConnectClick={() => setConnectDialogOpen(true)}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full"
            >
              {theme === 'light' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </Button>
          </nav>
        </div>
      </header>

      {/* Dialogs */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={() => {
          // Refresh will happen automatically via polling in DataSourceSelector
        }}
      />

      <DatabaseConnectionDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        onSuccess={() => {
          // Refresh will happen automatically via polling in DataSourceSelector
        }}
      />
    </>
  );
}