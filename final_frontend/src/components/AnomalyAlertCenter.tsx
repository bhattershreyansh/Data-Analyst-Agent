import { useState } from 'react';
import { ShieldAlert, CheckCircle, Play, Loader2, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dataSourcesAPI, AnomalyItem } from '@/lib/api';
import { useAuth } from '@clerk/react';
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
  const [expanded, setExpanded] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const triggerScan = async () => {
    if (!sourceId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await dataSourcesAPI.scanAnomalies(sourceId, token);
      if (res.success && res.data) {
        setAnomalies(res.data.anomalies || []);
        setHasScanned(true);
        if (res.data.anomalies && res.data.anomalies.length > 0) {
          toast.warning(`Scanner Alert: Found ${res.data.anomalies.length} active anomalies.`);
          setExpanded(true);
        } else {
          toast.success("Scanner complete: Database is fully healthy. No anomalies found.");
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

  if (!sourceId) return null;

  const activeAlerts = anomalies.filter(a => a.state !== 'RESOLVED');
  const resolvedAlerts = anomalies.filter(a => a.state === 'RESOLVED');

  return (
    <Card className="glass border-white/10 p-6 rounded-3xl overflow-hidden shadow-xl relative backdrop-blur-md">
      {/* Background radial accent */}
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-primary">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg tracking-tight">Indispensable Anomaly Monitor</h3>
            <p className="text-muted-foreground text-xs leading-relaxed max-w-md">
              Scans inventory velocity, variant refunds, discount leakage, and double-windowed sales dips.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={triggerScan}
            disabled={loading}
            className="rounded-2xl gap-2 font-semibold shadow-lg shadow-primary/10 py-5 px-6"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            {loading ? "Scanning Metrics..." : "Run Diagnostic Scan"}
          </Button>

          {hasScanned && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-white rounded-xl"
            >
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>

      {hasScanned && (
        <div className="flex items-center gap-3 mt-4 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            {activeAlerts.length} Active Warnings
          </span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span className="flex items-center gap-1 text-emerald-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {resolvedAlerts.length} Issues Resolved
          </span>
        </div>
      )}

      <AnimatePresence>
        {expanded && hasScanned && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden mt-6 space-y-4"
          >
            {anomalies.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                No anomalies detected. Database operations are healthy.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {anomalies.map((a, idx) => {
                  const isNew = a.state === 'NEW';
                  const isResolved = a.state === 'RESOLVED';

                  return (
                    <motion.div
                      key={a.anomaly_key || idx}
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className={cn(
                        "p-5 rounded-2xl border flex flex-col justify-between transition-all duration-300 relative overflow-hidden backdrop-blur-sm shadow-md",
                        isResolved
                          ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                          : isNew
                            ? "bg-destructive/5 border-destructive/20 text-red-300"
                            : "bg-amber-500/5 border-amber-500/20 text-amber-300"
                      )}
                    >
                      {/* State Badge */}
                      <div className="flex items-center justify-between mb-3">
                        <span className={cn(
                          "text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border",
                          isResolved
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : isNew
                              ? "bg-destructive/10 border-destructive/20 text-red-400"
                              : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        )}>
                          {a.state} {a.duration !== 'new' && a.duration !== 'resolved' && `(Seen for ${a.duration})`}
                        </span>

                        {a.financial_impact_dollars > 0 && (
                          <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded-lg border",
                            isResolved
                              ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-400"
                              : isNew
                                ? "bg-destructive/15 border-destructive/25 text-red-400"
                                : "bg-amber-500/15 border-amber-500/25 text-amber-400"
                          )}>
                            -${a.financial_impact_dollars} Impact
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 mb-4">
                        <h4 className="font-bold text-white text-sm">{a.metric}</h4>
                        <p className="text-xs text-foreground/80 leading-relaxed">
                          {a.description}
                        </p>
                      </div>

                      {a.suggested_query && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onSuggestedQueryClick(a.suggested_query)}
                          className={cn(
                            "w-full rounded-xl gap-2 text-xs font-semibold py-4 mt-auto border transition-all duration-300",
                            isResolved
                              ? "hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/10 hover:border-emerald-500/20"
                              : isNew
                                ? "hover:bg-destructive/10 text-red-400 border-destructive/10 hover:border-destructive/20"
                                : "hover:bg-amber-500/10 text-amber-400 border-amber-500/10 hover:border-amber-500/20"
                          )}
                        >
                          <Play className="h-3 w-3 fill-current" />
                          Diagnose with Query
                        </Button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
