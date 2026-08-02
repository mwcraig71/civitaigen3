import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, X, Heart, Search, SlidersHorizontal, Sparkles, User, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Model } from '@/types';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Maximum number of LoRAs a user can apply at once. Keep in sync with the
// corrupted-data threshold in client/src/hooks/use-generation-settings.ts.
const MAX_LORAS = 10;

interface LoRAConfig {
  id: string;
  strength: number;
}

interface LoRASelectorProps {
  selectedLoras: LoRAConfig[];
  onLorasChange: (loras: LoRAConfig[]) => void;
  onTriggerWordClick?: (word: string) => void;
  /** IDs of LoRAs that belong to the currently selected character */
  characterLoraIds?: string[];
}

export default function LoRASelector({ selectedLoras, onLorasChange, onTriggerWordClick, characterLoraIds = [] }: LoRASelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'favorites' | 'all'>('favorites');
  const [baseModelFilter, setBaseModelFilter] = useState<string>('all');
  const [selectedTriggerWords, setSelectedTriggerWords] = useState<Set<string>>(new Set());
  // Local character-group set — initialised from prop, user can modify it
  const [localCharIds, setLocalCharIds] = useState<Set<string>>(() => new Set(characterLoraIds));

  // Sync when a different character is selected (prop reference changes)
  useEffect(() => {
    setLocalCharIds(new Set(characterLoraIds));
  }, [characterLoraIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveToCharacter = (id: string) => setLocalCharIds(prev => new Set([...prev, id]));
  const removeFromCharacter = (id: string) => setLocalCharIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  const { toast } = useToast();

  const favoriteMutation = useMutation({
    mutationFn: async ({ modelId, favorited }: { modelId: string; favorited: boolean }) => {
      if (favorited) {
        await apiRequest('DELETE', `/api/model-favorites/${modelId}`);
      } else {
        await apiRequest('POST', '/api/model-favorites', { modelId });
      }
    },
    onSuccess: (_data, { favorited }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/model-favorites'] });
      toast({
        title: favorited ? 'Removed from favorites' : 'Added to favorites',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite',
        variant: 'destructive',
      });
    },
  });

  const { data: modelFavorites = [], isLoading: favoritesLoading } = useQuery({
    queryKey: ['/api/model-favorites'],
  });

  const { data: allModels = [], isLoading: modelsLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  const isLoading = favoritesLoading || modelsLoading;

  const loraModels = useMemo(
    () => allModels.filter((model) => model.type?.toLowerCase() === 'lora'),
    [allModels]
  );

  const favoriteModelIds = useMemo(
    () => new Set((modelFavorites as any[]).map((f: any) => f.modelId)),
    [modelFavorites]
  );

  const selectedIds = useMemo(() => new Set(selectedLoras.map((l) => l.id)), [selectedLoras]);

  // Distinct base models present among LoRAs (for the filter dropdown)
  const baseModelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of loraModels) {
      if (m.baseModel) set.add(m.baseModel);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [loraModels]);

  // Search always looks at the active tab's pool; favorites sort first in "All".
  const filteredLoras = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let pool = tab === 'favorites' ? loraModels.filter((m) => favoriteModelIds.has(m.id)) : loraModels;
    if (baseModelFilter !== 'all') {
      pool = pool.filter((m) => m.baseModel === baseModelFilter);
    }
    const matches = q === ''
      ? pool
      : pool.filter(
          (lora) =>
            lora.name.toLowerCase().includes(q) ||
            (lora.civitaiId && lora.civitaiId.toLowerCase().includes(q)) ||
            (lora.activationWords &&
              lora.activationWords.some((word: string) => word.toLowerCase().includes(q)))
        );
    return [...matches].sort((a, b) => {
      const favDiff = Number(favoriteModelIds.has(b.id)) - Number(favoriteModelIds.has(a.id));
      if (favDiff !== 0) return favDiff;
      return a.name.localeCompare(b.name);
    });
  }, [loraModels, favoriteModelIds, searchTerm, tab, baseModelFilter]);

  const addLoRA = (loraId: string) => {
    if (selectedIds.has(loraId)) return;
    if (selectedLoras.length >= MAX_LORAS) {
      toast({
        title: 'LoRA limit reached',
        description: `You can use up to ${MAX_LORAS} LoRAs at once. Remove one to add another.`,
        variant: 'destructive',
      });
      return;
    }
    onLorasChange([...selectedLoras, { id: loraId, strength: 1.0 }]);
  };

  const removeLoRA = (loraId: string) => {
    onLorasChange(selectedLoras.filter((l) => l.id !== loraId));
  };

  const toggleLoRA = (loraId: string) => {
    selectedIds.has(loraId) ? removeLoRA(loraId) : addLoRA(loraId);
  };

  const updateLoRAStrength = (loraId: string, strength: number) => {
    onLorasChange(selectedLoras.map((l) => (l.id === loraId ? { ...l, strength } : l)));
  };

  const getLoRAModel = (loraId: string) => loraModels.find((model) => model.id === loraId);

  const handleTriggerWordClick = (word: string) => {
    const newSelected = new Set(selectedTriggerWords);
    if (newSelected.has(word)) {
      newSelected.delete(word);
    } else {
      newSelected.add(word);
      onTriggerWordClick?.(word);
    }
    setSelectedTriggerWords(newSelected);
  };

  return (
    <Card className="bg-dark-card border-dark-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center">
            <Sparkles className="h-5 w-5 mr-2 text-blue-400" />
            LoRAs
          </span>
          {selectedLoras.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedLoras.length}/{MAX_LORAS} active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active LoRAs — grouped into Character / Style when applicable */}
        {selectedLoras.length > 0 && (() => {
          const charLoras = selectedLoras.filter(l => localCharIds.has(l.id));
          const otherLoras = selectedLoras.filter(l => !localCharIds.has(l.id));
          const showGroups = selectedLoras.length > 0 && (localCharIds.size > 0);

          const renderRow = (lora: LoRAConfig, isChar: boolean) => {
            const model = getLoRAModel(lora.id);
            if (!model) return null;
            const minStrength = Math.min((model.strengthMin ?? -1000) / 100, -10);
            const maxStrength = Math.max((model.strengthMax ?? 1000) / 100, 10);
            const activationWords = model.activationWords || [];

            return (
              <div
                key={lora.id}
                className={`flex items-center gap-2 p-2 bg-dark-bg rounded-lg border ${isChar ? 'border-purple-500/40' : 'border-blue-500/30'}`}
                data-testid={`selected-lora-${lora.id}`}
              >
                {model.imageUrl ? (
                  <img src={model.imageUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" loading="lazy" />
                ) : (
                  <div className="w-9 h-9 rounded bg-dark-card shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={model.name}>{model.name}</p>
                  <p className="text-xs text-slate-400 truncate">{model.baseModel}</p>
                </div>

                {/* Move between groups — only show when groups are active */}
                {showGroups && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => isChar ? removeFromCharacter(lora.id) : moveToCharacter(lora.id)}
                    className={`h-9 w-9 p-0 shrink-0 ${isChar ? 'text-purple-400 hover:text-blue-400 hover:bg-blue-500/10' : 'text-slate-400 hover:text-purple-400 hover:bg-purple-500/10'}`}
                    title={isChar ? 'Move to Style' : 'Move to Character'}
                  >
                    {isChar ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                  </Button>
                )}

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-2.5 font-mono text-xs shrink-0 border-dark-border"
                      data-testid={`slider-lora-strength-${lora.id}`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                      {lora.strength.toFixed(2)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 bg-dark-card border-dark-border" align="end">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Strength</Label>
                        <span className="text-xs font-mono text-slate-300 bg-dark-bg px-2 py-0.5 rounded">
                          {lora.strength.toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        value={[lora.strength]}
                        onValueChange={(value) => updateLoRAStrength(lora.id, value[0])}
                        min={minStrength}
                        max={maxStrength}
                        step={0.05}
                      />
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>{minStrength}</span>
                        <button
                          type="button"
                          className="text-blue-400 hover:text-blue-300"
                          onClick={() => updateLoRAStrength(lora.id, 1.0)}
                        >
                          Reset to 1.0
                        </button>
                        <span>{maxStrength}</span>
                      </div>

                      {activationWords.length > 0 && (
                        <div className="pt-2 border-t border-dark-border">
                          <Label className="text-xs mb-2 block">
                            Trigger words <span className="text-slate-500">(tap to add to prompt)</span>
                          </Label>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {activationWords.map((word: string, index: number) => {
                              const isSelected = selectedTriggerWords.has(word);
                              return (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className={`text-xs py-0.5 px-1.5 cursor-pointer transition-colors max-w-full truncate ${
                                    isSelected
                                      ? 'bg-blue-500 border-blue-500 text-white'
                                      : 'bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20'
                                  }`}
                                  onClick={() => handleTriggerWordClick(word)}
                                  title={word}
                                  data-testid={`activation-word-${word}`}
                                >
                                  {word.length > 24 ? word.substring(0, 22) + '…' : word}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLoRA(lora.id)}
                  className="h-9 w-9 p-0 shrink-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  title="Remove"
                  data-testid={`remove-lora-${lora.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          };

          return (
            <div className="space-y-1.5">
              {showGroups && charLoras.length > 0 && (
                <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wide flex items-center gap-1">
                  <User className="h-3 w-3" /> Character
                </p>
              )}
              {charLoras.map(l => renderRow(l, true))}

              {showGroups && otherLoras.length > 0 && (
                <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wide flex items-center gap-1 pt-1">
                  <Sparkles className="h-3 w-3" /> Style
                </p>
              )}
              {(showGroups ? otherLoras : selectedLoras).map(l => renderRow(l, false))}
            </div>
          );
        })()}

        {/* Browse & add */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'favorites' | 'all')}>
              <TabsList className="h-9 bg-dark-bg">
                <TabsTrigger value="favorites" className="text-xs px-3" data-testid="tab-lora-favorites">
                  <Heart className="h-3.5 w-3.5 mr-1.5" />
                  Favorites
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs px-3" data-testid="tab-lora-all">
                  All LoRAs
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={baseModelFilter} onValueChange={setBaseModelFilter}>
              <SelectTrigger
                className="h-9 flex-1 min-w-0 bg-dark-bg border-dark-border text-xs"
                data-testid="select-lora-base-model-filter"
              >
                <SelectValue placeholder="All base models" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All base models</SelectItem>
                {baseModelOptions.map((bm) => (
                  <SelectItem key={bm} value={bm} data-testid={`filter-base-model-${bm}`}>
                    {bm}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <Input
              type="text"
              placeholder={tab === 'favorites' ? 'Search favorites…' : 'Search all LoRAs…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-dark-bg border-dark-border pl-9"
              data-testid="input-lora-search"
            />
          </div>

          {isLoading ? (
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2 p-2">
                  <Skeleton className="w-11 h-11 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredLoras.length === 0 ? (
            <div className="text-center py-6 px-4">
              <p className="text-sm text-slate-400">
                {searchTerm
                  ? `No LoRAs match "${searchTerm}"${tab === 'favorites' ? ' in your favorites' : ''}`
                  : tab === 'favorites'
                    ? 'No favorites yet.'
                    : 'No LoRAs available.'}
              </p>
              {tab === 'favorites' && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="text-blue-400 mt-1"
                  onClick={() => setTab('all')}
                >
                  Browse all LoRAs
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-0.5">
              {filteredLoras.map((lora) => {
                const isSelected = selectedIds.has(lora.id);
                const isFavorite = favoriteModelIds.has(lora.id);

                return (
                  <div
                    key={lora.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleLoRA(lora.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleLoRA(lora.id);
                      }
                    }}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors w-full text-left ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500/40'
                        : 'bg-dark-bg border-dark-border hover:border-slate-500'
                    }`}
                    data-testid={`lora-option-${lora.id}`}
                  >
                    {lora.imageUrl ? (
                      <img
                        src={lora.imageUrl}
                        alt=""
                        className="w-11 h-11 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded bg-dark-card shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug line-clamp-2" title={lora.name}>
                        {lora.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{lora.baseModel}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        favoriteMutation.mutate({ modelId: lora.id, favorited: isFavorite });
                      }}
                      disabled={favoriteMutation.isPending}
                      className={`h-9 w-9 p-0 shrink-0 ${
                        isFavorite
                          ? 'text-pink-400 hover:text-pink-300 hover:bg-pink-500/10'
                          : 'text-slate-500 hover:text-pink-400 hover:bg-pink-500/10'
                      }`}
                      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      data-testid={`${isFavorite ? 'unfavorite' : 'favorite'}-lora-${lora.id}`}
                    >
                      <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                    </Button>
                    <div
                      className={`flex items-center justify-center h-9 w-9 rounded-md shrink-0 ${
                        isSelected ? 'bg-blue-500 text-white' : 'bg-dark-card text-slate-400'
                      }`}
                      data-testid={`${isSelected ? 'remove' : 'add'}-lora-${lora.id}`}
                    >
                      {isSelected ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
