import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser } from '@clerk/react';
import { queryAPI, SavedChart } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, ChevronRight, BarChart, PieChart, LineChart, Table, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface SavedChartsSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onChartSelect: (chart: SavedChart) => void;
  selectedCharts: string[];
  onChartToggle: (chartId: string) => void;
}

const chartIcons = {
  bar: BarChart,
  pie: PieChart,
  line: LineChart,
  table: Table,
};

export function SavedChartsSidebar({
  isOpen,
  onToggle,
  onChartSelect,
  selectedCharts,
  onChartToggle,
}: SavedChartsSidebarProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const { data: charts, isLoading, error } = useQuery({
    // Include userId in the key — User B's query never hits User A's cache
    queryKey: ['saved-charts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const token = await getToken();
      const response = await queryAPI.getSavedCharts(token);
      if (response.success) {
        return response.data || [];
      } else {
        console.error('Failed to fetch saved charts:', response.error);
        return [];
      }
    },
    retry: 1,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (chartId: string) => {
      const token = await getToken();
      const response = await queryAPI.deleteSavedChart(chartId, token);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete chart');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-charts', userId] });
      toast.success('Chart deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete chart');
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await queryAPI.clearAllCharts(token);
      if (!response.success) {
        throw new Error(response.error || 'Failed to clear charts');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-charts', userId] });
      toast.success('All charts cleared');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to clear charts');
    },
  });

  const handleClearAll = () => {
    if (window.confirm(`Are you sure you want to delete all ${charts?.length || 0} saved charts? This action cannot be undone.`)) {
      clearAllMutation.mutate();
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-card border-l shadow-lg z-40"
          >
            <div className="flex flex-col h-full">
              <div className="p-4 border-b bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold">Saved Charts</h2>
                    {charts && charts.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedCharts.length > 0 
                          ? `${selectedCharts.length} selected`
                          : `${charts.length} total`
                        }
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    className="rounded-full"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
                {charts && charts.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearAll}
                    disabled={clearAllMutation.isPending}
                    className="w-full"
                  >
                    {clearAllMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      'Clear All'
                    )}
                  </Button>
                )}
              </div>

              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading charts...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="p-6 text-center text-destructive">
                    <p className="text-sm font-medium mb-1">Failed to load charts</p>
                    <p className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : 'Unknown error'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['saved-charts', userId] })}
                      className="mt-3"
                    >
                      Retry
                    </Button>
                  </div>
                ) : !charts || charts.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <BarChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium mb-1">No saved charts yet</p>
                    <p className="text-xs">Run a query to create your first chart</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {charts.map((chart) => {
                      const Icon = chartIcons[chart.chart_type as keyof typeof chartIcons] || BarChart;
                      const isSelected = selectedCharts.includes(chart.chart_id);
                      
                      return (
                        <Card
                          key={chart.chart_id}
                          className={`p-3 cursor-pointer transition-all hover:shadow-md relative ${
                            isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
                          }`}
                          onClick={() => onChartSelect(chart)}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`p-2 rounded-lg cursor-pointer transition-colors relative ${
                                isSelected 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-primary/10 hover:bg-primary/20'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onChartToggle(chart.chart_id);
                              }}
                            >
                              {isSelected && (
                                <CheckCircle2 className="h-3 w-3 absolute -top-1 -right-1 text-primary bg-background rounded-full" />
                              )}
                              <Icon className={`h-4 w-4 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm line-clamp-2 mb-1">
                                {chart.title}
                              </h3>
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                {chart.question}
                              </p>
                              <div className="flex items-center justify-between gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {chart.chart_type}
                                </Badge>
                                <span className="text-xs text-muted-foreground truncate">
                                  {formatDistanceToNow(new Date(chart.timestamp), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete "${chart.title}"?`)) {
                                  deleteMutation.mutate(chart.chart_id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <Button
        variant="default"
        size="icon"
        onClick={onToggle}
        className="fixed right-4 top-20 z-30 rounded-full shadow-lg"
        title="Saved Charts"
      >
        <BarChart className="h-5 w-5" />
        {!isOpen && selectedCharts.length > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-xs font-bold flex items-center justify-center text-primary-foreground border-2 border-background">
            {selectedCharts.length}
          </span>
        )}
      </Button>
    </>
  );
}