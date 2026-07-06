import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Plus, Edit2, Trash2, FileText, Image, Tag, X, Grid3X3, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SavedPrompt } from "@shared/schema";

// Types for form handling
const createSavedPromptSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  prompt: z.string().min(1, "Prompt is required"),
  negativePrompt: z.string().optional(),
  characterName: z.string().optional(),
  sceneName: z.string().optional(),
  imageUrl: z.string().optional(),
  tags: z.array(z.string()).default([]),
  baseModel: z.string().optional(),
  steps: z.number().min(1).max(150).optional(),
  cfgScale: z.number().min(1).max(20).optional(),
  seed: z.number().optional(),
  loras: z.array(z.object({ id: z.string(), strength: z.number() })).default([]),
});

type CreateSavedPromptForm = z.infer<typeof createSavedPromptSchema>;

// Image selector component
function ImageSelector({ 
  selectedImageUrl, 
  onImageSelect 
}: { 
  selectedImageUrl: string; 
  onImageSelect: (url: string) => void; 
}) {
  const [inputMode, setInputMode] = useState<"gallery" | "url">("gallery");
  const [customUrl, setCustomUrl] = useState(selectedImageUrl || "");
  
  // Query to get user's generated images
  const { data: generationsData } = useQuery<{ generations: { id: string; imageUrl?: string | null; prompt?: string | null }[] }>({
    queryKey: ["/api/generations"],
  });
  
  const generations = generationsData?.generations || [];
  const recentImages = generations.slice(0, 6); // Show recent 6 images
  
  const handleImageClick = (imageUrl: string) => {
    onImageSelect(imageUrl);
  };
  
  const handleCustomUrlSubmit = () => {
    onImageSelect(customUrl);
  };
  
  return (
    <div className="space-y-3">
      <Tabs value={inputMode} onValueChange={(value) => setInputMode(value as "gallery" | "url")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="gallery" className="flex items-center gap-2">
            <Grid3X3 className="h-3 w-3" />
            Gallery
          </TabsTrigger>
          <TabsTrigger value="url" className="flex items-center gap-2">
            <Image className="h-3 w-3" />
            Custom URL
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="gallery" className="mt-3">
          {recentImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {recentImages.map((generation: any) => (
                <div
                  key={generation.id}
                  className={`relative aspect-square cursor-pointer rounded-md overflow-hidden border-2 transition-colors ${
                    selectedImageUrl === `/api/images/${generation.id}` 
                      ? "border-primary" 
                      : "border-transparent hover:border-muted-foreground"
                  }`}
                  onClick={() => handleImageClick(`/api/images/${generation.id}`)}
                >
                  <img
                    src={`/api/images/${generation.id}`}
                    alt="Generated image"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedImageUrl === `/api/images/${generation.id}` && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="h-6 w-6 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No generated images found</p>
              <p className="text-xs">Generate some images first to select from your gallery</p>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="url" className="mt-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter image URL"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              data-testid="input-custom-image-url"
            />
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleCustomUrlSubmit}
              data-testid="button-set-custom-url"
            >
              Set
            </Button>
          </div>
          {customUrl && (
            <div className="mt-2 p-2 border rounded-md">
              <img 
                src={customUrl} 
                alt="Preview" 
                className="w-16 h-16 object-cover rounded mx-auto"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {selectedImageUrl && (
        <div className="text-xs text-muted-foreground">
          Selected: {selectedImageUrl.length > 50 ? `${selectedImageUrl.slice(0, 50)}...` : selectedImageUrl}
        </div>
      )}
    </div>
  );
}

function SavedPromptCard({ 
  savedPrompt, 
  onEdit, 
  onDelete,
  onUse 
}: {
  savedPrompt: SavedPrompt;
  onEdit: (savedPrompt: SavedPrompt) => void;
  onDelete: (id: string) => void;
  onUse: (savedPrompt: SavedPrompt) => void;
}) {
  return (
    <Card className="h-full" data-testid={`card-saved-prompt-${savedPrompt.id}`}>
      {savedPrompt.imageUrl && (
        <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
          <img
            src={savedPrompt.imageUrl}
            alt={savedPrompt.title}
            className="w-full h-full object-cover"
            data-testid={`img-saved-prompt-${savedPrompt.id}`}
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onUse(savedPrompt)}
              className="bg-primary/80 hover:bg-primary text-white h-8 w-8"
              data-testid={`button-use-${savedPrompt.id}`}
              title="Use this prompt"
            >
              <Play className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(savedPrompt)}
              className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
              data-testid={`button-edit-${savedPrompt.id}`}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(savedPrompt.id)}
              className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
              data-testid={`button-delete-${savedPrompt.id}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      <CardHeader className={savedPrompt.imageUrl ? "pb-2" : ""}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg truncate">
              <FileText className="h-4 w-4 text-primary" />
              {savedPrompt.title}
            </CardTitle>
            {(savedPrompt.characterName || savedPrompt.sceneName) && (
              <CardDescription className="line-clamp-1 mt-1">
                {[savedPrompt.characterName, savedPrompt.sceneName].filter(Boolean).join(" • ")}
              </CardDescription>
            )}
            {savedPrompt.tags && savedPrompt.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {savedPrompt.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} className="text-xs bg-green-500 hover:bg-green-600 text-white border-green-500">
                    {tag}
                  </Badge>
                ))}
                {savedPrompt.tags.length > 3 && (
                  <Badge className="text-xs bg-green-500 hover:bg-green-600 text-white border-green-500">
                    +{savedPrompt.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {!savedPrompt.imageUrl && (
            <div className="flex gap-1 ml-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onUse(savedPrompt)}
                className="text-primary hover:bg-primary/10"
                data-testid={`button-use-${savedPrompt.id}`}
                title="Use this prompt"
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(savedPrompt)}
                data-testid={`button-edit-${savedPrompt.id}`}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(savedPrompt.id)}
                data-testid={`button-delete-${savedPrompt.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
          <p className="text-sm line-clamp-3">{savedPrompt.description || "No description provided"}</p>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Created: {savedPrompt.createdAt ? new Date(savedPrompt.createdAt).toLocaleDateString() : '—'}
          </div>
          {savedPrompt.imageUrl && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onUse(savedPrompt)}
              className="h-7 px-3 text-xs"
              data-testid={`button-use-bottom-${savedPrompt.id}`}
            >
              <Play className="h-3 w-3 mr-1" />
              Use
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SavedPromptDialog({ 
  savedPrompt, 
  onClose 
}: { 
  savedPrompt?: SavedPrompt; 
  onClose: () => void; 
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!savedPrompt;
  
  const form = useForm<CreateSavedPromptForm>({
    resolver: zodResolver(createSavedPromptSchema),
    defaultValues: {
      title: savedPrompt?.title || "",
      description: savedPrompt?.description || "",
      prompt: savedPrompt?.prompt || "",
      negativePrompt: savedPrompt?.negativePrompt || "",
      characterName: savedPrompt?.characterName || "",
      sceneName: savedPrompt?.sceneName || "",
      imageUrl: savedPrompt?.imageUrl || "",
      tags: savedPrompt?.tags || [],
      baseModel: savedPrompt?.baseModel || "",
      steps: savedPrompt?.steps || undefined,
      cfgScale: savedPrompt?.cfgScale ? savedPrompt.cfgScale / 10 : undefined,
      seed: savedPrompt?.seed || undefined,
      loras: savedPrompt?.loras || [],
    },
  });

  // Reset form when savedPrompt changes (for editing)
  useEffect(() => {
    if (savedPrompt) {
      form.reset({
        title: savedPrompt.title || "",
        description: savedPrompt.description || "",
        prompt: savedPrompt.prompt || "",
        negativePrompt: savedPrompt.negativePrompt || "",
        characterName: savedPrompt.characterName || "",
        sceneName: savedPrompt.sceneName || "",
        imageUrl: savedPrompt.imageUrl || "",
        tags: savedPrompt.tags || [],
        baseModel: savedPrompt.baseModel || "",
        steps: savedPrompt.steps || undefined,
        cfgScale: savedPrompt.cfgScale ? savedPrompt.cfgScale / 10 : undefined,
        seed: savedPrompt.seed || undefined,
        loras: savedPrompt.loras || [],
      });
    }
  }, [savedPrompt, form]);

  const createMutation = useMutation({
    mutationFn: async (data: CreateSavedPromptForm) => {
      const response = await fetch("/api/saved-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create saved prompt");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-prompts"] });
      toast({ title: "Saved prompt created successfully!" });
      onClose();
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to create saved prompt", 
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CreateSavedPromptForm) => {
      const response = await fetch(`/api/saved-prompts/${savedPrompt!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update saved prompt");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-prompts"] });
      toast({ title: "Saved prompt updated successfully!" });
      onClose();
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to update saved prompt", 
        variant: "destructive" 
      });
    },
  });

  const onSubmit = (data: CreateSavedPromptForm) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit" : "Create"} Saved Prompt</DialogTitle>
        <DialogDescription>
          {isEditing ? "Update your saved prompt details" : "Save your prompt for future use"}
        </DialogDescription>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter a descriptive title..."
                    {...field}
                    data-testid="input-title"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter a brief description of this prompt..."
                    rows={2}
                    {...field}
                    data-testid="textarea-description"
                  />
                </FormControl>
                <FormDescription>
                  A short description that will be displayed on the prompt card
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prompt</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter your prompt text..."
                    rows={4}
                    {...field}
                    data-testid="textarea-prompt"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="negativePrompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Negative Prompt</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter negative prompt (optional)..."
                    rows={2}
                    {...field}
                    data-testid="textarea-negative-prompt"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="baseModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Model</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Model ID (optional)"
                      {...field}
                      data-testid="input-base-model"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="steps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Steps</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="150"
                      placeholder="28"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      data-testid="input-steps"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cfgScale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CFG Scale</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.5"
                      min="1"
                      max="20"
                      placeholder="4.5"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      data-testid="input-cfg-scale"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="seed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seed</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Random"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      data-testid="input-seed"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="characterName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Character Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Associated character (optional)"
                      {...field}
                      data-testid="input-character-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sceneName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scene Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Associated scene (optional)"
                      {...field}
                      data-testid="input-scene-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preview Image</FormLabel>
                <ImageSelector 
                  selectedImageUrl={field.value || ""} 
                  onImageSelect={field.onChange}
                />
                <FormDescription>
                  Select an image from your gallery or enter a custom URL
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => {
              const [tagInput, setTagInput] = useState("");
              
              const addTag = () => {
                if (tagInput.trim() && !field.value.includes(tagInput.trim())) {
                  field.onChange([...field.value, tagInput.trim()]);
                  setTagInput("");
                }
              };
              
              const removeTag = (tagToRemove: string) => {
                field.onChange(field.value.filter((tag: string) => tag !== tagToRemove));
              };
              
              const handleKeyPress = (e: React.KeyboardEvent) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              };
              
              return (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a tag..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        data-testid="input-tag"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTag}
                        data-testid="button-add-tag"
                      >
                        <Tag className="h-3 w-3" />
                      </Button>
                    </div>
                    {field.value.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {field.value.map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-xs flex items-center gap-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                              data-testid={`button-remove-tag-${tag}`}
                            >
                              <X className="h-2 w-2" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    Add tags to organize and categorize your prompts
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isPending}
              data-testid="button-save"
            >
              {isPending ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Update" : "Create")}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

export default function SavedPrompts() {
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSavedPrompt, setEditingSavedPrompt] = useState<SavedPrompt | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: savedPrompts = [], isLoading } = useQuery<SavedPrompt[]>({
    queryKey: ["/api/saved-prompts"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/saved-prompts/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete saved prompt");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-prompts"] });
      toast({ title: "Saved prompt deleted successfully" });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to delete saved prompt", 
        variant: "destructive" 
      });
    },
  });

  const handleEdit = (savedPrompt: SavedPrompt) => {
    setEditingSavedPrompt(savedPrompt);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this saved prompt?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleUse = (savedPrompt: SavedPrompt) => {
    try {
      // Store saved prompt data in localStorage using the same keys as generation panel
      localStorage.setItem('generationPanel_prompt', JSON.stringify(savedPrompt.prompt));
      if (savedPrompt.negativePrompt) {
        localStorage.setItem('generationPanel_negativePrompt', JSON.stringify(savedPrompt.negativePrompt));
      }
      if (savedPrompt.baseModel) {
        localStorage.setItem('generationPanel_modelId', JSON.stringify(savedPrompt.baseModel));
      }
      if (savedPrompt.steps) {
        localStorage.setItem('generationPanel_steps', JSON.stringify(savedPrompt.steps));
      }
      if (savedPrompt.cfgScale) {
        localStorage.setItem('generationPanel_cfgScale', JSON.stringify(savedPrompt.cfgScale / 10));
      }
      if (savedPrompt.seed !== null && savedPrompt.seed !== undefined) {
        localStorage.setItem('generationPanel_seed', JSON.stringify(savedPrompt.seed));
      }
      if (savedPrompt.loras && savedPrompt.loras.length > 0) {
        localStorage.setItem('generationPanel_loras', JSON.stringify(savedPrompt.loras));
      }

      toast({
        title: "Prompt Loaded",
        description: `"${savedPrompt.title}" has been loaded into the generation form.`,
      });

      // Navigate to main page where generation panel is located
      navigate('/');
    } catch (error) {
      console.error('Error loading prompt:', error);
      toast({
        title: "Error",
        description: "Failed to load the prompt. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSavedPrompt(undefined);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading saved prompts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-start gap-4 mb-8">
        <Link href="/generate">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="heading-saved-prompts">Saved Prompts</h1>
              <p className="text-muted-foreground">
                Manage your saved prompts for quick reuse in generation
              </p>
            </div>
            
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingSavedPrompt(undefined)} data-testid="button-create-saved-prompt">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Saved Prompt
                </Button>
              </DialogTrigger>
              <SavedPromptDialog savedPrompt={editingSavedPrompt} onClose={handleCloseDialog} />
            </Dialog>
          </div>
        </div>
      </div>

      {savedPrompts.length === 0 ? (
        <Card className="text-center py-12" data-testid="card-empty-saved-prompts">
          <CardContent>
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No saved prompts yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first saved prompt to build a library of reusable prompts
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingSavedPrompt(undefined)} data-testid="button-create-first-saved-prompt">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Saved Prompt
                </Button>
              </DialogTrigger>
              <SavedPromptDialog savedPrompt={editingSavedPrompt} onClose={handleCloseDialog} />
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {savedPrompts.map((savedPrompt) => (
            <SavedPromptCard
              key={savedPrompt.id}
              savedPrompt={savedPrompt}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onUse={handleUse}
            />
          ))}
        </div>
      )}
    </div>
  );
}