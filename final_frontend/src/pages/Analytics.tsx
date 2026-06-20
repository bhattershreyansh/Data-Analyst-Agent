import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { ChatInterface, Message } from '@/components/ChatInterface';
import { AnomalyAlertCenter } from '@/components/AnomalyAlertCenter';
import { ChartDisplay } from '@/components/ChartDisplay';
import { SavedChartsSidebar } from '@/components/SavedChartsSidebar';
import { CreateDashboardDialog } from '@/components/CreateDashboardDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QueryResponse, SavedChart, queryAPI, modeAPI, dataSourcesAPI } from '@/lib/api';
import { PlusCircle, Sparkles, Loader2, Database, LayoutDashboard, BarChart3, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { Header } from '@/components/Header';

export default function Analytics() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = user?.user_id;
  const [queryMessages, setQueryMessages] = useState<Message[]>([]);
  const [diagnosticsMessages, setDiagnosticsMessages] = useState<Message[]>([]);
  const [chatMode, setChatMode] = useState<'query' | 'diagnose'>('query');
  const [isLoading, setIsLoading] = useState(false);

  // Derived: active messages for the current mode
  const messages = chatMode === 'query' ? queryMessages : diagnosticsMessages;
  const setMessages = chatMode === 'query' ? setQueryMessages : setDiagnosticsMessages;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCharts, setSelectedCharts] = useState<string[]>([]);
  const [createDashboardOpen, setCreateDashboardOpen] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string>("");
  const [smartQuestions, setSmartQuestions] = useState<string[]>([]);
  const [smartQuestionsLoading, setSmartQuestionsLoading] = useState(false);

  // Fetch smart questions when active source changes
  useEffect(() => {
    const fetchQuestions = async () => {
      if (!activeSourceId) {
        setSmartQuestions([]);
        return;
      }
      setSmartQuestionsLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const response = await dataSourcesAPI.getSmartQuestions(activeSourceId, token, false);
        if (response.success && response.data?.questions) {
          setSmartQuestions(response.data.questions.map((q: any) => q.question));
        }
      } catch (error) {
        console.error("Failed to fetch smart questions:", error);
      } finally {
        setSmartQuestionsLoading(false);
      }
    };
    fetchQuestions();
  }, [activeSourceId]);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupQuestion, setPopupQuestion] = useState("");
  const [popupResult, setPopupResult] = useState<QueryResponse | null>(null);

  // ── RBAC: clear all in-memory state when the signed-in user changes ──
  useEffect(() => {
    setQueryMessages([]);
    setDiagnosticsMessages([]);
    setActiveSourceId(null);
    setActiveSourceName("");
  }, [userId]);

  // Fetch active data source on mount and periodically
  useEffect(() => {
    const fetchActiveSource = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        
        const response = await modeAPI.getStatus(token);
        if (response.success && response.data.active_source) {
          const sourceId = response.data.active_source.source_id;
          setActiveSourceId(sourceId);
          setActiveSourceName(response.data.active_source.name);
          // Key by userId so different accounts never share active_source_id
          if (userId) localStorage.setItem(`active_source_id_${userId}`, sourceId);
        }
      } catch (error) {
        console.error("Failed to fetch active source:", error);
      }
    };

    if (userId) {
      fetchActiveSource();
      const interval = setInterval(fetchActiveSource, 5000);
      return () => clearInterval(interval);
    }
  }, [userId]);

  // Handle auto-run query redirected from Forensics Monitor
  useEffect(() => {
    const autoQuery = localStorage.getItem('auto_run_query');
    if (autoQuery && activeSourceId) {
      localStorage.removeItem('auto_run_query');
      handleSendMessage(autoQuery, 'query');
    }
  }, [activeSourceId]);

  // Handle auto-run query from URL param (e.g. Dashboard Re-run)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const urlQuery = searchParams.get('q');
    
    if (urlQuery && activeSourceId) {
      // Clear the param so it doesn't re-run if they refresh
      navigate('/analytics', { replace: true });
      
      // Give the layout a tiny moment to render before firing the query
      setTimeout(() => {
        setChatMode('query');
        handleSendMessage(urlQuery, 'query');
      }, 100);
    }
  }, [location.search, activeSourceId, navigate]);

  const handleSendMessage = async (text: string, mode: 'query' | 'diagnose' = 'query') => {
    // Add user message
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const token = await getToken();
      
      if (mode === 'diagnose') {
        const response = await queryAPI.diagnoseAnomaly({
          question: text,
          anomaly_data: [],
          source_id: activeSourceId || undefined
        }, token);

        if (response.success && response.data) {
          const assistantMsg: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: response.data.verdict || "No conclusive verdict reached.",
            result: {
              success: true,
              diagnose_data: response.data,
              thought_logs: (response.data.investigation_steps || []).map((step: string) => {
                // Parse the step output to display clean agent logs
                const match = step.match(/^(?:⚖️\s*)?Judge\s+\[(.*?)\]:\s+(.*)$/);
                const agentName = match ? 'Judge' : step.startsWith('[Call') ? 'Sleuth' : 'Scout';
                const cleanMsg = step.replace(/^(?:🕵️|🔬|⚖️)\s*/, "");
                return {
                  agent: agentName,
                  message: cleanMsg
                };
              })
            },
            timestamp: new Date()
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else {
          const errorMsg: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: `I encountered an issue during analysis: ${response.error || "Unknown error"}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } else {
        const response = await queryAPI.sendQuery({
          question: text,
          limit: 10,
          generate_insights: true
        }, token);

        if (response.data.success) {
          const assistantMsg: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: response.data.reasoning || "Here's the analysis for your request:",
            result: response.data,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else {
          const errorMsg: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: `I encountered an issue: ${response.data.error || "Unknown error"}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      }
    } catch (error: any) {
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: `Failed to execute: ${error.message || "Network error"}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatModeChange = (mode: 'query' | 'diagnose') => {
    setChatMode(mode);
  };

  const handleQuestionClick = async (question: string) => {
    // For popup logic
    setPopupQuestion(question);
    setPopupOpen(true);
    setPopupLoading(true);
    setPopupResult(null);

    try {
      const token = await getToken();
      const response = await queryAPI.sendQuery({ question, limit: 10 }, token);
      if (response.data.success) {
        setPopupResult(response.data);
      } else {
        console.error("Popup query failed:", response.data.error);
      }
    } catch (error) {
      console.error("Failed to execute popup query:", error);
    } finally {
      setPopupLoading(false);
    }
  };

  const handleChartSelect = (chart: SavedChart) => {
    toast.success("Chart selection not fully integrated with chat yet.");
  };

  const handleChartToggle = (chartId: string) => {
    setSelectedCharts((prev) =>
      prev.includes(chartId)
        ? prev.filter((id) => id !== chartId)
        : [...prev, chartId]
    );
  };

  const queryClient = useQueryClient();

  const handleSaveChart = async (chart: SavedChart, messageId?: string) => {
    try {
      const token = await getToken();
      const response = await queryAPI.saveChart(chart, token);
      if (response.success) {
        toast.success("Chart saved successfully");
        queryClient.invalidateQueries({ queryKey: ['saved-charts'] });

        // Update the correct message history to reflect saved status
        if (messageId) {
          setQueryMessages(prev => prev.map(msg =>
            msg.id === messageId && msg.result
              ? { ...msg, result: { ...msg.result, chart_id: chart.chart_id } }
              : msg
          ));
        }
      } else {
        toast.error("Failed to save chart");
      }
    } catch (error) {
      toast.error("Error saving chart");
    }
  };

  const handleDeleteChart = async (chartId: string) => {
    try {
      const token = await getToken();
      const response = await queryAPI.deleteSavedChart(chartId, token);
      if (response.success) {
        toast.success("Chart unsaved");
        queryClient.invalidateQueries({ queryKey: ['saved-charts', userId] });
        
        // Update the message history to clear saved status
        setQueryMessages(prev => prev.map(msg =>
          msg.result?.chart_id === chartId
            ? { ...msg, result: { ...msg.result, chart_id: undefined } }
            : msg
        ));
      } else {
        toast.error("Failed to remove chart");
      }
    } catch (error) {
      toast.error("Error removing chart");
    }
  };

  // Load messages from localStorage when user changes
  useEffect(() => {
    if (!userId) return;
    const loadHistory = (key: string) => {
      const saved = localStorage.getItem(key);
      if (!saved) return [];
      try {
        return JSON.parse(saved).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      } catch { return []; }
    };
    setQueryMessages(loadHistory(`shopify_query_history_${userId}`));
    setDiagnosticsMessages(loadHistory(`shopify_diagnostics_history_${userId}`));
  }, [userId]);

  // Persist each history independently
  useEffect(() => {
    if (userId && queryMessages.length > 0)
      localStorage.setItem(`shopify_query_history_${userId}`, JSON.stringify(queryMessages));
  }, [queryMessages, userId]);

  useEffect(() => {
    if (userId && diagnosticsMessages.length > 0)
      localStorage.setItem(`shopify_diagnostics_history_${userId}`, JSON.stringify(diagnosticsMessages));
  }, [diagnosticsMessages, userId]);

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setQueryMessages([]);
      setDiagnosticsMessages([]);
      if (userId) {
        localStorage.removeItem(`shopify_query_history_${userId}`);
        localStorage.removeItem(`shopify_diagnostics_history_${userId}`);
      }
      toast.success("Chat history cleared");
    }
  };

  return (
    <div className="h-[calc(100vh-36px)] bg-background text-foreground relative overflow-hidden flex flex-col">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Header */}
      <Header
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              disabled={messages.length === 0}
              className="text-muted-foreground hover:text-destructive font-mono text-[10px] uppercase tracking-wider"
            >
              Clear History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="gap-2 hidden sm:flex font-mono text-[10px] uppercase tracking-wider border-outline-variant hover:bg-white/5"
            >
              <LayoutDashboard className="h-4 w-4 text-primary" />
              Saved Charts
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 h-[calc(100vh-64px-36px)] overflow-hidden relative">
        {/* Main Workspace Viewport */}
        <main className="flex-1 flex flex-col bg-background relative overflow-hidden h-full min-h-0">
          {/* Sub-Navigation (Tabs) */}
          <div className="px-6 h-14 border-b border-outline-variant flex items-center gap-8 bg-surface-container-lowest shrink-0 font-sans">
            <button
              onClick={() => handleChatModeChange('query')}
              className={cn(
                "h-full border-b-2 px-1 text-xs font-sans font-bold uppercase tracking-widest flex items-center gap-2 transition-all",
                chatMode === 'query'
                  ? "text-primary border-primary"
                  : "text-on-surface-variant hover:text-white border-transparent"
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Query & Charts
            </button>
            <button
              onClick={() => handleChatModeChange('diagnose')}
              className={cn(
                "h-full border-b-2 px-1 text-xs font-sans font-bold uppercase tracking-widest flex items-center gap-2 transition-all",
                chatMode === 'diagnose'
                  ? "text-primary border-primary"
                  : "text-on-surface-variant hover:text-white border-transparent"
              )}
            >
              <Activity className="h-4 w-4" />
              Deep Diagnostics
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-grow flex flex-col overflow-hidden relative min-h-0">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onSaveChart={handleSaveChart}
              onDeleteChart={handleDeleteChart}
              onSuggestionClick={handleSendMessage}
              chatMode={chatMode}
              onChatModeChange={handleChatModeChange}
              suggestions={smartQuestions}
              suggestionsLoading={smartQuestionsLoading}
            />
          </div>
        </main>

        {selectedCharts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-12 right-8 z-20"
          >
            <Button
              onClick={() => setCreateDashboardOpen(true)}
              className="shadow-xl gap-2 rounded-full py-6 px-8 bg-primary hover:bg-primary/90 text-on-primary font-bold font-mono text-xs uppercase tracking-wider"
              size="lg"
            >
              <PlusCircle className="h-5 w-5" />
              Create Dashboard ({selectedCharts.length})
            </Button>
          </motion.div>
        )}
      </div>

      <SavedChartsSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onChartSelect={handleChartSelect}
        selectedCharts={selectedCharts}
        onChartToggle={handleChartToggle}
        onChartDeleted={(chartId) => {
          setQueryMessages(prev => prev.map(msg =>
            msg.result?.chart_id === chartId
              ? { ...msg, result: { ...msg.result, chart_id: undefined } }
              : msg
          ));
        }}
      />

      <CreateDashboardDialog
        open={createDashboardOpen}
        onOpenChange={setCreateDashboardOpen}
        selectedCharts={selectedCharts}
      />

      {/* Smart Question Result Popup */}
      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Smart Insight
            </DialogTitle>
            <DialogDescription>
              {popupQuestion}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {popupLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <p className="text-muted-foreground">Generating insights...</p>
              </div>
            ) : popupResult ? (
              <ChartDisplay result={popupResult} />
            ) : (
              <div className="text-center py-8 text-destructive">
                Failed to load results. Please try again.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
