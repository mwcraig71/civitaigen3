import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Search, Star, Download, Heart, ExternalLink, Filter, RefreshCw, Plus, ChevronDown } from 'lucide-react';
import Header from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Model } from '@/types';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type ModelLike = {
  id: string;
  userId: string;
  modelId: string;
  createdAt: Date;
};

const PAGE_SIZE = 60;

export default function Models() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'favorites' | string>('all');
  const [modelIdInput, setModelIdInput] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: models = [], isLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
    // Bypass the browser HTTP cache so a freshly-downloaded model appears
    // immediately without waiting for the 12-hour max-age to expire.
    queryFn: async () => {
      const res = await fetch('/api/models', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  // Debounce the search input so we don't refilter hundreds of cards on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset pagination whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, filterType]);

  const { data: modelFavorites = [], isLoading: isLoadingFavorites } = useQuery<ModelLike[]>({
    queryKey: ['/api/model-favorites'],
  });

  const addModelFavoriteMutation = useMutation({
    mutationFn: async (modelId: string) => {
      console.log('Adding model favorite:', modelId);
      const response = await apiRequest('POST', '/api/model-favorites', { modelId });
      const result = await response.json();
      console.log('Model favorite added successfully:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('Mutation success:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/model-favorites'] });
      toast({
        title: "Model favorited",
        description: "Model has been added to your favorites",
      });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      toast({
        title: "Error",
        description: "Failed to favorite model. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeModelFavoriteMutation = useMutation({
    mutationFn: async (modelId: string) => {
      console.log('Removing model favorite:', modelId);
      const response = await apiRequest('DELETE', `/api/model-favorites/${modelId}`);
      const result = await response.json();
      console.log('Model favorite removed successfully:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('Remove mutation success:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/model-favorites'] });
      toast({
        title: "Model unfavorited",
        description: "Model has been removed from your favorites",
      });
    },
    onError: (error) => {
      console.error('Remove mutation error:', error);
      toast({
        title: "Error",
        description: "Failed to unfavorite model. Please try again.",
        variant: "destructive",
      });
    },
  });

  const refreshModelsMutation = useMutation({
    mutationFn: async () => {
      console.log('Refreshing models from CivitAI...');
      const response = await apiRequest('POST', '/api/models/refresh');
      const result = await response.json();
      console.log('Models refreshed successfully:', result);
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      toast({
        title: "Models Updated",
        description: `Added ${data.addedCount} new models, skipped ${data.skippedCount} existing ones. Total: ${data.totalModels} models available.`,
      });
    },
    onError: (error) => {
      console.error('Refresh models error:', error);
      toast({
        title: "Error",
        description: "Failed to download new models. Please try again.",
        variant: "destructive",
      });
    },
  });

  const downloadSpecificModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiRequest('POST', `/api/models/download/${modelId}`);
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      // Immediately insert the new model into the local cache so it's
      // searchable right away, without waiting for the server round-trip.
      if (data.model) {
        queryClient.setQueryData(['/api/models'], (old: Model[] | undefined) => {
          if (!old) return [data.model];
          if (old.some((m: Model) => m.id === data.model.id)) return old;
          return [...old, data.model];
        });
      }
      // Still invalidate so the full list reconciles in the background.
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      queryClient.invalidateQueries({ queryKey: ['/api/model-favorites'] });
      
      const isLora = data.autoFavorited;
      toast({
        title: "Model Downloaded",
        description: isLora 
          ? `Successfully downloaded: ${data.model.name} (automatically added to your LoRA favorites)`
          : `Successfully downloaded: ${data.model.name}`,
      });
      setModelIdInput(''); // Clear input on success
    },
    onError: (error: any) => {
      let errorMessage = "Failed to download model. Please try again.";
      if (error.message?.includes('409')) {
        errorMessage = "This model already exists in your collection.";
      } else if (error.message?.includes('404')) {
        errorMessage = "Model not found on CivitAI. Please check the model ID.";
      } else if (error.message?.includes('400')) {
        errorMessage = "Invalid model ID. Please provide a numeric CivitAI model ID.";
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleAddToDropdown = (model: Model) => {
    // Check if already favorited
    if (!isModelFavorited(model.id)) {
      addModelFavoriteMutation.mutate(model.id, {
        onSuccess: () => {
          toast({
            title: "Added to Dropdown",
            description: `${model.name} has been added to your model dropdown list.`,
          });
        }
      });
    } else {
      toast({
        title: "Already Added",
        description: `${model.name} is already in your dropdown list.`,
      });
    }
  };

  const handleViewOnCivitAI = (civitaiId: string | null | undefined) => {
    if (civitaiId) {
      window.open(`https://civitai.com/models/${civitaiId}`, '_blank');
    }
  };

  const favoriteModelIds = useMemo(
    () => new Set(modelFavorites.map(f => f.modelId)),
    [modelFavorites]
  );

  const isModelFavorited = (modelId: string) => favoriteModelIds.has(modelId);

  const toggleModelFavorite = (modelId: string, isFavorited: boolean) => {
    if (isFavorited) {
      removeModelFavoriteMutation.mutate(modelId);
    } else {
      addModelFavoriteMutation.mutate(modelId);
    }
  };

  // Memoize derived dropdown lists so they don't recompute on every keystroke
  const modelTypes = useMemo(
    () => Array.from(new Set(models.map(m => m.type))).sort(),
    [models]
  );
  const filteredModels = useMemo(() => {
    const search = debouncedSearch;
    return models.filter(model => {
      const matchesSearch = !search
        || model.name.toLowerCase().includes(search)
        || model.description?.toLowerCase().includes(search)
        || model.civitaiId?.toLowerCase().includes(search);

      let matchesTypeFilter = true;
      if (filterType === 'favorites') {
        matchesTypeFilter = favoriteModelIds.has(model.id);
      } else if (filterType !== 'all') {
        matchesTypeFilter = model.type === filterType;
      }

      return matchesSearch && matchesTypeFilter;
    });
  }, [models, debouncedSearch, filterType, favoriteModelIds]);

  // Only render up to visibleCount cards at once. "Load more" reveals the next page.
  const visibleModels = useMemo(
    () => filteredModels.slice(0, visibleCount),
    [filteredModels, visibleCount]
  );

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      <Header />
      
      {/* Page Header - Below Main Navigation */}
      <div className="border-b border-dark-border bg-dark-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-4">
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div className="flex flex-col space-y-3 md:flex-row md:items-center md:space-y-0 md:space-x-4">
              <Link href="/generate">
                <Button variant="ghost" size="sm" className="min-h-[50px] w-full md:w-auto md:min-h-auto px-6 py-3 md:px-2 md:py-2 text-left justify-start" data-testid="button-back-home">
                  <ArrowLeft className="h-6 w-6 md:h-4 md:w-4 mr-3 md:mr-2" />
                  <span className="text-lg md:text-sm font-medium">Back to Generator</span>
                </Button>
              </Link>
              <h1 className="text-2xl md:text-2xl font-bold text-center md:text-left">Browse Models</h1>
            </div>
            
            <div className="flex flex-col space-y-3 md:flex-row md:items-center md:space-y-0 md:space-x-4">
              {/* More Models Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="bg-dark-bg border-dark-border text-white hover:bg-dark-card min-h-[50px] w-full md:w-auto md:min-h-auto px-6 py-3 md:px-4 md:py-2 text-lg md:text-sm"
                    data-testid="button-more-models"
                  >
                    <Download className="h-6 w-6 md:h-4 md:w-4 mr-3 md:mr-2" />
                    More Models
                    <ChevronDown className="h-6 w-6 md:h-4 md:w-4 ml-3 md:ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-dark-card border-dark-border text-white min-w-[300px]">
                  <DropdownMenuItem
                    onClick={() => refreshModelsMutation.mutate()}
                    disabled={refreshModelsMutation.isPending}
                    className="hover:bg-dark-bg cursor-pointer p-4"
                    data-testid="menu-item-download-batch"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshModelsMutation.isPending ? 'animate-spin' : ''}`} />
                    <div>
                      <div className="font-medium">
                        {refreshModelsMutation.isPending ? 'Downloading...' : 'Download More Models'}
                      </div>
                      <div className="text-xs text-slate-400">
                        Fetch newest, trending, and popular models from CivitAI
                      </div>
                    </div>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator className="bg-dark-border" />
                  
                  <div className="p-4">
                    <div className="text-sm font-medium mb-2">Download Specific Model</div>
                    <div className="text-xs text-slate-400 mb-3">
                      Enter a CivitAI model ID to download that specific model
                    </div>
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Enter CivitAI model ID..."
                        value={modelIdInput}
                        onChange={(e) => setModelIdInput(e.target.value)}
                        className="flex-1 bg-dark-bg border-dark-border text-white"
                        data-testid="input-model-id"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && modelIdInput.trim()) {
                            downloadSpecificModelMutation.mutate(modelIdInput.trim());
                          }
                        }}
                      />
                      <Button
                        onClick={() => modelIdInput.trim() && downloadSpecificModelMutation.mutate(modelIdInput.trim())}
                        disabled={downloadSpecificModelMutation.isPending || !modelIdInput.trim()}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                        data-testid="button-download-specific-model"
                      >
                        <Plus className={`h-4 w-4 ${downloadSpecificModelMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full md:w-44 bg-dark-bg border-dark-border text-white min-h-[50px] md:min-h-auto px-6 py-3 md:px-3 md:py-2 text-lg md:text-sm" data-testid="select-filter-models">
                  <Filter className="h-6 w-6 md:h-4 md:w-4 mr-3 md:mr-2" />
                  <SelectValue placeholder="Filter models" />
                </SelectTrigger>
                <SelectContent className="bg-dark-card border-dark-border">
                  <SelectItem value="all" className="text-white hover:bg-dark-bg">All Models</SelectItem>
                  <SelectItem value="favorites" className="text-white hover:bg-dark-bg">My Favorites</SelectItem>
                  {modelTypes.map(type => (
                    <SelectItem key={type} value={type} className="text-white hover:bg-dark-bg capitalize">
                      {type === 'lora' ? 'LoRA' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative w-full md:w-80">
                <Search className="h-6 w-6 md:h-4 md:w-4 absolute left-6 md:left-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                <Input
                  type="text"
                  placeholder="Search by name, description, or CivitAI ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  className="pl-16 md:pl-9 pr-6 md:pr-3 w-full bg-dark-bg border-dark-border text-white min-h-[50px] md:min-h-auto py-3 md:py-2 text-lg md:text-sm relative z-0"
                  data-testid="input-search-models"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-slate-400">Loading models...</div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-slate-400">
                Showing {filteredModels.length} of {models.length} models
                {searchTerm && ` • searching "${searchTerm}"`}
                {filterType === 'favorites' && ` • ${modelFavorites.length} favorited`}
                {filterType !== 'all' && filterType !== 'favorites' && ` • ${filterType}`}
              </p>
              {isLoadingFavorites && (
                <div className="text-slate-400 text-sm">Loading favorites...</div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {visibleModels.map((model) => (
                <Card key={model.id} className="bg-dark-card border-dark-border hover:border-slate-600 transition-colors" data-testid={`card-model-${model.id}`}>
                  <CardContent className="p-4">
                    {/* Model Image */}
                    <div 
                      className="relative aspect-square mb-4 rounded-lg overflow-hidden bg-dark-bg cursor-pointer transition-transform hover:scale-[1.02]"
                      onClick={() => handleViewOnCivitAI(model.civitaiId)}
                      data-testid={`img-container-model-${model.id}`}
                    >
                      {model.imageUrl ? (
                        <img
                          src={model.imageUrl}
                          alt={model.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                          data-testid={`img-model-${model.id}`}
                          onError={(e) => {
                            // Fallback to placeholder if image fails to load
                            e.currentTarget.style.display = 'none';
                            (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-full h-full flex items-center justify-center text-slate-400 ${model.imageUrl ? 'hidden' : 'flex'}`}
                        style={{ display: model.imageUrl ? 'none' : 'flex' }}
                      >
                        <div className="text-center">
                          <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mx-auto mb-2">
                            {model.type === 'lora' ? '🎨' : model.type === 'checkpoint' ? '📦' : '🔧'}
                          </div>
                          <p className="text-xs">{model.type.toUpperCase()}</p>
                        </div>
                      </div>
                      {/* Visual indicator that image is clickable */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
                        <div className="bg-black bg-opacity-50 rounded-full p-2">
                          <ExternalLink className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    </div>
                    
                    {/* Model Info */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 
                          className="font-semibold text-white truncate cursor-pointer hover:text-blue-400 transition-colors flex items-center" 
                          onClick={() => handleViewOnCivitAI(model.civitaiId)}
                          data-testid={`text-model-name-${model.id}`}
                        >
                          {model.name}
                          {model.civitaiId && <ExternalLink className="h-3 w-3 ml-1 flex-shrink-0" />}
                        </h3>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleModelFavorite(model.id, isModelFavorited(model.id))}
                          className={`p-1 h-8 w-8 hover:bg-dark-bg ${isModelFavorited(model.id) ? 'text-red-500 hover:text-red-400' : 'text-slate-400 hover:text-red-400'}`}
                          data-testid={`button-favorite-model-${model.id}`}
                          disabled={addModelFavoriteMutation.isPending || removeModelFavoriteMutation.isPending}
                        >
                          <Heart 
                            className={`h-4 w-4 ${isModelFavorited(model.id) ? 'fill-current' : ''}`} 
                          />
                        </Button>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="text-xs">
                          {model.type}
                        </Badge>
                        {model.baseModel && (
                          <Badge variant="outline" className="text-xs">
                            {model.baseModel}
                          </Badge>
                        )}
                      </div>
                      
                      {model.description && (
                        <p className="text-slate-400 text-sm line-clamp-2">
                          {model.description.replace(/<[^>]*>/g, '').slice(0, 100)}...
                        </p>
                      )}
                      
                      {/* Stats */}
                      <div className="flex items-center justify-between text-sm text-slate-400">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-1">
                            <Star className="h-3 w-3" />
                            <span>Popular</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Use Model Button */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mt-3 border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white"
                        onClick={() => handleAddToDropdown(model)}
                        data-testid={`button-use-model-${model.id}`}
                      >
                        Add to Drop Down List
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {filteredModels.length > visibleModels.length && (
              <div className="text-center py-8">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="bg-dark-card border-dark-border text-white hover:bg-dark-bg"
                  data-testid="button-load-more-models"
                >
                  Load more ({filteredModels.length - visibleModels.length} remaining)
                </Button>
              </div>
            )}

            {filteredModels.length === 0 && searchTerm && (
              <div className="text-center py-12">
                <p className="text-slate-400">No models found matching "{searchTerm}"</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}