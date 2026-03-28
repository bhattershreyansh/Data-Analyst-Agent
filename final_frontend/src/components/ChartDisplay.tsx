import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Plot from 'react-plotly.js';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Database, FileCode, Heart, Sparkles, PlusCircle, Activity, ShieldAlert, CheckCircle2, Loader2, Zap, Info, Search, Bot } from 'lucide-react';
import { QueryResponse, SavedChart, queryAPI, DiagnoseResponse } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@clerk/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ChartDisplayProps {
  result: QueryResponse;
  onSave?: (chart: SavedChart, messageId?: string) => void;
  onDelete?: (chartId: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

// Function to convert chart config to Plotly data
function convertChartConfigToPlotlyData(chartConfig: any, data: any[]): any[] {
  console.log('Converting chart config:', chartConfig);
  console.log('Data:', data);

  if (!chartConfig || !data || data.length === 0) {
    console.log('No chart config or data available');
    return [];
  }

  const { type, x, y, title } = chartConfig;

  if (!type) {
    console.log('Missing chart type');
    return [];
  }

  // If x and y are not specified, try to infer from data
  let xField = x;
  let yField = y;

  if (!xField || !yField) {
    const keys = Object.keys(data[0] || {});
    if (keys.length >= 2) {
      xField = xField || keys[0];
      yField = yField || keys[1];
      console.log('Inferred fields:', { xField, yField });
    } else {
      console.log('Not enough fields in data');
      return [];
    }
  }

  // Extract x and y values from data
  const xValues = data.map(row => row[xField]);
  const yValues = data.map(row => row[yField]);

  console.log('X values:', xValues);
  console.log('Y values:', yValues);

  // Check if we have valid data
  if (xValues.length === 0 || yValues.length === 0) {
    console.log('No valid data extracted');
    return [];
  }

  // Filter out null/undefined values
  const validIndices = xValues.map((_, i) => i).filter(i =>
    xValues[i] != null && yValues[i] != null
  );

  const validXValues = validIndices.map(i => xValues[i]);
  const validYValues = validIndices.map(i => yValues[i]);

  if (validXValues.length === 0) {
    console.log('No valid values after filtering');
    return [];
  }

  let plotlyData: any = {};

  switch (type.toLowerCase()) {
    case 'bar':
      plotlyData = {
        x: validXValues,
        y: validYValues,
        type: 'bar',
        marker: {
          color: '#8b5cf6', // Primary Neon Purple
          line: {
            color: '#a78bfa', // Lighter purple for glow effect
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
      // For table type, return empty to show table view only
      console.log('Table type or unknown chart type:', type);
      return [];
  }

  console.log('Generated Plotly data:', plotlyData);
  return [plotlyData];
}

export function ChartDisplay({ result, onSave, onDelete, onSuggestionClick }: ChartDisplayProps) {
  const [isSaved, setIsSaved] = useState(!!result.chart_id);
  const [currentChartId, setCurrentChartId] = useState<string | undefined>(result.chart_id);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnoseResponse | null>(null);
  const [nexusInfoOpen, setNexusInfoOpen] = useState(false);
  const { getToken } = useAuth();

  // Sync saved state when result changes (e.g. from history or after saving)
  useEffect(() => {
    if (result.chart_id) {
      setIsSaved(true);
      setCurrentChartId(result.chart_id);
    }
  }, [result.chart_id]);

  const handleToggleSave = () => {
    if (isSaved) {
      // Unsave
      if (currentChartId && onDelete) {
        onDelete(currentChartId);
      }
      setIsSaved(false);
      setCurrentChartId(undefined);
    } else {
      // Save
      if (onSave && result.chart && result.result) {
        const newChartId = uuidv4();
        const chartToSave: SavedChart = {
          chart_id: newChartId,
          question: result.chart?.title || 'Saved Chart',
          chart_type: result.chart.type || 'bar',
          title: result.chart.title || 'Untitled Chart',
          data: result.result,
          query: result.query,
          x_axis: result.chart.x,
          y_axis: result.chart.y,
          timestamp: new Date().toISOString()
        };

        onSave(chartToSave);
        setIsSaved(true);
        setCurrentChartId(newChartId);
      }
    }
  };

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    setDiagnosis(null);
    try {
      const token = await getToken();
      const response = await queryAPI.diagnoseAnomaly({
        question: result.reasoning || "Analyze this anomaly",
        anomaly_data: result.result || []
      }, token);
      
      if (response.success) {
        setDiagnosis(response.data);
      }
    } catch (error) {
      console.error("Forensic analysis failed:", error);
    } finally {
      setIsDiagnosing(false);
    }
  };

  console.log('ChartDisplay received result:', result);

  if (!result.success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-12"
      >
        <div className="text-destructive text-lg font-medium">
          {result.error || 'Query failed'}
        </div>
      </motion.div>
    );
  }

  // Convert chart config to Plotly data
  const chartData = convertChartConfigToPlotlyData(result.chart, result.result || []);

  console.log('Final chart data:', chartData);
  console.log('Chart data length:', chartData.length);

  const layout = {
    title: {
      text: result.chart?.title || 'Data Insight',
      font: {
        size: 20,
        color: '#ffffff',
        family: 'Outfit, sans-serif',
        weight: 'bold'
      }
    },
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: 'Inter, system-ui, sans-serif',
      color: 'rgba(255,255,255,0.7)',
    },
    margin: { l: 60, r: 40, t: 80, b: 80 },
    showlegend: true,
    legend: {
      orientation: 'h',
      y: -0.2,
      font: { color: 'rgba(255,255,255,0.7)' }
    },
    xaxis: {
      gridcolor: 'rgba(255,255,255,0.05)',
      showgrid: true,
      linecolor: 'rgba(255,255,255,0.1)',
      tickfont: { color: 'rgba(255,255,255,0.5)' }
    },
    yaxis: {
      gridcolor: 'rgba(255,255,255,0.05)',
      showgrid: true,
      linecolor: 'rgba(255,255,255,0.1)',
      tickfont: { color: 'rgba(255,255,255,0.5)' }
    },
    ...result.chart?.layout,
  };

  const showChart = chartData.length > 0 && result.chart?.type?.toLowerCase() !== 'table';
  const showSaveButton = (showChart || (result.result && result.result.length > 0));

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Metadata */}
      <div className="flex flex-wrap gap-3">
        {result.execution_time_ms && (
          <Badge variant="secondary" className="gap-1.5 glass border-white/10 text-primary px-3 py-1">
            <Clock className="h-3.5 w-3.5" />
            {result.execution_time_ms.toFixed(2)}ms
          </Badge>
        )}
        {result.row_count !== undefined && (
          <Badge variant="secondary" className="gap-1.5 glass border-white/10 text-accent px-3 py-1">
            <Database className="h-3.5 w-3.5" />
            {result.row_count} rows
          </Badge>
        )}
      </div>

      {/* Lumina Intelligence Engine: Insights & Narratives (PROMINENT POSITION) */}
      {result.insights && (
        <div className="rounded-3xl glass border-white/5 p-8 relative overflow-hidden group shadow-2xl bg-primary/5 border-primary/10">
          <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-primary to-accent" />
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-primary/20 text-primary ring-4 ring-primary/5">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-white tracking-tight">Lumina Insights</h3>
          </div>
          
          <div className="space-y-4">
            {result.insights.split('\n').filter(line => line.trim()).map((line, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-4 items-start"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 shrink-0 opacity-50 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                <p className="text-[17px] text-white/90 leading-relaxed font-semibold">
                  {line.replace(/^[-*•]\s*/, '')}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* SQL Query */}
      {result.query && (
        <div className="rounded-2xl glass border-white/5 p-5 relative overflow-hidden group opacity-60 hover:opacity-100 transition-opacity">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary/50" />
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">Generated SQL Engine</p>
          <code className="text-sm font-mono text-white/80 break-all bg-black/20 p-3 rounded-lg block leading-relaxed border border-white/5">
            {result.query}
          </code>
        </div>
      )}

      {/* Reasoning (Legacy) - Keeping but making smaller */}
      {result.reasoning && !result.insights && (
        <div className="rounded-2xl glass border-white/5 p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-accent/50" />
          <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-3">Neural Reasoning Output</p>
          <p className="text-[15px] text-white/80 leading-relaxed font-medium">
            {result.reasoning}
          </p>
        </div>
      )}

      {/* Smart Follow-up Suggestions */}
      {result.suggestions && result.suggestions.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
            <Database className="h-3 w-3" />
            Suggested Deep-Dives
          </p>
          <div className="flex flex-wrap gap-2">
            {result.suggestions.map((suggestion, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={() => onSuggestionClick?.(suggestion)}
                className="rounded-full bg-white/5 border-white/10 hover:border-primary/40 hover:bg-primary/5 text-xs font-bold py-5 px-5 transition-all hover:scale-105 active:scale-95 text-white/70 hover:text-primary"
              >
                <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" />
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      {showChart ? (
        <div className="glass-card rounded-3xl p-8 border-white/5 shadow-2xl relative group">
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="w-full" style={{ minHeight: '450px' }}>
            <Plot
              data={chartData}
              layout={layout}
              config={{
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
              }}
              style={{ width: '100%', height: '450px' }}
              useResizeHandler
            />
          </div>
        </div>
      ) : result.result && result.result.length > 0 ? (
        <div className="glass-card rounded-3xl p-8 border-white/5 text-center py-12">
          <Sparkles className="h-10 w-10 text-primary mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground font-medium">Data structuralized for table exploration</p>
        </div>
      ) : null}

      {/* Action Buttons */}
      <div className="flex justify-start gap-4">
        {showSaveButton && onSave && (
          <Button
            variant={isSaved ? "secondary" : "outline"}
            size="sm"
            onClick={handleToggleSave}
            className={`gap-2 rounded-2xl ${isSaved ? "text-primary bg-primary/10 border-primary/20" : "glass border-white/5"}`}
          >
            <Heart className={`h-4 w-4 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            {isSaved ? "Saved to Dashboard" : "Save Chart"}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleDiagnose}
          disabled={isDiagnosing}
          className="gap-2 rounded-2xl glass border-primary/20 text-primary hover:bg-primary/5 group relative overflow-hidden"
        >
          {isDiagnosing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 text-primary animate-pulse" />
          )}
          <span className="relative z-10">Causal Nexus Discovery</span>
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Button>
      </div>

      {/* Causal Nexus Section */}
      <AnimatePresence>
        {(isDiagnosing || diagnosis) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-[2rem] p-8 border-primary/20 shadow-[0_0_40px_rgba(139,92,246,0.1)] relative overflow-hidden my-6">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Activity className="h-32 w-32 text-primary" />
              </div>

              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-lg shadow-primary/20">
                  <Activity className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-black text-white tracking-tight uppercase italic">Causal Nexus</h3>
                    <button 
                      type="button"
                      onClick={() => setNexusInfoOpen(true)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg glass border-white/5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all hover:bg-primary/5 group"
                      title="What is Causal Nexus?"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] font-bold text-primary tracking-[0.3em] uppercase opacity-60 mt-1">Forensic Root Cause Analysis</p>
                </div>
              </div>

              {isDiagnosing ? (
                <div className="space-y-6 py-10">
                  <div className="flex flex-col items-center justify-center text-center space-y-4">
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                    <p className="text-white/60 font-medium italic animate-pulse">Orchestrating multi-agent forensic discovery...</p>
                    <div className="flex gap-2 mt-4">
                      <div className="h-1 w-8 rounded-full bg-primary/40 animate-pulse" />
                      <div className="h-1 w-8 rounded-full bg-primary/20 animate-pulse delay-75" />
                      <div className="h-1 w-8 rounded-full bg-primary/10 animate-pulse delay-150" />
                    </div>
                  </div>
                </div>
              ) : diagnosis && (
                <div className="grid lg:grid-cols-5 gap-10">
                  <div className="lg:col-span-3 space-y-6">
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                      <h4 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                        <Sparkles className="h-3 w-3" />
                        Forensic Verdict
                      </h4>
                      <p className="text-white/80 leading-relaxed text-lg font-medium italic">
                        "{diagnosis.verdict}"
                      </p>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4">
                      {diagnosis.diagnostic_path.map((step, idx) => (
                        <div key={idx} className="p-4 rounded-2xl bg-black/20 border border-white/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Step {idx + 1}</span>
                            {step.status === 'critical' ? (
                              <ShieldAlert className="h-4 w-4 text-destructive" />
                            ) : step.status === 'success' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            ) : (
                              <Activity className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <h5 className="font-bold text-white text-sm">{step.title}</h5>
                          <p className="text-xs text-white/40 line-clamp-2 leading-tight">{step.finding}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 h-full">
                      <h4 className="text-xs font-black text-white/60 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Activity className="h-3 w-3" />
                        Investigation Log
                      </h4>
                      <div className="space-y-4">
                        {diagnosis.investigation_steps.map((step, idx) => (
                          <div key={idx} className="flex gap-4 items-start group">
                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary ring-4 ring-primary/10 shrink-0" />
                            <p className="text-xs text-white/50 group-hover:text-white/80 transition-colors leading-relaxed">
                              {step}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table View - Always show the data */}
      {result.result && result.result.length > 0 && (
        <div className="glass-card rounded-3xl overflow-hidden border-white/5 shadow-2xl">
          <div className="p-6 border-b border-white/10 bg-white/5">
            <h3 className="text-xl font-bold text-white mb-1">Data Explorer</h3>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
              {result.result.length} unique nodes returned
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-white/5">
                  {Object.keys(result.result[0]).map((key) => (
                    <th key={key} className="text-left p-4 font-bold text-primary text-[10px] uppercase tracking-widest border-b border-white/10">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.result.map((row, idx) => (
                  <tr key={idx} className="hover:bg-primary/5 transition-colors group">
                    {Object.values(row).map((value, i) => (
                      <td key={i} className="p-4 text-sm text-white/70 group-hover:text-white transition-colors">
                        {value === null || value === undefined ? (
                          <span className="text-muted-foreground/30 italic">null</span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>

    {/* Causal Nexus Info Dialog */}
    <Dialog open={nexusInfoOpen} onOpenChange={setNexusInfoOpen}>
      <DialogContent className="max-w-md bg-black/80 backdrop-blur-2xl border-white/10 rounded-[2rem] p-8 shadow-[0_0_50px_rgba(139,92,246,0.15)]">
        <DialogHeader className="space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-2 mx-auto ring-4 ring-primary/5">
            <Activity className="h-8 w-8 animate-pulse" />
          </div>
          <DialogTitle className="text-3xl font-black text-center text-white tracking-tight italic uppercase">
            Causal Nexus
          </DialogTitle>
          <DialogDescription className="text-center text-white/60 text-base leading-relaxed">
            An autonomous multi-agent diagnostic engine that investigates anomalies to discover their root causes.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-8 space-y-6">
          <div className="space-y-4">
            {[
              { 
                title: "Iterative Deep Dives", 
                desc: "Unlike standard queries, Nexus autonomously runs up to 5 follow-up queries to test hypotheses.",
                icon: <Search className="h-4 w-4" />
              },
              { 
                title: "Root Cause Discovery", 
                desc: "Moves beyond describing what happened to uncover exactly why it happened.",
                icon: <Zap className="h-4 w-4" />
              },
              { 
                title: "Automated 'Judge' Agent", 
                desc: "An internal evaluator checks evidence sufficiency and dictates where to dig next.",
                icon: <Bot className="h-4 w-4" />
              }
            ].map((item, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/20 transition-all group">
                <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform flex-shrink-0">
                  {item.icon}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">{item.title}</h4>
                  <p className="text-xs text-white/40 leading-relaxed mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Button 
            onClick={() => setNexusInfoOpen(false)}
            className="w-full py-6 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold shadow-xl shadow-primary/20"
          >
            Acknowledge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}