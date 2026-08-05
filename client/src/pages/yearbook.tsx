import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '@/components/header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Layers,
  Save,
  FolderOpen,
  UserPlus,
  Trash2,
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

interface SavedRun {
  id: string;          // unique — used as React key and for deletion
  name: string;
  prompt: string;
  results: YearbookResult[];
  savedAt: number;
}

// Extra LoRA applied to every generation (non-character)
interface ExtraLora {
  id: string;
  strength: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PROMPT =
  'masterpiece, best quality, 1girl, portrait, beautiful detailed eyes, long flowing hair, soft lighting, highly detailed';

// ── Component ────────────────────────────────────────────────────────────────

export default function Yearbook() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Non-character LoRAs (style, artist, effect, etc.)
  const nonCharacterLoras = useMemo(
    () =>
      allModels
        .filter((m) => m.type?.toLowerCase() === 'lora' && !isCharacterLora(m))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allModels]
  );

  // Favorites — same source as the main LoRA selector
  const { data: modelFavorites = [] } = useQuery<{ modelId: string }[]>({
    queryKey: ['/api/model-favorites'],
  });
  const favoriteIds = useMemo(
    () => new Set(modelFavorites.map((f) => f.modelId)),
    [modelFavorites]
  );

  // Active checkpoint's baseModel — used to filter compatible extra LoRAs
  const activeModelId = form.watch('modelId');
  const activeBaseModel = useMemo(() => {
    if (!activeModelId) return null;
    return allModels.find((m) => m.id === activeModelId)?.baseModel ?? null;
  }, [activeModelId, allModels]);

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

  // Generation settings panel (steps, CFG, negative prompt, etc.)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  // Yearbook-specific seed — independent of the main panel.
  // Default -1 = random each run, which ensures fresh results even when
  // the main panel has a fixed seed locked in.
  const [yearbookSeed, setYearbookSeed] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('yearbook_seed') ?? '-1', 10) || -1; }
    catch { return -1; }
  });
  useEffect(() => {
    try { localStorage.setItem('yearbook_seed', String(yearbookSeed)); } catch { /* ignore */ }
  }, [yearbookSeed]);

  // Extra LoRAs applied to every generation — id → strength
  const [extraLoras, setExtraLoras] = useState<Map<string, number>>(new Map());
  const [extraSearch, setExtraSearch] = useState('');
  const [extraPanelOpen, setExtraPanelOpen] = useState(false);
  const [extraTab, setExtraTab] = useState<'favorites' | 'all'>('favorites');

  const toggleExtraLora = (id: string) => {
    setExtraLoras((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 0.8);
      return next;
    });
  };
  const setExtraStrength = (id: string, strength: number) => {
    setExtraLoras((prev) => {
      const next = new Map(prev);
      next.set(id, strength);
      return next;
    });
  };

  const filteredExtraLoras = useMemo(() => {
    // 1. Start with the full non-character pool
    let pool = nonCharacterLoras;

    // 2. Filter to the active checkpoint's baseModel so only compatible LoRAs show
    if (activeBaseModel) {
      pool = pool.filter((l) => !l.baseModel || l.baseModel === activeBaseModel);
    }

    // 3. Favorites tab shows only favourited LoRAs; "All" shows everything
    if (extraTab === 'favorites') {
      pool = pool.filter((l) => favoriteIds.has(l.id));
    }

    // 4. Search filter
    const q = extraSearch.trim().toLowerCase();
    if (q) {
      pool = pool.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.activationWords ?? []).some((w) => w.toLowerCase().includes(q))
      );
    }

    return pool;
  }, [nonCharacterLoras, activeBaseModel, extraTab, favoriteIds, extraSearch]);

  const extraLorasForGen: ExtraLora[] = useMemo(
    () => Array.from(extraLoras.entries()).map(([id, strength]) => ({ id, strength })),
    [extraLoras]
  );

  // ── Saved runs ────────────────────────────────────────────────────────────

  const [savedRuns, setSavedRuns] = useState<SavedRun[]>(() => {
    try { return JSON.parse(localStorage.getItem('yearbook_saved_runs') || '[]'); }
    catch { return []; }
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveRunName, setSaveRunName] = useState('');
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [isSavingRun, setIsSavingRun] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('yearbook_saved_runs', JSON.stringify(savedRuns)); }
    catch { /* ignore */ }
  }, [savedRuns]);

  const saveCurrentRun = () => {
    const name = saveRunName.trim() || `Run ${new Date().toLocaleDateString()}`;
    const run: SavedRun = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      prompt,
      results,
      savedAt: Date.now(),
    };
    setSavedRuns((prev) => [run, ...prev]);
    setShowSaveDialog(false);
    setSaveRunName('');
    toast({ title: `✓ Saved "${name}"` });
  };

  const loadRun = (run: SavedRun) => {
    setResults(run.results);
    setPrompt(run.prompt);
    setShowSavedPanel(false);
    toast({ title: `Loaded "${run.name}"` });
  };

  const deleteRun = (id: string) => {
    setSavedRuns((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Save as Character ─────────────────────────────────────────────────────

  const [saveAsTarget, setSaveAsTarget] = useState<YearbookResult | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [isSavingChar, setIsSavingChar] = useState(false);

  // Persist prompt whenever it changes
  useEffect(() => {
    try { localStorage.setItem('yearbook_prompt', prompt); } catch { /* ignore */ }
  }, [prompt]);

  // ── Batch run state ───────────────────────────────────────────────────────

  const [isRunning, setIsRunning] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0); // POSTs completed
  const [results, setResults] = useState<YearbookResult[]>(() => {
    try {
      const saved = localStorage.getItem('yearbook_results');
      if (!saved) return [];
      const parsed: YearbookResult[] = JSON.parse(saved);
      // Any card that was mid-run when the page reloaded is marked as failed
      return parsed.map((r) =>
        r.status === 'running' || r.status === 'pending'
          ? { ...r, status: 'failed', error: 'Interrupted — page was reloaded' }
          : r
      );
    } catch {
      return [];
    }
  });
  const cancelRef = useRef(false);

  // On mount: recover any cards that were interrupted mid-run (page reload).
  // If a card has a generationId stored, check the API — if it already completed
  // on the server, restore it as completed rather than leaving it as failed.
  useEffect(() => {
    const toCheck = results.filter(
      (r) => r.status === 'failed' && r.error === 'Interrupted — page was reloaded' && r.generationId
    );
    if (!toCheck.length) return;
    toCheck.forEach(async (r) => {
      try {
        const res = await fetch(`/api/generations/${r.generationId}`);
        if (!res.ok) return;
        const gen: Generation & { message?: string } = await res.json();
        if (gen.status === 'completed' && gen.imageUrl) {
          setResults((prev) =>
            prev.map((card) =>
              card.generationId === r.generationId
                ? { ...card, status: 'completed', imageUrl: gen.imageUrl, error: undefined }
                : card
            )
          );
        }
      } catch { /* ignore — card stays failed */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // Persist results whenever they change (skip during active run — flushed on completion)
  const isRunningRef = useRef(false);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => {
    if (isRunningRef.current) return;
    try { localStorage.setItem('yearbook_results', JSON.stringify(results)); } catch { /* ignore */ }
  }, [results]);

  // Map of generationId → resolver for concurrent in-flight generations
  type GenResolver = (r: { imageUrl?: string; error?: string }) => void;
  const pendingGensRef = useRef<Map<string, GenResolver>>(new Map());

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const { messageQueue, setMessageQueue } = useWebSocket((user as any)?.id || '');

  useEffect(() => {
    if (!messageQueue.length) return;

    const toProcess = [...messageQueue];
    setMessageQueue([]);

    for (const msg of toProcess) {
      // Find a pending generation matching any ID field on the message
      const matchId = ([msg.generationId, msg.batchId, msg.imageId] as (string | undefined)[]).find(
        (id): id is string => !!id && pendingGensRef.current.has(id)
      );
      if (!matchId) continue;

      const resolve = pendingGensRef.current.get(matchId);
      if (!resolve) continue;

      if (msg.type === 'generation_image_ready' && msg.imageUrl) {
        pendingGensRef.current.delete(matchId);
        resolve({ imageUrl: msg.imageUrl });
      } else if (msg.type === 'error') {
        pendingGensRef.current.delete(matchId);
        resolve({ error: (msg as any).error || msg.message || 'Generation failed' });
      }
    }
  }, [messageQueue, setMessageQueue]);

  // ── Generation waiter ─────────────────────────────────────────────────────

  const waitForGeneration = useCallback(
    (generationId: string): Promise<{ imageUrl?: string; error?: string }> => {
      return new Promise((resolve) => {
        let settled = false;
        let pollInterval: ReturnType<typeof setInterval>;
        let timeout: ReturnType<typeof setTimeout>;

        const settle = (r: { imageUrl?: string; error?: string }) => {
          if (settled) return;
          settled = true;
          clearInterval(pollInterval);
          clearTimeout(timeout);
          pendingGensRef.current.delete(generationId);
          resolve(r);
        };

        pendingGensRef.current.set(generationId, settle);

        // Poll immediately in case the result arrived during phase 1 (before
        // this watcher was registered) and the WebSocket message was dropped.
        const pollOnce = async () => {
          if (!pendingGensRef.current.has(generationId)) return;
          try {
            const res = await fetch(`/api/generations/${generationId}`);
            if (!res.ok) return;
            const gen: Generation & { message?: string } = await res.json();
            if (gen.status === 'completed' && gen.imageUrl) settle({ imageUrl: gen.imageUrl });
            else if (gen.status === 'failed') settle({ error: 'Generation failed' });
          } catch { /* ignore */ }
        };
        pollOnce();

        // HTTP polling fallback — fires every 6 s thereafter
        pollInterval = setInterval(async () => {
          if (!pendingGensRef.current.has(generationId)) {
            clearInterval(pollInterval);
            return;
          }
          try {
            const res = await fetch(`/api/generations/${generationId}`);
            if (!res.ok) return;
            const gen: Generation & { message?: string } = await res.json();
            if (gen.status === 'completed' && gen.imageUrl) {
              settle({ imageUrl: gen.imageUrl });
            } else if (gen.status === 'failed') {
              settle({ error: 'Generation failed' });
            }
          } catch {
            // polling failed — keep trying
          }
        }, 6000);

        // 35-minute hard timeout — matches the server's hard cap
        timeout = setTimeout(() => {
          settle({ error: 'Generation timed out — CivitAI queue may be busy. Check your gallery for the result.' });
        }, 35 * 60 * 1000);
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
    setSubmittedCount(0);

    const chars = selectedCharacters;

    // Initialise all result slots as pending
    setResults(
      chars.map((lora) => ({
        loraId: lora.id,
        loraName: lora.name,
        loraImage: lora.imageUrl,
        triggerWords: lora.activationWords ?? [],
        status: 'pending' as ResultStatus,
      }))
    );

    // ── Phase 1: submit ALL characters concurrently ───────────────────────
    // One promise per character; all POSTs fire at the same time.
    // Each promise never rejects — errors are returned as { index, error }.
    // Cards flip to "running" as each POST resolves.

    type SubmitOutcome =
      | { index: number; generationId: string }
      | { index: number; error: string };

    const submitOutcomes = await Promise.allSettled(
      chars.map(async (lora, i): Promise<SubmitOutcome> => {
        try {
          if (cancelRef.current) return { index: i, error: 'Cancelled' };

          const triggerWords = lora.activationWords ?? [];
          const fullPrompt = triggerWords.length
            ? `${prompt.trim()}, ${triggerWords.join(', ')}`
            : prompt.trim();

          const body = {
            modelId: settings.modelId,
            prompt: fullPrompt,
            negativePrompt: settings.negativePrompt ?? '',
            seed: yearbookSeed,
            seedIncrement: settings.seedIncrement ?? 3,
            steps: settings.steps,
            cfgScale: settings.cfgScale,
            width: settings.width,
            height: settings.height,
            scheduler: settings.scheduler,
            clipSkip: settings.clipSkip,
            quantity: 1,
            loras: [{ id: lora.id, strength: 1.0 }, ...extraLorasForGen],
            aspectRatio: settings.aspectRatio ?? '1:1',
            creativity: settings.creativity ?? 'medium',
          };

          const res = await apiRequest('POST', '/api/generations', body);
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to start generation' }));
            return { index: i, error: err.message || 'Failed to start generation' };
          }
          const generation: Generation & { message?: string } = await res.json();
          if (!generation.id) return { index: i, error: generation.message || 'No generation ID returned' };

          // Flip card to running and store the generationId so page-reload
          // recovery can check the API for this card even before it completes.
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: 'running', startedAt: Date.now(), generationId: generation.id } : r
            )
          );
          setSubmittedCount((c) => c + 1);
          return { index: i, generationId: generation.id };
        } catch (err: any) {
          return { index: i, error: err.message ?? 'Failed to submit' };
        }
      })
    );

    // Apply submission failures and collect successful IDs
    type Submitted = { index: number; generationId: string };
    const submitted: Submitted[] = [];

    for (const outcome of submitOutcomes) {
      // Promises never reject (errors are returned), but allSettled handles both
      const val = outcome.status === 'fulfilled' ? outcome.value : { index: -1, error: 'Unknown error' };
      if ('generationId' in val) {
        submitted.push(val as Submitted);
      } else {
        const { index, error } = val as { index: number; error: string };
        if (index >= 0) {
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === index ? { ...r, status: 'failed', error } : r
            )
          );
        }
      }
    }

    // Any slot still in "pending" was never submitted (e.g. cancel fired before
    // its promise started). Mark them as cancelled now.
    setResults((prev) =>
      prev.map((r) =>
        r.status === 'pending' ? { ...r, status: 'failed', error: 'Cancelled' } : r
      )
    );

    // ── Phase 2: collect image results concurrently ───────────────────────
    // All in-flight generations are watched in parallel.
    // Cards update individually as each image arrives.

    await Promise.all(
      submitted.map(async ({ index, generationId }) => {
        if (cancelRef.current) {
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === index && r.status === 'running'
                ? { ...r, status: 'failed', error: 'Cancelled' }
                : r
            )
          );
          return;
        }

        const result = await waitForGeneration(generationId);

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === index
              ? {
                  ...r,
                  status: result.error ? 'failed' : 'completed',
                  imageUrl: result.imageUrl,
                  generationId,
                  error: result.error,
                }
              : r
          )
        );
      })
    );

    setIsRunning(false);
    setSubmittedCount(0);

    // Flush final results to localStorage and show toast using the settled state
    setResults((prev) => {
      try { localStorage.setItem('yearbook_results', JSON.stringify(prev)); } catch { /* ignore */ }
      if (!cancelRef.current) {
        const done = prev.filter((r) => r.status === 'completed').length;
        const failed = prev.filter((r) => r.status === 'failed').length;
        toast({
          title: '🎓 Yearbook complete!',
          description:
            failed > 0
              ? `${done} generated, ${failed} failed.`
              : `${done} character image${done !== 1 ? 's' : ''} generated.`,
        });
      }
      return prev;
    });
  };

  const cancelRun = () => {
    cancelRef.current = true;
    for (const [, resolve] of pendingGensRef.current) {
      resolve({ error: 'Cancelled' });
    }
    pendingGensRef.current.clear();
    setIsRunning(false);
    setSubmittedCount(0);
    toast({ title: 'Yearbook cancelled' });
  };

  // ── Save as Character ─────────────────────────────────────────────────────

  const saveAsCharacter = async () => {
    if (!saveAsTarget) return;
    const name = saveAsName.trim();
    if (!name) return;
    const settings = form.getValues();
    const triggerWords = saveAsTarget.triggerWords ?? [];
    const fullPrompt = triggerWords.length
      ? `${prompt.trim()}, ${triggerWords.join(', ')}`
      : prompt.trim();

    const body = {
      name,
      basePrompt: fullPrompt,
      imageUrl: saveAsTarget.imageUrl,
      baseModel: settings.modelId,
      steps: settings.steps,
      cfgScale: settings.cfgScale,
      width: settings.width,
      height: settings.height,
      scheduler: settings.scheduler,
      clipSkip: settings.clipSkip,
      // Character LoRA + any extra LoRAs active during this run
      loras: [
        { id: saveAsTarget.loraId, strength: 1.0 },
        ...extraLorasForGen,
      ],
    };

    setIsSavingChar(true);
    try {
      const res = await apiRequest('POST', '/api/characters', body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to save character' }));
        throw new Error(err.message || 'Failed to save character');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      toast({ title: `✓ Saved "${name}" as a character` });
      setSaveAsTarget(null);
      setSaveAsName('');
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingChar(false);
    }
  };

  // ── Derived counts ────────────────────────────────────────────────────────

  const completedCount = results.filter((r) => r.status === 'completed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const totalResults = results.length;
  const allSubmitted = submittedCount >= totalResults && totalResults > 0;

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

            {/* ── Extra LoRAs ──────────────────────────────────────────────── */}
            <Card className="bg-dark-card border-dark-border">
              <CardContent className="pt-4 pb-4 space-y-3">
                {/* Header — collapse toggle */}
                <button
                  type="button"
                  className="flex items-center justify-between w-full"
                  onClick={() => setExtraPanelOpen((v) => !v)}
                >
                  <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-blue-400" />
                    Extra LoRAs
                    {extraLoras.size > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1 bg-blue-500/20 text-blue-300 border-blue-500/30">
                        {extraLoras.size} active
                      </Badge>
                    )}
                  </h2>
                  {extraPanelOpen ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>

                {!extraPanelOpen && extraLoras.size > 0 && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {Array.from(extraLoras.entries())
                      .map(([id, str]) => {
                        const m = nonCharacterLoras.find((l) => l.id === id);
                        return m ? `${m.name} (${str.toFixed(1)})` : id;
                      })
                      .join(', ')}
                  </p>
                )}

                {extraPanelOpen && (
                  <>
                    {/* Favorites / All tab + model label */}
                    <div className="flex items-center justify-between">
                      <div className="flex rounded-md overflow-hidden border border-dark-border text-xs">
                        <button
                          type="button"
                          onClick={() => setExtraTab('favorites')}
                          className={`px-2.5 py-1 transition-colors ${
                            extraTab === 'favorites'
                              ? 'bg-blue-600 text-white'
                              : 'bg-dark-bg text-slate-400 hover:text-white'
                          }`}
                        >
                          Favorites
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtraTab('all')}
                          className={`px-2.5 py-1 transition-colors ${
                            extraTab === 'all'
                              ? 'bg-blue-600 text-white'
                              : 'bg-dark-bg text-slate-400 hover:text-white'
                          }`}
                        >
                          All
                        </button>
                      </div>
                      {activeBaseModel && (
                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]" title={activeBaseModel}>
                          {activeBaseModel}
                        </span>
                      )}
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <Input
                        value={extraSearch}
                        onChange={(e) => setExtraSearch(e.target.value)}
                        placeholder="Search extra LoRAs…"
                        className="pl-8 h-8 text-xs bg-dark-bg border-dark-border"
                      />
                    </div>

                    {filteredExtraLoras.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        {extraTab === 'favorites'
                          ? <><p>No favorited style LoRAs{activeBaseModel ? ` for ${activeBaseModel}` : ''}.</p><button type="button" onClick={() => setExtraTab('all')} className="mt-1 underline hover:text-slate-300">Show all</button></>
                          : 'No style LoRAs found.'}
                      </div>
                    ) : (
                      <ScrollArea className="h-[220px]">
                        <div className="space-y-1 pr-2">
                          {filteredExtraLoras.map((lora) => {
                            const active = extraLoras.has(lora.id);
                            const strength = extraLoras.get(lora.id) ?? 0.8;
                            return (
                              <div key={lora.id} className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => toggleExtraLora(lora.id)}
                                  className={`flex items-center gap-2.5 w-full p-2 rounded-lg border text-left transition-colors ${
                                    active
                                      ? 'bg-blue-500/10 border-blue-500/40'
                                      : 'bg-dark-bg border-dark-border hover:border-slate-500'
                                  }`}
                                >
                                  <Checkbox
                                    checked={active}
                                    onCheckedChange={() => toggleExtraLora(lora.id)}
                                    className="shrink-0 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  {lora.imageUrl ? (
                                    <img src={lora.imageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" loading="lazy" />
                                  ) : (
                                    <div className="w-8 h-8 rounded bg-dark-bg shrink-0 flex items-center justify-center">
                                      <Layers className="h-3.5 w-3.5 text-slate-500" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-white truncate">{lora.name}</p>
                                    {lora.loraCategory && (
                                      <p className="text-[10px] text-slate-500">{lora.loraCategory}</p>
                                    )}
                                  </div>
                                </button>
                                {active && (
                                  <div className="flex items-center gap-2 px-2 pb-1">
                                    <span className="text-[10px] text-slate-500 w-12 shrink-0">
                                      Strength
                                    </span>
                                    <Slider
                                      min={0}
                                      max={2}
                                      step={0.05}
                                      value={[strength]}
                                      onValueChange={([v]) => setExtraStrength(lora.id, v)}
                                      className="flex-1"
                                    />
                                    <span className="text-[10px] text-slate-300 w-7 text-right">
                                      {strength.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </>
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
                  Each character's trigger words are appended automatically before generation. Leave them out of the prompt above.
                </p>

                {/* Seed */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-400 shrink-0 w-8">Seed</label>
                  <Input
                    type="number"
                    value={yearbookSeed === -1 ? '' : yearbookSeed}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setYearbookSeed(isNaN(v) ? -1 : v);
                    }}
                    placeholder="Random"
                    className="h-7 text-xs bg-dark-bg border-dark-border flex-1"
                    disabled={isRunning}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setYearbookSeed(-1)}
                    disabled={yearbookSeed === -1 || isRunning}
                    className="h-7 px-2 text-xs text-slate-400 hover:text-white shrink-0"
                    title="Use a random seed each run"
                  >
                    🎲 Random
                  </Button>
                </div>

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
                        {!allSubmitted ? (
                          <>Submitting <span className="text-white font-medium">{submittedCount} / {totalResults}</span>…</>
                        ) : (
                          <><span className="text-white font-medium">{completedCount} / {totalResults}</span> complete</>
                        )}
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

            {/* Generation Settings */}
            <Card className="bg-dark-card border-dark-border">
              <CardContent className="pt-4 pb-4 space-y-3">
                <button
                  type="button"
                  className="flex items-center justify-between w-full"
                  onClick={() => setSettingsPanelOpen((v) => !v)}
                >
                  <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="text-slate-400">⚙</span>
                    Generation Settings
                  </h2>
                  <div className="flex items-center gap-2">
                    {!settingsPanelOpen && (
                      <span className="text-[10px] text-slate-500">
                        {form.watch('steps')} steps · CFG {form.watch('cfgScale')} · {form.watch('scheduler')}
                      </span>
                    )}
                    {settingsPanelOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </button>

                {settingsPanelOpen && (
                  <div className="space-y-4 pt-1">
                    {/* Negative Prompt */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Negative Prompt</label>
                      <Textarea
                        value={form.watch('negativePrompt') ?? ''}
                        onChange={(e) => form.setValue('negativePrompt', e.target.value)}
                        placeholder="worst quality, low quality, blurry…"
                        className="h-16 text-xs bg-dark-bg border-dark-border resize-none"
                        disabled={isRunning}
                      />
                    </div>

                    {/* Steps + CFG Scale */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400">Steps</label>
                        <Input
                          type="number"
                          min={1}
                          max={200}
                          value={form.watch('steps') ?? 28}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) form.setValue('steps', Math.min(200, Math.max(1, v)));
                          }}
                          className="h-8 text-xs bg-dark-bg border-dark-border"
                          disabled={isRunning}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400">CFG Scale</label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          step={0.5}
                          value={form.watch('cfgScale') ?? 4.5}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) form.setValue('cfgScale', Math.min(30, Math.max(1, v)));
                          }}
                          className="h-8 text-xs bg-dark-bg border-dark-border"
                          disabled={isRunning}
                        />
                      </div>
                    </div>

                    {/* Scheduler + Clip Skip */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400">Scheduler</label>
                        <Select
                          value={form.watch('scheduler') ?? 'Euler'}
                          onValueChange={(v) => form.setValue('scheduler', v)}
                          disabled={isRunning}
                        >
                          <SelectTrigger className="h-8 text-xs bg-dark-bg border-dark-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Euler">Euler</SelectItem>
                            <SelectItem value="Euler a">Euler a</SelectItem>
                            <SelectItem value="DPM++ 2M">DPM++ 2M</SelectItem>
                            <SelectItem value="DPM++ 2M Karras">DPM++ 2M Karras</SelectItem>
                            <SelectItem value="DPM++ 2M SDE">DPM++ 2M SDE</SelectItem>
                            <SelectItem value="DPM++ 2M SDE Karras">DPM++ 2M SDE Karras</SelectItem>
                            <SelectItem value="DPM++ SDE">DPM++ SDE</SelectItem>
                            <SelectItem value="DPM++ SDE Karras">DPM++ SDE Karras</SelectItem>
                            <SelectItem value="DPM++ 3M SDE">DPM++ 3M SDE</SelectItem>
                            <SelectItem value="DPM2">DPM2</SelectItem>
                            <SelectItem value="DPM2 a">DPM2 a</SelectItem>
                            <SelectItem value="DPM2 Karras">DPM2 Karras</SelectItem>
                            <SelectItem value="LCM">LCM</SelectItem>
                            <SelectItem value="DDIM">DDIM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400">Clip Skip</label>
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          value={form.watch('clipSkip') ?? 2}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) form.setValue('clipSkip', Math.min(12, Math.max(1, v)));
                          }}
                          className="h-8 text-xs bg-dark-bg border-dark-border"
                          disabled={isRunning}
                        />
                      </div>
                    </div>

                    {/* Width × Height */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400">Width</label>
                        <Input
                          type="number"
                          min={64}
                          max={2048}
                          step={64}
                          value={form.watch('width') ?? 832}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) form.setValue('width', v);
                          }}
                          className="h-8 text-xs bg-dark-bg border-dark-border"
                          disabled={isRunning}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400">Height</label>
                        <Input
                          type="number"
                          min={64}
                          max={2048}
                          step={64}
                          value={form.watch('height') ?? 1216}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) form.setValue('height', v);
                          }}
                          className="h-8 text-xs bg-dark-bg border-dark-border"
                          disabled={isRunning}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results grid */}
            {results.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Results</h2>
                  <div className="flex items-center gap-2">
                    {/* Save current run */}
                    {!isRunning && completedCount > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSaveDialog(true)}
                        className="h-7 gap-1.5 text-xs border-dark-border text-slate-400 hover:text-white"
                      >
                        <Save className="h-3 w-3" />
                        Save run
                      </Button>
                    )}
                    {/* Saved runs */}
                    {savedRuns.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSavedPanel((v) => !v)}
                        className="h-7 gap-1.5 text-xs border-dark-border text-slate-400 hover:text-white"
                      >
                        <FolderOpen className="h-3 w-3" />
                        Saved ({savedRuns.length})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Saved runs dropdown */}
                {showSavedPanel && savedRuns.length > 0 && (
                  <div className="mb-4 rounded-lg border border-dark-border bg-dark-card divide-y divide-dark-border">
                    {savedRuns.map((run) => (
                      <div key={run.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{run.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {new Date(run.savedAt).toLocaleDateString()} · {run.results.filter((r) => r.status === 'completed').length} images
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => loadRun(run)}
                          className="h-6 px-2 text-xs text-slate-400 hover:text-white"
                        >
                          Load
                        </Button>
                        <button
                          type="button"
                          onClick={() => deleteRun(run.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {results.map((result, idx) => (
                    <ResultCard
                      key={result.loraId}
                      result={result}
                      index={idx}
                      onSaveAsCharacter={() => {
                        setSaveAsTarget(result);
                        setSaveAsName(result.loraName);
                      }}
                    />
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

            {/* Saved runs button when no results yet */}
            {results.length === 0 && savedRuns.length > 0 && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSavedPanel((v) => !v)}
                  className="gap-2 text-slate-400 hover:text-white border-dark-border"
                >
                  <FolderOpen className="h-4 w-4" />
                  Load a saved run ({savedRuns.length})
                </Button>
              </div>
            )}

            {showSavedPanel && results.length === 0 && savedRuns.length > 0 && (
              <div className="rounded-lg border border-dark-border bg-dark-card divide-y divide-dark-border">
                {savedRuns.map((run) => (
                  <div key={run.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{run.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(run.savedAt).toLocaleDateString()} · {run.results.filter((r) => r.status === 'completed').length} images
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => loadRun(run)}
                      className="h-6 px-2 text-xs text-slate-400 hover:text-white"
                    >
                      Load
                    </Button>
                    <button
                      type="button"
                      onClick={() => deleteRun(run.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Save run dialog ────────────────────────────────────────────────── */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-dark-card border-dark-border text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this run</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Run name</Label>
              <Input
                value={saveRunName}
                onChange={(e) => setSaveRunName(e.target.value)}
                placeholder={`Run ${new Date().toLocaleDateString()}`}
                className="bg-dark-bg border-dark-border text-white"
                onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentRun(); }}
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500">
              {completedCount} completed image{completedCount !== 1 ? 's' : ''} will be saved. Prompts and settings are not included.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button onClick={saveCurrentRun} className="bg-purple-600 hover:bg-purple-500">
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save as character dialog ────────────────────────────────────────── */}
      <Dialog open={!!saveAsTarget} onOpenChange={(open) => { if (!open) setSaveAsTarget(null); }}>
        <DialogContent className="bg-dark-card border-dark-border text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Character</DialogTitle>
          </DialogHeader>
          {saveAsTarget && (
            <div className="space-y-4 py-2">
              {/* Preview */}
              {saveAsTarget.imageUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={saveAsTarget.imageUrl}
                    alt=""
                    className="w-16 h-20 rounded-lg object-cover border border-dark-border shrink-0"
                  />
                  <div className="text-[11px] text-slate-500 space-y-1">
                    <p><span className="text-slate-400">LoRA:</span> {saveAsTarget.loraName}</p>
                    {saveAsTarget.triggerWords.length > 0 && (
                      <p><span className="text-slate-400">Triggers:</span> {saveAsTarget.triggerWords.join(', ')}</p>
                    )}
                    {extraLoras.size > 0 && (
                      <p><span className="text-slate-400">+{extraLoras.size} extra LoRA{extraLoras.size !== 1 ? 's' : ''}</span></p>
                    )}
                  </div>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">Character name</Label>
                <Input
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="Enter a name…"
                  className="bg-dark-bg border-dark-border text-white"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isSavingChar) saveAsCharacter(); }}
                  autoFocus
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                The character will be created with the base prompt, trigger words, LoRA selection, and model settings from this run. You can edit it from the Characters page.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveAsTarget(null)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              onClick={saveAsCharacter}
              disabled={!saveAsName.trim() || isSavingChar}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {isSavingChar ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-1.5" />
              )}
              {isSavingChar ? 'Saving…' : 'Save Character'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Result card ──────────────────────────────────────────────────────────────

const QUEUED_LABEL_AFTER_MS = 2 * 60 * 1000; // show "Queued at CivitAI" after 2 min

function ResultCard({
  result,
  index,
  onSaveAsCharacter,
}: {
  result: YearbookResult;
  index: number;
  onSaveAsCharacter?: () => void;
}) {
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
      <div className="group relative aspect-[3/4] rounded-lg overflow-hidden bg-dark-card border border-dark-border">
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

        {/* Status badge + save-as-character button */}
        {result.status === 'completed' && (
          <>
            <div className="absolute top-1.5 right-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-400 drop-shadow" />
            </div>
            {onSaveAsCharacter && (
              <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSaveAsCharacter(); }}
                  title="Save as character"
                  className="flex items-center gap-1 bg-dark-bg/90 border border-dark-border rounded px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white hover:border-purple-500/50 transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  Save
                </button>
              </div>
            )}
          </>
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
