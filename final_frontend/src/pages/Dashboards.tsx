import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { dashboardAPI, Dashboard } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Eye, Loader2, LayoutDashboard, PlusCircle } from 'lucide-react';
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
      
      <Header />
      
      <div className="container mx-auto px-6 py-12 relative z-10 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 flex flex-wrap items-end justify-between gap-6"
        >
          <div>
            <h1 className="text-5xl font-black text-white mb-3 tracking-tighter">
              Operational <span className="text-neon">Dashboards</span>
            </h1>
            <p className="text-lg text-muted-foreground/80 font-medium">
              Monitor your business pulse with AI-curated intelligence hubs.
            </p>
          </div>
          <Button 
            onClick={() => setCreateOpen(true)}
            size="lg" 
            className="rounded-2xl h-14 px-8 font-bold bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95 gap-2"
          >
            <PlusCircle className="h-5 w-5" />
            Create Intelligence Hub
          </Button>
        </motion.div>

        <CreateDashboardDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          selectedCharts={[]} // When opened from here, it uses all saved charts by default
        />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-primary font-bold animate-pulse uppercase tracking-widest text-xs">Deciphering Architectures</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 glass-card rounded-3xl border-destructive/20 max-w-2xl mx-auto">
            <div className="text-destructive text-xl font-bold mb-3 uppercase tracking-tight">
              Neural Link Interrupted
            </div>
            <p className="text-muted-foreground">
              {error.message || 'An error occurred while loading high-level intelligence.'}
            </p>
          </div>
        ) : !dashboards || dashboards.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-32 glass-card rounded-[3rem] border-white/5 space-y-8 max-w-3xl mx-auto"
          >
            <div className="text-8xl mb-6 opacity-30">📊</div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white">Tabula Rasa</h2>
              <p className="text-muted-foreground/80 max-w-md mx-auto text-lg leading-relaxed">
                Your intelligence center is currently empty. Start analyzing data to composite your first dashboard.
              </p>
            </div>
            <Link to="/">
              <Button size="lg" className="rounded-full px-10 h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                Initialize Analytics
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {dashboards.map((dashboard, index) => (
              <motion.div
                key={dashboard.dashboard_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="glass-card p-8 rounded-[2.5rem] hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden border-white/5 shadow-xl">
                  {/* Subtle hover accent */}
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex items-start gap-5 mb-8">
                    <div className="p-4 rounded-2xl bg-primary/10 neon-glow border border-primary/20 group-hover:scale-110 transition-transform duration-300">
                      <LayoutDashboard className="h-7 w-7 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-xl text-white mb-2 truncate group-hover:text-primary transition-colors">
                        {dashboard.name}
                      </h3>
                      {dashboard.description ? (
                        <p className="text-sm text-muted-foreground/80 line-clamp-2 leading-relaxed">
                          {dashboard.description}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/40 italic">No description provided</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/5">
                    <Badge variant="secondary" className="glass border-white/10 text-primary font-bold px-3 py-1">
                      {dashboard.total_charts} Modules
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/50 font-black uppercase tracking-widest">
                      {formatDistanceToNow(new Date(dashboard.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <Link to={`/dashboard/${dashboard.dashboard_id}`} className="flex-1 group/btn">
                      <Button variant="default" className="w-full h-12 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 group-hover/btn:scale-[1.02] transition-all">
                        <Eye className="h-4 w-4 mr-2" />
                        Access Intelligence
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(dashboard.dashboard_id)}
                      disabled={deleteMutation.isPending}
                      className="h-12 w-12 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
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
