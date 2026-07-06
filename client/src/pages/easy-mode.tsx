import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, User, MapPin, Sparkles, ChevronRight, ArrowLeft, Zap } from 'lucide-react';
import Header from '@/components/header';
import { useAuth } from '@/hooks/useAuth';
import type { Character, SavedScene } from '@shared/schema';

type Step = 'character' | 'scene' | 'generate';
type CharacterType = 'civitai' | 'user' | 'shared';

export default function EasyMode() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState<Step>('character');
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedScene, setSelectedScene] = useState<SavedScene | null>(null);
  const [imageCount, setImageCount] = useState(2);
  const [characterSearch, setCharacterSearch] = useState('');
  const [sceneSearch, setSceneSearch] = useState('');
  const [characterType, setCharacterType] = useState<CharacterType>('civitai');
  const { user } = useAuth();

  // Fetch characters and scenes
  const { data: characters = [], isLoading: charactersLoading } = useQuery<Character[]>({
    queryKey: ['/api/characters'],
  });

  // Fetch user's own scenes
  const { data: userScenes = [], isLoading: userScenesLoading } = useQuery<SavedScene[]>({
    queryKey: ['/api/saved-scenes'],
  });

  // Fetch shared scenes from other users
  const { data: sharedScenes = [], isLoading: sharedScenesLoading } = useQuery<SavedScene[]>({
    queryKey: ['/api/saved-scenes/shared'],
  });

  // Combine all scenes (user's own + shared scenes)
  const savedScenes = [...userScenes, ...sharedScenes];
  const scenesLoading = userScenesLoading || sharedScenesLoading;

  // Filter characters by type and search
  const filteredCharacters = characters.filter(character => {
    // Filter by type first
    let typeMatch = false;
    const currentUserId = user && typeof user === 'object' && user !== null && 'id' in user ? (user as any).id : null;
    
    switch (characterType) {
      case 'civitai':
        typeMatch = character.source === 'CivitAI';
        break;
      case 'user':
        typeMatch = character.source === 'User' && character.userId === currentUserId;
        break;
      case 'shared':
        typeMatch = character.isShared === true && character.userId !== currentUserId;
        break;
    }
    
    if (!typeMatch) return false;
    
    // Then filter by search
    return character.name.toLowerCase().includes(characterSearch.toLowerCase()) ||
           character.description?.toLowerCase().includes(characterSearch.toLowerCase());
  });

  // Filter scenes by search
  const filteredScenes = savedScenes.filter(scene =>
    scene.title.toLowerCase().includes(sceneSearch.toLowerCase()) ||
    scene.prompt.toLowerCase().includes(sceneSearch.toLowerCase()) ||
    scene.locationCategory?.toLowerCase().includes(sceneSearch.toLowerCase()) ||
    scene.location?.toLowerCase().includes(sceneSearch.toLowerCase())
  );

  const handleCharacterSelect = (character: Character) => {
    setSelectedCharacter(character);
    setCurrentStep('scene');
  };

  const handleSceneSelect = (scene: SavedScene) => {
    setSelectedScene(scene);
    setCurrentStep('generate');
  };

  const handleGenerate = () => {
    // Clear the previous prompt AND negative prompt to ensure fresh start
    localStorage.removeItem('generationPanel_prompt');
    localStorage.removeItem('generationPanel_negativePrompt');
    // Clear any existing scene selection to prevent duplication
    localStorage.removeItem('generationPanel_selectedScene');
    
    // Build the combined prompt
    let combinedPrompt = 'masterpiece, best quality, ';
    
    if (selectedCharacter) {
      combinedPrompt += selectedCharacter.basePrompt;
      if (selectedCharacter.description) {
        combinedPrompt += ', ' + selectedCharacter.description;
      }
      
      // Get the current age from localStorage (user may have adjusted the slider)
      const storageKey = `character_age_${selectedCharacter.id}`;
      const storedAge = localStorage.getItem(storageKey);
      const currentAge = storedAge ? parseInt(storedAge) : (selectedCharacter.age || 20);
      
      combinedPrompt += ', ' + currentAge + 'yo';
    }
    
    if (selectedScene) {
      // Collect all scene elements
      const sceneElements = [];
      
      if (selectedScene.prompt) {
        sceneElements.push(selectedScene.prompt);
      }
      if (selectedScene.location) {
        sceneElements.push('in ' + selectedScene.location);
      }
      if (selectedScene.outfit) {
        sceneElements.push('wearing ' + selectedScene.outfit);
      }
      if (selectedScene.pose) {
        sceneElements.push(selectedScene.pose);
      }
      
      // Join and deduplicate terms
      if (sceneElements.length > 0) {
        const sceneText = sceneElements.join(', ');
        // Smart deduplication: split by commas, trim, and remove duplicates
        const terms = sceneText.split(',').map(term => term.trim());
        const uniqueTerms = [];
        const seenTerms = new Set();
        
        for (const term of terms) {
          const normalizedTerm = term.toLowerCase();
          if (!seenTerms.has(normalizedTerm) && term !== '') {
            seenTerms.add(normalizedTerm);
            uniqueTerms.push(term);
          }
        }
        
        combinedPrompt += ', ' + uniqueTerms.join(', ');
      }
    }
    
    // Set the quantity and prompt
    localStorage.setItem('generationPanel_quantity', JSON.stringify(imageCount));
    localStorage.setItem('generationPanel_prompt', JSON.stringify(combinedPrompt));
    
    // Copy character's negative prompt to advanced settings if it exists
    if (selectedCharacter && selectedCharacter.negativePrompt) {
      localStorage.setItem('generationPanel_negativePrompt', JSON.stringify(selectedCharacter.negativePrompt));
    }
    
    // Set character selection so it shows up in the generation page
    if (selectedCharacter) {
      localStorage.setItem('generationPanel_selectedCharacter', JSON.stringify(selectedCharacter));
    }
    
    // Store the selected scene for dropdown display, but flag that we came from Easy Mode
    if (selectedScene) {
      localStorage.setItem('generationPanel_selectedScene', JSON.stringify(selectedScene));
      localStorage.setItem('generationPanel_fromEasyMode', 'true'); // Flag to prevent auto-adding scene text
    }
    
    // Navigate to the generate page (full interface)
    setLocation('/generate');
  };

  const handleBack = () => {
    if (currentStep === 'scene') {
      setCurrentStep('character');
      setSelectedScene(null);
    } else if (currentStep === 'generate') {
      setCurrentStep('scene');
    }
  };

  const getStepNumber = (step: Step) => {
    switch (step) {
      case 'character': return 1;
      case 'scene': return 2;
      case 'generate': return 3;
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <div className="flex items-center justify-center gap-2 mb-3 md:mb-4">
            <Sparkles className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
            <h1 className="text-2xl md:text-3xl font-bold">Easy Mode</h1>
          </div>
          <p className="text-slate-400 text-base md:text-lg px-4">
            Create amazing images in just 3 simple steps
          </p>
        </div>

        {/* Step Progress */}
        <div className="flex items-center justify-center mb-6 md:mb-8 px-2">
          {(['character', 'scene', 'generate'] as Step[]).map((step, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep === step;
            const isCompleted = getStepNumber(currentStep) > stepNumber;
            
            return (
              <div key={step} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-medium ${
                      isActive
                        ? 'bg-blue-500 text-white'
                        : isCompleted
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {stepNumber}
                  </div>
                  <div className="mt-1 md:mt-2">
                    <div
                      className={`text-xs md:text-sm font-medium text-center max-w-16 md:max-w-none ${
                        isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-slate-400'
                      }`}
                    >
                      {/* Mobile: Short labels */}
                      <span className="block md:hidden">
                        {step === 'character' && 'Character'}
                        {step === 'scene' && 'Scene'}
                        {step === 'generate' && 'Generate'}
                      </span>
                      {/* Desktop: Full labels */}
                      <span className="hidden md:block">
                        {step === 'character' && 'Character'}
                        {step === 'scene' && 'Scene'}
                        {step === 'generate' && 'Generate'}
                      </span>
                    </div>
                  </div>
                </div>
                {index < 2 && (
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-slate-600 mx-2 md:mx-4 mt-[-20px] md:mt-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="bg-dark-card border-dark-border">
          <CardContent className="p-4 md:p-6">
            {/* Character Selection Step */}
            {currentStep === 'character' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl md:text-2xl font-semibold mb-2">Choose Your Character</h2>
                  <p className="text-slate-400 text-sm md:text-base px-2">
                    Select a character to define the main subject of your image
                  </p>
                </div>

                {/* Character Type Tabs */}
                <Tabs value={characterType} onValueChange={(value) => setCharacterType(value as CharacterType)} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-slate-800">
                    <TabsTrigger value="civitai" className="data-[state=active]:bg-blue-600 text-xs sm:text-sm">
                      Characters
                    </TabsTrigger>
                    <TabsTrigger value="user" className="data-[state=active]:bg-green-600 text-xs sm:text-sm">
                      <span className="hidden sm:inline">My Characters</span>
                      <span className="sm:hidden">Mine</span>
                    </TabsTrigger>
                    <TabsTrigger value="shared" className="data-[state=active]:bg-purple-600 text-xs sm:text-sm">
                      <span className="hidden sm:inline">Shared Characters</span>
                      <span className="sm:hidden">Shared</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Search */}
                  <div className="relative max-w-md mx-auto mt-4">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search characters..."
                      value={characterSearch}
                      onChange={(e) => setCharacterSearch(e.target.value)}
                      className="pl-10 bg-dark-bg border-dark-border"
                      data-testid="input-search-characters"
                    />
                  </div>

                {/* Characters Grid */}
                <ScrollArea className="h-[600px] md:h-[700px]">
                  {charactersLoading ? (
                    <div className="flex justify-center items-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                      <div className="text-slate-400">Loading characters...</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                      {filteredCharacters.map((character) => (
                        <Card
                          key={character.id}
                          className="cursor-pointer hover:bg-dark-bg transition-colors bg-slate-800/50 border-slate-700 overflow-hidden"
                          onClick={() => handleCharacterSelect(character)}
                          data-testid={`card-character-${character.id}`}
                        >
                          {character.imageUrl && (
                            <div className="relative h-32 bg-muted">
                              <img
                                src={character.imageUrl}
                                alt={character.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                <User className="h-5 w-5 text-blue-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-white truncate">{character.name}</h3>
                                {character.description && (
                                  <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                                    {character.description}
                                  </p>
                                )}
                                <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                                  {character.basePrompt}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                  {filteredCharacters.length === 0 && !charactersLoading && (
                    <div className="text-center py-8">
                      <p className="text-slate-400">
                        {characterType === 'civitai' && 'No CivitAI characters found'}
                        {characterType === 'user' && 'No personal characters found'}
                        {characterType === 'shared' && 'No shared characters found'}
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        {characterType === 'civitai' && 'Try adjusting your search'}
                        {characterType === 'user' && 'Create characters in the Characters page'}
                        {characterType === 'shared' && 'Other users haven\'t shared characters yet'}
                      </p>
                    </div>
                  )}
                </Tabs>
              </div>
            )}

            {/* Scene Selection Step */}
            {currentStep === 'scene' && (
              <div className="space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mb-4 md:mb-6">
                  <Button
                    variant="ghost"
                    onClick={handleBack}
                    className="text-slate-400 hover:text-white self-start"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Separator orientation="vertical" className="h-6 hidden md:block" />
                  <div className="flex-shrink-0">
                    <Badge variant="outline" className="text-blue-400 border-blue-400 text-xs">
                      Selected: {selectedCharacter?.name}
                    </Badge>
                  </div>
                </div>

                <div className="text-center">
                  <h2 className="text-xl md:text-2xl font-semibold mb-2">Choose Your Scene</h2>
                  <p className="text-slate-400 text-sm md:text-base px-2">
                    Select a scene to define the setting and context for your image
                  </p>
                </div>

                {/* Search */}
                <div className="relative max-w-md mx-auto">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search scenes..."
                    value={sceneSearch}
                    onChange={(e) => setSceneSearch(e.target.value)}
                    className="pl-10 bg-dark-bg border-dark-border"
                    data-testid="input-search-scenes"
                  />
                </div>

                {/* Scenes Grid */}
                <ScrollArea className="h-[600px] md:h-[700px]">
                  {scenesLoading ? (
                    <div className="flex justify-center items-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                      <div className="text-slate-400">Loading scenes...</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredScenes.map((scene) => (
                        <Card
                          key={scene.id}
                          className="cursor-pointer hover:bg-dark-bg transition-colors bg-slate-800/50 border-slate-700"
                          onClick={() => handleSceneSelect(scene)}
                          data-testid={`card-scene-${scene.id}`}
                        >
                          {scene.imageUrl && (
                            <div className="relative bg-muted flex items-center justify-center p-2">
                              <img
                                src={scene.imageUrl}
                                alt={scene.title}
                                className="max-w-full max-h-24 object-contain rounded"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                <MapPin className="h-5 w-5 text-green-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-white truncate">{scene.title}</h3>
                                {scene.locationCategory && (
                                  <Badge variant="secondary" className="text-xs mb-2">
                                    {scene.locationCategory}
                                  </Badge>
                                )}
                                <p className="text-sm text-slate-400 line-clamp-3">
                                  {scene.prompt.length > 100 
                                    ? `${scene.prompt.substring(0, 100)}...` 
                                    : scene.prompt
                                  }
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {filteredScenes.length === 0 && !scenesLoading && (
                  <div className="text-center py-8">
                    <p className="text-slate-400">No scenes found</p>
                    <p className="text-sm text-slate-500 mt-2">
                      Try adjusting your search or create scenes in the Scene Builder page
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Generate Step */}
            {currentStep === 'generate' && (
              <div className="space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mb-4 md:mb-6">
                  <Button
                    variant="ghost"
                    onClick={handleBack}
                    className="text-slate-400 hover:text-white self-start"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Separator orientation="vertical" className="h-6 hidden md:block" />
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-blue-400 border-blue-400 text-xs">
                      {selectedCharacter?.name}
                    </Badge>
                    <Badge variant="outline" className="text-green-400 border-green-400 text-xs">
                      {selectedScene?.title}
                    </Badge>
                  </div>
                </div>

                <div className="text-center">
                  <h2 className="text-xl md:text-2xl font-semibold mb-2">Ready to Generate!</h2>
                  <p className="text-slate-400 text-sm md:text-base px-2">
                    Choose how many images you want and start generating
                  </p>
                </div>

                {/* Preview */}
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-slate-300">Your Selection</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 md:space-y-4 pt-0">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-medium text-blue-400">Character</span>
                      </div>
                      <p className="text-white font-medium">{selectedCharacter?.name}</p>
                      <p className="text-sm text-slate-400">{selectedCharacter?.description}</p>
                    </div>
                    
                    <Separator className="bg-slate-700" />
                    
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Scene</span>
                      </div>
                      <p className="text-white font-medium">{selectedScene?.title}</p>
                      <div className="flex gap-2 mt-2">
                        {selectedScene?.locationCategory && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedScene.locationCategory}
                          </Badge>
                        )}
                        {selectedScene?.location && (
                          <Badge variant="outline" className="text-xs">
                            {selectedScene.location}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Image Count Selection */}
                <div className="max-w-sm mx-auto">
                  <label className="block text-sm font-medium text-slate-300 mb-3">
                    Number of Images
                  </label>
                  <Select
                    value={imageCount.toString()}
                    onValueChange={(value) => setImageCount(parseInt(value))}
                  >
                    <SelectTrigger className="bg-dark-bg border-dark-border" data-testid="select-image-count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 4 }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} Image{num > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Info Note */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center max-w-lg mx-auto">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-blue-400">Next Steps</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    After hitting generate, you'll be taken to the advanced page where you can tweak the prompt, add LoRAs, and adjust settings. When you're happy with everything, hit generate again to create your images.
                  </p>
                </div>

                {/* Generate Button */}
                <div className="text-center pt-4">
                  <Button
                    onClick={handleGenerate}
                    size="lg"
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8"
                    data-testid="button-generate"
                  >
                    <Zap className="h-5 w-5 mr-2" />
                    Generate
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}