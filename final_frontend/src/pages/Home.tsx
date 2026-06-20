import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Database, 
  Shield, 
  FileText, 
  ArrowRight, 
  Play, 
  Terminal, 
  Check, 
  Lock, 
  RefreshCw, 
  AlertTriangle, 
  HelpCircle,
  Clock,
  Layers,
  ChevronRight,
  Activity,
  BarChart3,
  LayoutDashboard,
  Eye,
  CheckCircle,
  Server
} from "lucide-react";
import { Header } from "@/components/Header";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface SimulationStep {
  time: string;
  agent: "SCOUT" | "SLEUTH" | "JUDGE" | "SYS";
  message: string;
}

interface Simulation {
  id: string;
  title: string;
  severity: "HIGH_SEVERITY" | "MEDIUM" | "LOW";
  impact: string;
  sql: string;
  steps: SimulationStep[];
  verdict: string;
}

const simulations: Record<string, Simulation> = {
  coupon: {
    id: "coupon",
    title: "Discount Voucher Abuse",
    severity: "HIGH_SEVERITY",
    impact: "-$850.00 margin impact",
    sql: "SELECT discount_code, customer_email, count(*) as usage_count FROM shopify_orders WHERE discount_code = 'SAVE50' GROUP BY 1, 2 HAVING count(*) > 1;",
    steps: [
      { time: "00:01", agent: "SYS", message: "Audit session started: Scanning discount code transaction rates." },
      { time: "00:03", agent: "SCOUT", message: "Flagged anomalous usage frequency on coupon code: SAVE50." },
      { time: "00:06", agent: "SLEUTH", message: "Executing cross-order identity verification query." },
      { time: "00:08", agent: "SLEUTH", message: "Identified customer correlation: 42 separate orders placed from single source IP." },
      { time: "00:11", agent: "JUDGE", message: "Root-cause analysis complete. Customer bypassed single-use policy via split guest checkouts." }
    ],
    verdict: "Voucher SAVE50 was misused across 42 orders by a single buyer using guest accounts. Recommend disabling guest checkouts for promotional coupons."
  },
  stockout: {
    id: "stockout",
    title: "Inventory Stockout Risk",
    severity: "MEDIUM",
    impact: "-$2,100.00 projected revenue loss",
    sql: "SELECT sku, stock_qty, sales_velocity_30d, (stock_qty / NULLIF(sales_velocity_30d / 30, 0)) as days_remaining FROM products WHERE stock_qty < 50;",
    steps: [
      { time: "00:01", agent: "SYS", message: "Audit session started: Analyzing inventory levels against velocity metrics." },
      { time: "00:04", agent: "SCOUT", message: "Detected low inventory levels on high-demand SKU-88921." },
      { time: "00:07", agent: "SLEUTH", message: "Calculating replenishment time gap against vendor latency." },
      { time: "00:10", agent: "SLEUTH", message: "Depletion estimate: 3.4 days remaining. Replenishment lead time: 14 days." },
      { time: "00:13", agent: "JUDGE", message: "Root-cause analysis complete. Identified 11-day stockout gap due to delayed reorder trigger." }
    ],
    verdict: "Sales velocity spiked 3.2x due to recent promotion. Current inventory will deplete in 3.4 days. Lead time creates an 11-day stockout gap."
  },
  refund: {
    id: "refund",
    title: "Abnormal Product Refund Rate",
    severity: "LOW",
    impact: "-$430.00 weekly refund spike",
    sql: "SELECT product_id, count(*) as return_count, sum(refund_amount) FROM shopify_refunds WHERE processed_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC;",
    steps: [
      { time: "00:01", agent: "SYS", message: "Audit session started: Monitoring weekly refund rate variance thresholds." },
      { time: "00:03", agent: "SCOUT", message: "Flagged refund counts exceeding standard variance threshold on product ID 2001." },
      { time: "00:06", agent: "SLEUTH", message: "Correlating return reason log sheets with production batch records." },
      { time: "00:09", agent: "SLEUTH", message: "Identified return reason cluster: 85% of returns attribute to sizing mismatch in batch 4-B." },
      { time: "00:12", agent: "JUDGE", message: "Root-cause analysis complete. Refund spike is isolated to manufacturing size drift." }
    ],
    verdict: "Refund rate for product 2001 (Size Medium) spiked 22%. 85% of return logs indicate sizing mismatch in manufacturing batch 4-B."
  }
};

export default function Home() {
  const { isSignedIn } = useAuth();
  const [activeSim, setActiveSim] = useState<Simulation>(simulations.coupon);
  const [runningStep, setRunningStep] = useState<number>(5);
  const [isSimulating, setIsSimulating] = useState(false);
  const [sqlConsoleInput, setSqlConsoleInput] = useState("");
  const [sqlConsoleOutput, setSqlConsoleOutput] = useState<string[]>([]);
  const [sqlStatus, setSqlStatus] = useState<"idle" | "safe" | "blocked">("idle");

  const [demoMode, setDemoMode] = useState<"anomaly" | "diagnostics">("diagnostics");
  const [anomalyStep, setAnomalyStep] = useState(0);
  const [isAnomalyRunning, setIsAnomalyRunning] = useState(false);
  const [hasRunAnomaly, setHasRunAnomaly] = useState(false);

  const runAnomalyDemo = () => {
    setIsAnomalyRunning(true);
    setHasRunAnomaly(true);
    setAnomalyStep(0);
  };

  useEffect(() => {
    if (!isAnomalyRunning) return;
    if (anomalyStep < 4) {
      const timer = setTimeout(() => {
        setAnomalyStep(prev => prev + 1);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsAnomalyRunning(false);
    }
  }, [anomalyStep, isAnomalyRunning]);

  const runSimulation = (sim: Simulation) => {
    setActiveSim(sim);
    setIsSimulating(true);
    setRunningStep(0);
  };

  useEffect(() => {
    if (!isSimulating) return;
    if (runningStep < activeSim.steps.length) {
      const timer = setTimeout(() => {
        setRunningStep(prev => prev + 1);
      }, 900);
      return () => clearTimeout(timer);
    } else {
      setIsSimulating(false);
    }
  }, [runningStep, isSimulating, activeSim]);

  const handleConsoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sqlConsoleInput.trim()) return;

    const lowerInput = sqlConsoleInput.toLowerCase();
    const mutatingKeywords = ["drop", "delete", "update", "insert", "alter", "truncate", "create"];
    const foundKeyword = mutatingKeywords.find(k => lowerInput.includes(k));

    if (foundKeyword) {
      setSqlStatus("blocked");
      setSqlConsoleOutput(prev => [
        `> ${sqlConsoleInput}`,
        `[SECURITY_GATE] ERROR: Blocked mutating statement [${foundKeyword.toUpperCase()}].`,
        `[SECURITY_GATE] Database connection is configured in read-only mode.`
      ]);
    } else {
      setSqlStatus("safe");
      setSqlConsoleOutput(prev => [
        `> ${sqlConsoleInput}`,
        `[SECURITY_GATE] Query parsed. Safety check completed successfully.`,
        `[DATABASE] Query permitted. Returned data rows in read-only environment.`
      ]);
    }
    setSqlConsoleInput("");
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-dim text-on-background font-sans overflow-x-hidden relative">
      {/* Background visual elements */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, #8a919f 1px, transparent 1px), linear-gradient(to bottom, #8a919f 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-to-b from-primary/10 via-transparent to-transparent blur-[120px] pointer-events-none" />

      <Header />

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center pt-24 pb-12 px-6 text-center max-w-5xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-primary/20 bg-primary/5 text-primary text-[11px] font-mono uppercase tracking-widest">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
            </span>
            Continuous Forensic Telemetry
          </div>

          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white leading-[1.1] max-w-4xl mx-auto uppercase">
            Forensic Data Intelligence <br />
            <span className="text-primary">For E-Commerce Operations.</span>
          </h1>

          <p className="text-sm md:text-base text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            Connect your database, ask questions in plain English, and get instant charts, KPI cards, and root-cause insights — no SQL knowledge required.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="pt-2 flex flex-wrap justify-center gap-4 relative z-20"
        >
          {isSignedIn ? (
            <Link to="/analytics">
              <Button size="lg" className="h-10 rounded-[4px] font-mono text-[11px] uppercase tracking-wider bg-primary hover:opacity-90 text-on-primary font-bold px-6 shadow-md transition-all">
                Launch Workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/register">
                <Button size="lg" className="h-10 rounded-[4px] font-mono text-[11px] uppercase tracking-wider bg-primary hover:opacity-90 text-on-primary font-bold px-6 shadow-md transition-all">
                  Create Analyst Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#demo" className="cursor-pointer">
                <Button variant="outline" size="lg" className="h-10 rounded-[4px] font-mono text-[11px] uppercase tracking-wider border-outline-variant hover:bg-white/5 text-on-surface hover:text-white px-6 transition-all">
                  Interact with Live Demo
                </Button>
              </a>
            </>
          )}
        </motion.div>
      </section>

      {/* Workspace Capabilities Section */}
      <section className="py-16 px-6 max-w-6xl mx-auto w-full relative z-10">
        <div className="text-center mb-12 space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-bold">Capabilities</span>
          <h2 className="text-2xl md:text-3xl font-bold text-white uppercase tracking-tight">Built For Modern Data Operations</h2>
          <p className="text-xs text-on-surface-variant max-w-xl mx-auto">Explore the powerful suite of analytical tools designed to monitor, analyze, and secure your database records.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-6 bg-surface-container/20 border border-white/5 hover:border-primary/20 rounded-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[200px] group">
            <div className="p-2.5 bg-primary/5 border border-primary/10 rounded-lg w-fit text-primary group-hover:scale-105 transition-transform">
              <Terminal className="h-5 w-5" />
            </div>
            <div className="space-y-1.5 mt-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">SQL Workstation</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">Ask database questions in plain English. Get back safety-checked read-only queries instantly.</p>
            </div>
          </div>

          <div className="p-6 bg-surface-container/20 border border-white/5 hover:border-primary/20 rounded-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[200px] group">
            <div className="p-2.5 bg-primary/5 border border-primary/10 rounded-lg w-fit text-primary group-hover:scale-105 transition-transform">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="space-y-1.5 mt-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Dynamic Charts</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">Instantly convert query results into beautiful, interactive bar, line, and pie chart visualizations.</p>
            </div>
          </div>

          <div className="p-6 bg-surface-container/20 border border-white/5 hover:border-primary/20 rounded-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[200px] group">
            <div className="p-2.5 bg-primary/5 border border-primary/10 rounded-lg w-fit text-primary group-hover:scale-105 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
            <div className="space-y-1.5 mt-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Saved Catalog</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">Catalog queries and chart states in a side drawer library for fast access across analysis sessions.</p>
            </div>
          </div>

          <div className="p-6 bg-surface-container/20 border border-white/5 hover:border-primary/20 rounded-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[200px] group">
            <div className="p-2.5 bg-primary/5 border border-primary/10 rounded-lg w-fit text-primary group-hover:scale-105 transition-transform">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="space-y-1.5 mt-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Grid Dashboards</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">Pin saved visualizations onto customizable, resizable grid canvas layouts for real-time dashboards.</p>
            </div>
          </div>

          <div className="p-6 bg-surface-container/20 border border-white/5 hover:border-primary/20 rounded-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[200px] group">
            <div className="p-2.5 bg-primary/5 border border-primary/10 rounded-lg w-fit text-primary group-hover:scale-105 transition-transform">
              <Activity className="h-5 w-5" />
            </div>
            <div className="space-y-1.5 mt-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Forensic Monitor</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">Monitor data feeds for leaks, stockouts, or discount fraud, running tailored verification tasks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Interactive Demo Container */}
      <section id="demo" className="px-6 pb-20 relative z-10 max-w-6xl mx-auto w-full">
        <div className="text-center mb-8 flex flex-col items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary block mb-2">Interactive Capabilities</span>
          <h2 className="text-xl md:text-2xl font-bold uppercase text-white mb-6">Live Feature Simulators</h2>
          
          {/* Demo Toggle */}
          <div className="inline-grid grid-cols-2 bg-surface-container-low p-1.5 rounded-lg border border-outline-variant/30 w-full max-w-[400px] gap-1">
            <button 
              onClick={() => setDemoMode("diagnostics")}
              className={`px-2 md:px-5 py-2.5 text-[10px] md:text-xs font-mono font-bold uppercase tracking-wider rounded-md transition-all ${
                demoMode === 'diagnostics' 
                  ? 'bg-surface-container-lowest border border-outline-variant/50 shadow-sm text-primary' 
                  : 'text-outline hover:text-white border border-transparent'
              }`}
            >
              Deep Diagnostics
            </button>
            <button 
              onClick={() => setDemoMode("anomaly")}
              className={`px-2 md:px-5 py-2.5 text-[10px] md:text-xs font-mono font-bold uppercase tracking-wider rounded-md transition-all ${
                demoMode === 'anomaly' 
                  ? 'bg-surface-container-lowest border border-outline-variant/50 shadow-sm text-amber-400' 
                  : 'text-outline hover:text-white border border-transparent'
              }`}
            >
              Proactive Anomalies
            </button>
          </div>
        </div>

        {demoMode === "diagnostics" ? (
          <div className="rounded border border-outline-variant bg-surface-container-lowest p-4 md:p-6 shadow-xl flex flex-col md:flex-row gap-6 min-h-[480px] overflow-hidden">
          {/* Anomaly Alerts Feed (Sidebar component) */}
          <div className="w-full md:w-72 bg-surface-container-low border border-outline-variant rounded p-4 flex flex-col gap-4 shrink-0 font-sans">
            <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-3">
              <Database className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface font-bold">Target Alerts</span>
                <span className="font-mono text-[9px] text-outline">Click an anomaly to scan</span>
              </div>
            </div>

            <div className="space-y-2.5 flex-1">
              {Object.values(simulations).map(sim => {
                const isCurrent = activeSim.id === sim.id;
                return (
                  <button
                    key={sim.id}
                    onClick={() => runSimulation(sim)}
                    disabled={isSimulating}
                    className={`w-full text-left p-3 rounded transition-all border flex flex-col gap-1.5 cursor-pointer ${
                      isCurrent
                        ? "border-primary/50 bg-surface-container-high shadow-[0_0_12px_rgba(var(--primary),0.1)]"
                        : "border-outline-variant/30 bg-surface-container hover:bg-surface-container-high opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className={`font-mono text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        sim.severity === "HIGH_SEVERITY" ? "bg-red-500/20 text-red-400" :
                        sim.severity === "MEDIUM" ? "bg-amber-500/20 text-amber-400" :
                        "bg-blue-500/20 text-primary"
                      }`}>
                        {sim.severity === "HIGH_SEVERITY" ? "HIGH" : sim.severity}
                      </span>
                      <span className="font-mono text-[9px] text-outline">{sim.id === "coupon" ? "2m ago" : sim.id === "stockout" ? "3h ago" : "1d ago"}</span>
                    </div>
                    <h4 className="text-xs font-bold text-white leading-tight">{sim.title}</h4>
                    <span className="font-mono text-[9px] text-outline-variant">{sim.impact}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-outline-variant/30 pt-3">
              <div className="flex items-center gap-2 text-outline">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono text-[9px] uppercase tracking-widest font-bold">Active Pipeline Status</span>
              </div>
            </div>
          </div>

          {/* Diagnostics Canvas (Main Content component) */}
          <div className="flex-grow flex-1 min-w-0 bg-surface-dim border border-outline-variant rounded p-4 md:p-5 flex flex-col gap-5 relative font-sans overflow-hidden">
            <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-primary/30">SIMULATOR::CORE_ENGINE</div>
            
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-primary">
                <Play className="h-3.5 w-3.5 fill-current" />
                <span className="font-mono text-[9px] uppercase tracking-widest font-bold">Active Telemetry Diagnostic Graph</span>
              </div>
              <h3 className="text-sm font-bold text-white italic">"Investigate: {activeSim.title}"</h3>
            </div>

            {/* Interactive Visual Pipeline */}
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 flex flex-col lg:flex-row items-center justify-center gap-2 lg:gap-3 overflow-hidden">
              
              {/* Database Node */}
              <div className="flex items-center gap-2 bg-surface-container-low border border-emerald-500/30 text-emerald-400 p-2.5 rounded-lg flex-1 min-w-0 max-w-[160px]">
                <div className="h-7 w-7 shrink-0 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/25">
                  <Server className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-white truncate">Database</div>
                  <div className="text-[8px] font-mono text-emerald-500 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    CONNECTED
                  </div>
                </div>
              </div>

              {/* Connector 1 */}
              <ChevronRight className={cn(
                "h-4 w-4 rotate-90 lg:rotate-0 transition-colors shrink-0",
                runningStep >= 1 ? "text-primary animate-pulse" : "text-outline-variant/30"
              )} />

              {/* Scout Node */}
              <div className={cn(
                "flex items-center gap-2 p-2.5 rounded-lg flex-1 min-w-0 max-w-[160px] transition-all border",
                runningStep >= 1 ? "border-primary/30 bg-primary/5 text-primary" : "border-outline-variant/30 bg-surface-container-low opacity-40"
              )}>
                <div className="h-7 w-7 shrink-0 rounded-md bg-white/5 flex items-center justify-center border border-white/5">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-white truncate">Scout Scanner</div>
                  <div className="text-[8px] font-mono text-outline font-bold truncate">
                    {runningStep >= 1 ? "ANOMALY ISOLATED" : "PENDING SCAN"}
                  </div>
                </div>
              </div>

              {/* Connector 2 */}
              <ChevronRight className={cn(
                "h-4 w-4 rotate-90 lg:rotate-0 transition-colors shrink-0",
                runningStep >= 2 ? "text-primary animate-pulse" : "text-outline-variant/30"
              )} />

              {/* Sleuth Node */}
              <div className={cn(
                "flex items-center gap-2 p-2.5 rounded-lg flex-1 min-w-0 max-w-[160px] transition-all border",
                runningStep >= 4 ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" :
                runningStep >= 2 ? "border-primary/40 bg-primary/10 text-primary" :
                "border-outline-variant/30 bg-surface-container-low opacity-40"
              )}>
                <div className="h-7 w-7 shrink-0 rounded-md bg-white/5 flex items-center justify-center border border-white/5">
                  {runningStep >= 2 && runningStep < 4 ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Terminal className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-white truncate">Sleuth Analyst</div>
                  <div className="text-[8px] font-mono text-outline font-bold truncate">
                    {runningStep >= 4 ? "QUERY COMPLETED" : runningStep >= 2 ? "RUNNING SQL..." : "PENDING DB"}
                  </div>
                </div>
              </div>

              {/* Connector 3 */}
              <ChevronRight className={cn(
                "h-4 w-4 rotate-90 lg:rotate-0 transition-colors shrink-0",
                runningStep >= 5 ? "text-primary animate-pulse" : "text-outline-variant/30"
              )} />

              {/* Judge Node */}
              <div className={cn(
                "flex items-center gap-2 p-2.5 rounded-lg flex-1 min-w-0 max-w-[160px] transition-all border",
                runningStep >= 5 ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-outline-variant/30 bg-surface-container-low opacity-40"
              )}>
                <div className="h-7 w-7 shrink-0 rounded-md bg-white/5 flex items-center justify-center border border-white/5">
                  <CheckCircle className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-white truncate">Judge Resolver</div>
                  <div className="text-[8px] font-mono text-outline font-bold truncate">
                    {runningStep >= 5 ? "VERDICT READY" : "PENDING VERDICT"}
                  </div>
                </div>
              </div>

            </div>

            {/* In-progress forensic verdict log */}
            <div className="flex-1 bg-surface-container-low rounded p-4 border border-outline-variant/20 font-mono text-[11px] space-y-2 text-outline overflow-y-auto max-h-[140px] custom-scrollbar">
              <AnimatePresence>
                {activeSim.steps.slice(0, runningStep).map((step, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex gap-2"
                  >
                    <span className="text-outline-variant">[{step.time}]</span>
                    <span className={
                      step.agent === "SCOUT" ? "text-primary font-bold" :
                      step.agent === "SLEUTH" ? "text-amber-400 font-bold" :
                      step.agent === "JUDGE" ? "text-emerald-400 font-bold" : "text-outline-variant"
                    }>
                      {step.agent}::
                    </span>
                    <span className="text-on-surface">{step.message}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isSimulating && (
                <div className="h-3.5 w-1 bg-primary animate-pulse inline-block ml-1" />
              )}
            </div>

            {/* Render SQL and Final Verdict if finished */}
            {runningStep >= 4 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 pt-2 border-t border-outline-variant/30"
              >
                <div>
                  <span className="font-mono text-[8px] text-outline-variant uppercase tracking-widest block mb-1">Generated Safe Query</span>
                  <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant text-[10px] font-mono text-primary overflow-x-auto whitespace-nowrap">
                    {activeSim.sql}
                  </div>
                </div>
                {runningStep >= 5 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-3 bg-surface-container border-l-4 border-emerald-500 rounded-r"
                  >
                    <span className="font-mono text-[9px] font-bold text-emerald-400 block uppercase mb-1">Final Verdict Report</span>
                    <p className="text-xs text-on-surface leading-relaxed">{activeSim.verdict}</p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </div>
        ) : (
          <div className="rounded border border-outline-variant bg-surface-container-lowest p-6 md:p-10 shadow-xl flex flex-col items-center justify-center min-h-[480px] gap-6 text-center">
            <div className="relative">
              <Clock className={`h-16 w-16 text-primary ${isAnomalyRunning ? 'animate-pulse' : ''}`} />
              {isAnomalyRunning && <span className="absolute top-0 right-0 h-4 w-4 rounded-full bg-emerald-500 animate-ping" />}
            </div>
            
            <div className="max-w-xl space-y-3">
              <h3 className="text-2xl font-bold uppercase text-white font-sans tracking-tight">Proactive Metric Monitoring</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Schedule automated checks to run every hour. Stop finding out about revenue drops or stockouts days later. If an anomaly is detected, an alert is triggered immediately.
              </p>
            </div>

            <Button 
              onClick={runAnomalyDemo} 
              disabled={isAnomalyRunning}
              className="mt-2 h-10 rounded-[4px] font-mono text-[11px] uppercase tracking-wider bg-primary hover:opacity-90 text-on-primary font-bold px-8 cursor-pointer"
            >
              {isAnomalyRunning ? "Monitoring..." : "Simulate Hourly Run"}
            </Button>

            <div className="w-full max-w-2xl mt-4 bg-surface-container border border-outline-variant/50 rounded-lg p-5 font-mono text-left text-[11px] flex flex-col gap-3 min-h-[220px]">
              <div className="text-outline uppercase tracking-wider font-bold border-b border-outline-variant/30 pb-2">Cron Job Output</div>
              
              {!hasRunAnomaly && (
                <div className="text-outline-variant opacity-50 text-center py-8">Idle — Waiting for next scheduled run.</div>
              )}
              
              {hasRunAnomaly && (
                <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="text-primary">
                  {">"}  [14:00:00] Executing scheduled SQL task: "Revenue Variance Check"
                </motion.div>
              )}
              
              {hasRunAnomaly && anomalyStep >= 1 && (
                <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="text-on-surface-variant">
                  {">"} SELECT sum(revenue) as current FROM orders WHERE created_at {">"} now() - interval '1 hour'
                </motion.div>
              )}
              
              {hasRunAnomaly && anomalyStep >= 2 && (
                <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="text-on-surface-variant">
                  {">"} Evaluating against rolling 7-day average...
                </motion.div>
              )}

              {hasRunAnomaly && anomalyStep >= 3 && (
                <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="p-3 bg-red-500/10 border border-red-500/30 rounded mt-2">
                  <div className="text-red-400 font-bold mb-1">⚠️ CRITICAL ALERT TRIGGERED</div>
                  <div className="text-red-200/80">Hourly revenue ($1,420) dropped 34% vs expected average ($2,150). Pushing alert to Notification Channels.</div>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* SQL Safety Interactive Block */}
      <section className="border-t border-outline-variant/20 bg-surface-container-lowest py-16 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-5 text-left">
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-bold">SQL Safety middleware Gate</span>
            <h2 className="text-2xl md:text-3xl font-bold text-white uppercase leading-tight tracking-tight">
              Strict Read-Only <br />
              <span className="text-primary">Database Protection</span>
            </h2>
            <p className="text-xs md:text-sm text-on-surface-variant leading-relaxed">
              We understand you cannot trust automated agents with write-access to core database structures. Our SQL middleware parses all statements prior to compilation, blocking mutating queries instantly.
            </p>
            <div className="space-y-3 text-xs">
              <div className="flex gap-2.5 items-start">
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-on-surface-variant">Blocks: `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`</span>
              </div>
              <div className="flex gap-2.5 items-start">
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-on-surface-variant">Read-only connection configuration for complete data safety.</span>
              </div>
            </div>
          </div>

          {/* Interactive Console UI */}
          <div className="border border-outline-variant rounded bg-surface-dim p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <span className="font-mono text-[9px] uppercase tracking-wider text-outline flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" /> Security Simulator Console
              </span>
              <span className={`font-mono text-[8px] px-2 py-0.5 rounded ${
                sqlStatus === "blocked" ? "bg-red-500/20 text-red-400" :
                sqlStatus === "safe" ? "bg-emerald-500/20 text-emerald-400" :
                "bg-outline-variant/20 text-outline"
              }`}>
                {sqlStatus === "blocked" ? "MUTATION_BLOCKED" :
                 sqlStatus === "safe" ? "PERMITTED" : "LISTENING"}
              </span>
            </div>
            
            <div className="font-mono text-[10px] space-y-2 h-40 overflow-y-auto custom-scrollbar text-outline-variant">
              <div>Try typing: <span className="text-primary">DELETE FROM orders;</span> or <span className="text-primary">SELECT * FROM products;</span></div>
              <div className="h-[1px] bg-outline-variant/25 my-1" />
              {sqlConsoleOutput.map((log, idx) => (
                <div key={idx} className={
                  log.startsWith(">") ? "text-white" :
                  log.includes("Blocked") || log.includes("ERROR") ? "text-red-400" : "text-emerald-400"
                }>
                  {log}
                </div>
              ))}
            </div>

            <form onSubmit={handleConsoleSubmit} className="flex gap-2">
              <input
                type="text"
                value={sqlConsoleInput}
                onChange={(e) => setSqlConsoleInput(e.target.value)}
                placeholder="Type query to test safety gate..."
                className="flex-grow bg-surface-container border border-outline-variant rounded px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-white"
              />
              <button
                type="submit"
                className="bg-primary hover:opacity-90 text-on-primary font-mono text-[10px] uppercase font-bold tracking-wider px-4 rounded transition-all cursor-pointer active:scale-95"
              >
                Run
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Database Connectors grid */}
      <section className="py-20 px-6 max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-2.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-bold">Integrations</span>
          <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Active Connection Pipelines</h2>
          <p className="text-xs text-on-surface-variant max-w-xl mx-auto">Instant sync and telemetry checking with your existing operational stores.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: "PostgreSQL", logo: "database", rows: "450K rows", latency: "1.2s", color: "text-primary" },
            { name: "MySQL Database", logo: "database", rows: "120K rows", latency: "0.9s", color: "text-emerald-400" },
            { name: "Snowflake Store", logo: "layers", rows: "2.4M rows", latency: "4.5s", color: "text-blue-400" },
            { name: "BigQuery Lake", logo: "layers", rows: "18.2M rows", latency: "6.1s", color: "text-purple-400" }
          ].map((db, idx) => (
            <div key={idx} className="p-4 bg-surface-container-low border border-outline-variant rounded hover:border-primary/50 transition-all space-y-3">
              <div className="flex justify-between items-start">
                <div className={`p-2 bg-surface-container rounded ${db.color}`}>
                  {db.logo === "database" ? <Database className="h-4.5 w-4.5" /> : <Layers className="h-4.5 w-4.5" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono text-[8px] text-emerald-400 uppercase">SYS_OK</span>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{db.name}</h4>
                <div className="flex justify-between font-mono text-[9px] text-outline mt-1.5">
                  <span>{db.rows}</span>
                  <span>Latency: {db.latency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>


    </div>
  );
}
