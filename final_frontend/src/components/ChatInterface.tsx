import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, User, Bot, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { QueryResponse } from '@/lib/api';
import { ChartDisplay } from '@/components/ChartDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  onSendMessage: (question: string) => void;
  isLoading: boolean;
  onSaveChart?: (chart: any, messageId?: string) => void;
  onDeleteChart?: (chartId: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
  insightsEnabled?: boolean;
  onToggleInsights?: (enabled: boolean) => void;
}

export function ChatInterface({ 
  messages, 
  onSendMessage, 
  isLoading, 
  onSaveChart, 
  onDeleteChart, 
  onSuggestionClick,
  insightsEnabled = false,
  onToggleInsights
}: ChatInterfaceProps) {
  const [question, setQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

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
      onSendMessage(question);
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
    <div className="flex flex-col h-[750px] glass-card rounded-[2rem] overflow-hidden border-white/5 shadow-2xl relative">
      {/* STICKY INTELLIGENCE HEADER */}
      <div className="absolute top-0 left-0 right-0 z-20 px-8 py-4 bg-black/40 backdrop-blur-xl border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleInsights?.(!insightsEnabled)}
            className={cn(
              "group flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all border shadow-lg",
              insightsEnabled 
                ? "bg-primary/20 border-primary/40 text-primary shadow-primary/20" 
                : "bg-white/5 border-white/5 text-muted-foreground hover:border-white/20 hover:bg-white/10"
            )}
          >
            <Sparkles className={cn("h-4 w-4", insightsEnabled && "animate-pulse")} />
            <span className="text-[12px] font-black uppercase tracking-widest">
              Intelligence {insightsEnabled ? "ACTIVE" : "OFF"}
            </span>
            {insightsEnabled && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping ml-1" />
            )}
          </button>

          <button 
            type="button"
            onClick={() => setInfoDialogOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl glass border-white/5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all hover:bg-primary/5 group"
            title="Learn about Lumina Intelligence"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-end">
          <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
            Neural Computation Mode
          </p>
          <div className="flex gap-1 mt-1">
            <div className={cn("h-1 w-4 rounded-full transition-all duration-500", insightsEnabled ? "bg-primary shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "bg-white/10")} />
            <div className={cn("h-1 w-2 rounded-full transition-all duration-700 delay-100", insightsEnabled ? "bg-accent shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-white/10")} />
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 pt-24 space-y-10 scroll-smooth"
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
              <h3 className="font-bold text-white text-3xl tracking-tight">Lumina Assistant</h3>
              <p className="max-w-md mx-auto text-muted-foreground/80 leading-relaxed text-sm">
                Ready to unlock the secrets in your data. <br />
                Try: <span className="text-primary font-medium italic">"Analyze quarterly trends"</span> or <span className="text-accent font-medium italic">"Visualize sales by region"</span>.
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

                  {/* Render Chart/Result if available */}
                  {msg.result && msg.role === 'assistant' && (
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

        <form onSubmit={handleSubmit} className="relative flex gap-3">
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Explore your intelligence engine..."
            disabled={isLoading}
            className="flex-1 min-h-[64px] max-h-[150px] resize-none pr-16 py-5 rounded-3xl glass border-white/10 focus:border-primary/50 focus:bg-white/10 transition-all text-[16px] placeholder:text-muted-foreground/30 leading-snug"
            rows={1}
          />
          <Button
            type="submit"
            disabled={!question.trim() || isLoading}
            size="icon"
            className="h-[64px] w-[64px] rounded-3xl bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95 shrink-0"
          >
            {isLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Send className="h-7 w-7" />}
          </Button>
        </form>
      </div>

      {/* Info Dialog */}
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="max-w-md bg-black/80 backdrop-blur-2xl border-white/10 rounded-[2rem] p-8 shadow-[0_0_50px_rgba(139,92,246,0.15)]">
          <DialogHeader className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-2 mx-auto ring-4 ring-primary/5">
              <Sparkles className="h-8 w-8 animate-pulse" />
            </div>
            <DialogTitle className="text-3xl font-black text-center text-white tracking-tight">
              Lumina Intelligence
            </DialogTitle>
            <DialogDescription className="text-center text-white/60 text-base leading-relaxed">
              Enhances your current query results with narrative storytelling, trend detection, and strategic business context.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-8 space-y-6">
            <div className="space-y-4">
              {[
                { 
                  title: "Strategic Context", 
                  desc: "Adds business narratives that explain the 'Why' behind the numbers in your current view.",
                  icon: <RefreshCw className="h-4 w-4" />
                },
                { 
                  title: "Pattern Recognition", 
                  desc: "Analyzes the data returned by your query to point out immediate trends.",
                  icon: <Bot className="h-4 w-4" />
                },
                { 
                  title: "Not for Deep Diagnostics", 
                  desc: "Intelligence analyzes what you see. For autonomous multi-step root cause analysis across your whole database, use Causal Nexus.",
                  icon: <Info className="h-4 w-4" />
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/20 transition-all group">
                  <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
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
              onClick={() => setInfoDialogOpen(false)}
              className="w-full py-6 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold shadow-xl shadow-primary/20"
            >
              Got it, Agent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
