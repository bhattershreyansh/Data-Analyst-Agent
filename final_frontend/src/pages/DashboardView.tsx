import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { useParams, Link } from 'react-router-dom';
import { dashboardAPI } from '@/lib/api';
import { Card } from '@/components/ui/card';
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

  const xValues = chart.data.map((row: any) => row[xField]);
  const yValues = chart.data.map((row: any) => row[yField]);

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
          color: '#8b5cf6', // Primary Neon Purple
          line: {
            color: '#a78bfa',
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
          colors: ['#8b5cf6', '#10b981', '#d946ef', '#0ea5e9', '#f59e0b', '#f43f5e', '#14b8a6'],
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
          color: '#10b981', // Accent Neon Emerald
          width: 3,
        },
        marker: {
          color: '#10b981',
          size: 8,
          line: {
            color: '#34d399',
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
    toast.success(isLocked ? 'Dashboard unlocked - you can now resize and move charts' : 'Dashboard locked');
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (dashboardError || !dashboard) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Dashboard not found</h2>
          <p className="text-muted-foreground mb-4">
            {dashboardError?.message || 'The requested dashboard could not be found'}
          </p>
          <Link to="/dashboards">
            <Button>Back to Dashboards</Button>
          </Link>
        </div>
      </div>
    );
  }

  const defaultLayout = generateDefaultLayout(dashboard.charts?.length || 0);

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
          className="mb-12"
        >
          <div className="flex flex-wrap items-center justify-between gap-6 mb-10">
            <Link to="/dashboards">
              <Button variant="ghost" className="gap-2 font-bold hover:bg-white/5 pl-2 group">
                <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                Fleet View
              </Button>
            </Link>
            <div className="flex flex-wrap gap-3">
              <Button
                variant={isLocked ? "ghost" : "default"}
                onClick={toggleLock}
                className={cn(
                  "gap-2 font-bold px-6",
                  isLocked ? "glass border-white/10 hover:bg-white/5" : "bg-primary text-white shadow-lg shadow-primary/20"
                )}
              >
                {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                {isLocked ? 'Structure Locked' : 'Structure Interactive'}
              </Button>
              {!isLocked && (
                <Button variant="outline" onClick={resetLayout} className="gap-2 glass border-white/10 hover:bg-white/5 font-bold">
                  Reset Architecture
                </Button>
              )}
              <Button variant="outline" onClick={handleExport} className="gap-2 glass border-white/10 hover:bg-white/5 font-bold">
                <Download className="h-4 w-4" />
                Export Data
              </Button>
            </div>
          </div>
          
          <div className="space-y-3">
            <h1 className="text-6xl font-black text-white tracking-tighter leading-none">{dashboard.name}</h1>
            {dashboard.description && (
              <p className="text-xl text-muted-foreground/80 font-medium max-w-3xl leading-relaxed">
                {dashboard.description}
              </p>
            )}
            {!isLocked && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/30 mt-4 animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Architectural Manipulation Active
              </div>
            )}
          </div>
        </motion.div>

        {!dashboard.charts || dashboard.charts.length === 0 ? (
          <div className="text-center py-32 glass-card rounded-[3rem] border-white/5">
            <div className="text-8xl mb-6 opacity-20">🕳️</div>
            <h2 className="text-3xl font-black text-white mb-2">Void Detected</h2>
            <p className="text-muted-foreground/60 max-w-sm mx-auto">
              This node has not yet been populated with any intelligence modules.
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
            margin={[24, 24]}
          >
            {dashboard.charts.map((chart, index) => {
              const plotlyData = convertChartConfigToPlotlyData(chart);

              const layout = {
                title: { text: '' },
                autosize: true,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: {
                  family: 'Inter, system-ui, sans-serif',
                  color: 'rgba(255,255,255,0.6)',
                },
                margin: { l: 40, r: 20, t: 20, b: 40 },
                showlegend: true,
                legend: {
                  orientation: 'h',
                  y: -0.15,
                  font: { color: 'rgba(255,255,255,0.4)', size: 10 }
                },
                xaxis: {
                  gridcolor: 'rgba(255,255,255,0.03)',
                  showgrid: true,
                  linecolor: 'rgba(255,255,255,0.05)',
                  tickfont: { size: 9 }
                },
                yaxis: {
                  gridcolor: 'rgba(255,255,255,0.03)',
                  showgrid: true,
                  linecolor: 'rgba(255,255,255,0.05)',
                  tickfont: { size: 9 }
                },
              };

              return (
                <div key={`chart-${index}`}>
                  <div className="glass-card rounded-3xl p-6 h-full overflow-hidden flex flex-col border-white/5 relative group">
                    <div className={`mb-4 flex items-start justify-between ${!isLocked ? 'drag-handle cursor-move' : ''}`}>
                      <div className="flex-1 min-w-0 pr-8">
                        <h3 className="font-bold text-white text-lg mb-1 truncate group-hover:text-primary transition-colors">
                          {chart.title}
                        </h3>
                        <p className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest line-clamp-1">
                          {chart.question}
                        </p>
                      </div>
                      {!isLocked && (
                        <div className="text-primary/40 group-hover:text-primary transition-colors">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 3C9 2.44772 8.55228 2 8 2C7.44772 2 7 2.44772 7 3V21C7 21.5523 7.44772 22 8 22C8.55228 22 9 21.5523 9 21V3Z" />
                            <path d="M17 3C17 2.44772 16.5523 2 16 2C15.4477 2 15 2.44772 15 3V21C15 21.5523 15.4477 22 16 22C16.5523 22 17 21.5523 17 21V3Z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {plotlyData.length > 0 ? (
                      <div className="flex-1 w-full min-h-0">
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
                      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/20 space-y-2">
                        <Database className="h-8 w-8" />
                        <p className="text-[10px] font-black uppercase tracking-tighter">Null Data State</p>
                      </div>
                    )}
                    
                    {/* Corner accent */}
                    <div className="absolute bottom-0 right-0 w-8 h-8 opacity-[0.03] pointer-events-none">
                      <svg viewBox="0 0 24 24" className="w-full h-full fill-white">
                        <path d="M24 24H0V22H22V0H24V24Z" />
                      </svg>
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