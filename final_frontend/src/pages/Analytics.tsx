import { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { ChatInterface, Message } from '@/components/ChatInterface';
import { ChartDisplay } from '@/components/ChartDisplay';
import { SavedChartsSidebar } from '@/components/SavedChartsSidebar';
import { CreateDashboardDialog } from '@/components/CreateDashboardDialog';
import { SmartQuestions } from '@/components/SmartQuestions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QueryResponse, SavedChart, queryAPI, modeAPI } from '@/lib/api';
import { PlusCircle, Sparkles, Loader2, Database, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { Header } from '@/components/Header';

export default function Analytics() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCharts, setSelectedCharts] = useState<string[]>([]);
  const [createDashboardOpen, setCreateDashboardOpen] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string>("");

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupQuestion, setPopupQuestion] = useState("");
  const [popupResult, setPopupResult] = useState<QueryResponse | null>(null);

  // Insight Engine toggle
  const [insightsEnabled, setInsightsEnabled] = useState(false);

  // ── RBAC: clear all in-memory state when the signed-in user changes ──
  // Without this, a second user logging in on the same browser tab inherits
  // the previous user's entire chat history and active source.
  useEffect(() => {
    setMessages([]);
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

  const handleSendMessage = async (text: string) => {
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
      const response = await queryAPI.sendQuery({ question: text, limit: 10, generate_insights: insightsEnabled }, token);

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
    } catch (error: any) {
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: `Failed to execute query: ${error.message || "Network error"}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
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

        // Update message history to reflect saved status
        if (messageId) {
          setMessages(prev => prev.map(msg =>
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
        queryClient.invalidateQueries({ queryKey: ['saved-charts'] });
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
    
    const saved = localStorage.getItem(`lumina_chat_history_${userId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert string timestamps back to Date objects
        const hydrated = parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        setMessages(hydrated);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
  }, [userId]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (userId && messages.length > 0) {
      localStorage.setItem(`lumina_chat_history_${userId}`, JSON.stringify(messages));
    }
  }, [messages, userId]);

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setMessages([]);
      if (userId) {
        localStorage.removeItem(`lumina_chat_history_${userId}`);
      }
      toast.success("Chat history cleared");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
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
              className="text-muted-foreground hover:text-destructive"
            >
              Clear History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="gap-2 hidden sm:flex"
            >
              <LayoutDashboard className="h-4 w-4" />
              Saved Charts
            </Button>
          </div>
        }
      />

      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        {/* Smart Questions Suggestions */}
        <SmartQuestions
          sourceId={activeSourceId}
          sourceName={activeSourceName}
          onQuestionClick={handleQuestionClick}
        />

        {/* Main Chat Interface */}
        <div className="grid gap-6">
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            onSaveChart={handleSaveChart}
            onDeleteChart={handleDeleteChart}
            onSuggestionClick={handleSendMessage}
            insightsEnabled={insightsEnabled}
            onToggleInsights={setInsightsEnabled}
          />
        </div>

        {selectedCharts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-8 right-8 z-20"
          >
            <Button
              onClick={() => setCreateDashboardOpen(true)}
              className="shadow-xl gap-2 rounded-full py-6 px-8"
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
