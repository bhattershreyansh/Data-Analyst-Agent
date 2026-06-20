import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Play, Loader2, Activity, Terminal, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dataSourcesAPI, AnomalyItem } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AnomalyAlertCenterProps {
  sourceId: string | null;
  onSuggestedQueryClick: (query: string) => void;
}

export function AnomalyAlertCenter({ sourceId, onSuggestedQueryClick }: AnomalyAlertCenterProps) {
  const { getToken } = useAuth();
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'ongoing' | 'resolved'>('new');

  const triggerScan = async () => {
    if (!sourceId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await dataSourcesAPI.scanAnomalies(sourceId, token);
      if (res.success && res.data) {
        setAnomalies(res.data.anomalies || []);
        if (res.data.anomalies && res.data.anomalies.length > 0) {
          toast.warning(`Forensic Scan Complete: Found ${res.data.anomalies.length} active anomalies.`);
        } else {
          toast.success("Scan Complete: Database is fully healthy.");
        }
      } else {
        toast.error("Diagnostic scan failed.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to execute data source scan.");
    } finally {
      setLoading(false);
    }
  };

  // Run initial scan on mount if source is connected
  useEffect(() => {
    if (sourceId) {
      triggerScan();
    } else {
      setAnomalies([]);
    }
  }, [sourceId]);

  if (!sourceId) {
    return (
      <aside className="fixed left-0 top-16 bottom-9 w-80 bg-surface-container-low border-r border-outline-variant flex flex-col p-4 justify-center items-center text-center space-y-4 z-40">
        <div className="p-3 rounded bg-surface-container border border-outline-variant text-primary">
          <ShieldAlert className="h-5 w-5 opacity-45" />
        </div>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Anomaly Alerts</h3>
        <p className="text-[11px] text-outline-variant max-w-[200px] leading-relaxed">
          Connect a data source to enable proactive anomaly scanning.
        </p>
      </aside>
    );
  }

  // Filter alerts by state
  const newAlerts = anomalies.filter(a => a.state === 'NEW');
  const ongoingAlerts = anomalies.filter(a => a.state === 'ONGOING');
  const resolvedAlerts = anomalies.filter(a => a.state === 'RESOLVED');

  const getFilteredAlerts = () => {
    if (activeTab === 'new') return newAlerts;
    if (activeTab === 'ongoing') return ongoingAlerts;
    return resolvedAlerts;
  };

  return (
    <aside className="fixed left-0 top-16 bottom-9 w-80 bg-surface-container-low border-r border-outline-variant flex flex-col z-40">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-mono text-xs font-black uppercase tracking-widest text-white">Anomaly Alerts</h2>
            <p className="text-[9px] text-outline font-mono uppercase tracking-wider">Forensic Monitoring</p>
          </div>
        </div>
      </div>

      {/* Action Trigger Button */}
      <div className="p-3 border-b border-outline-variant">
        <Button
          onClick={triggerScan}
          disabled={loading}
          className="w-full h-9 bg-primary hover:opacity-95 text-on-primary font-mono text-[10px] uppercase tracking-wider rounded-[4px] font-bold transition-all shadow active:scale-[0.98] flex items-center justify-center gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Terminal className="h-3.5 w-3.5" />
          )}
          {loading ? "Scanning Telemetry..." : "Run New Diagnostic"}
        </Button>
      </div>

      {/* Alert Filter Tabs */}
      <div className="flex border-b border-outline-variant font-mono text-[9px] bg-surface-container-lowest shrink-0">
        <button
          onClick={() => setActiveTab('new')}
          className={cn(
            "flex-1 py-2 text-center relative border-b-2 font-bold transition-all uppercase tracking-wider",
            activeTab === 'new'
              ? "text-primary border-primary bg-primary/5"
              : "text-outline-variant border-transparent hover:text-white"
          )}
        >
          New
          {newAlerts.length > 0 && (
            <span className="ml-1.5 px-1 bg-destructive text-destructive-foreground rounded-[2px] text-[8px] font-bold">
              {newAlerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('ongoing')}
          className={cn(
            "flex-1 py-2 text-center relative border-b-2 font-bold transition-all uppercase tracking-wider",
            activeTab === 'ongoing'
              ? "text-primary border-primary bg-primary/5"
              : "text-outline-variant border-transparent hover:text-white"
          )}
        >
          Ongoing
          {ongoingAlerts.length > 0 && (
            <span className="ml-1.5 px-1 bg-secondary text-secondary-foreground rounded-[2px] text-[8px] font-bold">
              {ongoingAlerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('resolved')}
          className={cn(
            "flex-1 py-2 text-center relative border-b-2 font-bold transition-all uppercase tracking-wider",
            activeTab === 'resolved'
              ? "text-primary border-primary bg-primary/5"
              : "text-outline-variant border-transparent hover:text-white"
          )}
        >
          Resolved
        </button>
      </div>

      {/* Alerts Feed */}
      <div className="flex-grow flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {getFilteredAlerts().length === 0 ? (
          <div className="text-center py-12 text-[10px] text-outline font-mono uppercase tracking-wider space-y-2">
            <CheckCircle className="h-5 w-5 text-emerald-500 mx-auto opacity-35" />
            <p>No anomalies in active state</p>
          </div>
        ) : (
          getFilteredAlerts().map((a, idx) => {
            const isNew = a.state === 'NEW';
            const isResolved = a.state === 'RESOLVED';

            return (
              <div
                key={a.anomaly_key || idx}
                onClick={() => !isResolved && onSuggestedQueryClick(a.suggested_query)}
                className={cn(
                  "p-3 rounded bg-surface-container border border-outline-variant/30 border-l-4 transition-all duration-200 cursor-pointer hover:bg-surface-container-high group flex flex-col gap-1.5",
                  isResolved
                    ? "border-emerald-500/80 opacity-60"
                    : isNew
                      ? "border-destructive"
                      : "border-secondary"
                )}
              >
                <div className="flex justify-between items-center">
                  <span className={cn(
                    "text-[8px] font-bold px-1.5 py-0.5 rounded-[2px] font-mono uppercase",
                    isResolved
                      ? "bg-emerald-500/10 text-emerald-400"
                      : isNew
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-secondary-container text-on-secondary-container"
                  )}>
                    {a.state}
                  </span>
                  <span className="font-mono text-[8px] text-outline">
                    {isResolved ? "Resolved" : isNew ? "2m ago" : `Day ${a.duration.match(/\d+/) || a.duration}`}
                  </span>
                </div>

                <h4 className="text-[12px] font-bold text-white group-hover:text-primary transition-colors leading-snug">
                  {a.metric}
                </h4>

                <p className="text-[10px] text-on-surface-variant leading-normal line-clamp-2">
                  {a.description}
                </p>

                {a.financial_impact_dollars > 0 && (
                  <div className="flex items-center justify-between border-t border-outline-variant/15 pt-1.5 mt-1 font-mono text-[9px]">
                    <span className={cn(
                      "font-bold",
                      isResolved ? "text-emerald-400" : isNew ? "text-destructive" : "text-on-surface-variant"
                    )}>
                      -${a.financial_impact_dollars}.00 impact
                    </span>
                    {!isResolved && (
                      <span className="text-primary hover:underline flex items-center gap-0.5 text-[8px] uppercase tracking-wider font-bold">
                        Diagnose <Play className="h-2 w-2 fill-current" />
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Technical Links */}
      <div className="mt-auto border-t border-outline-variant p-2 space-y-1 bg-surface-container-lowest">
        <div className="flex items-center gap-2.5 p-2 text-outline-variant hover:text-white rounded hover:bg-white/5 cursor-pointer transition-all">
          <Terminal className="h-3.5 w-3.5" />
          <span className="font-mono text-[9px] uppercase tracking-wider">System Health</span>
        </div>
        <div className="flex items-center gap-2.5 p-2 text-outline-variant hover:text-white rounded hover:bg-white/5 cursor-pointer transition-all">
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="font-mono text-[9px] uppercase tracking-wider">Documentation</span>
        </div>
      </div>
    </aside>
  );
}
