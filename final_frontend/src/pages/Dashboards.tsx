import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { dashboardAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Eye, Loader2, LayoutDashboard, PlusCircle, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { CreateDashboardDialog } from '@/components/CreateDashboardDialog';

export default function Dashboards() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: dashboards, isLoading, error } = useQuery({
    queryKey: ['dashboards'],
    queryFn: async () => {
      const token = await getToken();
      const response = await dashboardAPI.getDashboards(token);
      if (response.success) {
        return response.data || [];
      } else {
        console.error('Failed to fetch dashboards:', response.error);
        return [];
      }
    },
    retry: 1,
    staleTime: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const response = await dashboardAPI.deleteDashboard(id, token);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete dashboard');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      toast.success('Dashboard deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete dashboard');
    },
  });

  return (
    <div className="min-h-screen bg-surface-dim text-on-background relative overflow-hidden flex flex-col pb-16 font-sans">
      {/* Background decoration grid lines */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, #8a919f 1px, transparent 1px), linear-gradient(to bottom, #8a919f 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-gradient-to-b from-primary/5 via-transparent to-transparent blur-[100px] pointer-events-none" />
      
      <Header />
      
      <div className="container mx-auto px-6 py-12 relative z-10 max-w-6xl flex-grow">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-outline-variant/30"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-[2px] bg-primary/10 border border-primary/25 text-primary text-[10px] font-mono uppercase tracking-wider mb-2">
              Dashboards
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white uppercase tracking-tight font-sans">
              Operational Dashboards
            </h1>
            <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
              Monitor your e-commerce operations with automated dashboards.
            </p>
          </div>
          <Button 
            onClick={() => setCreateOpen(true)}
            size="sm" 
            className="h-10 rounded-[4px] px-5 font-mono text-[10px] uppercase tracking-wider font-bold bg-primary hover:opacity-95 text-on-primary transition-all gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Create Dashboard
          </Button>
        </motion.div>

        <CreateDashboardDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          selectedCharts={[]} // When opened from here, it uses all saved charts by default
        />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-outline font-mono text-[10px] uppercase tracking-widest animate-pulse">Syncing Dashboard Directory...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-surface-container-low border border-outline-variant rounded-lg max-w-2xl mx-auto">
            <div className="text-destructive font-mono text-xs font-bold mb-2 uppercase tracking-wider">
              Connection Interrupted
            </div>
            <p className="text-xs text-on-surface-variant font-mono">
              {error.message || 'An error occurred while loading dashboards.'}
            </p>
          </div>
        ) : !dashboards || dashboards.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-surface-container border border-outline-variant rounded-lg space-y-6 max-w-2xl mx-auto"
          >
            <div className="flex justify-center opacity-25">
              <LayoutDashboard className="h-16 w-16 text-outline" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-md font-bold text-white uppercase tracking-wider">No Dashboards Found</h2>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
                Your dashboard center is currently empty. Start analyzing data to compile your first dashboard.
              </p>
            </div>
            <Link to="/analytics">
              <Button size="sm" className="rounded-[4px] px-6 h-9 font-mono text-[10px] uppercase tracking-wider font-bold bg-primary hover:opacity-95 text-on-primary">
                Launch Workspace
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboards.map((dashboard, index) => (
              <motion.div
                key={dashboard.dashboard_id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="bg-surface-container border border-outline-variant p-6 rounded-lg hover:border-primary/50 transition-all group relative flex flex-col min-h-[220px]">
                  <div className="flex items-start gap-4 mb-5">
                    <div className="p-2.5 rounded bg-primary/10 border border-primary/20 text-primary shrink-0 group-hover:scale-105 transition-transform duration-300">
                      <LayoutDashboard className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-white mb-1 truncate uppercase group-hover:text-primary transition-colors font-sans">
                        {dashboard.name}
                      </h3>
                      {dashboard.description ? (
                        <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                          {dashboard.description}
                        </p>
                      ) : (
                        <p className="text-xs text-outline-variant italic">No description provided</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-outline-variant/15 mb-4">
                    <Badge variant="secondary" className="bg-surface-container-high border border-outline-variant/40 text-primary font-mono text-[9px] uppercase tracking-wider rounded-[2px] px-2 py-0.5">
                      {dashboard.total_charts} Charts
                    </Badge>
                    <span className="text-[9px] text-outline font-mono flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-outline-variant" />
                      {formatDistanceToNow(new Date(dashboard.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Link to={`/dashboard/${dashboard.dashboard_id}`} className="flex-grow">
                      <Button variant="default" className="w-full h-9 rounded-[4px] font-mono text-[10px] uppercase tracking-wider font-bold bg-primary hover:opacity-95 text-on-primary transition-all">
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View Dashboard
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(dashboard.dashboard_id)}
                      disabled={deleteMutation.isPending}
                      className="h-9 w-9 rounded-[4px] text-outline-variant hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
