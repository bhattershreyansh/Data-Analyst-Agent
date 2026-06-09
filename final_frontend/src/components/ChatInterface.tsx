import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, User, Bot, RefreshCw, Activity, Maximize2, Minimize2, CheckCircle2, ShieldAlert, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { QueryResponse } from '@/lib/api';
import { ChartDisplay } from '@/components/ChartDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';



// Types for Chat
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
}

export function ChatInterface({ 
  messages, 
  onSendMessage, 
  isLoading, 
  onSaveChart, 
  onDeleteChart, 
  onSuggestionClick,
  chatMode,
  onChatModeChange
}: ChatInterfaceProps) {
  const [question, setQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showThoughtLogs, setShowThoughtLogs] = useState<Record<string, boolean>>({});
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleThoughtLog = (messageId: string) => {
    setShowThoughtLogs(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  // Only auto-scroll when a genuinely new message arrives or loading starts —
  // NOT on every message update (e.g. saving a chart mutates messages but
  // shouldn't steal scroll position).
  const prevMsgCountRef = useRef(messages.length);
  const prevIsLoadingRef = useRef(isLoading);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const newMessageArrived = messages.length > prevMsgCountRef.current;
    const loadingJustStarted = isLoading && !prevIsLoadingRef.current;

    if (newMessageArrived || loadingJustStarted) {
      scrollToBottom();
    }

    prevMsgCountRef.current = messages.length;
    prevIsLoadingRef.current = isLoading;
  }, [messages, isLoading, scrollToBottom]);

  // Adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [question]);

  // Handle submit
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (question.trim() && !isLoading) {
      onSendMessage(question, chatMode);
      setQuestion('');
    }
  };

  // Handle enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 transition-all duration-300" 
          onClick={() => setIsExpanded(false)}
        />
      )}
      <div className={cn(
        "flex flex-col glass-card rounded-[2rem] overflow-hidden border-white/5 shadow-2xl relative transition-all duration-300",
        isExpanded 
          ? "fixed inset-4 sm:inset-12 z-50 h-auto bg-black/75 backdrop-blur-3xl border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)]"
          : "h-[750px]"
      )}>
        {/* Minimal Top Bar — Expand Toggle Only */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/20 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">Shopify Analyst</span>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground/50 hover:text-white hover:bg-white/10 transition-all"
            title={isExpanded ? 'Minimize' : 'Expand to fullscreen'}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 space-y-10 scroll-smooth"
      >

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 text-muted-foreground p-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="p-6 rounded-3xl bg-primary/10 neon-glow border border-primary/20"
            >
              <Sparkles className="h-10 w-10 text-primary" />
            </motion.div>
            <div className="space-y-3">
              <h3 className="font-bold text-white text-3xl tracking-tight">Shopify Data Assistant</h3>
              <p className="max-w-md mx-auto text-muted-foreground/80 leading-relaxed text-sm">
                Ready to unlock the secrets in your e-commerce data. <br />
                Try: <span className="text-primary font-medium italic">"What is our Average Order Value?"</span> or <span className="text-accent font-medium italic">"List products with high refund rates"</span>.
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className={cn(
                  "flex items-start gap-4",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300",
                    msg.role === 'user'
                      ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                      : "glass border-white/10 text-primary shadow-md"
                  )}
                >
                  {msg.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                </div>

                {/* Bubble */}
                <div className={cn(
                  "flex flex-col max-w-[85%] space-y-2",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-5 py-3.5 rounded-3xl text-[15px] leading-relaxed shadow-lg",
                    msg.role === 'user'
                      ? "bg-primary text-white rounded-tr-none"
                      : "glass border-white/10 text-foreground/90 rounded-tl-none"
                  )}>
                    {msg.content}
                  </div>

                  {/* Collapsible Thought Logs Trace */}
                  {msg.result?.thought_logs && msg.result.thought_logs.length > 0 && (
                    <div className="w-full mt-2">
                      <button
                        onClick={() => toggleThoughtLog(msg.id)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors py-1.5 px-3 rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/10"
                      >
                        <Activity className="h-3.5 w-3.5 animate-pulse text-primary" />
                        {showThoughtLogs[msg.id] ? "Hide Agent Thought Logs" : "View Agent Thought Logs"}
                      </button>

                      <AnimatePresence>
                        {showThoughtLogs[msg.id] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden w-full max-w-lg mt-2"
                          >
                            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 font-mono text-[11px] leading-relaxed text-foreground/80 space-y-2.5 shadow-inner backdrop-blur-sm">
                              <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-2">
                                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Multi-Agent Execution Trace</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                              </div>
                              {msg.result.thought_logs.map((log: any, lIdx: number) => (
                                <div key={lIdx} className="flex items-start gap-2 border-l border-primary/20 pl-2.5 ml-1.5 py-0.5 animate-fadeIn">
                                  <span className="text-primary font-bold shrink-0">[{log.agent}]:</span>
                                  <span className="text-white/90 break-words">{log.message}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Render Direct Diagnostics Card if available */}
                  {msg.result?.diagnose_data && msg.role === 'assistant' && (
                    <div className="w-full mt-4 max-w-2xl overflow-x-visible">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="glass border-rose-500/20 rounded-[2rem] p-6 shadow-xl relative overflow-hidden backdrop-blur-md"
                      >
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400">
                            <Activity className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-white text-base tracking-tight uppercase italic">Forensic Diagnostic Report</h4>
                            <p className="text-[9px] font-black text-rose-400 tracking-[0.2em] uppercase opacity-75">Deep Root Cause Discovery</p>
                          </div>
                        </div>

                        <div className="space-y-6">
                          {/* Verdict Box */}
                          <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-2.5">
                            <h5 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3" />
                              Forensic Verdict
                            </h5>
                            <p className="text-white/90 leading-relaxed text-sm italic font-medium">
                              "{msg.result.diagnose_data.verdict}"
                            </p>
                          </div>

                          {/* Timeline Steps */}
                          <div className="grid sm:grid-cols-2 gap-4">
                            {msg.result.diagnose_data.diagnostic_path.map((step: any, idx: number) => {
                              const isCritical = step.status === 'critical';
                              const isSuccess = step.status === 'success';

                              return (
                                <div key={idx} className={cn(
                                  "p-4 rounded-xl border bg-black/20 space-y-2",
                                  isCritical 
                                    ? "border-rose-500/15 bg-rose-500/5" 
                                    : isSuccess 
                                      ? "border-emerald-500/15 bg-emerald-500/5" 
                                      : "border-white/5"
                                )}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider">Step {idx + 1}</span>
                                    {isCritical ? (
                                      <ShieldAlert className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
                                    ) : isSuccess ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                      <Activity className="h-3.5 w-3.5 text-primary" />
                                    )}
                                  </div>
                                  <h6 className={cn(
                                    "font-bold text-xs",
                                    isCritical 
                                      ? "text-rose-300" 
                                      : isSuccess 
                                        ? "text-emerald-300" 
                                        : "text-white"
                                  )}>
                                    {step.title}
                                  </h6>
                                  <p className="text-[11px] text-white/50 leading-snug line-clamp-3">{step.finding}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  )}

                  {/* Render Chart/Result if available */}
                  {msg.result && !msg.result.diagnose_data && msg.role === 'assistant' && (
                    <div className="w-full mt-4 min-w-[700px] overflow-x-visible">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        <ChartDisplay
                          result={msg.result}
                          onSave={(chart) => onSaveChart && onSaveChart(chart, msg.id)}
                          onDelete={onDeleteChart}
                          onSuggestionClick={onSuggestionClick}
                        />
                      </motion.div>
                    </div>
                  )}

                  <span className="text-[10px] text-muted-foreground/40 font-medium px-3 flex items-center gap-1.5 ">
                    {msg.role === 'assistant' && <div className="w-1 h-1 rounded-full bg-primary" />}
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-2xl glass border-white/10 text-primary flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="glass border-white/10 px-6 py-4 rounded-3xl rounded-tl-none flex items-center gap-3 shadow-lg">
                  <span className="text-sm font-semibold text-primary animate-pulse">Thinking</span>
                  <div className="flex gap-1.5">
                    {[0, 0.2, 0.4].map((delay) => (
                      <motion.div
                        key={delay}
                        className="w-1.5 h-1.5 bg-primary rounded-full"
                        animate={{ y: [0, -4, 0], opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut", delay }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white/5 backdrop-blur-md border-t border-white/10">

        {/* Chat Mode Switcher Tabs */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
          onClick={() => onChatModeChange('query')}
            className={cn(
              "px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border flex items-center gap-1.5",
              chatMode === 'query'
                ? "bg-primary/20 border-primary/40 text-primary shadow-sm shadow-primary/10"
                : "bg-transparent border-transparent text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Query & Charts
          </button>
          <button
            type="button"
          onClick={() => onChatModeChange('diagnose')}
            className={cn(
              "px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border flex items-center gap-1.5",
              chatMode === 'diagnose'
                ? "bg-rose-500/20 border-rose-500/40 text-rose-400 shadow-sm shadow-rose-500/10"
                : "bg-transparent border-transparent text-muted-foreground hover:text-white hover:bg-rose-500/5"
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Deep Diagnostics
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative flex gap-3">
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              chatMode === 'diagnose'
                ? "Ask a business problem to diagnose (e.g. 'Why did orders drop yesterday?')..."
                : "Explore your intelligence engine (e.g. 'Show monthly sales')..."
            }
            disabled={isLoading}
            className={cn(
              "flex-1 min-h-[64px] max-h-[150px] resize-none pr-16 py-5 rounded-3xl glass border-white/10 focus:bg-white/10 transition-all text-[16px] placeholder:text-muted-foreground/30 leading-snug",
              chatMode === 'diagnose'
                ? "focus:border-rose-500/50"
                : "focus:border-primary/50"
            )}
            rows={1}
          />
          <Button
            type="submit"
            disabled={!question.trim() || isLoading}
            size="icon"
            className={cn(
              "h-[64px] w-[64px] rounded-3xl text-white shadow-xl transition-all hover:scale-105 active:scale-95 shrink-0",
              chatMode === 'diagnose'
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-500/20"
                : "bg-primary hover:bg-primary/90 shadow-primary/20"
            )}
          >
            {isLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Send className="h-7 w-7" />}
          </Button>
        </form>
      </div>

    </div>
    </>
  );
}
