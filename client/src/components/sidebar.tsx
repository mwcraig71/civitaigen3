import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Flame, History, Zap, Upload, Heart, Users, Settings, Star, Box, Palette, User, RotateCcw, Coins, Wand2, Film } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Model, Generation, User as UserType } from '@/types';
import type { Favorite } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

export default function Sidebar() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const { data: popularModels = [] } = useQuery<Model[]>({
    queryKey: ['/api/models/popular'],
  });

  const { data: generationsData } = useQuery({
    queryKey: ['/api/generations', { limit: 10, offset: 0 }], // Get first 10 for sidebar
    queryFn: () => fetch('/api/generations?limit=10&offset=0').then(res => res.json()),
  });

  const recentGenerations = Array.isArray(generationsData?.generations) ? generationsData.generations : [];

  const { data: user } = useQuery<UserType>({
    queryKey: ['/api/user'],
  });

  const { data: favorites = [] } = useQuery<Favorite[]>({
    queryKey: ['/api/favorites'],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-500 bg-green-500 bg-opacity-20';
      case 'processing':
        return 'text-yellow-500 bg-yellow-500 bg-opacity-20';
      case 'pending':
        return 'text-yellow-500 bg-yellow-500 bg-opacity-20';
      case 'failed':
        return 'text-red-500 bg-red-500 bg-opacity-20';
      default:
        return 'text-slate-400 bg-slate-400 bg-opacity-20';
    }
  };

  const getModelIcon = (type: string) => {
    switch (type) {
      case 'checkpoint':
        return <Box className="h-4 w-4" />;
      case 'lora':
        return <Palette className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const handleAddToFavorites = async (generationId: string) => {
    try {
      await apiRequest('POST', '/api/favorites', { generationId });
      
      // Invalidate favorites cache to update the UI
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
      
      toast({
        title: "Added to Favorites",
        description: "Image has been added to your favorites.",
      });
    } catch (error) {
      console.error('Error adding to favorites:', error);
      toast({
        title: "Error",
        description: "Failed to add to favorites",
        variant: "destructive",
      });
    }
  };

  const handleRemoveFromFavorites = async (generationId: string) => {
    try {
      await apiRequest('DELETE', `/api/favorites/${generationId}`, {});
      
      // Invalidate favorites cache to update the UI
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
      
      toast({
        title: "Removed from Favorites",
        description: "Image has been removed from your favorites.",
      });
    } catch (error) {
      console.error('Error removing from favorites:', error);
      toast({
        title: "Error",
        description: "Failed to remove from favorites",
        variant: "destructive",
      });
    }
  };

  const handleReuse = (generation: Generation) => {
    // Save all generation data to localStorage with the same keys the generation panel uses
    const generationData = {
      modelId: generation.modelId || '',
      prompt: generation.prompt,
      negativePrompt: generation.negativePrompt || '',
      seed: generation.seed,
      steps: generation.steps,
      cfgScale: generation.cfgScale,
      width: generation.width,
      height: generation.height,
      scheduler: generation.scheduler,
      clipSkip: generation.clipSkip,
      quantity: generation.quantity || 1,
      loras: generation.loras || [],
      characterId: generation.characterId || '',
    };

    // Save to localStorage with the same keys the generation panel expects
    Object.entries(generationData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        localStorage.setItem(`generationPanel_${key}`, JSON.stringify(value));
      }
    });

    // Trigger multiple storage events for better detection
    Object.entries(generationData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        window.dispatchEvent(new StorageEvent('storage', {
          key: `generationPanel_${key}`,
          newValue: JSON.stringify(value),
          oldValue: localStorage.getItem(`generationPanel_${key}`),
          storageArea: localStorage
        }));
      }
    });

    // Trigger a custom event for more reliable detection
    window.dispatchEvent(new CustomEvent('generationDataUpdated', {
      detail: { generationData, source: 'sidebar' }
    }));

    // Navigate to generator (if not already there)
    if (window.location.pathname !== '/generate') {
      navigate('/generate');
    }

    toast({
      title: "Settings Applied",
      description: "All generation settings have been loaded into the generator. Ready to create!",
      duration: 2000, // Auto-dismiss after 2 seconds
    });
  };

  return (
    <div className="space-y-6">
      {/* Popular Models */}
      <Card className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)] hover:border-[hsl(180,100%,50%)]/50 hover:shadow-[0_0_15px_rgba(0,255,255,0.15)] transition-all">
        <CardHeader>
          <CardTitle className="flex items-center text-lg font-[Orbitron,sans-serif] text-[hsl(180,100%,70%)]">
            <Flame className="mr-2 h-5 w-5 text-[hsl(30,100%,55%)]" />
            Popular Models
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {popularModels.length === 0 ? (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-slate-400">Loading models from CivitAI...</p>
              </div>
            ) : (
              popularModels.slice(0, 3).map((model) => (
                <div
                  key={model.id}
                  className="flex items-center space-x-3 p-3 bg-dark-bg rounded-lg hover:bg-opacity-80 transition-colors cursor-pointer"
                  data-testid={`model-card-${model.id}`}
                >
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center overflow-hidden">
                    {model.imageUrl ? (
                      <img
                        src={model.imageUrl}
                        alt={model.name}
                        className="w-full h-full object-cover"
                        style={{
                          touchAction: 'auto'
                        }}
                        onError={(e) => {
                          // Fallback to icon if image fails to load
                          e.currentTarget.style.display = 'none';
                          (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-full h-full flex items-center justify-center ${model.imageUrl ? 'hidden' : 'flex'}`}
                      style={{ display: model.imageUrl ? 'none' : 'flex' }}
                    >
                      {getModelIcon(model.type)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{model.name}</h4>
                    <p className="text-xs text-slate-400">{model.type} • {model.baseModel}</p>
                    <div className="flex items-center space-x-1 mt-1">
                      <Star className="h-3 w-3 text-yellow-400" />
                      <span className="text-xs text-slate-400">
                        {((model.rating || 0) / 10).toFixed(1)} ({Math.round((model.downloads || 0) / 1000)}K)
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <Link href="/models">
            <Button
              variant="outline"
              className="w-full mt-4 border-[hsl(180,100%,50%)] text-[hsl(180,100%,50%)] hover:bg-[hsl(180,100%,50%)] hover:text-[hsl(240,20%,4%)] hover:shadow-[0_0_15px_hsl(180,100%,50%)]"
              data-testid="button-browse-models"
            >
              Browse All Models
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Generation History */}
      <Card className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)] hover:border-[hsl(180,100%,50%)]/50 hover:shadow-[0_0_15px_rgba(0,255,255,0.15)] transition-all">
        <CardHeader>
          <CardTitle className="flex items-center text-lg font-[Orbitron,sans-serif] text-[hsl(180,100%,70%)]">
            <History className="mr-2 h-5 w-5 text-[hsl(210,100%,60%)]" />
            Image Gallery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentGenerations.slice(0, 3).map((generation: Generation) => (
              <div
                key={generation.id}
                className="flex items-center space-x-3 p-3 bg-dark-bg rounded-lg"
                data-testid={`generation-${generation.id}`}
              >
                <div className="w-10 h-10 bg-dark-border rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {generation.imageUrl ? (
                    <img
                      src={generation.imageUrl}
                      alt="Generation thumbnail"
                      className="w-full h-full object-cover"
                    />
                  ) : generation.status === 'processing' ? (
                    <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <div className="w-4 h-4 bg-slate-600 rounded"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`text-generation-prompt-${generation.id}`}>
                    {generation.prompt.slice(0, 30)}...
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(generation.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {generation.status === 'completed' && generation.imageUrl && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-green-500/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReuse(generation);
                        }}
                        data-testid={`button-reuse-${generation.id}`}
                        title="Reuse"
                      >
                        <RotateCcw className="h-3 w-3 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-red-500/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          const isFavorited = favorites.some(fav => fav.generationId === generation.id);
                          if (isFavorited) {
                            handleRemoveFromFavorites(generation.id);
                          } else {
                            handleAddToFavorites(generation.id);
                          }
                        }}
                        data-testid={`button-favorite-${generation.id}`}
                        title={favorites.some(fav => fav.generationId === generation.id) ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Heart className={`h-3 w-3 ${favorites.some(fav => fav.generationId === generation.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                      </Button>
                    </>
                  )}
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(generation.status)}`}>
                    {generation.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Link href="/generations">
            <Button
              variant="outline"
              className="w-full mt-4 border-[hsl(320,100%,60%)] text-[hsl(320,100%,60%)] hover:bg-[hsl(320,100%,60%)] hover:text-[hsl(240,20%,4%)] hover:shadow-[0_0_15px_hsl(320,100%,60%)]"
              data-testid="button-view-history"
            >
              View All History
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)] hover:border-[hsl(180,100%,50%)]/50 hover:shadow-[0_0_15px_rgba(0,255,255,0.15)] transition-all">
        <CardHeader>
          <CardTitle className="flex items-center text-lg font-[Orbitron,sans-serif] text-[hsl(180,100%,70%)]">
            <Zap className="mr-2 h-5 w-5 text-[hsl(60,100%,50%)]" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start p-2 bg-[hsl(240,25%,10%)] hover:bg-[hsl(180,100%,50%)]/10 hover:text-[hsl(180,100%,70%)] transition-all"
              data-testid="button-favorites"
              onClick={() => navigate('/favorites')}
            >
              <Heart className="mr-3 h-4 w-4 text-[hsl(350,100%,55%)]" />
              <span className="text-sm">My Favorites</span>
            </Button>

            <Link href="/transform">
              <Button
                variant="ghost"
                className="w-full justify-start p-2 bg-[hsl(240,25%,10%)] hover:bg-[hsl(180,100%,50%)]/10 hover:text-[hsl(180,100%,70%)] transition-all"
                data-testid="button-transform"
              >
                <Film className="mr-3 h-4 w-4 text-[hsl(270,100%,65%)]" />
                <span className="text-sm">Transform Studio</span>
              </Button>
            </Link>

            <Link href="/community">
              <Button
                variant="ghost"
                className="w-full justify-start p-2 bg-[hsl(240,25%,10%)] hover:bg-[hsl(180,100%,50%)]/10 hover:text-[hsl(180,100%,70%)] transition-all"
                data-testid="button-community"
              >
                <Users className="mr-3 h-4 w-4 text-[hsl(120,100%,45%)]" />
                <span className="text-sm">Community</span>
              </Button>
            </Link>

            <Link href="/settings">
              <Button
                variant="ghost"
                className="w-full justify-start p-2 bg-[hsl(240,25%,10%)] hover:bg-[hsl(180,100%,50%)]/10 hover:text-[hsl(180,100%,70%)] transition-all"
                data-testid="button-settings"
              >
                <Settings className="mr-3 h-4 w-4 text-[hsl(180,30%,60%)]" />
                <span className="text-sm">Settings</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Stats Card */}
      {user && (
        <Card className="bg-gradient-to-r from-[hsl(180,100%,30%)] to-[hsl(320,100%,40%)] border border-[hsl(180,100%,50%)]/30 shadow-[0_0_20px_rgba(0,255,255,0.2)]">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold mb-4 text-white font-[Orbitron,sans-serif] tracking-wider uppercase">Your Stats</h3>
            <div className="space-y-3 text-white">
              <div className="flex justify-between">
                <span className="text-sm opacity-90">Images Generated</span>
                <span className="font-semibold" data-testid="text-stat-generated">
                  {user.totalGenerated}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm opacity-90">Models Used</span>
                <span className="font-semibold" data-testid="text-stat-models">
                  {user.modelsUsed || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <Link href="/settings">
                  <div className="cursor-pointer hover:opacity-80 transition-opacity">
                    <span className="text-sm opacity-90">Buzz Credits</span>
                    <p className="font-semibold" data-testid="text-stat-buzz">
                      {user.buzzCredits}
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
