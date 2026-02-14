import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, User, Bot, RefreshCw } from 'lucide-react';
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
  onSendMessage: (question: string) => void;
  isLoading: boolean;
  onSaveChart?: (chart: any, messageId?: string) => void;
  onDeleteChart?: (chartId: string) => void;
}

export function ChatInterface({ messages, onSendMessage, isLoading, onSaveChart, onDeleteChart }: ChatInterfaceProps) {
  const [question, setQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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
    <div className="flex flex-col h-[700px] bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-muted-foreground p-8">
            <div className="p-4 bg-primary/10 rounded-full">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground text-lg">Lumina AI</h3>
              <p className="max-w-md mx-auto text-sm">
                I can analyze your data, generate SQL, and create charts.
                Try asking "Show me total revenue" or "Top products by sales".
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "flex items-start gap-4",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Bubble */}
                <div className={cn(
                  "flex flex-col max-w-[85%] space-y-2",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-4 py-3 rounded-2xl text-sm",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted/50 border border-border rounded-tl-sm text-foreground"
                  )}>
                    {msg.content}
                  </div>

                  {/* Render Chart/Result if available */}
                  {msg.result && msg.role === 'assistant' && (
                    <div className="w-full mt-2 min-w-[600px] overflow-x-auto">
                      <ChartDisplay
                        result={msg.result}
                        onSave={(chart) => onSaveChart && onSaveChart(chart, msg.id)}
                        onDelete={onDeleteChart}
                      />
                    </div>
                  )}

                  <span className="text-[10px] text-muted-foreground/60 px-2">
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
                <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-muted/50 border border-border px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Thinking</span>
                  <div className="flex gap-1">
                    <motion.div
                      className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0 }}
                    />
                    <motion.div
                      className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.2 }}
                    />
                    <motion.div
                      className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.4 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-border">
        <form onSubmit={handleSubmit} className="relative flex gap-2">
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question..."
            disabled={isLoading}
            className="flex-1 min-h-[50px] max-h-[120px] resize-none pr-12 py-3 rounded-xl border-border bg-muted/20 focus:bg-background transition-all"
            rows={1}
          />
          <Button
            type="submit"
            disabled={!question.trim() || isLoading}
            size="icon"
            className="h-[50px] w-[50px] rounded-xl shrink-0"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-2">
          Lumina AI can make mistakes. Double check important results.
        </p>
      </div>
    </div>
  );
}
