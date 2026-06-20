import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useAuth, useUser } from '@/context/AuthContext';
import { queryAPI, dataSourcesAPI, modeAPI, AnomalyItem } from '@/lib/api';
import { 
  Activity, 
  Terminal, 
  CheckCircle, 
  ShieldAlert, 
  Loader2, 
  Play, 
  Copy, 
  CheckCircle2, 
  AlertOctagon, 
  Info, 
  ArrowRight,
  ExternalLink,
  HelpCircle,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function ForensicsMonitor() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.user_id;
  const navigate = useNavigate();

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string>("");
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [selectedAnomalyKey, setSelectedAnomalyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'ongoing' | 'resolved'>('new');
  const [copied, setCopied] = useState(false);

  // Fetch active database source
  useEffect(() => {
    const fetchActiveSource = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        
        const response = await modeAPI.getStatus(token);
        if (response.success && response.data.active_source) {
          setActiveSourceId(response.data.active_source.source_id);
          setActiveSourceName(response.data.active_source.name);
        }
      } catch (error) {
        console.error("Failed to fetch active source:", error);
      }
    };

    if (userId) {
      fetchActiveSource();
    }
  }, [userId]);

  // Fetch anomalies once active source is loaded
  const fetchAnomalies = async (showToast = false) => {
    if (!activeSourceId) return;
    setScanLoading(true);
    try {
      const token = await getToken();
      const res = await dataSourcesAPI.scanAnomalies(activeSourceId, token);
      if (res.success && res.data) {
        setAnomalies(res.data.anomalies || []);
        if (showToast) {
          if (res.data.anomalies && res.data.anomalies.length > 0) {
            toast.warning(`Diagnostics Complete: Detected ${res.data.anomalies.length} unresolved anomalies.`);
          } else {
            toast.success("Diagnostics Complete: Data nodes are fully healthy.");
          }
        }
      } else {
        toast.error("Failed to execute telemetry diagnostics scan.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error during diagnostic scan.");
    } finally {
      setScanLoading(false);
    }
  };

  useEffect(() => {
    if (activeSourceId) {
      fetchAnomalies(false);
    } else {
      setAnomalies([]);
    }
  }, [activeSourceId]);

  // Copy query tool
  const handleCopyQuery = (queryText: string) => {
    navigator.clipboard.writeText(queryText);
    setCopied(true);
    toast.success("Verification query copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Run automated query in analytics workspace
  const handleRunDiagnostic = (queryText: string) => {
    localStorage.setItem('auto_run_query', queryText);
    toast.info("Routing query to active workspace...");
    navigate('/analytics');
  };

  // Update Anomaly Status
  const handleUpdateStatus = (key: string, newState: 'NEW' | 'ONGOING' | 'RESOLVED') => {
    setAnomalies(prev => prev.map(a => 
      a.anomaly_key === key ? { ...a, state: newState } : a
    ));
    toast.success(`Anomaly transitioned to state: ${newState}`);
  };

  // Dynamic Verification Checklist Generator
  const getValidationSuggestions = (key: string): string[] => {
    if (key.startsWith('inventory:')) {
      return [
        "Verify physical inventory stock values inside the inventory warehouse systems.",
        "Inspect upcoming Purchase Orders (PO) or freight restock logs.",
        "Assess average daily sales velocity trends to confirm remaining duration calculation.",
        "Check manufacturer shipping and lead time configurations."
      ];
    }
    if (key.startsWith('refund:')) {
      return [
        "Review sizing charts and product description alignment for details mismatch.",
        "Check return/refund customer feedback comments for repeating complaints.",
        "Audit product factory batches for quality assurance logs.",
        "Verify if refund values correspond with actual purchase amounts."
      ];
    }
    if (key.startsWith('revenue_dip:')) {
      return [
        "Verify checkout gateway latency metrics and payment processor connections.",
        "Assess recent ad campaigns or digital marketing traffic funnels.",
        "Audit storefront order API webhook delivery and latency logs.",
        "Compare daily order frequencies to detect dropped connection anomalies."
      ];
    }
    if (key.startsWith('discount:')) {
      return [
        "Audit coupon order logs for checkout discount code misuse or leaks.",
        "Verify product wholesale profit margins to calculate net financial impact.",
        "Cross-reference active promotions with the marketing campaigns calendar.",
        "Check admin access logs for unapproved coupon changes."
      ];
    }
    return [
      "Review the raw source tables referenced in the suggested query.",
      "Verify row count volumes inside the database tables.",
      "Cross-check metrics with historical dashboard averages."
    ];
  };

  // Filter alerts by active tab state
  const getFilteredAnomalies = () => {
    return anomalies.filter(a => {
      const state = (a.state || 'NEW').toLowerCase();
      return state === activeTab;
    });
  };

  const selectedAnomaly = anomalies.find(a => a.anomaly_key === selectedAnomalyKey);
  const newCount = anomalies.filter(a => (a.state || 'NEW') === 'NEW').length;
  const ongoingCount = anomalies.filter(a => (a.state || 'NEW') === 'ONGOING').length;

  return (
    <div className="h-[calc(100vh-36px)] bg-background text-foreground relative overflow-hidden flex flex-col">
      {/* Glow decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      <Header />

      <div className="flex flex-1 h-[calc(100vh-64px-36px)] overflow-hidden relative">
        
        {/* LEFT PANE: Master Anomaly Inbox */}
        <aside className="w-96 border-r border-outline-variant bg-surface-container-low flex flex-col z-30 shrink-0">
          
          {/* Header Info */}
          <div className="p-5 border-b border-outline-variant">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-mono text-xs font-black uppercase tracking-widest text-white">Forensic Monitor</h2>
                  <p className="text-[9px] text-outline font-mono uppercase tracking-wider">Operational Triage</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[8px] bg-surface-container border border-outline-variant/30 px-2 py-1 rounded-[2px] text-outline">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeSourceName || "No node connected"}
              </div>
            </div>

            {/* Run New Diagnostic Trigger */}
            <Button
              onClick={() => fetchAnomalies(true)}
              disabled={scanLoading || !activeSourceId}
              className="w-full h-9 bg-primary hover:opacity-95 text-on-primary font-mono text-[10px] uppercase tracking-wider rounded-[4px] font-bold transition-all shadow flex items-center justify-center gap-1.5"
            >
              {scanLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Terminal className="h-3.5 w-3.5" />
              )}
              {scanLoading ? "Analyzing Data Nodes..." : "Execute Diagnostic Scan"}
            </Button>
          </div>

          {/* Inbox Filter Tabs */}
          <div className="flex border-b border-outline-variant font-mono text-[9px] bg-surface-container-lowest shrink-0">
            <button
              onClick={() => setActiveTab('new')}
              className={cn(
                "flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase tracking-wider flex justify-center items-center gap-1.5",
                activeTab === 'new'
                  ? "text-primary border-primary bg-primary/5"
                  : "text-outline-variant border-transparent hover:text-white"
              )}
            >
              New Alerts
              {newCount > 0 && (
                <span className="px-1.5 py-0.5 bg-destructive text-destructive-foreground rounded-[2px] text-[8px] font-mono font-bold">
                  {newCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('ongoing')}
              className={cn(
                "flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase tracking-wider flex justify-center items-center gap-1.5",
                activeTab === 'ongoing'
                  ? "text-primary border-primary bg-primary/5"
                  : "text-outline-variant border-transparent hover:text-white"
              )}
            >
              Ongoing
              {ongoingCount > 0 && (
                <span className="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded-[2px] text-[8px] font-mono font-bold">
                  {ongoingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('resolved')}
              className={cn(
                "flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase tracking-wider flex justify-center items-center gap-1.5",
                activeTab === 'resolved'
                  ? "text-primary border-primary bg-primary/5"
                  : "text-outline-variant border-transparent hover:text-white"
              )}
            >
              Resolved
            </button>
          </div>

          {/* Feed List */}
          <ScrollArea className="flex-grow flex-1">
            <div className="p-4 space-y-3">
              {getFilteredAnomalies().length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto opacity-35" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-white">Triage Clear</p>
                    <p className="text-[9px] text-outline max-w-[200px] mx-auto leading-normal">
                      No database anomalies found matching this state filter.
                    </p>
                  </div>
                </div>
              ) : (
                getFilteredAnomalies().map((a, idx) => {
                  const severity = a.severity || 'MEDIUM';
                  const duration = a.duration || 'new';
                  const metric = a.metric || 'Anomaly Detected';
                  const description = a.description || 'No description provided.';
                  const state = a.state || 'NEW';
                  const key = a.anomaly_key || `anomaly-${idx}`;
                  const isSelected = selectedAnomalyKey === key;
                  
                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedAnomalyKey(key)}
                      className={cn(
                        "p-3.5 rounded bg-surface-container border cursor-pointer transition-all duration-200 flex flex-col gap-2 relative overflow-hidden group",
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-outline-variant/30 hover:bg-surface-container-high hover:border-outline-variant"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span className={cn(
                          "text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] uppercase border",
                          severity === 'HIGH' 
                            ? "bg-destructive/10 text-destructive border-destructive/20" 
                            : "bg-surface-container-high text-outline border-outline-variant/35"
                        )}>
                          {severity}
                        </span>
                        <span className="font-mono text-[8px] text-outline-variant">
                          {duration === 'new' ? 'NEW' : duration}
                        </span>
                      </div>

                      <h3 className="font-bold text-xs text-white group-hover:text-primary transition-colors leading-snug">
                        {metric}
                      </h3>

                      <p className="text-[10px] text-on-surface-variant line-clamp-2 leading-relaxed">
                        {description}
                      </p>

                      {a.financial_impact_dollars > 0 && (
                        <div className="flex items-center justify-between border-t border-outline-variant/15 pt-2 mt-1 font-mono text-[9px] text-outline-variant">
                          <span className={state === 'RESOLVED' ? 'text-emerald-400 font-bold' : 'text-destructive font-bold'}>
                            -${a.financial_impact_dollars || 0}.00 impact
                          </span>
                          <span className="text-primary group-hover:underline flex items-center gap-0.5 text-[8px] uppercase tracking-wider font-bold">
                            Inspect <ChevronRight className="h-2 w-2" />
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* RIGHT PANE: Forensic Anomaly Inspector */}
        <main className="flex-grow bg-surface-dim overflow-y-auto custom-scrollbar flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            {!selectedAnomaly ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-grow flex flex-col items-center justify-center p-12 text-center select-none"
              >
                <div className="h-16 w-16 rounded bg-surface-container border border-outline-variant flex items-center justify-center mb-4">
                  <AlertOctagon className="h-6 w-6 text-outline-variant/40 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Select Anomaly Alert</h3>
                  <p className="text-[11px] text-outline font-mono uppercase tracking-wide max-w-sm mx-auto leading-normal">
                    Choose a diagnostic alert node from the triage inbox to inspect telemetry metrics and suggested check routines.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={selectedAnomaly.anomaly_key}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-8 flex flex-col gap-6 max-w-4xl w-full"
              >
                {/* Header */}
                <div className="border-b border-outline-variant/35 pb-5">
                  <div className="flex items-center gap-2 mb-2 font-mono text-[9px] text-primary uppercase tracking-widest">
                    <Activity className="h-3.5 w-3.5" />
                    <span>Forensic Node: {selectedAnomaly.anomaly_key}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <h2 className="text-lg font-black text-white uppercase tracking-tight italic font-sans max-w-xl leading-snug">
                      {selectedAnomaly.metric || "Anomaly Detected"}
                    </h2>
                    
                    <div className="flex gap-2">
                      {(selectedAnomaly.state || 'NEW') === 'NEW' && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateStatus(selectedAnomaly.anomaly_key, 'ONGOING')}
                          className="h-8 rounded-[4px] border border-outline-variant bg-surface-container hover:bg-surface-container-high font-mono text-[9px] uppercase tracking-wider text-outline hover:text-white"
                        >
                          Acknowledge Alert
                        </Button>
                      )}
                      {(selectedAnomaly.state || 'NEW') !== 'RESOLVED' && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateStatus(selectedAnomaly.anomaly_key, 'RESOLVED')}
                          className="h-8 rounded-[4px] border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 font-mono text-[9px] uppercase tracking-wider font-bold"
                        >
                          Mark Resolved
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metrics Summary Blocks */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-surface-container border border-outline-variant/30 p-4 rounded-[4px] flex flex-col gap-1">
                    <span className="text-[9px] text-outline font-mono uppercase tracking-wider">Severity Status</span>
                    <span className={cn(
                      "text-sm font-black font-mono",
                      selectedAnomaly.severity === 'HIGH' ? 'text-destructive' : 'text-primary'
                    )}>
                      {selectedAnomaly.severity || 'MEDIUM'} RISK
                    </span>
                  </div>
                  <div className="bg-surface-container border border-outline-variant/30 p-4 rounded-[4px] flex flex-col gap-1">
                    <span className="text-[9px] text-outline font-mono uppercase tracking-wider">Unresolved Duration</span>
                    <span className="text-sm font-black text-white font-mono uppercase">
                      {selectedAnomaly.duration === 'new' ? 'Just Detected' : (selectedAnomaly.duration || 'new')}
                    </span>
                  </div>
                  <div className="bg-surface-container border border-outline-variant/30 p-4 rounded-[4px] flex flex-col gap-1">
                    <span className="text-[9px] text-outline font-mono uppercase tracking-wider">Calculated Impact Loss</span>
                    <span className="text-sm font-black text-destructive font-mono">
                      -${selectedAnomaly.financial_impact_dollars || 0}.00 USD
                    </span>
                  </div>
                </div>

                {/* Description & Core Finding */}
                <div className="bg-surface-container border border-outline-variant/30 p-5 rounded-[4px] space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-primary" />
                    Telemetry Anomaly Verdict
                  </h4>
                  <p className="text-on-surface-variant text-[11px] leading-relaxed">
                    {selectedAnomaly.description || 'No description provided.'}
                  </p>
                </div>

                {/* Suggested Human-Verification Steps */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Recommended Manual Verification Checklist
                  </h4>
                  <div className="bg-surface-container border border-outline-variant/30 p-5 rounded-[4px] space-y-3.5">
                    <p className="text-[10px] text-outline-variant italic">
                      Verify calculations and connected store states using the following playbook steps:
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {getValidationSuggestions(selectedAnomaly.anomaly_key || '').map((step, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-[11px] leading-relaxed text-on-surface-variant">
                          <div className="h-4.5 w-4.5 rounded bg-surface-container-high border border-outline-variant flex items-center justify-center text-[9px] font-mono text-white font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </div>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* target verification SQL query */}
                {selectedAnomaly.suggested_query && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Terminal className="h-4 w-4 text-primary" />
                        Target Verification SQL Query
                      </h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyQuery(selectedAnomaly.suggested_query || '')}
                        className="h-7 px-2.5 rounded-[4px] text-outline hover:text-white hover:bg-white/5 font-mono text-[9px] uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        {copied ? "Copied" : "Copy Query"}
                      </Button>
                    </div>
                    
                    <div className="relative group">
                      <pre className="p-4.5 bg-surface-container border border-outline-variant/35 rounded-[4px] font-mono text-[10px] text-accent/90 overflow-x-auto select-all leading-relaxed max-h-48 custom-scrollbar">
                        {selectedAnomaly.suggested_query}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Diagnostics control console */}
                {selectedAnomaly.suggested_query && (
                  <div className="pt-2 border-t border-outline-variant/20 flex justify-end">
                    <Button
                      onClick={() => handleRunDiagnostic(selectedAnomaly.suggested_query || '')}
                      className="bg-primary hover:opacity-95 text-on-primary font-mono text-[10px] uppercase tracking-wider rounded-[4px] font-bold h-9 px-5 transition-all shadow flex items-center gap-1.5 active:scale-[0.98]"
                    >
                      Run Automated Diagnostic Query
                      <Play className="h-3 w-3 fill-current" />
                    </Button>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom Technical Bar */}
      <footer className="mt-auto border-t border-outline-variant bg-surface-container-lowest h-9 px-6 flex items-center justify-between z-30 font-mono text-[9px] text-outline uppercase tracking-wider shrink-0">
        <div>v2.4.1-stable</div>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-white">Platform Status</a>
          <a href="#" className="hover:text-white">API Docs</a>
          <a href="#" className="hover:text-white">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
