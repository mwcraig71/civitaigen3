import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, X, Sparkles, Shuffle, Trash2, Loader2, ArrowLeft, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface TraitConfig {
  multiSelect: boolean;
  traits: string[];
}

interface TraitGroups {
  [key: string]: string[];
}

interface TraitData {
  [key: string]: TraitConfig;
}

const traitGroups: TraitGroups = {
  "Core Identity": ["Age", "Ethnicity", "Expression"],
  "Physical Appearance": ["Body Type", "Breast Size", "Buttocks Size", "Skin", "Hair", "Facial Features"],
  "Style & Setting": ["Outfit", "Adornments", "Lighting"]
};

const traitData: TraitData = {
  "Age": { multiSelect: false, traits: ["18+", "21+", "30s", "mature", "40s", "50s"] },
  "Ethnicity": { multiSelect: false, traits: ["American", "Irish", "Russian", "Japanese", "Kenyan", "Brazilian", "Indian", "Italian", "Egyptian", "Swedish", "Mexican", "Chinese"] },
  "Body Type": { multiSelect: false, traits: ["tall slender body", "tall athletic body", "tall curvy body", "average height slender body", "average height athletic body", "average height curvy body", "short slender body", "short athletic body", "short curvy body", "petite body", "muscular body", "plus-size body"] },
  "Outfit": { multiSelect: false, traits: ["blue and white striped bikini", "sleek black one-piece swimsuit", "crisp white tennis dress", "black Lululemon shorts", "charcoal grey yoga pants", "tight-fitting denim shorts", "loose-fitting khaki shorts", "yellow floral sun dress", "red and white polka dot bikini", "high-waisted athletic shorts", "simple grey sweatpants", "patterned maxi dress", "white crop top and jean shorts", "navy blue two-piece swimsuit", "pink pleated tennis skirt", "camouflage cargo shorts", "tight black leggings", "breezy linen shorts", "long-sleeve black swimsuit", "vibrant tie-dye sundress", "red high-cut one-piece swimsuit", "neon green running shorts", "lavender yoga pants", "simple white t-shirt and loose shorts", "elegant backless summer dress", "Victorian goth dress with lace", "goth punk outfit with chains and leather", "fishnet top and black pleated skirt", "darkwave aesthetic outfit", "elven ranger leather armor", "fae-inspired dress of glowing leaves", "orc shaman outfit with bones and fur", "demon-themed tattered robes"] },
  "Breast Size": { multiSelect: false, traits: ["flat chest", "small breasts", "medium breasts", "large breasts", "very large breasts"] },
  "Buttocks Size": { multiSelect: false, traits: ["flat buttocks", "small buttocks", "medium buttocks", "large buttocks", "very large buttocks"] },
  "Skin": { multiSelect: true, traits: ["pale skin", "fair skin", "olive skin", "tan skin", "brown skin", "dark skin", "freckles", "large pores", "long eyelashes", "arm hair", "beauty mark", "dimples", "smile lines", "glowing skin", "visible pores", "light scars", "stretch marks", "body hair"] },
  "Hair": { multiSelect: true, traits: ["blonde hair", "brunette hair", "black hair", "red hair", "silver hair", "pastel pink hair", "electric blue hair", "long straight hair", "wavy hair", "curly hair", "braids", "ponytail", "short pixie cut", "bob cut"] },
  "Facial Features": { multiSelect: true, traits: ["blue eyes", "green eyes", "brown eyes", "hazel eyes", "grey eyes", "amber eyes", "oval face", "round face", "square face", "heart-shaped face", "thin lips", "full lips", "cupid's bow lips"] },
  "Adornments": { multiSelect: true, traits: ["sleeve tattoo", "small wrist tattoo", "intricate back tattoo", "floral shoulder tattoo", "nose ring", "earrings", "lip ring", "eyebrow piercing", "simple silver necklace", "choker", "pendant necklace"] },
  "Lighting": { multiSelect: false, traits: ["dramatic studio lighting", "soft natural light", "golden hour sunlight", "moonlight", "neon city lights", "cinematic lighting", "rim lighting", "eerie backlight", "candlelight", "dappled sunlight"] },
  "Expression": { multiSelect: false, traits: ["smiling", "laughing", "smirking", "serious", "thoughtful", "surprised", "winking", "serene"] }
};

type ModelStyle = 'pony' | 'flux';

const MODEL_STYLE_OPTIONS: { value: ModelStyle; label: string; description: string }[] = [
  { value: 'pony', label: 'Pony / SD (booru tags)', description: 'CyberRealistic Pony and other Pony/SD checkpoints' },
  { value: 'flux', label: 'Flux / Krea2 (natural language)', description: 'Flux, Krea2, and other natural-language models' },
];

export default function PromptCreator() {
  const [selectedTraits, setSelectedTraits] = useState<{ [key: string]: string[] }>({});
  const [creativeFlair, setCreativeFlair] = useState(false);
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imagesPerPrompt, setImagesPerPrompt] = useState<number>(1);
  const [isSendingToGenerator, setIsSendingToGenerator] = useState(false);
  const [modelStyle, setModelStyle] = useState<ModelStyle>('pony');
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const MAX_SELECTIONS = 10;

  const countSelectedTraits = () => {
    return Object.values(selectedTraits).flat().length;
  };

  const handleSelection = (category: string, value: string) => {
    if (!value) return;

    const isMultiSelect = traitData[category].multiSelect;

    if (countSelectedTraits() >= MAX_SELECTIONS) {
      toast({
        title: "Maximum traits reached",
        description: `You can select a maximum of ${MAX_SELECTIONS} traits.`,
        variant: "destructive"
      });
      return;
    }

    setSelectedTraits(prev => {
      const newSelection = { ...prev };
      
      if (isMultiSelect) {
        if (!newSelection[category]) newSelection[category] = [];
        if (!newSelection[category].includes(value)) {
          newSelection[category] = [...newSelection[category], value];
        }
      } else {
        newSelection[category] = [value];
      }
      
      return newSelection;
    });
  };

  const removeTrait = (traitToRemove: string, category: string) => {
    setSelectedTraits(prev => {
      const newSelection = { ...prev };
      if (!newSelection[category]) return newSelection;

      const traitIndex = newSelection[category].indexOf(traitToRemove);
      if (traitIndex > -1) {
        newSelection[category] = newSelection[category].filter((_, i) => i !== traitIndex);
        if (newSelection[category].length === 0) {
          delete newSelection[category];
        }
      }

      return newSelection;
    });
  };

  const clearAllTraits = () => {
    setSelectedTraits({});
  };

  const randomizeTraits = () => {
    const currentCount = countSelectedTraits();
    if (currentCount >= MAX_SELECTIONS) {
      toast({
        title: "Maximum traits selected",
        description: "Clear some traits to randomize.",
        variant: "destructive"
      });
      return;
    }

    const categories = Object.keys(traitData);
    const remainingSlots = MAX_SELECTIONS - currentCount;
    const numToSelect = Math.floor(Math.random() * Math.min(4, remainingSlots)) + 1;

    const newSelection = { ...selectedTraits };
    let addedCount = 0;
    let attempts = 0;

    while (addedCount < numToSelect && attempts < 50) {
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];

      if (!traitData[randomCategory].multiSelect && newSelection[randomCategory]) {
        attempts++;
        continue;
      }

      const traitsForCategory = traitData[randomCategory].traits;
      const randomTrait = traitsForCategory[Math.floor(Math.random() * traitsForCategory.length)];

      const isMultiSelect = traitData[randomCategory].multiSelect;

      if (isMultiSelect) {
        if (!newSelection[randomCategory]) newSelection[randomCategory] = [];
        if (!newSelection[randomCategory].includes(randomTrait)) {
          newSelection[randomCategory] = [...newSelection[randomCategory], randomTrait];
          addedCount++;
        }
      } else {
        newSelection[randomCategory] = [randomTrait];
        addedCount++;
      }
      attempts++;
    }

    setSelectedTraits(newSelection);
  };

  const generatePrompts = async () => {
    const allTraits = Object.values(selectedTraits).flat();
    if (allTraits.length === 0) {
      toast({
        title: "No traits selected",
        description: "Please select at least one trait before generating prompts.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedPrompts([]);

    try {
      const response = await apiRequest('POST', '/api/generate-prompts', {
        traits: allTraits,
        creativeFlair,
        // Pass baseModel so the server can detect the family and switch prompt style
        baseModel: modelStyle === 'flux' ? 'Flux.1 D' : 'Pony',
        modelName: modelStyle === 'flux' ? 'Flux' : 'CyberRealistic Pony',
      });

      const data = await response.json();
      setGeneratedPrompts(data.prompts);

      toast({
        title: "Prompts generated!",
        description: `${data.prompts.length} creative prompts created successfully.`
      });
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast({
      title: "Copied!",
      description: "Prompt copied to clipboard."
    });
  };

  const copyAllPrompts = () => {
    const allText = generatedPrompts.join('\n\n---\n\n');
    navigator.clipboard.writeText(allText);
    toast({
      title: "All prompts copied!",
      description: `${generatedPrompts.length} prompts copied to clipboard.`
    });
  };

  const sendToGenerator = async () => {
    if (generatedPrompts.length === 0) {
      toast({
        title: "No prompts to send",
        description: "Generate some prompts first.",
        variant: "destructive"
      });
      return;
    }

    setIsSendingToGenerator(true);

    try {
      console.log('📋 PROMPT CREATOR: Preparing to send prompts:', generatedPrompts.length);
      console.log('📋 PROMPT CREATOR: Images per prompt:', imagesPerPrompt);
      
      // Store prompts in localStorage for the generator to pick up
      const promptBatch = generatedPrompts.map(prompt => ({
        prompt,
        quantity: imagesPerPrompt
      }));

      console.log('📦 PROMPT CREATOR: Created batch object:', promptBatch);
      console.log('📦 PROMPT CREATOR: Batch length:', promptBatch.length);
      
      localStorage.setItem('promptCreatorBatch', JSON.stringify(promptBatch));
      
      // Verify it was saved
      const savedBatch = localStorage.getItem('promptCreatorBatch');
      console.log('✅ PROMPT CREATOR: Verified saved to localStorage:', savedBatch ? 'Success' : 'FAILED');
      if (savedBatch) {
        const parsed = JSON.parse(savedBatch);
        console.log('✅ PROMPT CREATOR: Saved batch contains', parsed.length, 'prompts');
      }
      
      toast({
        title: "Prompts queued!",
        description: `${generatedPrompts.length} prompts with ${imagesPerPrompt} image(s) each ready to generate.`,
      });

      // Navigate to generator
      setLocation('/generate');
    } catch (error) {
      console.error('Send to generator error:', error);
      toast({
        title: "Failed to queue prompts",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSendingToGenerator(false);
    }
  };

  const allSelectedTraits = Object.entries(selectedTraits).flatMap(([category, traits]) =>
    traits.map(trait => ({ trait, category }))
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <Link href="/generate">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-to-generator">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Generator
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-4xl font-bold text-foreground mb-2">AI Prompt Generator</h1>
            <p className="text-lg text-muted-foreground">
              Select up to 10 traits to generate diverse prompts for your character
            </p>
          </div>
        </div>

        {/* Selection Summary - Sticky */}
        <Card className="sticky top-4 z-10 mb-8 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Your Selections ({countSelectedTraits()}/{MAX_SELECTIONS})</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={randomizeTraits}
                  data-testid="button-randomize-traits"
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Randomize
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllTraits}
                  data-testid="button-clear-traits"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Selected Traits */}
            <div className="min-h-[60px] bg-muted rounded-lg p-4 flex flex-wrap gap-2">
              {allSelectedTraits.length === 0 ? (
                <span className="text-muted-foreground">No traits selected yet.</span>
              ) : (
                allSelectedTraits.map(({ trait, category }, index) => (
                  <span
                    key={`${category}-${trait}-${index}`}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium"
                  >
                    {trait}
                    <button
                      onClick={() => removeTrait(trait, category)}
                      className="hover:text-primary-foreground/80 transition-colors"
                      data-testid={`button-remove-${trait.replace(/\s+/g, '-')}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Model Style Selector */}
            <div className="space-y-1">
              <Label htmlFor="select-model-style" className="text-sm font-medium">
                Prompt style
              </Label>
              <Select
                value={modelStyle}
                onValueChange={(value) => setModelStyle(value as ModelStyle)}
              >
                <SelectTrigger id="select-model-style" className="w-full" data-testid="select-model-style">
                  <SelectValue placeholder="Select model style" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_STYLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Creative Flair Option */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="creative-flair"
                checked={creativeFlair}
                onCheckedChange={(checked) => setCreativeFlair(checked as boolean)}
                data-testid="checkbox-creative-flair"
              />
              <Label htmlFor="creative-flair" className="text-sm cursor-pointer">
                Add Creative Flair (surrealism, fantasy elements)
              </Label>
            </div>

            {/* Generate Button */}
            <Button
              onClick={generatePrompts}
              disabled={isGenerating || countSelectedTraits() === 0}
              className="w-full"
              size="lg"
              data-testid="button-generate-prompts"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Generate Prompts
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Trait Selection Grid */}
        <div className="space-y-6 mb-8">
          {Object.entries(traitGroups).map(([groupName, categories]) => (
            <Card key={groupName}>
              <CardHeader>
                <CardTitle>{groupName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {categories.map((category) => (
                    <div key={category} className="space-y-2">
                      <Label htmlFor={`select-${category}`} className="text-base font-semibold">
                        {category}
                      </Label>
                      <Select
                        value=""
                        onValueChange={(value) => handleSelection(category, value)}
                      >
                        <SelectTrigger id={`select-${category}`} data-testid={`select-${category.toLowerCase().replace(/\s+/g, '-')}`}>
                          <SelectValue
                            placeholder={
                              traitData[category].multiSelect
                                ? `Add a ${category.toLowerCase()}...`
                                : `Select a ${category.toLowerCase()}...`
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <ScrollArea className="h-[200px]">
                            {traitData[category].traits.map((trait) => (
                              <SelectItem key={trait} value={trait}>
                                {trait}
                              </SelectItem>
                            ))}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Results Section */}
        {generatedPrompts.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Generated Prompts</CardTitle>
                    <CardDescription>{generatedPrompts.length} prompts ready to use</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={copyAllPrompts}
                    data-testid="button-copy-all"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All
                  </Button>
                </div>
                
                {/* Send to Generator Section */}
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <div className="flex-1">
                    <Label htmlFor="images-per-prompt" className="text-sm font-medium mb-2 block">
                      Images per prompt
                    </Label>
                    <Select
                      value={imagesPerPrompt.toString()}
                      onValueChange={(value) => setImagesPerPrompt(parseInt(value))}
                    >
                      <SelectTrigger id="images-per-prompt" className="w-[180px]" data-testid="select-images-per-prompt">
                        <SelectValue placeholder="Select quantity" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            {num} image{num > 1 ? 's' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      onClick={sendToGenerator}
                      disabled={isSendingToGenerator}
                      size="lg"
                      data-testid="button-send-to-generator"
                    >
                      {isSendingToGenerator ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5 mr-2" />
                          Send to Generator
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Total: {generatedPrompts.length * imagesPerPrompt} images
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {generatedPrompts.map((prompt, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-4 bg-muted rounded-lg"
                >
                  <div className="flex-1 text-sm text-foreground break-words">
                    {prompt}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyPrompt(prompt)}
                    className="shrink-0"
                    data-testid={`button-copy-prompt-${index}`}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
