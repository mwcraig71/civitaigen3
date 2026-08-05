import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/use-websocket';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { apiRequest } from '@/lib/queryClient';
import { Model, Generation, WebSocketMessage } from '@/types';
import {
  BookOpen,
  Play,
  Square,
  Search,
  User,
  CheckCircle,
  XCircle,
  Loader2,
  ImageIcon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ── Character LoRA detection (mirrors lora-selector.tsx logic) ──────────────

const isCharacterLoraName = (name: string) => {
  const n = name.toLowerCase();
  return n.startsWith('rly') || n.includes('be my hero') || n.includes('bemyhero');
};

const isCharacterLora = (lora: Model): boolean => {
  if (lora.loraCategory === 'character') return true;
  if (lora.loraCategory === 'style') return false;
  return isCharacterLoraName(lora.name ?? '');
};

// ── Types ────────────────────────────────────────────────────────────────────

type ResultStatus = 'pending' | 'running' | 'queued' | 'completed' | 'failed';

interface YearbookResult {
  loraId: string;
  loraName: string;
  loraImage?: string;
  triggerWords: string[];
  status: ResultStatus;
  imageUrl?: string;
  generationId?: string;
  error?: string;
  startedAt?: number; // ms timestamp — for the card to show "queued" label
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PROMPT =
  'masterpiece, best quality, 1girl, portrait, beautiful detailed eyes, long flowing hair, soft lighting, highly detailed';

// ── Component ────────────────────────────────────────────────────────────────

export default function Yearbook() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Read current generation settings from the main panel (read-only — don't clobber them)
  const { form } = useGenerationSettings({
    storagePrefix: 'generationPanel',
    enableAutoSave: false,
    enableLoRAValidation: false,
  });

  // All models
  const { data: allModels = [], isLoading: modelsLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  // Character LoRAs only
  const characterLoras = useMemo(
    () =>
      allModels
        .filter((m) => m.type?.toLowerCase() === 'lora' && isCharacterLora(m))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allModels]
  );

  // ── UI state ─────────────────────────────────────────────────────────────

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [prompt, setPrompt] = useState<string>(() => {
    try {
      return localStorage.getItem('yearbook_prompt') || DEFAULT_PROMPT;
    } catch {
      return DEFAULT_PROMPT;
    }
  });
  const [promptExpanded, setPromptExpanded] = useState(false);

  // Persist prompt whenever it changes
  useEffect(() => {
    try { localStorage.setItem('yearbook_prompt', prompt); } catch { /* ignore */ }
  }, [prompt]);

  // ── Batch run state ───────────────────────────────────────────────────────

  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [results, setResults] = useState<YearbookResult[]>([]);
  const cancelRef = useRef(false);

  // Refs for bridging async generation loop ↔ WebSocket/poll
  const pendingGenIdRef = useRef<string | null>(null);
  const resolveGenRef = useRef<((r: { imageUrl?: string; error?: string }) => void) | null>(null);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const { messageQueue, setMessageQueue } = useWebSocket((user as any)?.id || '');

  useEffect(() => {
    if (!messageQueue.length) return;

    const toProcess = [...messageQueue];
    setMessageQueue([]);

    for (const msg of toProcess) {
      if (!pendingGenIdRef.current || !resolveGenRef.current) continue;

      const matches =
        msg.generationId === pendingGenIdRef.current ||
        msg.batchId === pendingGenIdRef.current ||
        msg.imageId === pendingGenIdRef.current;

      if (!matches) continue;

      if (msg.type === 'generation_image_ready' && msg.imageUrl) {
        const resolve = resolveGenRef.current;
        pendingGenIdRef.current = null;
        resolveGenRef.current = null;
        resolve({ imageUrl: msg.imageUrl });
        break;
      }

      if (msg.type === 'generation_batch_complete') {
        // batch finished — if we haven't resolved via image_ready, poll once
        break;
      }

      if (msg.type === 'error') {
        const resolve = resolveGenRef.current;
        pendingGenIdRef.current = null;
        resolveGenRef.current = null;
        resolve({ error: (msg as any).error || msg.message || 'Generation failed' });
        break;
      }
    }
  }, [messageQueue, setMessageQueue]);

  // ── Generation waiter ─────────────────────────────────────────────────────

  const waitForGeneration = useCallback(
    (generationId: string): Promise<{ imageUrl?: string; error?: string }> => {
      return new Promise((resolve) => {
        pendingGenIdRef.current = generationId;
        resolveGenRef.current = resolve;

        // HTTP polling fallback — fires every 6 s
        const pollInterval = setInterval(async () => {
          if (!pendingGenIdRef.current) {
            clearInterval(pollInterval);
            return;
          }
          try {
            const res = await fetch(`/api/generations/${generationId}`);
            if (!res.ok) return;
            const gen: Generation & { message?: string } = await res.json();

            if (gen.status === 'completed' && gen.imageUrl) {
              clearInterval(pollInterval);
              if (pendingGenIdRef.current) {
                pendingGenIdRef.current = null;
                resolveGenRef.current = null;
                resolve({ imageUrl: gen.imageUrl });
              }
            } else if (gen.status === 'failed') {
              clearInterval(pollInterval);
              if (pendingGenIdRef.current) {
                pendingGenIdRef.current = null;
                resolveGenRef.current = null;
                resolve({ error: 'Generation failed' });
              }
            }
          } catch {
            // polling failed — keep trying
          }
        }, 6000);

        // 35-minute hard timeout — matches the server's hard cap so we never
        // give up before the server does (CivitAI queues can run 15-25 min).
        const timeout = setTimeout(() => {
          clearInterval(pollInterval);
          if (pendingGenIdRef.current === generationId) {
            pendingGenIdRef.current = null;
            resolveGenRef.current = null;
            resolve({ error: 'Generation timed out — CivitAI queue may be busy. Check your gallery for the result.' });
          }
        }, 35 * 60 * 1000);

        // Clean up timeout when resolved by WebSocket
        const originalResolve = resolveGenRef.current;
        resolveGenRef.current = (r) => {
          clearTimeout(timeout);
          clearInterval(pollInterval);
          originalResolve?.(r);
        };
      });
    },
    []
  );

  // ── Derived lists ─────────────────────────────────────────────────────────

  const filteredLoras = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return characterLoras;
    return characterLoras.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.activationWords ?? []).some((w) => w.toLowerCase().includes(q))
    );
  }, [characterLoras, search]);

  // Group filtered LoRAs by baseModel, alphabetically by group label
  const loraGroups = useMemo(() => {
    const map = new Map<string, typeof filteredLoras>();
    for (const lora of filteredLoras) {
      const key = lora.baseModel?.trim() || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lora);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLoras]);

  const selectedCharacters = useMemo(
    () => characterLoras.filter((l) => selectedIds.has(l.id)),
    [characterLoras, selectedIds]
  );

  // ── Selection helpers ─────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedIds(new Set(filteredLoras.map((l) => l.id)));
  const selectNone = () => setSelectedIds(new Set());

  // ── Run / cancel ──────────────────────────────────────────────────────────

  const runYearbook = async () => {
    if (selectedCharacters.length === 0) return;

    if (!prompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Enter a base prompt before running Yearbook.',
        variant: 'destructive',
      });
      return;
    }

    const settings = form.getValues();
    if (!settings.modelId) {
      toast({
        title: 'No model selected',
        description: 'Select a model in the main generator first, then come back.',
        variant: 'destructive',
      });
      return;
    }

    cancelRef.current = false;
    setIsRunning(true);
    setCurrentIndex(0);

    // Initialise all result slots as pending
    setResults(
      selectedCharacters.map((lora) => ({
        loraId: lora.id,
        loraName: lora.name,
        loraImage: lora.imageUrl,
        triggerWords: lora.activationWords ?? [],
        status: 'pending',
      }))
    );

    let doneCount = 0;

    for (let i = 0; i < selectedCharacters.length; i++) {
      if (cancelRef.current) break;

      const lora = selectedCharacters[i];
      setCurrentIndex(i);

      // Mark as running
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'running', startedAt: Date.now() } : r))
      );

      // Build prompt: base + trigger words
      const triggerWords = lora.activationWords ?? [];
      const fullPrompt = triggerWords.length
        ? `${prompt.trim()}, ${triggerWords.join(', ')}`
        : prompt.trim();

      try {
        const body = {
          modelId: settings.modelId,
          prompt: fullPrompt,
          negativePrompt: settings.negativePrompt ?? '',
          seed: settings.seed ?? -1,
          seedIncrement: settings.seedIncrement ?? 3,
          steps: settings.steps,
          cfgScale: settings.cfgScale,
          width: settings.width,
          height: settings.height,
          scheduler: settings.scheduler,
          clipSkip: settings.clipSkip,
          quantity: 1,
          loras: [{ id: lora.id, strength: 1.0 }],
          aspectRatio: settings.aspectRatio ?? '1:1',
          creativity: settings.creativity ?? 'medium',
        };

        const res = await apiRequest('POST', '/api/generations', body);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Failed to start generation' }));
          throw new Error(err.message || 'Failed to start generation');
        }

        const generation: Generation & { message?: string } = await res.json();

        if (!generation.id) {
          throw new Error(generation.message || 'No generation ID returned');
        }

        // Wait for completion via WebSocket / HTTP polling
        const result = await waitForGeneration(generation.id);

        if (cancelRef.current) break;

        doneCount++;
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: result.error ? 'failed' : 'completed',
                  imageUrl: result.imageUrl,
                  generationId: generation.id,
                  error: result.error,
                }
              : r
          )
        );
      } catch (err: any) {
        if (cancelRef.current) break;
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: 'failed', error: err.message ?? 'Generation failed' }
              : r
          )
        );
      }
    }

    setIsRunning(false);
    setCurrentIndex(-1);

    if (!cancelRef.current) {
      const failed = results.filter((r) => r.status === 'failed').length;
      toast({
        title: '🎓 Yearbook complete!',
        description:
          failed > 0
            ? `${doneCount} generated, ${failed} failed.`
            : `${doneCount} character image${doneCount !== 1 ? 's' : ''} generated.`,
      });
    }
  };

  const cancelRun = () => {
    cancelRef.current = true;
    pendingGenIdRef.current = null;
    resolveGenRef.current = null;
    setIsRunning(false);
    setCurrentIndex(-1);
    toast({ title: 'Yearbook cancelled' });
  };

  // ── Derived counts ────────────────────────────────────────────────────────

  const completedCount = results.filter((r) => r.status === 'completed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const totalResults = results.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30">
            <BookOpen className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Yearbook</h1>
            <p className="text-sm text-slate-400">
              Generate one portrait per character LoRA using a shared base prompt
            </p>
          </div>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          {/* ── LEFT: Character selector ─────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <Card className="bg-dark-card border-dark-border">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <User className="h-4 w-4 text-purple-400" />
                    Character LoRAs
                    {characterLoras.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        {characterLoras.length}
                      </Badge>
                    )}
                  </h2>
                  <span className="text-xs text-slate-400">
                    {selectedIds.size} selected
                  </span>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or trigger word…"
                    className="pl-8 h-8 text-xs bg-dark-bg border-dark-border"
                  />
                </div>

                {/* Select all / none */}
                {filteredLoras.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAll}
                      className="h-7 text-xs text-slate-400 hover:text-white px-2"
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectNone}
                      className="h-7 text-xs text-slate-400 hover:text-white px-2"
                    >
                      Clear
                    </Button>
                  </div>
                )}

                {/* List */}
                {modelsLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5">
                        <Skeleton className="w-9 h-9 rounded shrink-0" />
                        <div className="flex-1 space-y-1">
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-2.5 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredLoras.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    {characterLoras.length === 0
                      ? 'No character LoRAs found. Add some from the Models page.'
                      : 'No matches for your search.'}
                  </div>
                ) : (
                  <ScrollArea className="h-[420px]">
                    <div className="space-y-3 pr-2">
                      {loraGroups.map(([groupLabel, loras]) => (
                        <div key={groupLabel}>
                          {/* Group heading */}
                          <div className="flex items-center gap-2 mb-1 px-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                              {groupLabel}
                            </span>
                            <span className="text-[10px] text-slate-600">
                              ({loras.length})
                            </span>
                          </div>
                          <div className="space-y-1">
                            {loras.map((lora) => {
                              const selected = selectedIds.has(lora.id);
                              return (
                                <button
                                  key={lora.id}
                                  type="button"
                                  onClick={() => toggleSelect(lora.id)}
                                  className={`flex items-center gap-2.5 w-full p-2 rounded-lg border text-left transition-colors ${
                                    selected
                                      ? 'bg-purple-500/10 border-purple-500/40'
                                      : 'bg-dark-bg border-dark-border hover:border-slate-500'
                                  }`}
                                >
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={() => toggleSelect(lora.id)}
                                    className="shrink-0 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  {lora.imageUrl ? (
                                    <img
                                      src={lora.imageUrl}
                                      alt=""
                                      className="w-9 h-9 rounded object-cover shrink-0"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded bg-dark-card shrink-0 flex items-center justify-center">
                                      <User className="h-4 w-4 text-slate-500" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-white truncate" title={lora.name}>
                                      {lora.name}
                                    </p>
                                    {(lora.activationWords ?? []).length > 0 ? (
                                      <p className="text-[10px] text-slate-500 truncate">
                                        {(lora.activationWords ?? []).slice(0, 3).join(', ')}
                                        {(lora.activationWords ?? []).length > 3 && ' …'}
                                      </p>
                                    ) : (
                                      <p className="text-[10px] text-amber-500/70 flex items-center gap-0.5">
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        No trigger words
                                      </p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT: Config + Results ────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Prompt + run controls */}
            <Card className="bg-dark-card border-dark-border">
              <CardContent className="pt-4 pb-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Base Prompt</h2>
                  <button
                    type="button"
                    onClick={() => setPromptExpanded((v) => !v)}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {promptExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the portrait style… Trigger words are added automatically per character."
                  className={`bg-dark-bg border-dark-border text-sm resize-none transition-all ${
                    promptExpanded ? 'h-40' : 'h-20'
                  }`}
                  disabled={isRunning}
                />

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Each character's trigger words are appended automatically before generation, then
                  stripped before the next character runs. Leave them out of the prompt above.
                </p>

                {/* Run / cancel */}
                <div className="flex items-center gap-3">
                  {isRunning ? (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={cancelRun}
                        className="gap-2"
                      >
                        <Square className="h-4 w-4" />
                        Cancel
                      </Button>
                      <span className="text-sm text-slate-400">
                        {currentIndex + 1} / {totalResults} — generating{' '}
                        <span className="text-white font-medium">
                          {results[currentIndex]?.loraName ?? '…'}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        onClick={runYearbook}
                        disabled={selectedIds.size === 0 || modelsLoading}
                        className="gap-2 bg-purple-600 hover:bg-purple-500 text-white"
                      >
                        <Play className="h-4 w-4" />
                        Run Yearbook
                        {selectedIds.size > 0 && (
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {selectedIds.size}
                          </Badge>
                        )}
                      </Button>
                      {selectedIds.size === 0 && (
                        <span className="text-xs text-slate-500">
                          Select at least one character
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Progress summary (shown after at least one result) */}
                {totalResults > 0 && !isRunning && (
                  <div className="flex items-center gap-3 pt-1">
                    {completedCount > 0 && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {completedCount} done
                      </span>
                    )}
                    {failedCount > 0 && (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" />
                        {failedCount} failed
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results grid */}
            {results.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-white mb-3">Results</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {results.map((result, idx) => (
                    <ResultCard key={result.loraId} result={result} index={idx} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {results.length === 0 && !isRunning && (
              <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-dark-border text-slate-600 gap-2">
                <ImageIcon className="h-8 w-8" />
                <p className="text-sm">Select characters and run Yearbook to see results here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Result card ──────────────────────────────────────────────────────────────

const QUEUED_LABEL_AFTER_MS = 2 * 60 * 1000; // show "Queued at CivitAI" after 2 min

function ResultCard({ result, index }: { result: YearbookResult; index: number }) {
  // Flip the label from "Generating…" to "Queued at CivitAI…" once we've been
  // waiting more than 2 minutes (CivitAI's queue can run 15-25 min under load).
  const [isQueued, setIsQueued] = useState(false);
  useEffect(() => {
    if (result.status !== 'running' || !result.startedAt) {
      setIsQueued(false);
      return;
    }
    const elapsed = Date.now() - result.startedAt;
    if (elapsed >= QUEUED_LABEL_AFTER_MS) {
      setIsQueued(true);
      return;
    }
    const timer = setTimeout(() => setIsQueued(true), QUEUED_LABEL_AFTER_MS - elapsed);
    return () => clearTimeout(timer);
  }, [result.status, result.startedAt]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Image area */}
      <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-dark-card border border-dark-border">
        {result.status === 'pending' && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-700">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}

        {result.status === 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-purple-400 bg-dark-bg/80">
            <Loader2 className="h-6 w-6 animate-spin" />
            {isQueued ? (
              <>
                <span className="text-[10px] text-amber-400 font-medium">Queued at CivitAI…</span>
                <span className="text-[9px] text-slate-500 text-center px-2">
                  Queue can take 15–25 min
                </span>
              </>
            ) : (
              <span className="text-[10px] text-slate-400">Generating…</span>
            )}
          </div>
        )}

        {result.status === 'completed' && result.imageUrl && (
          <img
            src={result.imageUrl}
            alt={result.loraName}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {result.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center">
            <XCircle className="h-5 w-5 text-red-400" />
            <p className="text-[10px] text-red-400 leading-tight">{result.error ?? 'Failed'}</p>
          </div>
        )}

        {/* Status badge */}
        {result.status === 'completed' && (
          <div className="absolute top-1.5 right-1.5">
            <CheckCircle className="h-4 w-4 text-emerald-400 drop-shadow" />
          </div>
        )}

        {/* No trigger-word indicator */}
        {result.triggerWords.length === 0 && result.status !== 'failed' && (
          <div className="absolute bottom-1.5 left-1.5">
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-400 bg-dark-bg/80"
            >
              no trigger
            </Badge>
          </div>
        )}

        {/* LoRA preview thumbnail (top-left, only when pending) */}
        {result.status === 'pending' && result.loraImage && (
          <img
            src={result.loraImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-20"
            loading="lazy"
          />
        )}
      </div>

      {/* Name + trigger words */}
      <div className="px-0.5">
        <p className="text-xs font-medium text-white truncate" title={result.loraName}>
          {result.loraName}
        </p>
        {result.triggerWords.length > 0 && (
          <p className="text-[10px] text-slate-500 truncate">
            {result.triggerWords.slice(0, 2).join(', ')}
            {result.triggerWords.length > 2 && ' …'}
          </p>
        )}
      </div>
    </div>
  );
}
