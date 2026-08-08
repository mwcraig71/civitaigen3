import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpDown, ArrowUp, ArrowDown, Play, Clock, Zap, CheckCircle, XCircle,
  RefreshCw, Trophy, AlertTriangle, ChevronUp, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Model } from "@shared/schema";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface ModelPerf {
  modelId: string;
  modelName: string;
  baseModel: string;
  /** Generations with timing data (successes and timed failures) */
  timedCount: number;
  count24h: number;
  medianQueueMs: number | null;
  p90QueueMs: number | null;
  medianGenerateMs: number | null;
  medianTotalMs: number | null;
  p90TotalMs: number | null;
  /** Number of failed generations that had timing data */
  failCount: number;
  /** Average total latency (queue + generate) for failed generations; null when no failures */
  avgFailMs: number | null;
}

interface HistoryPoint {
  date: string;
  count: number;
  medianQueueMs: number | null;
  medianGenerateMs: number | null;
  medianTotalMs: number | null;
}

interface ModelHistory {
  modelId: string;
  days: number;
  history: HistoryPoint[];
}

type SortField = keyof ModelPerf;
type SortDir = "asc" | "desc";

type BenchmarkStatus = "idle" | "queued" | "running" | "completed" | "failed";

interface BenchmarkJob {
  modelId: string;
  modelName: string;
  baseModel: string;
  generationId?: string;
  startMs: number;
  endMs?: number;
  status: BenchmarkStatus;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtElapsed(startMs: number, endMs?: number): string {
  return fmtMs((endMs ?? Date.now()) - startMs);
}

/** Infer engine tag from baseModel string */
function engineTag(baseModel: string): string {
  const bm = baseModel.toLowerCase();
  if (bm.includes("krea") && bm.includes("turbo")) return "comfy";
  if (bm.includes("krea")) return "fal";
  if (bm.includes("flux")) return "flux";
  return "sdcpp";
}

const ENGINE_COLORS: Record<string, string> = {
  fal:   "bg-sky-500/15 text-sky-300 border-sky-500/30",
  comfy: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  flux:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  sdcpp: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const BENCHMARK_PROMPT = "a high quality portrait, photorealistic, detailed lighting";
const BENCHMARK_NEG    = "blurry, low quality, deformed";

/** Build generation params appropriate for the model family */
function benchmarkParams(model: Model) {
  const bm = (model.baseModel || "").toLowerCase();
  const isKrea2Fal = bm.includes("krea") && !bm.includes("turbo");
  const isFlux = bm.includes("flux");
  return {
    modelId: model.id,
    prompt: BENCHMARK_PROMPT,
    negativePrompt: isKrea2Fal ? "" : BENCHMARK_NEG,
    steps: isKrea2Fal ? 20 : isFlux ? 20 : 20,
    cfgScale: isKrea2Fal ? 70 : isFlux ? 35 : 70, // stored as int×10
    width:  isKrea2Fal ? 832 : 512,
    height: isKrea2Fal ? 832 : 768,
    scheduler: "Euler",
    clipSkip: 2,
    quantity: 1,
    loras: [],
    generationType: "txt2img",
    ...(isKrea2Fal && { aspectRatio: "1:1", creativity: "medium" }),
  };
}

// ── History Detail Row ────────────────────────────────────────────────────────

function HistoryDetailRow({ modelId, colSpan }: { modelId: string; colSpan: number }) {
  const [historyDays, setHistoryDays] = useState<string>("7");

  const { data, isLoading, isError } = useQuery<ModelHistory>({
    queryKey: [`/api/admin/model-performance/${modelId}/history`, historyDays],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/model-performance/${modelId}/history?days=${historyDays}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    staleTime: 30_000,
  });

  const history = data?.history ?? [];

  // Tooltip formatter
  const tooltipFormatter = (value: number | null, name: string) => {
    if (value == null) return ["—", name];
    const label =
      name === "medianTotalMs" ? "Median Total" :
      name === "medianQueueMs" ? "Median Queue" :
      name === "medianGenerateMs" ? "Median Gen" : name;
    return [fmtMs(value), label];
  };

  const tickFormatter = (ms: number) => {
    if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(0)}s`;
    return `${ms}ms`;
  };

  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-4 bg-muted/20 border-b border-border">
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Timing History
            </span>
            <Select value={historyDays} onValueChange={setHistoryDays}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Chart */}
          {isLoading ? (
            <div className="flex items-center justify-center h-28">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-28 text-xs text-red-400">
              Failed to load history data
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-xs text-muted-foreground">
              No timing data in the selected range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d);
                    return `${dt.getMonth() + 1}/${dt.getDate()}`;
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                  tickFormatter={tickFormatter}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "11px",
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.7)", marginBottom: 4 }}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                  formatter={tooltipFormatter as any}
                />
                <Line
                  type="monotone"
                  dataKey="medianTotalMs"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="medianQueueMs"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="medianGenerateMs"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          {!isLoading && !isError && history.length > 0 && (
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-0.5 bg-amber-400" />
                Median Total
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-0.5 bg-sky-400 border-dashed" style={{ borderTop: "1.5px dashed" }} />
                Median Queue
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-0.5 bg-violet-400" style={{ borderTop: "1.5px dashed" }} />
                Median Gen
              </span>
              {history.length > 0 && (
                <span className="ml-auto">
                  {history.reduce((s, p) => s + (p.count ?? 0), 0)} timed runs in range
                </span>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ModelPerformanceTab() {
  const { toast } = useToast();

  // ── Leaderboard state ──────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>("medianTotalMs");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");
  const [engineFilter, setEngineFilter] = useState<string>("all");
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const { data: perfData, isLoading: perfLoading, refetch: refetchPerf } = useQuery<{ models: ModelPerf[] }>({
    queryKey: ["/api/admin/model-performance"],
    refetchInterval: 60_000,
  });

  const { data: modelsData } = useQuery<Model[]>({ queryKey: ["/api/models"] });
  const checkpointModels = (modelsData ?? []).filter(m => m.type === "checkpoint");

  // ── Benchmark state ────────────────────────────────────────────────────────
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [benchmarkJobs, setBenchmarkJobs]       = useState<BenchmarkJob[]>([]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [tick, setTick]                         = useState(0); // drives live timer re-renders
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live 1-second tick while benchmark is running
  useEffect(() => {
    if (benchmarkRunning) {
      tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [benchmarkRunning]);

  // Poll generation status while benchmark is running
  const pollJobs = useCallback(async (jobs: BenchmarkJob[]) => {
    const active = jobs.filter(j => j.generationId && (j.status === "queued" || j.status === "running"));
    if (!active.length) return jobs;

    const updated = await Promise.all(jobs.map(async (job) => {
      if (!job.generationId || job.status === "completed" || job.status === "failed") return job;
      try {
        const res = await fetch(`/api/generations/${job.generationId}`, { credentials: "include" });
        if (!res.ok) return job;
        const gen = await res.json();
        if (gen.status === "completed") return { ...job, status: "completed" as BenchmarkStatus, endMs: Date.now() };
        if (gen.status === "failed")    return { ...job, status: "failed"    as BenchmarkStatus, endMs: Date.now() };
        // Distinguish queued vs actively generating by checking if CivitAI has started
        return job;
      } catch { return job; }
    }));
    return updated;
  }, []);

  useEffect(() => {
    if (!benchmarkRunning) return;
    pollRef.current = setInterval(async () => {
      setBenchmarkJobs(prev => {
        // If no jobs have a generationId to poll (e.g. all submissions failed),
        // stop immediately rather than looping forever.
        const hasPollable = prev.some(
          j => j.generationId && (j.status === "queued" || j.status === "running")
        );
        if (!hasPollable) {
          const allDone = prev.every(j => j.status === "completed" || j.status === "failed");
          if (allDone) {
            setBenchmarkRunning(false);
            if (pollRef.current) clearInterval(pollRef.current);
          }
          return prev;
        }

        // kick off async poll, update state when done
        pollJobs(prev).then(updated => {
          setBenchmarkJobs(updated);
          const allDone = updated.every(j => j.status === "completed" || j.status === "failed");
          if (allDone) {
            setBenchmarkRunning(false);
            refetchPerf(); // update leaderboard with new data
          }
        });
        return prev; // optimistic no-op until promise resolves
      });
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [benchmarkRunning, pollJobs, refetchPerf]);

  // ── Start benchmark ────────────────────────────────────────────────────────
  const startBenchmark = async () => {
    if (!selectedModelIds.length) return;
    const models = checkpointModels.filter(m => selectedModelIds.includes(m.id));
    const jobs: BenchmarkJob[] = models.map(m => ({
      modelId: m.id, modelName: m.name, baseModel: m.baseModel || "",
      startMs: Date.now(), status: "queued",
    }));
    setBenchmarkJobs(jobs);
    setBenchmarkRunning(true);

    // Fire all generations in parallel
    const finalJobs = await Promise.all(models.map(async (model, idx) => {
      try {
        const res = await fetch("/api/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(benchmarkParams(model)),
        });
        if (!res.ok) throw new Error(await res.text());
        const { id } = await res.json();
        const updated = { ...jobs[idx], generationId: id, status: "running" as BenchmarkStatus };
        setBenchmarkJobs(prev => prev.map((j, i) => i === idx ? updated : j));
        return updated;
      } catch (err) {
        const updated = { ...jobs[idx], status: "failed" as BenchmarkStatus, endMs: Date.now() };
        setBenchmarkJobs(prev => prev.map((j, i) => i === idx ? updated : j));
        toast({ title: `Failed to start ${model.name}`, description: String(err), variant: "destructive" });
        return updated;
      }
    }));

    // If every submission failed immediately, stop the runner right now —
    // there are no generation IDs to poll and the loop would never terminate.
    const allTerminal = finalJobs.every(j => j.status === "completed" || j.status === "failed");
    if (allTerminal) {
      setBenchmarkRunning(false);
      return;
    }
  };

  const resetBenchmark = () => {
    setBenchmarkJobs([]);
    setBenchmarkRunning(false);
    setSelectedModelIds([]);
  };

  // ── Sort + filter leaderboard ──────────────────────────────────────────────
  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  const leaderboard: ModelPerf[] = [...(perfData?.models ?? [])];
  const filtered = engineFilter === "all"
    ? leaderboard
    : leaderboard.filter(m => engineTag(m.baseModel) === engineFilter);

  filtered.sort((a, b) => {
    const av = (a[sortField] as number) ?? Infinity;
    const bv = (b[sortField] as number) ?? Infinity;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  // ── Benchmark results ranked by total time ─────────────────────────────────
  const rankedJobs = [...benchmarkJobs]
    .filter(j => j.status === "completed" || j.status === "failed")
    .sort((a, b) => ((a.endMs ?? 0) - a.startMs) - ((b.endMs ?? 0) - b.startMs));

  const hasBenchmarkResults = benchmarkJobs.length > 0;

  // Total columns in leaderboard table (for colSpan)
  const TABLE_COLS = 11; // #, Model, Engine, Median Queue, Median Gen, Median Total, P90 Total, Avg Fail, 24h Runs, Total, Expand

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-400" />
            Model Performance
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Passive latency tracking from every generation — queue wait, generation time, and success rate.
            Data accumulates automatically; no extra Buzz cost.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchPerf()} disabled={perfLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${perfLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Leaderboard ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Speed Leaderboard</CardTitle>
            <Select value={engineFilter} onValueChange={setEngineFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Engine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All engines</SelectItem>
                <SelectItem value="fal">FAL (Krea 2)</SelectItem>
                <SelectItem value="comfy">Comfy</SelectItem>
                <SelectItem value="flux">Flux</SelectItem>
                <SelectItem value="sdcpp">SD / Pony</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {perfLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filtered.length ? (
            <div className="text-center py-12 text-muted-foreground text-sm px-6">
              No timing data yet — timing is recorded automatically after each generation completes.
              Run some generations and data will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium">#</th>
                    <th className="text-left px-4 py-2 font-medium min-w-[180px]">Model</th>
                    <th className="text-left px-4 py-2 font-medium">Engine</th>
                    <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("medianQueueMs")}>
                      <span className="inline-flex items-center">Median Queue<SortIcon field="medianQueueMs" /></span>
                    </th>
                    <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("medianGenerateMs")}>
                      <span className="inline-flex items-center">Median Gen<SortIcon field="medianGenerateMs" /></span>
                    </th>
                    <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("medianTotalMs")}>
                      <span className="inline-flex items-center">Median Total<SortIcon field="medianTotalMs" /></span>
                    </th>
                    <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("p90TotalMs")}>
                      <span className="inline-flex items-center">P90 Total<SortIcon field="p90TotalMs" /></span>
                    </th>
                    <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("avgFailMs")}>
                      <span className="inline-flex items-center">Avg Fail<SortIcon field="avgFailMs" /></span>
                    </th>
                    <th className="text-right px-4 py-2 font-medium">24h Runs</th>
                    <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("timedCount")}>
                      <span className="inline-flex items-center">Total<SortIcon field="timedCount" /></span>
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, idx) => {
                    const eng = engineTag(m.baseModel);
                    const isExpanded = expandedModelId === m.modelId;
                    return (
                      <>
                        <tr
                          key={m.modelId}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${isExpanded ? "bg-muted/20" : ""}`}
                          onClick={() => setExpandedModelId(isExpanded ? null : m.modelId)}
                        >
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {idx === 0 ? <Trophy className="h-4 w-4 text-amber-400" /> : idx + 1}
                          </td>
                          <td className="px-4 py-2.5 font-medium max-w-[220px] truncate" title={m.modelName}>
                            {m.modelName}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${ENGINE_COLORS[eng] ?? ENGINE_COLORS.sdcpp}`}>
                              {eng}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtMs(m.medianQueueMs)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtMs(m.medianGenerateMs)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtMs(m.medianTotalMs)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMs(m.p90TotalMs)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {m.avgFailMs == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="text-red-400" title={`${Number(m.failCount)} failed generation${Number(m.failCount) !== 1 ? "s" : ""} with timing`}>
                                {fmtMs(m.avgFailMs)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{Number(m.count24h)}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{Number(m.timedCount)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {isExpanded
                              ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />
                            }
                          </td>
                        </tr>
                        {isExpanded && (
                          <HistoryDetailRow key={`${m.modelId}-history`} modelId={m.modelId} colSpan={TABLE_COLS} />
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Benchmark runner ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4" />
            On-Demand Benchmark
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Fires a real 1-image test generation per selected model simultaneously.
            Results feed back into the leaderboard above.
            Costs ~5 Buzz per model.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasBenchmarkResults && !benchmarkRunning && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Select up to 6 models to race
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {checkpointModels.map(m => {
                  const selected = selectedModelIds.includes(m.id);
                  const disabled = !selected && selectedModelIds.length >= 6;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        if (selected) setSelectedModelIds(prev => prev.filter(id => id !== m.id));
                        else if (!disabled) setSelectedModelIds(prev => [...prev, m.id]);
                      }}
                      className={`text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : disabled
                          ? "border-border/30 text-muted-foreground/50 cursor-not-allowed"
                          : "border-border hover:border-primary/50 text-foreground"
                      }`}
                    >
                      <div className="font-medium truncate">{m.name}</div>
                      <div className={`mt-0.5 inline-flex items-center px-1 py-0.5 rounded border text-[9px] ${ENGINE_COLORS[engineTag(m.baseModel || "")] ?? ENGINE_COLORS.sdcpp}`}>
                        {engineTag(m.baseModel || "")}
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedModelIds.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground">
                    {selectedModelIds.length} model{selectedModelIds.length > 1 ? "s" : ""} selected
                    · est. <span className="text-amber-400 font-medium">{selectedModelIds.length * 5} Buzz</span>
                  </div>
                  <Button size="sm" onClick={startBenchmark} disabled={benchmarkRunning}>
                    <Play className="h-3 w-3 mr-1.5" />
                    Start Race
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Live race cards */}
          {hasBenchmarkResults && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {benchmarkJobs.map((job) => {
                  const elapsed = (job.endMs ?? Date.now()) - job.startMs;
                  const statusIcon = {
                    idle:      <Clock className="h-4 w-4 text-muted-foreground" />,
                    queued:    <Clock className="h-4 w-4 text-sky-400 animate-pulse" />,
                    running:   <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />,
                    completed: <CheckCircle className="h-4 w-4 text-green-400" />,
                    failed:    <XCircle className="h-4 w-4 text-red-400" />,
                  }[job.status];

                  const rank = rankedJobs.findIndex(j => j.modelId === job.modelId);
                  const rankLabel = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;

                  return (
                    <div
                      key={job.modelId}
                      className={`rounded-lg border p-3 space-y-2 transition-colors ${
                        job.status === "completed" ? "border-green-500/30 bg-green-500/5" :
                        job.status === "failed"    ? "border-red-500/30 bg-red-500/5" :
                        "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-xs truncate flex-1" title={job.modelName}>
                          {rankLabel && <span className="mr-1">{rankLabel}</span>}{job.modelName}
                        </div>
                        {statusIcon}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-medium ${ENGINE_COLORS[engineTag(job.baseModel)] ?? ENGINE_COLORS.sdcpp}`}>
                          {engineTag(job.baseModel)}
                        </span>
                        <span className="text-xl font-mono font-bold tabular-nums">
                          {/* re-renders every second via tick */}
                          {void tick}
                          {fmtElapsed(job.startMs, job.endMs)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground capitalize">{job.status}</div>
                    </div>
                  );
                })}
              </div>

              {!benchmarkRunning && (
                <Button variant="outline" size="sm" onClick={resetBenchmark}>
                  Run Another Benchmark
                </Button>
              )}
              {benchmarkRunning && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Polling for results every 3s…
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
