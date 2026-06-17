import { useState, useEffect } from "react";
import { Sparkles, TrendingUp, BarChart3, PieChart, LineChart, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/context/AuthContext';
import { dataSourcesAPI } from "@/lib/api";

interface SmartQuestion {
    id: string;
    question: string;
    category: string;
    chart_type: string;
    reasoning: string;
    generated_at: string;
}

interface SmartQuestionsProps {
    sourceId: string | null;
    sourceName?: string;
    onQuestionClick: (question: string) => void;
}

export function SmartQuestions({ sourceId, sourceName, onQuestionClick }: SmartQuestionsProps) {
    const [questions, setQuestions] = useState<SmartQuestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [domain, setDomain] = useState<string>("");
    const { toast } = useToast();
    const { getToken } = useAuth();

    const fetchQuestions = async (forceRefresh = false) => {
        if (!sourceId) return;

        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;

            const response = await dataSourcesAPI.getSmartQuestions(sourceId, token, forceRefresh);

            if (response.success) {
                setQuestions(response.data.questions || []);
                setDomain(response.data.domain || "");
            } else {
                throw new Error("Failed to fetch questions");
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to generate smart questions",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (sourceId) {
            fetchQuestions(false);
        } else {
            setQuestions([]);
        }
    }, [sourceId]);

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            Trends: "bg-blue-500/10 text-blue-500 border-blue-500/20",
            Performance: "bg-green-500/10 text-green-500 border-green-500/20",
            Comparison: "bg-purple-500/10 text-purple-500 border-purple-500/20",
            Patterns: "bg-orange-500/10 text-orange-500 border-orange-500/20",
            Optimization: "bg-pink-500/10 text-pink-500 border-pink-500/20",
        };
        return colors[category] || "bg-gray-500/10 text-gray-500 border-gray-500/20";
    };

    const getChartIcon = (chartType: string) => {
        switch (chartType) {
            case "bar":
                return <BarChart3 className="h-4 w-4" />;
            case "pie":
                return <PieChart className="h-4 w-4" />;
            case "line":
                return <LineChart className="h-4 w-4" />;
            default:
                return <TrendingUp className="h-4 w-4" />;
        }
    };

    if (!sourceId) {
        return (
            <div className="glass-card rounded-3xl p-8 border-white/5 text-center space-y-4">
                <Sparkles className="h-10 w-10 text-primary mx-auto opacity-20" />
                <h3 className="text-xl font-bold text-white tracking-tight">Intelligence Suggestions</h3>
                <p className="text-sm text-muted-foreground/60 max-w-xs mx-auto">
                    Select a neural data link to initialize automated intelligence queries.
                </p>
            </div>
        );
    }

    return (
        <div className="glass-card rounded-3xl overflow-hidden border-white/5 shadow-2xl">
            <div className="p-6 border-b border-white/10 bg-white/5 flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary neon-glow" />
                        Smart Queries
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-1">
                        Neural insights for {sourceName || "Active Data Source"}
                        {domain && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/30 text-primary">
                                {domain}
                            </Badge>
                        )}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fetchQuestions(true)}
                    disabled={loading}
                    className="h-10 w-10 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
            </div>

            <div className="p-6">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-24 w-full rounded-2xl bg-white/5" />
                        ))}
                    </div>
                ) : questions.length > 0 ? (
                    <div className="grid gap-4">
                        {questions.map((q) => (
                            <button
                                key={q.id}
                                onClick={() => onQuestionClick(q.question)}
                                className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5 text-left transition-all hover:border-primary/50 hover:bg-primary/10 hover:-translate-y-1 shadow-sm"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="mt-1 p-2 rounded-lg bg-white/5 text-primary group-hover:scale-110 transition-transform">
                                        {getChartIcon(q.chart_type)}
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <p className="font-bold text-white leading-snug group-hover:text-primary transition-colors">
                                            {q.question}
                                        </p>
                                        <div className="flex items-center gap-3">
                                            <Badge
                                                variant="outline"
                                                className={`text-[9px] font-black uppercase tracking-widest px-2 py-0 h-5 border-none ${getCategoryColor(q.category)} shadow-lg shadow-black/20`}
                                            >
                                                {q.category}
                                            </Badge>
                                            <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-tighter">
                                                {q.chart_type} topology
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Hover effect glow overlay */}
                                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 space-y-6">
                        <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-10" />
                        <p className="text-muted-foreground italic text-sm">No intelligence modules generated for this source.</p>
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => fetchQuestions(true)}
                            className="rounded-full px-8 glass border-primary/30 text-primary hover:bg-primary/10 font-bold"
                        >
                            Generate Neural Nodes
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
