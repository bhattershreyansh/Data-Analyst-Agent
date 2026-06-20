import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useParams, Link } from 'react-router-dom';
import { dashboardAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Download, Lock, Unlock, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import Plot from 'react-plotly.js';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Header } from '@/components/Header';
import { cn } from '@/lib/utils';

const ResponsiveGridLayout = WidthProvider(Responsive);

// Function to convert chart config to Plotly data
function convertChartConfigToPlotlyData(chart: any): any[] {
  if (!chart || !chart.data || chart.data.length === 0) {
    return [];
  }

  const { chart_type, x_axis, y_axis, title } = chart;

  if (!chart_type) {
    return [];
  }

  let xField = x_axis;
  let yField = y_axis;

  if (!xField || !yField) {
    const keys = Object.keys(chart.data[0] || {});
    if (keys.length >= 2) {
      xField = xField || keys[0];
      yField = yField || keys[1];
    } else {
      return [];
    }
  }

  const keys = Object.keys(chart.data[0] || {});
  const actualXKey = keys.find(k => k.toLowerCase() === xField.toLowerCase()) || xField;
  const actualYKey = keys.find(k => k.toLowerCase() === yField.toLowerCase()) || yField;

  const xValues = chart.data.map((row: any) => row[actualXKey]);
  const yValues = chart.data.map((row: any) => row[actualYKey]);

  const validIndices = xValues.map((_: any, i: number) => i).filter(i =>
    xValues[i] != null && yValues[i] != null
  );

  const validXValues = validIndices.map(i => xValues[i]);
  const validYValues = validIndices.map(i => yValues[i]);

  if (validXValues.length === 0) {
    return [];
  }

  let plotlyData: any = {};

  switch (chart_type.toLowerCase()) {
    case 'bar':
      plotlyData = {
        x: validXValues,
        y: validYValues,
        type: 'bar',
        marker: {
          color: '#3291ff', // Intelligence Blue
          line: {
            color: '#a7c8ff', // Highlight Blue
            width: 1
          }
        },
        name: title || 'Data',
      };
      break;

    case 'pie':
      plotlyData = {
        labels: validXValues,
        values: validYValues,
        type: 'pie',
        marker: {
          colors: ['#3291ff', '#10b981', '#a7c8ff', '#b7c8e1', '#8292aa', '#bec6e0', '#3f465c'],
        },
        textinfo: 'label+percent',
        textposition: 'auto',
        name: title || 'Data',
      };
      break;

    case 'line':
      plotlyData = {
        x: validXValues,
        y: validYValues,
        type: 'scatter',
        mode: 'lines+markers',
        line: {
          color: '#3291ff', // Intelligence Blue
          width: 3,
        },
        marker: {
          color: '#3291ff',
          size: 8,
          line: {
            color: '#a7c8ff',
            width: 2
          }
        },
        name: title || 'Data',
      };
      break;

    case 'table':
    default:
      return [];
  }

  return [plotlyData];
}

export default function DashboardView() {
  const { getToken } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [isLocked, setIsLocked] = useState(true);
  const [layouts, setLayouts] = useState<{ [key: string]: Layout[] }>({});

  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: async () => {
      const token = await getToken();
      const response = await dashboardAPI.getDashboard(id!, token);
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch dashboard');
      }
    },
    enabled: !!id,
  });

  // Load saved layout from localStorage
  useEffect(() => {
    if (id) {
      const savedLayouts = localStorage.getItem(`dashboard-layout-${id}`);
      if (savedLayouts) {
        setLayouts(JSON.parse(savedLayouts));
      }
    }
  }, [id]);

  // Generate default layout
  const generateDefaultLayout = (chartsCount: number): Layout[] => {
    return Array.from({ length: chartsCount }, (_, i) => ({
      i: `chart-${i}`,
      x: (i % 2) * 6,
      y: Math.floor(i / 2) * 4,
      w: 6,
      h: 4,
      minW: 3,
      minH: 3,
    }));
  };

  const handleLayoutChange = (layout: Layout[], allLayouts: { [key: string]: Layout[] }) => {
    setLayouts(allLayouts);
    if (id && !isLocked) {
      localStorage.setItem(`dashboard-layout-${id}`, JSON.stringify(allLayouts));
    }
  };

  const handleExport = () => {
    toast.success('Dashboard export feature coming soon!');
  };

  const toggleLock = () => {
    setIsLocked(!isLocked);
    toast.success(isLocked ? 'Dashboard unlocked - drag and resize enabled' : 'Dashboard locked');
  };

  const resetLayout = () => {
    if (id) {
      localStorage.removeItem(`dashboard-layout-${id}`);
      setLayouts({});
      toast.success('Layout reset to default');
    }
  };

  if (dashboardLoading) {
    return (
      <div className="min-h-screen bg-surface-dim flex flex-col items-center justify-center space-y-4 font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-outline font-mono text-[10px] uppercase tracking-widest animate-pulse">Syncing Dashboard...</p>
      </div>
    );
  }

  if (dashboardError || !dashboard) {
    return (
      <div className="min-h-screen bg-surface-dim flex items-center justify-center p-6 font-sans">
        <div className="text-center bg-surface-container border border-outline-variant rounded-lg p-8 max-w-md w-full">
          <h2 className="text-md font-bold text-white uppercase tracking-wider mb-2">Dashboard Not Found</h2>
          <p className="text-xs text-on-surface-variant font-mono mb-6 leading-relaxed">
            {dashboardError?.message || 'The requested dashboard could not be loaded.'}
          </p>
          <Link to="/dashboards">
            <Button className="rounded-[4px] bg-primary hover:opacity-95 text-on-primary font-mono text-[10px] uppercase font-bold tracking-wider px-6 h-9">
              Back to Directory
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const defaultLayout = generateDefaultLayout(dashboard.charts?.length || 0);

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
          className="mb-10 pb-6 border-b border-outline-variant/30"
        >
          <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
            <Link to="/dashboards">
              <Button variant="ghost" className="gap-2 font-mono text-[10px] uppercase tracking-wider hover:bg-white/5 pl-2 group h-9 rounded-[4px] border border-transparent">
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                Back to Dashboards
              </Button>
            </Link>
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant={isLocked ? "ghost" : "default"}
                onClick={toggleLock}
                className={cn(
                  "gap-2 font-mono text-[10px] uppercase tracking-wider font-bold h-9 rounded-[4px] border",
                  isLocked ? "bg-surface-container border-outline-variant hover:bg-surface-container-high" : "bg-primary text-on-primary border-primary hover:opacity-95"
                )}
              >
                {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                {isLocked ? 'Lock Layout' : 'Unlock Layout'}
              </Button>
              {!isLocked && (
                <Button variant="outline" onClick={resetLayout} className="gap-2 bg-surface-container border-outline-variant hover:border-primary/50 text-primary font-mono text-[10px] uppercase tracking-wider font-bold h-9 rounded-[4px]">
                  Reset Grid
                </Button>
              )}
              <Button variant="outline" onClick={handleExport} className="gap-2 bg-surface-container border-outline-variant hover:border-primary/50 text-primary font-mono text-[10px] uppercase tracking-wider font-bold h-9 rounded-[4px]">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-[2px] bg-primary/10 border border-primary/25 text-primary text-[10px] font-mono uppercase tracking-wider">
              Dashboard View
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight font-sans">{dashboard.name}</h1>
            {dashboard.description && (
              <p className="text-xs text-on-surface-variant max-w-3xl leading-relaxed">
                {dashboard.description}
              </p>
            )}
            {!isLocked && (
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-primary/20 text-primary text-[9px] font-mono uppercase tracking-widest border border-primary/30 mt-3 animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Edit Layout Active
              </div>
            )}
          </div>
        </motion.div>

        {!dashboard.charts || dashboard.charts.length === 0 ? (
          <div className="text-center py-20 bg-surface-container border border-outline-variant rounded-lg max-w-2xl mx-auto space-y-4">
            <div className="flex justify-center opacity-25">
              <Database className="h-14 w-14 text-outline" />
            </div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Dashboard Empty</h2>
            <p className="text-xs text-on-surface-variant max-w-xs mx-auto leading-relaxed">
              This dashboard has not yet been populated with any charts. Start querying data and saving charts to populate it.
            </p>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={Object.keys(layouts).length > 0 ? layouts : { lg: defaultLayout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={100}
            onLayoutChange={handleLayoutChange}
            isDraggable={!isLocked}
            isResizable={!isLocked}
            draggableHandle=".drag-handle"
            margin={[16, 16]}
          >
            {dashboard.charts.map((chart, index) => {
              const plotlyData = convertChartConfigToPlotlyData(chart);

              // ── KPI Detection: 1 row × 1 col = spotlight number ──
              const isKPI = chart.data?.length === 1 && Object.keys(chart.data[0] || {}).length === 1;
              const kpiKey = isKPI ? Object.keys(chart.data[0])[0] : null;
              const kpiValue = isKPI ? chart.data[0][kpiKey!] : null;

              const formatKPI = (val: any) => {
                const n = parseFloat(val);
                if (isNaN(n)) return String(val);
                if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
                return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
              };

              const layout = {
                title: { text: '' },
                autosize: true,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: {
                  family: 'Geist, sans-serif',
                  color: '#c0c6d5',
                },
                margin: { l: 40, r: 20, t: 10, b: 40 },
                showlegend: true,
                legend: {
                  orientation: 'h',
                  y: -0.15,
                  font: { color: '#8a919f', size: 9 }
                },
                xaxis: {
                  gridcolor: 'rgba(65,71,83,0.15)',
                  showgrid: true,
                  linecolor: '#414753',
                  tickfont: { size: 8 }
                },
                yaxis: {
                  gridcolor: 'rgba(65,71,83,0.15)',
                  showgrid: true,
                  linecolor: '#414753',
                  tickfont: { size: 8 }
                },
              };

              const rerunUrl = `/analytics?q=${encodeURIComponent(chart.question || '')}`;

              return (
                <div key={`chart-${index}`}>
                  <div className="bg-surface-container border border-outline-variant rounded-lg p-4 h-full overflow-hidden flex flex-col relative group">
                    
                    {/* Card Header */}
                    <div className={`mb-3 flex items-start justify-between ${!isLocked ? 'drag-handle cursor-move' : ''}`}>
                      <div className="flex-grow min-w-0 pr-4">
                        <h3 className="font-bold text-white text-xs mb-0.5 truncate uppercase group-hover:text-primary transition-colors font-sans">
                          {chart.title}
                        </h3>
                        <p className="text-[9px] text-outline font-mono uppercase tracking-widest line-clamp-1 italic">
                          "{chart.question}"
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Chart type badge */}
                        <span className="px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold tracking-wider bg-surface-container-high border border-outline-variant/30 rounded text-outline">
                          {isKPI ? 'KPI' : chart.chart_type}
                        </span>
                        {!isLocked && (
                          <div className="text-outline-variant group-hover:text-primary transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 3C9 2.44772 8.55228 2 8 2C7.44772 2 7 2.44772 7 3V21C7 21.5523 7.44772 22 8 22C8.55228 22 9 21.5523 9 21V3Z" />
                              <path d="M17 3C17 2.44772 16.5523 2 16 2C15.4477 2 15 2.44772 15 3V21C15 21.5523 15.4477 22 16 22C16.5523 22 17 21.5523 17 21V3Z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Chart or KPI content */}
                    {isKPI ? (
                      /* ── KPI Spotlight Card ── */
                      <div className="flex-grow flex flex-col items-center justify-center text-center py-2">
                        <div className="text-[9px] font-mono uppercase tracking-widest text-outline mb-2">
                          {kpiKey?.replace(/_/g, ' ')}
                        </div>
                        <div className="text-4xl font-bold text-white font-sans tracking-tight leading-none">
                          {formatKPI(kpiValue)}
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-[9px] font-mono text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live Query Result
                        </div>
                      </div>
                    ) : plotlyData.length > 0 ? (
                      <div className="flex-grow flex-1 w-full min-h-0">
                        <Plot
                          data={plotlyData}
                          layout={layout}
                          config={{
                            responsive: true,
                            displayModeBar: false,
                            displaylogo: false,
                          }}
                          style={{ width: '100%', height: '100%' }}
                          useResizeHandler
                        />
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-outline-variant/30 space-y-2">
                        <Database className="h-6 w-6" />
                        <p className="text-[9px] font-mono uppercase tracking-wider font-bold">No Data Available</p>
                      </div>
                    )}

                    {/* ── Insight Line ── */}
                    {chart.insight && (
                      <div className="mt-2.5 pt-2.5 border-t border-outline-variant/20 flex items-start gap-1.5">
                        <span className="text-primary shrink-0 mt-0.5">→</span>
                        <p className="text-[10px] text-on-surface-variant font-sans leading-relaxed line-clamp-2">
                          {chart.insight}
                        </p>
                      </div>
                    )}

                    {/* ── Freshness Badge + Re-run ── */}
                    <div className="mt-2 flex items-center justify-between pt-2 border-t border-outline-variant/15">
                      <div className="flex items-center gap-1.5 text-[8px] font-mono text-outline-variant">
                        <span className="w-1 h-1 rounded-full bg-outline-variant/50" />
                        {chart.timestamp
                          ? (() => {
                              const diff = Date.now() - new Date(chart.timestamp).getTime();
                              const mins = Math.floor(diff / 60000);
                              const hours = Math.floor(mins / 60);
                              const days = Math.floor(hours / 24);
                              if (days > 0) return `${days}d ago`;
                              if (hours > 0) return `${hours}h ago`;
                              if (mins > 0) return `${mins}m ago`;
                              return 'just now';
                            })()
                          : 'unknown'}
                      </div>
                      <Link
                        to={rerunUrl}
                        className="text-[8px] font-mono text-primary hover:underline uppercase tracking-wider"
                      >
                        Re-run →
                      </Link>
                    </div>

                  </div>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}