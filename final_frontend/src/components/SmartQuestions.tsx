import { useState, useEffect } from "react";
import { Sparkles, TrendingUp, BarChart3, PieChart, LineChart, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

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

    const fetchQuestions = async (forceRefresh = false) => {
        if (!sourceId) return;

        setLoading(true);
        try {
            const response = await fetch(
                `http://localhost:8000/data-sources/${sourceId}/smart-questions?count=6&refresh=${forceRefresh}`
            );

            if (response.ok) {
                const data = await response.json();
                setQuestions(data.questions || []);
                setDomain(data.domain || "");
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
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Smart Question Suggestions
                    </CardTitle>
                    <CardDescription>
                        Select a data source to see intelligent question suggestions
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Smart Questions
                        </CardTitle>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            AI-generated insights for {sourceName || "your data"}
                            {domain && (
                                <Badge variant="outline">
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
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <Skeleton key={i} className="h-20 w-full" />
                        ))}
                    </div>
                ) : questions.length > 0 ? (
                    <div className="grid gap-3">
                        {questions.map((q) => (
                            <button
                                key={q.id}
                                onClick={() => onQuestionClick(q.question)}
                                className="group relative overflow-hidden rounded-lg border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md hover:scale-[1.02]"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-1 text-muted-foreground">
                                        {getChartIcon(q.chart_type)}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <p className="font-medium leading-tight group-hover:text-primary transition-colors">
                                            {q.question}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="outline"
                                                className={`text-xs ${getCategoryColor(q.category)}`}
                                            >
                                                {q.category}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {q.chart_type} chart
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Hover effect gradient */}
                                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No questions generated yet</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchQuestions(true)}
                            className="mt-3"
                        >
                            Generate Questions
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
