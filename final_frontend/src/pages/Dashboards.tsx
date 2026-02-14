import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardAPI, Dashboard } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Eye, Loader2, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Header } from '@/components/Header';

export default function Dashboards() {
  const queryClient = useQueryClient();

  const { data: dashboards, isLoading, error } = useQuery({
    queryKey: ['dashboards'],
    queryFn: async () => {
      const response = await dashboardAPI.getDashboards();
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
      const response = await dashboardAPI.deleteDashboard(id);
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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2">My Dashboards</h1>
          <p className="text-muted-foreground">
            View and manage your custom analytics dashboards
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="text-destructive text-lg font-medium mb-2">
              Failed to load dashboards
            </div>
            <p className="text-muted-foreground">
              {error.message || 'An error occurred while loading dashboards'}
            </p>
          </div>
        ) : !dashboards || dashboards.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 space-y-4"
          >
            <div className="text-6xl mb-4">📈</div>
            <h2 className="text-2xl font-semibold">No dashboards yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Create your first dashboard by selecting charts from the analytics page
            </p>
            <Link to="/">
              <Button className="mt-4">
                Go to Analytics
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboards.map((dashboard, index) => (
              <motion.div
                key={dashboard.dashboard_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="p-6 hover:shadow-lg transition-shadow group">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <LayoutDashboard className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg mb-1 truncate">
                        {dashboard.name}
                      </h3>
                      {dashboard.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {dashboard.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="secondary">
                      {dashboard.total_charts} chart{dashboard.total_charts !== 1 ? 's' : ''}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(dashboard.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Link to={`/dashboard/${dashboard.dashboard_id}`} className="flex-1">
                      <Button variant="default" className="w-full gap-2">
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => deleteMutation.mutate(dashboard.dashboard_id)}
                      disabled={deleteMutation.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
