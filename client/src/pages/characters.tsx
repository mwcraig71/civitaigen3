import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Model, Generation } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCharacterSchema } from "@shared/schema";
import { Plus, Edit2, Trash2, Users, Lock, ArrowLeft, Settings, X, Image as ImageIcon, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import LoRASelector from "@/components/lora-selector";
import { z } from "zod";
import type { Character } from "@shared/schema";
import { Link, useLocation } from "wouter";

const createCharacterSchema = insertCharacterSchema.extend({
  tags: z.array(z.string()).optional().default([]),
  imageUrl: z.string().optional(),
  category: z.string().default("User Characters/Female"),
  source: z.string().default("User"),
  isShared: z.boolean().default(false),
});

type CreateCharacterForm = z.infer<typeof createCharacterSchema>;

function TagsInput({ value, onChange, placeholder, ...props }: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  "data-testid"?: string;
}) {
  const [inputValue, setInputValue] = useState("");

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag]);
    }
    setInputValue("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-background min-h-[2.5rem] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        {value.map((tag, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="flex items-center gap-1 px-2 py-1"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:bg-destructive/10 rounded-full p-0.5 ml-1"
              data-testid={`button-remove-tag-${index}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              addTag(inputValue);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 min-w-[120px]"
          {...props}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Press Enter or comma to add tags
      </p>
    </div>
  );
}

function CharacterCard({ character, onEdit, onDelete, onSelect, onHide, onToggleShared, canEdit, models }: {
  character: Character;
  onEdit?: (character: Character) => void;
  onDelete?: (id: string) => void;
  onSelect: (character: Character) => void;
  onHide?: (id: string) => void;
  onToggleShared?: (id: string, isShared: boolean) => void;
  canEdit: boolean;
  models: Model[];
}) {
  // Character age state - stored in localStorage per character
  const [characterAge, setCharacterAge] = useState(() => {
    const stored = localStorage.getItem(`character_age_${character.id}`);
    return stored ? parseInt(stored) : (character.age || 20);
  });

  // Update localStorage when age changes
  const handleAgeChange = (newAge: number) => {
    setCharacterAge(newAge);
    localStorage.setItem(`character_age_${character.id}`, newAge.toString());
  };

  // Find the actual model name from the baseModel ID
  const baseModelName = character.baseModel 
    ? models.find(m => m.id === character.baseModel)?.name 
    : null;
  return (
    <Card className="h-full" data-testid={`card-character-${character.id}`}>
      {character.imageUrl && (
        <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
          <img
            src={character.imageUrl}
            alt={character.name}
            className="w-full h-full object-cover"
            data-testid={`img-character-${character.id}`}
          />
          <div className="absolute top-2 right-2 flex gap-1">
            {canEdit ? (
              <>
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(character)}
                    className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
                    data-testid={`button-edit-${character.id}`}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(character.id)}
                    className="bg-black/50 hover:bg-red-600/70 text-white h-8 w-8"
                    data-testid={`button-delete-${character.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </>
            ) : (
              onHide && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onHide(character.id)}
                  className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
                  title="Hide this character"
                  data-testid={`button-hide-${character.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              )
            )}
          </div>
        </div>
      )}
      <CardHeader className={character.imageUrl ? "pb-2" : ""}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg truncate">
              {character.name}
              {character.isPublic ? (
                <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <Lock className="h-4 w-4 text-gray-500" />
              )}
            </CardTitle>
            {character.description && (
              <CardDescription className="line-clamp-2 mt-1">
                {character.description}
              </CardDescription>
            )}
          </div>
          {!character.imageUrl && (
            <div className="flex gap-1 ml-2">
              {canEdit ? (
                <>
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(character)}
                      data-testid={`button-edit-${character.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(character.id)}
                      data-testid={`button-delete-${character.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </>
              ) : (
                onHide && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onHide(character.id)}
                    title="Hide this character"
                    data-testid={`button-hide-${character.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {baseModelName && (
            <div>
              <h4 className="text-sm font-medium mb-1">Base Model</h4>
              <p className="text-sm text-muted-foreground">
                {baseModelName}
              </p>
            </div>
          )}

          {character.tags && character.tags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {character.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Age Slider */}
          <div>
            <h4 className="text-sm font-medium mb-2">Age: {characterAge} years old</h4>
            <Slider
              min={21}
              max={45}
              step={1}
              value={[characterAge]}
              onValueChange={(values) => handleAgeChange(values[0])}
              className="w-full"
              data-testid={`slider-character-age-${character.id}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>21</span>
              <span>45</span>
            </div>
          </div>
        </div>

        {/* Share Toggle for User Characters */}
        {canEdit && onToggleShared && (
          <div className="pt-3 border-t border-b">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">
                  Share Character
                </label>
                <p className="text-xs text-muted-foreground">
                  Make this character visible in the Shared Library
                </p>
              </div>
              <Switch
                checked={character.isShared || false}
                onCheckedChange={(checked) => onToggleShared(character.id, checked)}
                data-testid={`switch-share-${character.id}`}
              />
            </div>
          </div>
        )}

        <div className="pt-3 border-t">
          <Button 
            onClick={() => onSelect({...character, age: characterAge})}
            className="w-full"
            variant="default"
            size="sm"
            data-testid={`button-select-${character.id}`}
          >
            <Check className="h-4 w-4 mr-2" />
            Select Character
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CharacterImageSelector({ character, form }: {
  character?: Character;
  form: any;
}) {
  const [showSelector, setShowSelector] = useState(false);
  const { data: generationsData } = useQuery<{generations: Generation[]}>({
    queryKey: ["/api/generations"],
  });

  const generations = generationsData?.generations || [];
  const completedGenerations = generations.filter(gen => 
    gen.status === "completed" && gen.imageUrl
  );

  const currentImageUrl = form.watch("imageUrl");

  const selectImage = (imageUrl: string) => {
    form.setValue("imageUrl", imageUrl);
    setShowSelector(false);
  };

  const removeImage = () => {
    form.setValue("imageUrl", "");
  };

  if (!showSelector && !currentImageUrl) {
    return (
      <div className="space-y-2">
        <FormLabel>Character Image</FormLabel>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowSelector(true)}
          className="w-full h-32 border-dashed"
          data-testid="button-select-image"
        >
          <div className="flex flex-col items-center gap-2">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Choose from generated images
            </span>
          </div>
        </Button>
      </div>
    );
  }

  if (currentImageUrl && !showSelector) {
    return (
      <div className="space-y-2">
        <FormLabel>Character Image</FormLabel>
        <div className="relative">
          <img
            src={currentImageUrl}
            alt="Character preview"
            className="w-full h-32 object-cover rounded-lg border"
            data-testid="img-character-preview"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowSelector(true)}
              className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
              data-testid="button-change-image"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={removeImage}
              className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
              data-testid="button-remove-image"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FormLabel>Choose Character Image</FormLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowSelector(false)}
          data-testid="button-cancel-selector"
        >
          Cancel
        </Button>
      </div>
      
      {completedGenerations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No generated images available. Create some images first!
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {completedGenerations.map((generation) => (
            <button
              key={generation.id}
              type="button"
              onClick={() => selectImage(generation.imageUrl!)}
              className="relative aspect-square overflow-hidden rounded-lg border hover:border-primary transition-colors"
              data-testid={`button-select-generation-${generation.id}`}
            >
              <img
                src={generation.imageUrl!}
                alt={generation.prompt}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterDialog({ character, onClose }: {
  character?: Character;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!character;
  
  const { data: models = [] } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  const { data: currentUser } = useQuery<import('@/types').AuthUser | null>({
    queryKey: ['/api/auth/user'],
  });
  
  const form = useForm<CreateCharacterForm>({
    resolver: zodResolver(createCharacterSchema),
    defaultValues: {
      name: character?.name || "",
      description: character?.description || "",
      basePrompt: character?.basePrompt || "",
      negativePrompt: character?.negativePrompt || "",
      imageUrl: character?.imageUrl || "",
      tags: character?.tags ?? [],
      isPublic: character?.isPublic || false,
      isShared: character?.isShared || false,
      category: character?.category || "User Characters/Female",
      source: character?.source || "User",
      age: character?.age ?? 20,
      baseModel: character?.baseModel ?? "none",
      steps: character?.steps ?? undefined,
      cfgScale: character?.cfgScale ? character.cfgScale / 10 : undefined, // Convert back from integer storage
      seed: character?.seed ?? undefined,
      loras: character?.loras ?? [],
    },
  });

  // Reset form when character changes (for editing)
  useEffect(() => {
    if (character) {
      form.reset({
        name: character.name || "",
        description: character.description || "",
        basePrompt: character.basePrompt || "",
        negativePrompt: character.negativePrompt || "",
        imageUrl: character.imageUrl || "",
        tags: character.tags ?? [],
        isPublic: character.isPublic || false,
        isShared: character.isShared || false,
        category: character.category || "User Characters/Female",
        source: character.source || "User",
        age: character.age ?? 20,
        baseModel: character.baseModel ?? "none",
        steps: character.steps ?? undefined,
        cfgScale: character.cfgScale ? character.cfgScale / 10 : undefined,
        seed: character.seed ?? undefined,
        loras: character.loras ?? [],
      });
    }
  }, [character, form]);

  const createMutation = useMutation({
    mutationFn: async (data: CreateCharacterForm) => {
      // Convert CFG scale to integer for storage (multiply by 10)
      const processedData = {
        ...data,
        cfgScale: data.cfgScale ? Math.round(data.cfgScale * 10) : undefined,
        baseModel: data.baseModel === "none" ? undefined : data.baseModel, // Convert "none" to undefined
      };
      
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processedData),
      });
      if (!response.ok) throw new Error("Failed to create character");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({ title: "Character created successfully!" });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create character", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CreateCharacterForm) => {
      // Convert CFG scale to integer for storage (multiply by 10)
      const processedData = {
        ...data,
        cfgScale: data.cfgScale ? Math.round(data.cfgScale * 10) : undefined,
        baseModel: data.baseModel === "none" ? undefined : data.baseModel, // Convert "none" to undefined
      };
      
      const response = await fetch(`/api/characters/${character!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processedData),
      });
      if (!response.ok) throw new Error("Failed to update character");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({ title: "Character updated successfully!" });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update character", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const onSubmit = (data: CreateCharacterForm) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-character-form">
      <DialogHeader>
        <DialogTitle>
          {isEditing ? "Edit Character" : "Create New Character"}
        </DialogTitle>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Character name" {...field} data-testid="input-character-name" />
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
                    placeholder="Brief description of the character"
                    className="resize-none"
                    rows={3}
                    {...field}
                    value={field.value || ""}
                    data-testid="input-character-description"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <FormControl>
                  <TagsInput
                    value={field.value || []}
                    onChange={field.onChange}
                    placeholder="Add tags..."
                    data-testid="input-character-tags"
                  />
                </FormControl>
                <FormDescription>
                  Add tags to help categorize and find this character (e.g., fantasy, anime, realistic)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-character-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(form.watch("source") === "User" ? USER_CATEGORIES : CIVITAI_CATEGORIES).map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose which category this character belongs to
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Age: {field.value || 25} years old</FormLabel>
                <FormControl>
                  <Slider
                    min={21}
                    max={45}
                    step={1}
                    value={[field.value || 25]}
                    onValueChange={(values) => field.onChange(values[0])}
                    className="w-full"
                    data-testid="slider-character-age"
                  />
                </FormControl>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>21</span>
                  <span>45</span>
                </div>
                <FormDescription>
                  Set the character's age for prompt generation (e.g., "25yo")
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="basePrompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base Prompt *</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="The main prompt that defines this character's appearance and style"
                    className="resize-none"
                    rows={4}
                    {...field}
                    data-testid="input-character-prompt"
                  />
                </FormControl>
                <FormDescription>
                  This prompt will be used as the foundation for generating images of this character
                </FormDescription>
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
                    placeholder="Things to avoid in the generation"
                    className="resize-none"
                    rows={3}
                    {...field}
                    value={field.value || ""}
                    data-testid="input-character-negative"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator className="my-6" />
          
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <h3 className="text-sm font-medium">Generation Settings (Optional)</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              These settings will be automatically applied when using this character for generation
            </p>

            <FormField
              control={form.control}
              name="baseModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Model</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-character-model">
                        <SelectValue placeholder="Select a model (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60">
                      <SelectItem value="none">No specific model</SelectItem>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{model.name}</span>
                            <span className="text-xs text-slate-400">
                              {model.type} • {model.baseModel}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="loras"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>LoRAs</FormLabel>
                  <FormControl>
                    <LoRASelector
                      selectedLoras={field.value || []}
                      onLorasChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    LoRAs attached here are applied automatically whenever this character is used for generation
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
                        data-testid="input-character-steps"
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
                        data-testid="input-character-cfg"
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
                        data-testid="input-character-seed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <CharacterImageSelector character={character} form={form} />

          {currentUser?.isAdmin && (
            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Public Character</FormLabel>
                    <FormDescription>
                      Allow other users to use this character (Admin only)
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value || false}
                      onCheckedChange={field.onChange}
                      data-testid="switch-character-public"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="isShared"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Share to Community</FormLabel>
                  <FormDescription>
                    Share this character to the community shared library
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value || false}
                    onCheckedChange={field.onChange}
                    data-testid="switch-character-shared"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-character"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : (isEditing ? "Update" : "Create")}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

const CIVITAI_CATEGORIES = [
  "CivitAI Characters/Female",
  "CivitAI Characters/Male", 
  "CivitAI Characters/Couples",
  "CivitAI Characters/Other"
];

const USER_CATEGORIES = [
  "User Characters/Female",
  "User Characters/Male", 
  "User Characters/Couples",
  "User Characters/Other"
];

export default function Characters() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>();
  const [selectedLibrary, setSelectedLibrary] = useState<"civitai" | "user" | "shared">("user");
  const [selectedCategory, setSelectedCategory] = useState("User Characters/Female");
  const [hiddenCivitAI, setHiddenCivitAI] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: allCharacters = [], isLoading } = useQuery<Character[]>({
    queryKey: ["/api/characters"],
  });

  // Separate CivitAI and User characters
  const civitaiCharacters = allCharacters.filter(char => 
    (char.source || "CivitAI") === "CivitAI" && 
    !hiddenCivitAI.includes(char.id)
  );
  const userCharacters = allCharacters.filter(char => 
    (char.source || "CivitAI") === "User"
  );
  const sharedCharacters = allCharacters.filter(char => 
    char.isShared === true
  );

  // Get current library characters
  const currentCharacters = selectedLibrary === "civitai" ? civitaiCharacters : 
                           selectedLibrary === "user" ? userCharacters : 
                           sharedCharacters;
  const currentCategories = selectedLibrary === "civitai" ? CIVITAI_CATEGORIES : USER_CATEGORIES;

  // Filter by selected category
  const characters = currentCharacters.filter(char => 
    (char.category || (selectedLibrary === "civitai" ? "CivitAI Characters/Female" : "User Characters/Female")) === selectedCategory
  );

  // Group characters by category for folder display
  const charactersByCategory = currentCharacters.reduce((acc, char) => {
    const category = char.category || (selectedLibrary === "civitai" ? "CivitAI Characters/Female" : "User Characters/Female");
    if (!acc[category]) acc[category] = [];
    acc[category].push(char);
    return acc;
  }, {} as Record<string, Character[]>);

  // Effect to update selected category when switching libraries
  useEffect(() => {
    if (selectedLibrary === "civitai") {
      setSelectedCategory("CivitAI Characters/Female");
    } else {
      setSelectedCategory("User Characters/Female");
    }
  }, [selectedLibrary]);

  const { data: models = [] } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/characters/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete character");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({ title: "Character deleted successfully!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete character", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleEdit = (character: Character) => {
    setEditingCharacter(character);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this character?")) {
      deleteMutation.mutate(id);
    }
  };

  const toggleSharedMutation = useMutation({
    mutationFn: async ({ id, isShared }: { id: string; isShared: boolean }) => {
      const response = await apiRequest("PATCH", `/api/characters/${id}/shared`, { isShared });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({
        title: "Character updated",
        description: "Character sharing status has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update character sharing status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleToggleShared = (id: string, isShared: boolean) => {
    toggleSharedMutation.mutate({ id, isShared });
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCharacter(undefined);
  };

  const handleSelect = (character: Character) => {
    // Store character selection in localStorage for generation panel to pick up
    localStorage.setItem('generationPanel_selectedCharacter', JSON.stringify(character));
    
    // Build character prompt with age if available
    if (character.basePrompt) {
      let prompt = character.basePrompt;
      if (character.age) {
        prompt += `, ${character.age}yo`;
      }
      localStorage.setItem('generationPanel_prompt', JSON.stringify(prompt));
    }
    
    // Save all character generation settings to localStorage for immediate application
    if (character.negativePrompt) {
      localStorage.setItem('generationPanel_negativePrompt', JSON.stringify(character.negativePrompt));
    }
    
    if (character.baseModel) {
      localStorage.setItem('generationPanel_modelId', JSON.stringify(character.baseModel));
    }
    
    if (character.steps) {
      localStorage.setItem('generationPanel_steps', JSON.stringify(character.steps));
    }
    
    if (character.cfgScale) {
      // Convert from integer storage (stored as *10) to actual decimal value
      localStorage.setItem('generationPanel_cfgScale', JSON.stringify(character.cfgScale / 10));
    }
    
    if (character.seed) {
      localStorage.setItem('generationPanel_seed', JSON.stringify(character.seed));
    }
    
    if (character.loras && character.loras.length > 0) {
      localStorage.setItem('generationPanel_loras', JSON.stringify(character.loras));
    }
    
    toast({ 
      title: "Character Selected", 
      description: `"${character.name}" has been selected for generation with all settings applied.` 
    });
    
    // Navigate to generate page where generation panel will load the character
    setLocation('/generate');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading characters...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <div className="flex items-start gap-2 sm:gap-4 mb-6 sm:mb-8">
        <Link href="/generate">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2" data-testid="heading-characters">Characters</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Browse character collections by category
              </p>
            </div>
            
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  onClick={() => setEditingCharacter(undefined)} 
                  data-testid="button-create-character"
                  className="w-full sm:w-auto shrink-0"
                  size="sm"
                >
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline ml-2">Create Character</span>
                  <span className="sm:hidden">Create</span>
                </Button>
              </DialogTrigger>
              <CharacterDialog character={editingCharacter} onClose={handleCloseDialog} />
            </Dialog>
          </div>
        </div>
      </div>

      {/* Library Selection */}
      <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant={selectedLibrary === "civitai" ? "default" : "outline"}
            onClick={() => setSelectedLibrary("civitai")}
            className="flex items-center justify-center gap-2 text-xs sm:text-sm px-3 py-2"
            data-testid="button-library-civitai"
            size="sm"
          >
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">CivitAI Characters ({civitaiCharacters.length})</span>
            <span className="sm:hidden">CivitAI ({civitaiCharacters.length})</span>
          </Button>
          <Button
            variant={selectedLibrary === "user" ? "default" : "outline"}
            onClick={() => setSelectedLibrary("user")}
            className="flex items-center justify-center gap-2 text-xs sm:text-sm px-3 py-2"
            data-testid="button-library-user"
            size="sm"
          >
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">User Characters ({userCharacters.length})</span>
            <span className="sm:hidden">User ({userCharacters.length})</span>
          </Button>
          <Button
            variant={selectedLibrary === "shared" ? "default" : "outline"}
            onClick={() => setSelectedLibrary("shared")}
            className="flex items-center justify-center gap-2 text-xs sm:text-sm px-3 py-2"
            data-testid="button-library-shared"
            size="sm"
          >
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Shared Characters ({sharedCharacters.length})</span>
            <span className="sm:hidden">Shared ({sharedCharacters.length})</span>
          </Button>
        </div>

        {/* Category Navigation */}
        <div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {currentCategories.map(category => {
              const count = charactersByCategory[category]?.length || 0;
              return (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  onClick={() => setSelectedCategory(category)}
                  className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2"
                  data-testid={`button-category-${category.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                  size="sm"
                >
                  <span className="truncate">{category.split('/').pop()} ({count})</span>
                </Button>
              );
            })}
          </div>
          <div className="mt-3 text-xs sm:text-sm text-slate-400">
            Currently viewing: <span className="text-white font-medium text-xs sm:text-sm">{selectedCategory}</span>
          </div>
        </div>
      </div>

      {characters.length === 0 ? (
        <Card className="text-center py-12" data-testid="card-empty-characters">
          <CardContent>
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No characters yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first character to start building consistent prompts
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingCharacter(undefined)} data-testid="button-create-first-character">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Character
                </Button>
              </DialogTrigger>
              <CharacterDialog character={editingCharacter} onClose={handleCloseDialog} />
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onEdit={selectedLibrary === "user" ? handleEdit : undefined}
              onDelete={selectedLibrary === "user" ? handleDelete : undefined}
              onSelect={handleSelect}
              onHide={selectedLibrary === "civitai" ? (id) => setHiddenCivitAI(prev => [...prev, id]) : undefined}
              onToggleShared={selectedLibrary === "user" ? handleToggleShared : undefined}
              canEdit={selectedLibrary === "user"}
              models={models}
            />
          ))}
        </div>
      )}
    </div>
  );
}