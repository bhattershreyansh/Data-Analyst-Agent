import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { queryAPI } from '@/lib/api';
import { useAuth, useUser } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, 
  Search, 
  ArrowRight, 
  Info, 
  Sparkles, 
  RefreshCw,
  Table as TableIcon,
  Link as LinkIcon,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface BlueprintTable {
  name: string;
  columns: string[];
}

interface Relationship {
  from_table: string;
  from_columns?: string[];
  to_table: string;
  to_columns?: string[];
  type?: string;
  matching_column?: string;
  description?: string;
}

interface Blueprint {
  tables: BlueprintTable[];
  relationships: Relationship[];
  source_name: string;
  source_id: string;
  ai_enriched: boolean;
}

export default function SchemaBlueprint() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id;
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [aiEnriching, setAiEnriching] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  // ── RBAC: wipe stale blueprint when user changes ──
  useEffect(() => {
    setBlueprint(null);
    setSelectedTable(null);
    setSearchQuery('');
    if (userId) fetchBlueprint();
  }, [userId]);

  const fetchBlueprint = async (enrich: boolean = false) => {
    try {
      setLoading(true);
      if (enrich) setAiEnriching(true);
      const token = await getToken();
      const sourceId = (userId ? localStorage.getItem(`active_source_id_${userId}`) : null) || 'demo-shopify-db';
      
      const response = await queryAPI.getSchema(sourceId, enrich, token);
      if (response.success) {
        setBlueprint(response.data);
      } else {
        setBlueprint(null);
        toast.error(response.error || 'Failed to load Database Structure Map');
      }
    } catch (error) {
      console.error('Error fetching blueprint:', error);
      toast.error('Failed to load Database Structure Map');
    } finally {
      setLoading(false);
      setAiEnriching(false);
    }
  };

  const toggleExpand = (tableName: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) next.delete(tableName);
      else next.add(tableName);
      return next;
    });
  };

  const filteredTables = blueprint?.tables.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Get unique, deduplicated relationships for a given table
  const getRelatedTables = (tableName: string): { neighbor: string; type: string }[] => {
    if (!blueprint) return [];
    const seen = new Set<string>();
    const result: { neighbor: string; type: string }[] = [];
    blueprint.relationships.forEach(rel => {
      let neighbor: string | null = null;
      if (rel.from_table === tableName) neighbor = rel.to_table;
      else if (rel.to_table === tableName) neighbor = rel.from_table;
      if (neighbor && !seen.has(neighbor)) {
        seen.add(neighbor);
        result.push({ neighbor, type: rel.type || 'explicit' });
      }
    });
    return result;
  };

  // Unique relationship count (deduplicated by table pair)
  const uniqueRelCount = (() => {
    if (!blueprint) return 0;
    const pairs = new Set<string>();
    blueprint.relationships.forEach(r => {
      const pair = [r.from_table, r.to_table].sort().join('||');
      pairs.add(pair);
    });
    return pairs.size;
  })();

  const selectedTableData = blueprint?.tables.find(t => t.name === selectedTable);
  const selectedRelations = selectedTable ? getRelatedTables(selectedTable) : [];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 flex flex-col md:flex-row h-[calc(100vh-80px)] overflow-hidden">
        {/* SIDEBAR: Table List */}
        <aside className="w-full md:w-80 border-r border-white/5 bg-black/20 backdrop-blur-md flex flex-col">
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <Database className="h-5 w-5 text-primary" />
                Schema Blueprint
              </h2>
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 bg-white/5 border-white/10 rounded-xl focus:ring-primary/20"
              />
            </div>

            {/* Stats */}
            <div className="flex gap-2">
              <div className="flex-1 bg-white/5 rounded-xl px-3 py-2 text-center">
                <div className="text-lg font-black text-white">{blueprint?.tables.length || 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Tables</div>
              </div>
              <div className="flex-1 bg-white/5 rounded-xl px-3 py-2 text-center">
                <div className="text-lg font-black text-primary">{uniqueRelCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Links</div>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-4 pb-6 space-y-1">
              {filteredTables.map((table) => (
                <button
                  key={table.name}
                  onClick={() => setSelectedTable(table.name === selectedTable ? null : table.name)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl transition-all group relative overflow-hidden",
                    selectedTable === table.name
                      ? "bg-primary/20 border border-primary/30 text-primary shadow-lg shadow-primary/5"
                      : "hover:bg-white/5 text-muted-foreground border border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                      <TableIcon className={cn("h-4 w-4", selectedTable === table.name ? "text-primary" : "text-muted-foreground/40")} />
                      <span className="font-medium text-sm truncate">{table.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">{table.columns.length} cols</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-white/5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchBlueprint(true)}
              disabled={aiEnriching || loading}
              className="w-full glass border-primary/30 text-primary hover:bg-primary hover:text-white rounded-xl h-10 font-bold"
            >
              {aiEnriching ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Enrich Schema
            </Button>
          </div>
        </aside>

        {/* MAIN AREA: Card-based schema visualization */}
        <section className="flex-1 relative bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent overflow-hidden flex">
          
          {/* Table Grid */}
          <div className="flex-1 overflow-auto p-8">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <div className="h-16 w-16 rounded-3xl bg-primary/20 flex items-center justify-center neon-glow">
                  <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                </div>
                <p className="text-muted-foreground font-medium animate-pulse">Syncing Database Structure Map...</p>
              </div>
            ) : !blueprint ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <Database className="h-16 w-16 text-muted-foreground/20" />
                <p className="text-muted-foreground">No data source active. Upload a file or connect a database.</p>
              </div>
            ) : (
              <div>
                {/* Empty state when no table is selected */}
                {!selectedTable ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 select-none">
                    <div className="h-20 w-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <TableIcon className="h-9 w-9 text-muted-foreground/30" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white/30">No table selected</p>
                      <p className="text-sm text-muted-foreground/40 mt-1">Choose a table from the sidebar to view its schema</p>
                    </div>
                  </div>
                ) : (
                <div>
                  {/* Header hint */}
                  <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground/50">
                    <Info className="h-3.5 w-3.5" />
                    <span>Inspecting <span className="text-primary font-bold">{selectedTable}</span>. Click it again to deselect.</span>
                  </div>

                  {/* Table Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredTables.map((table, idx) => {
                      const relations = getRelatedTables(table.name);
                      const isSelected = selectedTable === table.name;
                      const isExpanded = expandedTables.has(table.name);
                      const isNeighbor = selectedTable !== null && relations.some(r => r.neighbor === selectedTable);
                      const isUnrelated = selectedTable !== null && !isSelected && !isNeighbor;

                      return (
                        <motion.div
                          key={table.name}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ 
                            opacity: isUnrelated ? 0.2 : 1, 
                            y: 0,
                            scale: isSelected ? 1.02 : 1  
                          }}
                          transition={{ delay: idx * 0.02, duration: 0.25 }}
                        className={cn(
                          "rounded-2xl border p-4 flex flex-col gap-3 cursor-pointer transition-all",
                          isSelected
                            ? "border-primary/60 bg-primary/10 shadow-xl shadow-primary/10"
                            : isNeighbor
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : "border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/5"
                        )}
                        onClick={() => setSelectedTable(isSelected ? null : table.name)}
                      >
                        {/* Table header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "p-1.5 rounded-lg",
                              isSelected ? "bg-primary/20 text-primary" 
                              : isNeighbor ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-white/10 text-muted-foreground"
                            )}>
                              <TableIcon className="h-3.5 w-3.5" />
                            </div>
                            <span className="font-bold text-sm text-white truncate max-w-[120px]">{table.name}</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(table.name); }}
                            className="p-1 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {/* Collapsed: show first 3 cols as pills */}
                        {!isExpanded && (
                          <div className="flex flex-wrap gap-1.5">
                            {table.columns.slice(0, 4).map(col => (
                              <span key={col} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-muted-foreground truncate max-w-full">
                                {col}
                              </span>
                            ))}
                            {table.columns.length > 4 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-bold">
                                +{table.columns.length - 4} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Expanded: all columns */}
                        {isExpanded && (
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                            {table.columns.map(col => (
                              <div key={col} className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 text-white/70 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-primary/50 flex-shrink-0" />
                                {col}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Relations footer */}
                        {relations.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                            <LinkIcon className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {relations.slice(0, 3).map(r => (
                                <span 
                                  key={r.neighbor} 
                                  className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
                                    r.type === 'semantic' 
                                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                      : "bg-primary/10 text-primary/70 border border-primary/20"
                                  )}
                                >
                                  {r.neighbor}
                                </span>
                              ))}
                              {relations.length > 3 && (
                                <span className="text-[9px] text-muted-foreground/50">+{relations.length - 3}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </motion.div>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT FOCUS PANEL: Appears when table is selected */}
          <AnimatePresence>
            {selectedTable && selectedTableData && (
              <motion.aside
                initial={{ x: 340, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 340, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="w-80 border-l border-white/10 bg-black/60 backdrop-blur-xl p-6 overflow-y-auto flex flex-col gap-6 flex-shrink-0"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Selected Table</div>
                    <h3 className="text-2xl font-black text-white leading-none">{selectedTable}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{selectedTableData.columns.length} columns · {selectedRelations.length} connections</p>
                  </div>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* All columns */}
                <div>
                  <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-2 mb-3">
                    <TableIcon className="h-3.5 w-3.5" />
                    All Columns
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {selectedTableData.columns.map(col => (
                      <div key={col} className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-sm font-mono flex items-center gap-2 hover:border-primary/30 transition-all">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                        {col}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connections */}
                {selectedRelations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-2 mb-3">
                      <LinkIcon className="h-3.5 w-3.5" />
                      Connections ({selectedRelations.length})
                    </h4>
                    <div className="flex flex-col gap-2">
                      {selectedRelations.map(r => (
                        <button
                          key={r.neighbor}
                          onClick={() => setSelectedTable(r.neighbor)}
                          className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all text-left group"
                        >
                          <div>
                            <div className={cn(
                              "text-[9px] font-bold uppercase tracking-widest mb-0.5 flex items-center gap-1",
                              r.type === 'semantic' ? "text-amber-400" : "text-primary"
                            )}>
                              {r.type === 'semantic' ? (
                                <>
                                  <Sparkles className="h-3 w-3" />
                                  Semantic
                                </>
                              ) : (
                                <>
                                  <LinkIcon className="h-3 w-3" />
                                  Foreign Key
                                </>
                              )}
                            </div>
                            <div className="font-bold text-white text-sm">{r.neighbor}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-all -translate-x-2 group-hover:translate-x-0 opacity-0 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Empty state hint when blueprint loaded but nothing selected */}
          <AnimatePresence>
            {blueprint && !selectedTable && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none"
              >
                <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 text-sm text-muted-foreground shadow-2xl">
                  <TableIcon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>Select a table from the grid to inspect its columns and connections</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
