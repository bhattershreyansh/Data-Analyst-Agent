import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser } from '@/context/AuthContext';
import { queryAPI, SavedChart } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, ChevronRight, BarChart, PieChart, LineChart, Table, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SavedChartsSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onChartSelect: (chart: SavedChart) => void;
  selectedCharts: string[];
  onChartToggle: (chartId: string) => void;
  onChartDeleted?: (chartId: string) => void;
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
  onChartDeleted,
}: SavedChartsSidebarProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.user_id; // FIX: changed from user?.id to user?.user_id
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
    onSuccess: (data, chartId) => {
      queryClient.invalidateQueries({ queryKey: ['saved-charts', userId] });
      toast.success('Chart deleted successfully');
      onChartDeleted?.(chartId);
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
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-0 top-16 bottom-9 w-80 bg-surface-container-low border-l border-outline-variant flex flex-col z-40 shadow-2xl"
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-outline-variant bg-surface-container-lowest">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-mono text-xs font-black uppercase tracking-widest text-white">Saved Charts</h2>
                  {charts && charts.length > 0 && (
                    <p className="text-[9px] text-outline font-mono uppercase tracking-wider mt-0.5">
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
                  className="rounded-[4px] text-outline hover:text-white hover:bg-white/5 h-8 w-8 transition-colors"
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
                  className="w-full h-8 rounded-[4px] border border-outline-variant bg-surface-container hover:bg-surface-container-high text-[9px] font-mono font-bold uppercase tracking-wider text-outline hover:text-white transition-colors"
                >
                  {clearAllMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Clearing Workspace...
                    </>
                  ) : (
                    'Clear All Saved'
                  )}
                </Button>
              )}
            </div>

            {/* Scrollable List */}
            <ScrollArea className="flex-1 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-[9px] font-mono uppercase tracking-wider text-outline">Loading database records...</p>
                </div>
              ) : error ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-destructive">Failed to fetch charts</p>
                  <p className="text-[9px] text-outline leading-relaxed">
                    {error instanceof Error ? error.message : 'Unknown error'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['saved-charts', userId] })}
                    className="h-8 border border-outline-variant bg-surface-container hover:bg-surface-container-high font-mono text-[9px] uppercase tracking-wider rounded-[4px]"
                  >
                    Retry Diagnostics
                  </Button>
                </div>
              ) : !charts || charts.length === 0 ? (
                <div className="p-6 text-center space-y-3 text-outline">
                  <div className="p-3 bg-surface-container border border-outline-variant rounded-[4px] w-fit mx-auto opacity-35">
                    <BarChart className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-white">No Saved Charts</p>
                    <p className="text-[9px] leading-relaxed max-w-[200px] mx-auto text-outline-variant">
                      Run a data exploration query and click "Save Chart" to catalog visualization nodes.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {charts.map((chart) => {
                    const Icon = chartIcons[chart.chart_type as keyof typeof chartIcons] || BarChart;
                    const isSelected = selectedCharts.includes(chart.chart_id);
                    
                    return (
                      <div
                        key={chart.chart_id}
                        className={cn(
                          "p-3 cursor-pointer transition-all duration-200 relative bg-surface-container border border-outline-variant/30 rounded-[4px] hover:bg-surface-container-high group flex flex-col gap-2",
                          isSelected ? "border-primary bg-primary/5" : ""
                        )}
                        onClick={() => onChartSelect(chart)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox Icon Indicator */}
                          <div
                            className={cn(
                              "h-7 w-7 rounded-[4px] flex items-center justify-center cursor-pointer transition-all relative border border-outline-variant/30 shrink-0",
                              isSelected 
                                ? "bg-primary/20 text-primary border-primary" 
                                : "bg-surface-container-low text-outline hover:text-white"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChartToggle(chart.chart_id);
                            }}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {isSelected && (
                              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full flex items-center justify-center">
                                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                              </div>
                            )}
                          </div>
                          
                          {/* Description block */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-xs text-white truncate group-hover:text-primary transition-colors leading-snug">
                              {chart.title}
                            </h3>
                            <p className="text-[10px] text-on-surface-variant line-clamp-2 mt-0.5 leading-normal">
                              "{chart.question}"
                            </p>
                            
                            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-outline-variant/15 font-mono text-[8px] text-outline-variant">
                              <span className="px-1.5 py-0.5 bg-surface-container-high text-outline rounded-[2px] border border-outline-variant/30 uppercase font-mono text-[8px]">
                                {chart.chart_type}
                              </span>
                              <span className="truncate italic">
                                {formatDistanceToNow(new Date(chart.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                          </div>

                          {/* Trash Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-[4px] text-outline-variant hover:text-destructive hover:bg-destructive/10 shrink-0 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete "${chart.title}"?`)) {
                                deleteMutation.mutate(chart.chart_id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}