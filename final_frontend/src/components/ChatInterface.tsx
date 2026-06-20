import { useState, useRef, useEffect } from 'react';
import { Loader2, Sparkles, Database, Clock, Activity, ShieldAlert, CheckCircle2, Save, Play, Trash2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryResponse, SavedChart } from '@/lib/api';
import Plot from 'react-plotly.js';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  result?: QueryResponse | null;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (question: string, mode?: 'query' | 'diagnose') => void;
  isLoading: boolean;
  onSaveChart?: (chart: any, messageId?: string) => void;
  onDeleteChart?: (chartId: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
  chatMode: 'query' | 'diagnose';
  onChatModeChange: (mode: 'query' | 'diagnose') => void;
  suggestions?: string[];
  suggestionsLoading?: boolean;
}

// Function to convert chart config to Plotly data
function convertChartConfigToPlotlyData(chartConfig: any, data: any[]): any[] {
  if (!chartConfig || !data || data.length === 0) {
    return [];
  }

  const { type, x, y, x_axis, y_axis, title } = chartConfig;

  if (!type) {
    return [];
  }

  let xField = x || x_axis;
  let yField = y || y_axis;

  if (!xField || !yField) {
    const keys = Object.keys(data[0] || {});
    if (keys.length >= 2) {
      xField = xField || keys[0];
      yField = yField || keys[1];
    } else {
      return [];
    }
  }

  const keys = Object.keys(data[0] || {});
  const actualXKey = keys.find(k => k.toLowerCase() === xField.toLowerCase()) || xField;
  const actualYKey = keys.find(k => k.toLowerCase() === yField.toLowerCase()) || yField;

  const xValues = data.map(row => row[actualXKey]);
  const yValues = data.map(row => row[actualYKey]);

  if (xValues.length === 0 || yValues.length === 0) {
    return [];
  }

  const validIndices = xValues.map((_, i) => i).filter(i =>
    xValues[i] != null && yValues[i] != null
  );

  const validXValues = validIndices.map(i => xValues[i]);
  const validYValues = validIndices.map(i => yValues[i]);

  if (validXValues.length === 0) {
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
          color: '#3291ff',
          line: {
            color: '#a7c8ff',
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
          color: '#3291ff',
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

export function ChatInterface({ 
  messages, 
  onSendMessage, 
  isLoading, 
  onSaveChart, 
  onDeleteChart,
  onSuggestionClick,
  chatMode,
  suggestions = [],
  suggestionsLoading = false
}: ChatInterfaceProps) {
  const [question, setQuestion] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract the latest assistant message and the user's latest query
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (question.trim() && !isLoading) {
      onSendMessage(question, chatMode);
      setQuestion('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Convert chart response to saved chart structure
  const handlePinChart = () => {
    if (!lastAssistantMessage?.result || !onSaveChart) return;
    const res = lastAssistantMessage.result;
    
    // Check if it's a KPI (1 row, 1 column) or has chart data
    const isKPIResult = res.result && res.result.length === 1 && Object.keys(res.result[0] || {}).length === 1;
    
    if ((res.chart || isKPIResult) && res.result) {
      const newChartId = uuidv4();
      const chartToSave: SavedChart = {
        chart_id: newChartId,
        question: res.chart?.title || lastUserMessage?.content || 'Saved Chart',
        chart_type: isKPIResult ? 'kpi' : (res.chart?.type || 'bar'),
        title: res.chart?.title || (isKPIResult ? Object.keys(res.result[0])[0].replace(/_/g, ' ') : 'Untitled Chart'),
        data: res.result,
        query: res.query,
        x_axis: res.chart?.x,
        y_axis: res.chart?.y,
        timestamp: new Date().toISOString(),
        insight: res.insights || undefined
      };
      onSaveChart(chartToSave, lastAssistantMessage.id);
      toast.success("Chart saved");
    }
  };

  // Suggestions falling back to defaults if not loaded
  const defaultSuggestions = chatMode === 'diagnose' 
    ? [
        "Why did orders drop yesterday?",
        "Analyze voucher discount margin erosion",
        "Explain unusual refund rate spikes"
      ]
    : [
        "Compare revenue by region for the last 30 days",
        "Identify churn risk for EU customers",
        "Weekly trend of subscription upgrades"
      ];
  
  const suggestionsList = suggestions.length > 0 ? suggestions.slice(0, 3) : defaultSuggestions;

  // Chart conversions if assistant message is available
  let plotlyData: any[] = [];
  let hasChartData = false;
  let chartLayout: any = {};
  let tableHeaders: string[] = [];
  let tableRows: any[] = [];

  if (lastAssistantMessage?.result?.success) {
    const res = lastAssistantMessage.result;
    if (res.result && res.result.length > 0) {
      tableRows = res.result.slice(0, 15); // Show top 15 rows in high-density table
      tableHeaders = Object.keys(res.result[0]);
    }
    if (res.chart) {
      plotlyData = convertChartConfigToPlotlyData(res.chart, res.result || []);
      hasChartData = plotlyData.length > 0 && res.chart.type?.toLowerCase() !== 'table';
      chartLayout = {
        title: { text: '' },
        autosize: true,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: {
          family: 'Geist, sans-serif',
          color: '#c0c6d5',
        },
        margin: { l: 40, r: 15, t: 15, b: 35 },
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
    }
  }

  // ── KPI Detection ──
  const isKPI = tableRows.length === 1 && Object.keys(tableRows[0] || {}).length === 1;
  const kpiKey = isKPI ? Object.keys(tableRows[0])[0] : null;
  const kpiValue = isKPI ? tableRows[0][kpiKey!] : null;

  const formatKPI = (val: any) => {
    const n = parseFloat(val);
    if (isNaN(n)) return String(val);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-dim relative overflow-hidden justify-between p-6">
      
      {/* Active Query Workspace Viewport */}
      <div className="flex-grow flex flex-col overflow-y-auto custom-scrollbar pr-1 mb-4 min-h-0">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-grow flex flex-col items-center justify-center min-h-[340px]"
            >
              <div className="bg-surface-container border border-outline-variant p-6 rounded-lg max-w-sm w-full space-y-4 text-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
                <div className="space-y-1.5 font-mono text-[10px] text-outline uppercase tracking-widest">
                  <div>[SYS_CONN] Querying database...</div>
                  <div className="text-primary animate-pulse">[AGENT] Preparing query analysis...</div>
                </div>
              </div>
            </motion.div>
          ) : !lastAssistantMessage ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-grow flex flex-col items-center justify-center min-h-[340px] px-4"
            >
              {chatMode === 'query' ? (
                /* ── Query & Charts empty state ── */
                <div className="w-full max-w-xl space-y-4">
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-white text-sm uppercase tracking-wider font-sans">Query & Charts</h3>
                    </div>
                    <p className="text-xs text-on-surface-variant font-sans">Ask any data question — get a chart or table back instantly.</p>
                  </div>

                  {/* Example flow */}
                  <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-lg p-4 space-y-3 text-left">
                    {/* Example question */}
                    <div className="flex items-start gap-2">
                      <span className="text-[9px] font-mono font-bold text-primary uppercase tracking-widest shrink-0 mt-0.5">You</span>
                      <span className="text-xs text-white font-sans italic">"Compare revenue by region for the last 30 days"</span>
                    </div>
                    {/* Arrow */}
                    <div className="border-l-2 border-outline-variant/30 ml-[22px] pl-3 space-y-2">
                      <div className="flex items-center gap-2 text-[9px] font-mono text-outline uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        SQL generated & executed
                      </div>
                      {/* Mini chart mockup */}
                      <div className="bg-surface-container border border-outline-variant/30 rounded p-2.5 space-y-1.5">
                        <div className="text-[9px] font-mono text-primary uppercase tracking-wider mb-2">Bar Chart → Revenue by Region</div>
                        <div className="flex items-end gap-1.5 h-10">
                          {[65, 90, 45, 78, 55].map((h, i) => (
                            <div key={i} className="flex-1 bg-primary/20 border-t border-primary/50 rounded-sm" style={{ height: `${h}%` }} />
                          ))}
                        </div>
                        <div className="flex justify-between text-[8px] font-mono text-outline">
                          <span>North</span><span>South</span><span>East</span><span>West</span><span>EU</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-outline text-center font-sans">Use this when you want to <span className="text-white font-semibold">explore, compare, or visualize</span> your data.</p>
                </div>
              ) : (
                /* ── Deep Diagnostics empty state ── */
                <div className="w-full max-w-xl space-y-4">
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Activity className="h-5 w-5 text-amber-400" />
                      <h3 className="font-bold text-white text-sm uppercase tracking-wider font-sans">Deep Diagnostics</h3>
                    </div>
                    <p className="text-xs text-on-surface-variant font-sans">Investigate <span className="text-white">why</span> something happened — get a root cause verdict.</p>
                  </div>

                  {/* Example flow */}
                  <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-lg p-4 space-y-3 text-left">
                    {/* Example question */}
                    <div className="flex items-start gap-2">
                      <span className="text-[9px] font-mono font-bold text-amber-400 uppercase tracking-widest shrink-0 mt-0.5">You</span>
                      <span className="text-xs text-white font-sans italic">"Why did orders drop 20% last week?"</span>
                    </div>
                    {/* Investigation steps */}
                    <div className="border-l-2 border-outline-variant/30 ml-[22px] pl-3 space-y-2">
                      {[
                        { agent: 'Scout', color: 'text-blue-400', msg: 'Scanning schema — flagged orders, discounts tables' },
                        { agent: 'Sleuth', color: 'text-purple-400', msg: 'Running 3 SQL queries across flagged tables...' },
                        { agent: 'Judge', color: 'text-amber-400', msg: 'Evidence sufficient — routing to Narrator' },
                      ].map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className={`text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 ${s.color}`}>{s.agent}</span>
                          <span className="text-[10px] font-mono text-outline">{s.msg}</span>
                        </div>
                      ))}
                      {/* Verdict box */}
                      <div className="bg-emerald-500/5 border border-emerald-500/25 rounded p-2 mt-1">
                        <div className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider mb-1">Verdict</div>
                        <p className="text-[10px] text-white/80 font-sans leading-relaxed">Discount voucher over-redemption drove a 22% AOV drop in the North region. Recommend capping single-use vouchers at 15%.</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-outline text-center font-sans">Use this when you want to <span className="text-white font-semibold">investigate a problem</span> or understand a drop/spike.</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-grow flex flex-col justify-start w-full min-h-0 space-y-6"
            >
              {/* Header section with User Query and Action Button */}
              <div className="flex items-start justify-between border-b border-outline-variant/30 pb-4 shrink-0">
                <div>
                  <span className="text-[9px] font-mono font-bold text-primary uppercase tracking-widest block mb-1">
                    {chatMode === 'diagnose' ? "Anomaly Diagnosed" : "Query Executed"}
                  </span>
                  <h2 className="text-md font-bold text-white uppercase tracking-tight italic font-sans">
                    "{lastUserMessage?.content || "Data Exploration Query"}"
                  </h2>
                </div>
                {chatMode !== 'diagnose' && (hasChartData || isKPI) && (
                  lastAssistantMessage.result?.chart_id ? (
                    <Button
                      onClick={() => {
                        const chartId = lastAssistantMessage.result?.chart_id;
                        if (chartId && onDeleteChart) {
                          onDeleteChart(chartId);
                        }
                      }}
                      className="h-8 rounded-[4px] border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-xs font-mono font-bold uppercase tracking-wider text-destructive px-4 gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Unsave Chart
                    </Button>
                  ) : (
                    <Button
                      onClick={handlePinChart}
                      className="h-8 rounded-[4px] border border-outline-variant bg-surface-container hover:bg-surface-container-high text-xs font-mono font-bold uppercase tracking-wider text-primary px-4 gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Chart
                    </Button>
                  )
                )}
              </div>

              {/* Workspace Content Block */}
              {chatMode === 'diagnose' ? (
                /* Diagnostic verdict workspace */
                lastAssistantMessage.result?.diagnose_data ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-grow min-h-0">
                    {/* Diagnostic verdict log details */}
                    <div className="bg-surface-container border border-outline-variant rounded-lg p-5 flex flex-col justify-between min-h-[300px]">
                      <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2.5 mb-3">
                        <span className="text-[10px] font-mono font-bold text-outline uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-primary" /> Diagnostic Telemetry Timeline
                        </span>
                      </div>
                      
                      <div className="flex-grow overflow-y-auto pr-1 space-y-3 max-h-[220px] custom-scrollbar">
                        {lastAssistantMessage.result.diagnose_data.diagnostic_path.map((step: any, idx: number) => {
                          const isCritical = step.status === 'critical';
                          return (
                            <div key={idx} className={cn(
                              "p-3 rounded border text-[11px] bg-surface-container-low font-mono",
                              isCritical ? "border-destructive/30 bg-destructive/5" : "border-outline-variant/30"
                            )}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] text-outline font-bold">Step {idx + 1} // {step.title}</span>
                                {isCritical && <ShieldAlert className="h-3 w-3 text-destructive animate-pulse" />}
                              </div>
                              <p className="text-on-surface-variant leading-relaxed text-[10px]">{step.finding}</p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[9px] font-mono text-outline-variant italic mt-3 pt-2 border-t border-outline-variant/15">
                        Scan completed in {lastAssistantMessage.result.execution_time_ms ? `${lastAssistantMessage.result.execution_time_ms.toFixed(0)}ms` : "820ms"}
                      </div>
                    </div>

                    {/* Verdict Card */}
                    <div className="bg-surface-container border border-outline-variant rounded-lg p-5 flex flex-col min-h-[300px] justify-between">
                      <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2.5 mb-3">
                        <span className="text-[10px] font-mono font-bold text-outline-variant uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Root Cause Verdict
                        </span>
                      </div>
                      <div className="p-4 bg-surface-container-low rounded border border-outline-variant/40 flex-grow flex items-center justify-center italic text-xs leading-relaxed text-white/90">
                        "{lastAssistantMessage.result.diagnose_data.verdict}"
                      </div>
                      <div className="text-[9px] font-mono text-outline-variant italic mt-3 pt-2 border-t border-outline-variant/15">
                        Quantified loss: -${lastAssistantMessage.result.diagnose_data.diagnostic_path.find((p: any) => p.status === 'critical')?.financial_impact_dollars || 0}.00 impact
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 bg-surface-container border border-outline-variant rounded-lg">
                    <p className="text-xs text-outline font-mono uppercase">Diagnostic result is empty or failed.</p>
                  </div>
                )
              ) : (
                /* Query & Charts workspace */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-grow min-h-0">
                  {/* Left Side: Plotly Chart or KPI Card */}
                  <div className="bg-surface-container border border-outline-variant rounded-lg p-5 flex flex-col justify-between min-h-[300px]">
                    <div className="flex-grow w-full min-h-0 relative flex items-center justify-center">
                      {isKPI ? (
                        <div className="flex flex-col items-center justify-center text-center py-2 h-full w-full">
                          <div className="text-[11px] font-mono uppercase tracking-widest text-outline mb-4">
                            {kpiKey?.replace(/_/g, ' ')}
                          </div>
                          <div className="text-6xl font-bold text-white font-sans tracking-tight leading-none mb-4">
                            {formatKPI(kpiValue)}
                          </div>
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Live Query Result
                          </div>
                        </div>
                      ) : hasChartData ? (
                        <Plot
                          data={plotlyData}
                          layout={chartLayout}
                          config={{
                            responsive: true,
                            displayModeBar: false,
                            displaylogo: false,
                          }}
                          style={{ width: '100%', height: '100%' }}
                          useResizeHandler
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-outline-variant/20 space-y-2">
                          <Database className="h-6 w-6" />
                          <p className="text-[9px] font-mono uppercase tracking-wider font-bold">Chart Resolution Null</p>
                        </div>
                      )}
                    </div>
                    <div className="text-center font-mono text-[9px] text-outline mt-3 pt-2 border-t border-outline-variant/15">
                      {lastAssistantMessage.result?.chart?.title || "Revenue Analysis Chart"}
                    </div>
                  </div>

                  {/* Right Side: Tabular Data */}
                  <div className="bg-surface-container border border-outline-variant rounded-lg p-5 flex flex-col justify-between min-h-[300px]">
                    <div className="flex flex-col min-h-0 flex-grow">
                      <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2.5 mb-3 shrink-0">
                        <span className="text-[10px] font-mono font-bold text-outline uppercase tracking-wider">Source Tabular Data</span>
                        <button className="text-[9px] font-mono font-bold text-primary hover:underline uppercase tracking-wider">
                          Export CSV
                        </button>
                      </div>

                      <div className="flex-grow overflow-auto custom-scrollbar max-h-[220px]">
                        {tableRows.length > 0 ? (
                          <table className="w-full border-collapse text-[10px] font-mono text-on-surface-variant">
                            <thead>
                              <tr className="bg-surface-container-high border-b border-outline-variant/40 sticky top-0 z-10">
                                {tableHeaders.map((header) => (
                                  <th key={header} className="text-left p-2.5 font-bold uppercase tracking-wider text-outline text-[9px]">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/15">
                              {tableRows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-surface-container-high transition-all">
                                  {Object.values(row).map((val: any, vIdx) => (
                                    <td key={vIdx} className="p-2.5 text-white/80">
                                      {val === null || val === undefined ? "null" : String(val)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="h-full flex items-center justify-center text-outline-variant/20 font-mono text-[10px] uppercase">
                            No rows returned
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-[9px] font-mono text-outline-variant italic mt-3 pt-2 border-t border-outline-variant/15 shrink-0">
                      Viewing {tableRows.length} of {lastAssistantMessage.result?.row_count || tableRows.length} records
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Suggestions Shelf */}
      <div className="space-y-2 text-center py-2 shrink-0 border-t border-outline-variant/10">
        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-outline">Common forensics queries you can try:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {suggestionsLoading ? (
            <div className="flex items-center gap-2 text-[10px] font-mono text-outline">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Generating query recommendations...
            </div>
          ) : (
            suggestionsList.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="px-3.5 py-1.5 border border-outline-variant/35 rounded bg-surface-container hover:bg-surface-container-high hover:border-primary/50 text-white/70 hover:text-primary transition-all font-mono text-[10px] cursor-pointer"
              >
                "{suggestion}"
              </button>
            ))
          )}
        </div>
      </div>

      {/* Input container and status meters */}
      <div className="shrink-0 pt-2">
        <form onSubmit={handleSubmit} className="relative flex">
          <div className="bg-surface-container border border-outline-variant rounded p-2.5 flex items-center gap-3 w-full shadow-lg">
            <Database className="h-4 w-4 text-outline shrink-0 ml-1.5" />
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                chatMode === 'diagnose'
                  ? "Ask a business problem to diagnose (e.g. 'Why did orders drop yesterday?')..."
                  : "Ask anything about your data (e.g., 'Compare revenue by region for last month')..."
              }
              disabled={isLoading}
              className="flex-grow bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-xs text-white placeholder-outline-variant/40 h-8 font-sans"
            />
            <button
              type="submit"
              disabled={!question.trim() || isLoading}
              className="h-8 px-4 rounded-[4px] bg-accent hover:bg-accent/90 text-accent-foreground transition-all flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current text-accent-foreground" />
              )}
            </button>
          </div>
        </form>

        {/* Telemetry Status Bar */}
        <div className="flex justify-center items-center gap-4 text-[9px] text-outline font-mono mt-3 uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Model: Forensic-XL (v4)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-outline-variant" />
            <span>Sync: 2m ago</span>
          </div>
        </div>
      </div>

    </div>
  );
}
