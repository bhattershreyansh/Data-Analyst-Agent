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
  const userId = user?.user_id;
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
        <aside className="w-full md:w-80 border-r border-outline-variant bg-surface-container-low flex flex-col">
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-md font-bold uppercase tracking-tight text-white">
                <Database className="h-4.5 w-4.5 text-primary" />
                Schema Blueprint
              </h2>
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-surface-dim border-outline-variant rounded-[4px] text-xs font-mono focus:ring-primary/20 placeholder:text-outline-variant/40 text-white"
              />
            </div>

            {/* Stats */}
            <div className="flex gap-2">
              <div className="flex-1 bg-surface-container border border-outline-variant/30 rounded p-2 text-center">
                <div className="text-md font-black text-white">{blueprint?.tables.length || 0}</div>
                <div className="text-[9px] text-outline font-mono uppercase tracking-widest">Tables</div>
              </div>
              <div className="flex-1 bg-surface-container border border-outline-variant/30 rounded p-2 text-center">
                <div className="text-md font-black text-primary">{uniqueRelCount}</div>
                <div className="text-[9px] text-outline font-mono uppercase tracking-widest">Links</div>
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
                    "w-full text-left px-3.5 py-2.5 rounded transition-all group relative overflow-hidden border",
                    selectedTable === table.name
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "hover:bg-surface-container/60 text-on-surface-variant border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2.5">
                      <TableIcon className={cn("h-4 w-4", selectedTable === table.name ? "text-primary" : "text-outline")} />
                      <span className="font-mono text-xs truncate">{table.name}</span>
                    </div>
                    <span className="text-[10px] text-outline-variant font-mono">{table.columns.length} cols</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-outline-variant">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchBlueprint(true)}
              disabled={aiEnriching || loading}
              className="w-full bg-surface-container border-outline-variant hover:border-primary/50 text-primary hover:bg-primary hover:text-on-primary rounded-[4px] h-9 font-mono text-[10px] uppercase tracking-wider font-bold"
            >
              {aiEnriching ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Enrich Schema
            </Button>
          </div>
        </aside>

        {/* MAIN AREA: Card-based schema visualization */}
        <section className="flex-grow flex-1 relative bg-surface-dim overflow-hidden flex">
          
          {/* Table Grid */}
          <div className="flex-grow flex-1 overflow-auto p-8">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <div className="h-12 w-12 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
                  <RefreshCw className="h-6 w-6 text-primary animate-spin" />
                </div>
                <p className="text-outline font-mono text-[11px] uppercase tracking-wider animate-pulse">Syncing Database Structure Map...</p>
              </div>
            ) : !blueprint ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <Database className="h-12 w-12 text-outline-variant/30" />
                <p className="text-outline font-mono text-[11px] uppercase tracking-wider">No data source active. Connect a database to trace.</p>
              </div>
            ) : (
              <div>
                {/* Empty state when no table is selected */}
                {!selectedTable ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 select-none min-h-[300px]">
                    <div className="h-16 w-16 rounded bg-surface-container border border-outline-variant flex items-center justify-center">
                      <TableIcon className="h-6 w-6 text-outline-variant/40" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-white uppercase tracking-wider">No table selected</p>
                      <p className="text-[11px] text-outline font-mono uppercase tracking-wide mt-1.5">Choose a table from the sidebar to inspect schema blueprint</p>
                    </div>
                  </div>
                ) : (
                <div>
                  {/* Header hint */}
                  <div className="mb-6 flex items-center gap-2 text-[10px] font-mono text-outline uppercase tracking-wider">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    <span>Inspecting <span className="text-primary font-bold">{selectedTable}</span>. Click again to deselect.</span>
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
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ 
                            opacity: isUnrelated ? 0.3 : 1, 
                            y: 0,
                            scale: isSelected ? 1.01 : 1  
                          }}
                          transition={{ delay: idx * 0.01, duration: 0.2 }}
                        className={cn(
                          "rounded border p-4 flex flex-col gap-3.5 cursor-pointer transition-all",
                          isSelected
                            ? "border-primary/60 bg-primary/5 shadow-md shadow-primary/5"
                            : isNeighbor
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-outline-variant bg-surface-container-low hover:border-outline hover:bg-surface-container"
                        )}
                        onClick={() => setSelectedTable(isSelected ? null : table.name)}
                      >
                        {/* Table header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "p-1.5 rounded",
                              isSelected ? "bg-primary/10 text-primary border border-primary/25" 
                              : isNeighbor ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                              : "bg-surface-container-high text-outline"
                            )}>
                              <TableIcon className="h-3.5 w-3.5" />
                            </div>
                            <span className="font-mono text-xs font-bold text-white truncate max-w-[120px]">{table.name}</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(table.name); }}
                            className="p-1 rounded hover:bg-white/5 text-outline hover:text-white transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {/* Collapsed: show first 3 cols as pills */}
                        {!isExpanded && (
                          <div className="flex flex-wrap gap-1.5">
                            {table.columns.slice(0, 4).map(col => (
                              <span key={col} className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant truncate max-w-full">
                                {col}
                              </span>
                            ))}
                            {table.columns.length > 4 && (
                              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-bold">
                                +{table.columns.length - 4} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Expanded: all columns */}
                        {isExpanded && (
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                            {table.columns.map(col => (
                              <div key={col} className="text-[10px] font-mono px-2.5 py-1.5 rounded bg-surface-container-lowest border border-outline-variant/35 text-white/70 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-primary/50 flex-shrink-0" />
                                {col}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Relations footer */}
                        {relations.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-outline-variant/20">
                            <LinkIcon className="h-3 w-3 text-outline/40 flex-shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {relations.slice(0, 3).map(r => (
                                <span 
                                  key={r.neighbor} 
                                  className={cn(
                                    "text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] uppercase tracking-wide border",
                                    r.type === 'semantic' 
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                      : "bg-primary/10 text-primary/70 border-primary/20"
                                  )}
                                >
                                  {r.neighbor}
                                </span>
                              ))}
                              {relations.length > 3 && (
                                <span className="text-[8px] text-outline/50 font-mono">+{relations.length - 3}</span>
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
                initial={{ x: 320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 320, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                className="w-80 border-l border-outline-variant bg-surface-container-low p-6 overflow-y-auto flex flex-col gap-6 flex-shrink-0 custom-scrollbar"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] font-mono font-bold text-primary uppercase tracking-widest mb-1">Selected Table</div>
                    <h3 className="text-xl font-bold text-white leading-none uppercase tracking-tight font-sans">{selectedTable}</h3>
                    <p className="text-[10px] font-mono text-outline mt-1.5">{selectedTableData.columns.length} columns · {selectedRelations.length} links</p>
                  </div>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="p-1 rounded hover:bg-white/5 text-outline hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* All columns */}
                <div>
                  <h4 className="text-[10px] font-mono font-bold text-outline uppercase tracking-wider flex items-center gap-2 mb-3">
                    <TableIcon className="h-3.5 w-3.5 text-primary" />
                    All Columns
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {selectedTableData.columns.map(col => (
                       <div key={col} className="px-3 py-2.5 rounded bg-surface-container border border-outline-variant text-[11px] font-mono flex items-center gap-2 text-white/95">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                        {col}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connections */}
                {selectedRelations.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-mono font-bold text-outline uppercase tracking-wider flex items-center gap-2 mb-3">
                      <LinkIcon className="h-3.5 w-3.5 text-primary" />
                      Connections ({selectedRelations.length})
                    </h4>
                    <div className="flex flex-col gap-2">
                      {selectedRelations.map(r => (
                        <button
                          key={r.neighbor}
                          onClick={() => setSelectedTable(r.neighbor)}
                          className="flex items-center justify-between p-3 rounded border border-outline-variant bg-surface-container hover:bg-surface-container-high transition-all text-left group"
                        >
                          <div>
                            <div className={cn(
                              "text-[8px] font-mono font-bold uppercase tracking-widest mb-0.5 flex items-center gap-1",
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
                            <div className="font-mono font-bold text-white text-xs">{r.neighbor}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-outline group-hover:text-primary transition-all -translate-x-1 group-hover:translate-x-0 opacity-0 group-hover:opacity-100" />
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
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded border border-outline-variant bg-surface-container-low text-xs text-outline font-mono uppercase tracking-wide">
                  <TableIcon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>Select a table from grid to inspect columns</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
