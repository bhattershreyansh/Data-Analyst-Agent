import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { Database, Upload, Plus, Check, X, Folder } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { dataSourcesAPI, modeAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

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
    const { getToken } = useAuth();
    const [sources, setSources] = useState<DataSource[]>([]);
    const [modeStatus, setModeStatus] = useState<ModeStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const navigate = useNavigate();
    const fetchSources = async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const response = await dataSourcesAPI.listSources(token);
            if (response.success) {
                setSources(response.data.sources || []);
            }
        } catch (error) {
            console.error("Failed to fetch data sources:", error);
        }
    };

    const fetchModeStatus = async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const response = await modeAPI.getStatus(token);
            if (response.success) {
                setModeStatus(response.data);
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
            const token = await getToken();
            if (!token) return;
            const response = await dataSourcesAPI.activateSource(sourceId, token);

            if (response.success) {
                toast({
                    title: "Data source activated",
                    description: "Successfully switched data source",
                });
                fetchModeStatus();
                navigate("/analytics");
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to activate data source",
                variant: "destructive",
            });
        }
    };

    const deactivateSource = async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const response = await dataSourcesAPI.deactivateSource(token);

            if (response.success) {
                toast({
                    title: "Neural Link Terminated",
                    description: "Disconnected from the data source",
                });
                fetchModeStatus();
                // Redirect to home page as requested
                navigate("/");
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to disconnect data source",
                variant: "destructive",
            });
        }
    };


    const getSourceIcon = (type: string) => {
        return type === "database" ? (
            <Database className="h-4 w-4 inline-block text-primary" />
        ) : (
            <Folder className="h-4 w-4 inline-block text-primary" />
        );
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
                <Button variant="ghost" className="h-10 px-4 rounded-xl glass border-white/10 hover:bg-white/5 transition-all group">
                    <Database className="h-4 w-4 mr-2 text-primary group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-white/90 text-sm hidden sm:inline">
                        {modeStatus?.active_source?.name || "Neural Link: Offline"}
                    </span>
                    {modeStatus?.mode && (
                        <div className={cn(
                            "ml-3 w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]",
                            modeStatus.mode === "demo" ? "bg-accent shadow-accent/50" : "bg-primary shadow-primary/50"
                        )} />
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-80 glass-card rounded-2xl border-white/10 shadow-2xl p-2 mt-2">
                <DropdownMenuLabel className="flex items-center justify-between px-3 py-3">
                    <span className="text-xs font-black uppercase tracking-widest text-white/40">Data Ecosystem</span>
                    <Badge variant="secondary" className="glass border-white/10 text-primary text-[10px] h-5 px-2 font-bold">
                        {sources.length} Nodes
                    </Badge>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="bg-white/5 mx-2" />

                {/* Active Source Info */}
                {modeStatus?.active_source && (
                    <div className="px-2 py-3 bg-primary/5 rounded-xl border border-primary/20 mx-1 my-2 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                        <div className="flex items-center gap-3 px-2">
                            <span className="opacity-80 flex items-center">{getSourceIcon(modeStatus.active_source.type)}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-tighter text-primary mb-0.5">Active Neural Link</div>
                                <div className="font-bold text-white truncate">{modeStatus.active_source.name}</div>
                                <div className="text-[10px] text-muted-foreground/60 font-medium">
                                    {modeStatus.active_source.table_count} Knowledge Modules
                                </div>
                            </div>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deactivateSource();
                                }}
                                className="h-8 w-8 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-all border border-white/5 hover:border-red-500/30"
                                title="Disconnect Neural Link"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Available Sources */}
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar px-1">
                    {sources.length > 0 ? (
                        <>
                            <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest px-3 py-3">
                                Available Syntaxes
                            </DropdownMenuLabel>
                            {sources.filter(s => s.source_id !== modeStatus?.active_source?.source_id).map((source) => (
                                <DropdownMenuItem
                                    key={source.source_id}
                                    onClick={() => activateSource(source.source_id)}
                                    className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer hover:bg-white/5 focus:bg-white/5 transition-colors mb-1 group"
                                >
                                    <span className="grayscale group-hover:grayscale-0 transition-all flex items-center">{getSourceIcon(source.type)}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-white/80 group-hover:text-white transition-colors truncate">{source.name}</div>
                                        <div className="text-[10px] text-muted-foreground/40 font-medium group-hover:text-muted-foreground/60 transition-colors">
                                            {source.table_count} tables
                                        </div>
                                    </div>
                                    {source.is_demo && (
                                        <Badge variant="outline" className="text-[8px] h-4 px-1 border-white/10 text-muted-foreground/40 uppercase">
                                            Demo
                                        </Badge>
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </>
                    ) : !modeStatus?.active_source && (
                        <div className="px-4 py-8 text-center space-y-3">
                            <div className="flex justify-center opacity-20"><Database className="h-8 w-8 text-muted-foreground" /></div>
                            <p className="text-xs text-muted-foreground/40 font-medium">No intelligence vectors established.</p>
                        </div>
                    )}
                </div>

                <DropdownMenuSeparator className="bg-white/5 mx-2" />

                {/* Add New Source Actions */}
                <div className="grid grid-cols-2 gap-2 p-2 pt-3">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={onUploadClick}
                        className="h-20 flex-col gap-2 rounded-xl bg-white/5 hover:bg-primary/10 hover:text-primary border border-white/5 hover:border-primary/20 transition-all group"
                    >
                        <Upload className="h-5 w-5 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Upload</span>
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={onConnectClick}
                        className="h-20 flex-col gap-2 rounded-xl bg-white/5 hover:bg-accent/10 hover:text-accent border border-white/5 hover:border-accent/20 transition-all group"
                    >
                        <Plus className="h-5 w-5 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Connect</span>
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
