import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { dashboardAPI } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Download, Lock, Unlock } from 'lucide-react';
import { motion } from 'framer-motion';
import Plot from 'react-plotly.js';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Header } from '@/components/Header';

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
          color: '#3b82f6',
          line: {
            color: '#2563eb',
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
          colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'],
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
          color: '#3b82f6',
          width: 3,
        },
        marker: {
          color: '#3b82f6',
          size: 8,
          line: {
            color: '#2563eb',
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
  const { id } = useParams<{ id: string }>();
  const [isLocked, setIsLocked] = useState(true);
  const [layouts, setLayouts] = useState<{ [key: string]: Layout[] }>({});

  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: async () => {
      const response = await dashboardAPI.getDashboard(id!);
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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <Link to="/dashboards">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboards
              </Button>
            </Link>
            <div className="flex gap-2">
              <Button
                variant={isLocked ? "outline" : "default"}
                onClick={toggleLock}
                className="gap-2"
              >
                {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                {isLocked ? 'Unlock Layout' : 'Lock Layout'}
              </Button>
              {!isLocked && (
                <Button variant="outline" onClick={resetLayout} className="gap-2">
                  Reset Layout
                </Button>
              )}
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-2">{dashboard.name}</h1>
          {dashboard.description && (
            <p className="text-muted-foreground text-lg">{dashboard.description}</p>
          )}
          {!isLocked && (
            <p className="text-sm text-primary mt-2">
              💡 Drag charts to move them, drag corners to resize
            </p>
          )}
        </motion.div>

        {!dashboard.charts || dashboard.charts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-semibold mb-2">No charts in this dashboard</h2>
            <p className="text-muted-foreground">
              This dashboard doesn't contain any charts yet.
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
          >
            {dashboard.charts.map((chart, index) => {
              const plotlyData = convertChartConfigToPlotlyData(chart);

              const layout = {
                title: {
                  text: '',
                  font: {
                    size: 18,
                    color: '#1f2937'
                  }
                },
                autosize: true,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: {
                  family: 'Inter, system-ui, sans-serif',
                  color: '#1f2937',
                },
                margin: { l: 50, r: 30, t: 10, b: 50 },
                showlegend: true,
                legend: {
                  orientation: 'h',
                  y: -0.15
                },
                xaxis: {
                  gridcolor: '#e5e7eb',
                  showgrid: true,
                },
                yaxis: {
                  gridcolor: '#e5e7eb',
                  showgrid: true,
                },
              };

              return (
                <div key={`chart-${index}`}>
                  <Card className="p-4 bg-card h-full overflow-hidden">
                    <div className={`mb-2 flex items-start justify-between ${!isLocked ? 'drag-handle cursor-move' : ''}`}>
                      <div className="flex-1">
                        <h3 className="font-semibold text-base mb-1">{chart.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {chart.question}
                        </p>
                      </div>
                      {!isLocked && (
                        <div className="text-muted-foreground ml-2">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 3C9 2.44772 8.55228 2 8 2C7.44772 2 7 2.44772 7 3V21C7 21.5523 7.44772 22 8 22C8.55228 22 9 21.5523 9 21V3Z" />
                            <path d="M17 3C17 2.44772 16.5523 2 16 2C15.4477 2 15 2.44772 15 3V21C15 21.5523 15.4477 22 16 22C16.5523 22 17 21.5523 17 21V3Z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {plotlyData.length > 0 ? (
                      <div className="w-full h-[calc(100%-60px)]">
                        <Plot
                          data={plotlyData}
                          layout={layout}
                          config={{
                            responsive: true,
                            displayModeBar: true,
                            displaylogo: false,
                            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                          }}
                          style={{ width: '100%', height: '100%' }}
                          useResizeHandler
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[calc(100%-60px)] text-muted-foreground">
                        <p>Chart data not available</p>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}