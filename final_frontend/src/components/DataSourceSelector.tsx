import { useState, useEffect } from "react";
import { Database, Upload, Plus, Check } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface DataSource {
    source_id: string;
    name: string;
    type: string;
    table_count: number;
    is_demo?: boolean;
}

interface ModeStatus {
    mode: string;
    message: string;
    active_source: DataSource | null;
    demo_available: boolean;
}

export function DataSourceSelector({ onUploadClick, onConnectClick }: {
    onUploadClick: () => void;
    onConnectClick: () => void;
}) {
    const [sources, setSources] = useState<DataSource[]>([]);
    const [modeStatus, setModeStatus] = useState<ModeStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchSources = async () => {
        try {
            const response = await fetch("http://localhost:8000/data-sources");
            if (response.ok) {
                const data = await response.json();
                setSources(data.sources || []);
            }
        } catch (error) {
            console.error("Failed to fetch data sources:", error);
        }
    };

    const fetchModeStatus = async () => {
        try {
            const response = await fetch("http://localhost:8000/mode/status");
            if (response.ok) {
                const data = await response.json();
                setModeStatus(data);
            }
        } catch (error) {
            console.error("Failed to fetch mode status:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSources();
        fetchModeStatus();

        // Refresh every 5 seconds
        const interval = setInterval(() => {
            fetchSources();
            fetchModeStatus();
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const activateSource = async (sourceId: string) => {
        try {
            const response = await fetch(
                `http://localhost:8000/data-sources/${sourceId}/activate`,
                { method: "POST" }
            );

            if (response.ok) {
                toast({
                    title: "Data source activated",
                    description: "Successfully switched data source",
                });
                fetchModeStatus();
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to activate data source",
                variant: "destructive",
            });
        }
    };

    const getSourceIcon = (type: string) => {
        return type === "database" ? "🗄️" : "📁";
    };

    const getModeColor = (mode: string) => {
        if (mode === "demo") return "bg-blue-500/10 text-blue-500 border-blue-500/20";
        if (mode === "custom") return "bg-green-500/10 text-green-500 border-green-500/20";
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    };

    if (loading) {
        return (
            <Button variant="outline" size="sm" disabled>
                <Database className="h-4 w-4 mr-2" />
                Loading...
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Database className="h-4 w-4" />
                    <span className="hidden sm:inline">
                        {modeStatus?.active_source?.name || "No Data Source"}
                    </span>
                    {modeStatus?.mode && (
                        <Badge
                            variant="outline"
                            className={`ml-1 ${getModeColor(modeStatus.mode)}`}
                        >
                            {modeStatus.mode === "demo" ? "DEMO" : "CUSTOM"}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Data Sources</span>
                    <Badge variant="secondary" className="ml-2">
                        {sources.length} source{sources.length !== 1 ? "s" : ""}
                    </Badge>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                {/* Active Source Info */}
                {modeStatus?.active_source && (
                    <>
                        <div className="px-2 py-2 text-sm">
                            <div className="font-medium text-muted-foreground mb-1">
                                Active Source
                            </div>
                            <div className="flex items-center gap-2">
                                <span>{getSourceIcon(modeStatus.active_source.type)}</span>
                                <div className="flex-1">
                                    <div className="font-medium">{modeStatus.active_source.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {modeStatus.active_source.table_count} table
                                        {modeStatus.active_source.table_count !== 1 ? "s" : ""}
                                    </div>
                                </div>
                                <Check className="h-4 w-4 text-green-500" />
                            </div>
                        </div>
                        <DropdownMenuSeparator />
                    </>
                )}

                {/* Available Sources */}
                {sources.length > 0 ? (
                    <>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Available Sources
                        </DropdownMenuLabel>
                        {sources.map((source) => (
                            <DropdownMenuItem
                                key={source.source_id}
                                onClick={() => activateSource(source.source_id)}
                                className="flex items-center gap-2 cursor-pointer"
                                disabled={source.source_id === modeStatus?.active_source?.source_id}
                            >
                                <span>{getSourceIcon(source.type)}</span>
                                <div className="flex-1">
                                    <div className="font-medium">{source.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {source.table_count} table{source.table_count !== 1 ? "s" : ""}
                                    </div>
                                </div>
                                {source.is_demo && (
                                    <Badge variant="outline" className="text-xs">
                                        DEMO
                                    </Badge>
                                )}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                    </>
                ) : (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No data sources available
                    </div>
                )}

                {/* Add New Source Actions */}
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Add New Source
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={onUploadClick} className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File (CSV/Excel)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onConnectClick} className="cursor-pointer">
                    <Plus className="h-4 w-4 mr-2" />
                    Connect Database
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
