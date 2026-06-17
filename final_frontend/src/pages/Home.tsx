import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, BarChart3, ShieldCheck, Zap, Database, Search, Layout, Activity, Cpu, Globe } from "lucide-react";
import { Header } from "@/components/Header";

import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { isSignedIn } = useAuth();
  return (
    <div className="flex flex-col min-h-screen overflow-hidden relative bg-background">
      {/* Atmospheric background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      
      <Header />
      
      <div className="flex flex-col items-center justify-center flex-grow px-4 text-center space-y-12 max-w-6xl mx-auto py-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-white/10 text-primary text-sm font-semibold mb-2 neon-glow">
            <Sparkles className="h-4 w-4" />
            The Future of E-Commerce Data Analytics
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-none text-white">
            Shopify Data. <span className="text-neon">Solved.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground/80 max-w-3xl mx-auto leading-relaxed">
            The world's first autonomous analyst for your e-commerce data. Connect your Shopify database or CSV files and get root-cause insights in seconds.
          </p>

          <div className="pt-4">
            {!isSignedIn && (
              <Link to="/login">
                <Button size="lg" className="h-16 rounded-full px-10 text-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-2xl shadow-primary/40 hover:shadow-primary/60 transition-all hover:scale-105">
                  Start Your Journey
                  <Zap className="ml-2 h-5 w-5 fill-current" />
                </Button>
              </Link>
            )}
            {isSignedIn && (
              <Link to="/analytics">
                <Button size="lg" className="h-16 rounded-full px-10 text-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-2xl shadow-primary/40 hover:shadow-primary/60 transition-all hover:scale-105">
                  Go to Analytics
                  <Zap className="ml-2 h-5 w-5 fill-current" />
                </Button>
              </Link>
            )}
          </div>
        </motion.div>

        {/* Feature Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 w-full pt-12"
        >
          {[
            { 
              icon: <Activity className="h-6 w-6" />, 
              title: "Root Cause Analysis", 
              desc: "Autonomous diagnostic engine that scans data anomalies to find the root cause.",
              color: "text-blue-400",
              bgColor: "bg-blue-400/10"
            },
            { 
              icon: <Sparkles className="h-6 w-6" />, 
              title: "AI Insights", 
              desc: "Rich e-commerce narratives and trend detection for every single query.",
              color: "text-primary",
              bgColor: "bg-primary/10"
            },
            { 
              icon: <Layout className="h-6 w-6" />, 
              title: "Database Structure Map", 
              desc: "Interactive card-grid map of your entire data ecosystem and semantic links.",
              color: "text-emerald-400",
              bgColor: "bg-emerald-400/10"
            },
            { 
              icon: <Globe className="h-6 w-6" />, 
              title: "Shopify & CSV Data", 
              desc: "Native support for Shopify PostgreSQL databases, custom databases, and CSV files.",
              color: "text-accent",
              bgColor: "bg-accent/10"
            }
          ].map((feature, i) => (
            <div key={i} className="group p-8 rounded-3xl glass-card text-left space-y-4 hover:-translate-y-2 transition-all min-h-[220px]">
              <div className={`w-12 h-12 rounded-2xl ${feature.bgColor} flex items-center justify-center ${feature.color} border border-white/5 shadow-lg group-hover:scale-110 transition-transform`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white">{feature.title}</h3>
              <p className="text-sm text-muted-foreground/70 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Deep Dive Section */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="w-full py-20 border-t border-white/5"
        >
          <div className="grid md:grid-cols-2 gap-20 items-center">
            <div className="text-left space-y-8">
              <h2 className="text-4xl font-bold text-white leading-tight">
                Beyond traditional dashboards. <br />
                <span className="text-primary italic">Deep structural e-commerce awareness.</span>
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-primary mt-1 shrink-0">
                    <Check className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Semantic Relationship Discovery</h4>
                    <p className="text-sm text-muted-foreground">Our AI identifies "statistical links" in messy data even when foreign keys are missing.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center text-accent mt-1 shrink-0">
                    <Check className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Iterative Forensic Sprints</h4>
                    <p className="text-sm text-muted-foreground">The engine sleuths through your database, automatically drilling down until the evidence is conclusive.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="glass-card p-4 rounded-3xl border border-white/10 relative z-10">
                <div className="aspect-video rounded-2xl bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden">
                   <div className="text-primary/20 animate-pulse">
                     <Cpu className="h-24 w-24" />
                   </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
