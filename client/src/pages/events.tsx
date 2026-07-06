import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X, ChevronDown, ChevronUp, Save, Trash2, Edit, Play, ArrowUp, ArrowDown, Copy, Heart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event, EventStep, FavoritePromptWord, InsertEvent, InsertEventStep, InsertFavoritePromptWord } from "@shared/schema";

const createEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

const createStepSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  wordsToAdd: z.array(z.string()).default([]),
  wordsToRemove: z.array(z.string()).default([]),
});

const createFavoriteWordSchema = z.object({
  word: z.string().min(1, "Word is required"),
  category: z.string().optional(),
});

type CreateEventForm = z.infer<typeof createEventSchema>;
type CreateStepForm = z.infer<typeof createStepSchema>;
type CreateFavoriteWordForm = z.infer<typeof createFavoriteWordSchema>;

function EventStepCard({ step, eventId, onUpdate, steps, stepIndex }: {
  step: EventStep;
  eventId: string;
  onUpdate: () => void;
  steps: EventStep[];
  stepIndex: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateStepForm>({
    resolver: zodResolver(createStepSchema),
    defaultValues: {
      title: step.title,
      description: step.description || "",
      wordsToAdd: step.wordsToAdd || [],
      wordsToRemove: step.wordsToRemove || [],
    },
  });

  // Handle string arrays manually instead of useFieldArray
  const [wordsToAdd, setWordsToAdd] = useState<string[]>(step.wordsToAdd || []);
  const [wordsToRemove, setWordsToRemove] = useState<string[]>(step.wordsToRemove || []);
  const [newAddWord, setNewAddWord] = useState("");
  const [newRemoveWord, setNewRemoveWord] = useState("");

  // Update form values when arrays change
  useEffect(() => {
    form.setValue("wordsToAdd", wordsToAdd);
    form.setValue("wordsToRemove", wordsToRemove);
  }, [wordsToAdd, wordsToRemove, form]);

  const updateMutation = useMutation({
    mutationFn: (data: CreateStepForm) => 
      apiRequest("PUT", `/api/events/${eventId}/steps/${step.id}`, data),
    onSuccess: () => {
      toast({ title: "Step updated successfully" });
      setIsEditing(false);
      onUpdate();
    },
    onError: () => {
      toast({ title: "Failed to update step", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${eventId}/steps/${step.id}`),
    onSuccess: () => {
      toast({ title: "Step deleted successfully" });
      onUpdate();
    },
    onError: () => {
      toast({ title: "Failed to delete step", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (newStepIds: string[]) => 
      apiRequest("PUT", `/api/events/${eventId}/steps/reorder`, { stepIds: newStepIds }),
    onSuccess: () => {
      toast({ title: "Steps reordered successfully" });
      onUpdate();
    },
    onError: () => {
      toast({ title: "Failed to reorder steps", variant: "destructive" });
    },
  });

  const moveStepUp = () => {
    if (stepIndex > 0) {
      const newStepIds = [...steps.map(s => s.id)];
      [newStepIds[stepIndex], newStepIds[stepIndex - 1]] = [newStepIds[stepIndex - 1], newStepIds[stepIndex]];
      reorderMutation.mutate(newStepIds);
    }
  };

  const moveStepDown = () => {
    if (stepIndex < steps.length - 1) {
      const newStepIds = [...steps.map(s => s.id)];
      [newStepIds[stepIndex], newStepIds[stepIndex + 1]] = [newStepIds[stepIndex + 1], newStepIds[stepIndex]];
      reorderMutation.mutate(newStepIds);
    }
  };

  const onSubmit = (data: CreateStepForm) => {
    updateMutation.mutate(data);
  };

  return (
    <Card className="bg-dark-card border-dark-border">
      <CardHeader className="pb-3 px-3 sm:px-6">
        {/* Mobile-friendly step header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-400">Step {step.stepNumber}</span>
            <Badge variant="outline" className="text-xs">
              {step.wordsToAdd?.length || 0} to add, {step.wordsToRemove?.length || 0} to remove
            </Badge>
          </div>
          {/* Mobile-optimized button group with larger tap targets */}
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {/* Reordering buttons */}
            <Button
              variant="ghost"
              size="sm"
              onClick={moveStepUp}
              disabled={stepIndex === 0 || reorderMutation.isPending}
              className="text-blue-400 hover:text-blue-300 disabled:opacity-50 h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-move-step-up-${step.id}`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={moveStepDown}
              disabled={stepIndex === steps.length - 1 || reorderMutation.isPending}
              className="text-blue-400 hover:text-blue-300 disabled:opacity-50 h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-move-step-down-${step.id}`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditing(!isEditing);
                if (!isEditing) {
                  setIsExpanded(true); // Auto-expand when entering edit mode
                }
              }}
              className="h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-edit-step-${step.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              className="text-red-400 hover:text-red-300 h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-delete-step-${step.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-expand-step-${step.id}`}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <CardTitle className="text-base sm:text-lg">{step.title}</CardTitle>
        {step.description && (
          <p className="text-sm text-slate-400">{step.description}</p>
        )}
      </CardHeader>

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleContent>
          <CardContent className="pt-0 px-3 sm:px-6">
            {isEditing ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-step-title" />
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
                          <Textarea {...field} data-testid="input-step-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <div>
                      <FormLabel>Words to Add</FormLabel>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={newAddWord}
                            onChange={(e) => setNewAddWord(e.target.value)}
                            placeholder="Enter word or phrase"
                            className="bg-white border-gray-300 text-black flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newAddWord.trim()) {
                                e.preventDefault();
                                setWordsToAdd([...wordsToAdd, newAddWord.trim()]);
                                setNewAddWord("");
                              }
                            }}
                            data-testid="input-new-add-word"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (newAddWord.trim()) {
                                setWordsToAdd([...wordsToAdd, newAddWord.trim()]);
                                setNewAddWord("");
                              }
                            }}
                            className="border-dark-border"
                            data-testid="button-add-word-to-add"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {wordsToAdd.map((word, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="bg-green-500/20 text-green-300 border-green-500/30"
                            >
                              {word}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setWordsToAdd(wordsToAdd.filter((_, i) => i !== index))}
                                className="ml-1 p-0 h-4 w-4 hover:bg-red-500/20"
                                data-testid={`button-remove-add-${index}`}
                              >
                                <X className="h-2 w-2" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <FormLabel>Words to Remove</FormLabel>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={newRemoveWord}
                            onChange={(e) => setNewRemoveWord(e.target.value)}
                            placeholder="Enter word or phrase to remove"
                            className="bg-white border-gray-300 text-black flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newRemoveWord.trim()) {
                                e.preventDefault();
                                setWordsToRemove([...wordsToRemove, newRemoveWord.trim()]);
                                setNewRemoveWord("");
                              }
                            }}
                            data-testid="input-new-remove-word"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (newRemoveWord.trim()) {
                                setWordsToRemove([...wordsToRemove, newRemoveWord.trim()]);
                                setNewRemoveWord("");
                              }
                            }}
                            className="border-dark-border"
                            data-testid="button-add-word-to-remove"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {wordsToRemove.map((word, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="bg-red-500/20 text-red-300 border-red-500/30"
                            >
                              {word}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setWordsToRemove(wordsToRemove.filter((_, i) => i !== index))}
                                className="ml-1 p-0 h-4 w-4 hover:bg-red-500/20"
                                data-testid={`button-remove-remove-${index}`}
                              >
                                <X className="h-2 w-2" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-step">
                      <Save className="h-4 w-4 mr-2" />
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            ) : (
              <div className="space-y-4">
                {(step.wordsToAdd?.length || 0) > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-green-400 mb-2">Words to Add:</h4>
                    <div className="flex flex-wrap gap-2">
                      {step.wordsToAdd?.map((word, index) => (
                        <Badge key={index} variant="outline" className="text-green-400 border-green-400">
                          +{word}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(step.wordsToRemove?.length || 0) > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-400 mb-2">Words to Remove:</h4>
                    <div className="flex flex-wrap gap-2">
                      {step.wordsToRemove?.map((word, index) => (
                        <Badge key={index} variant="outline" className="text-red-400 border-red-400">
                          -{word}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function EventCard({ event, onUpdate }: {
  event: Event;
  onUpdate: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const { data: steps = [] } = useQuery<EventStep[]>({
    queryKey: [`/api/events/${event.id}/steps`],
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${event.id}`),
    onSuccess: () => {
      toast({ title: "Event deleted successfully" });
      onUpdate();
    },
    onError: () => {
      toast({ title: "Failed to delete event", variant: "destructive" });
    },
  });

  const copyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/events/${event.id}/copy`),
    onSuccess: () => {
      toast({ title: "Event copied successfully" });
      onUpdate();
    },
    onError: () => {
      toast({ title: "Failed to copy event", variant: "destructive" });
    },
  });

  const saveWordsMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/events/${event.id}/save-words`),
    onSuccess: (data: any) => {
      toast({ 
        title: "Words saved to favorites", 
        description: data.message 
      });
    },
    onError: () => {
      toast({ 
        title: "Failed to save words", 
        variant: "destructive" 
      });
    },
  });

  return (
    <Card className="bg-dark-card border-dark-border">
      <CardHeader className="px-3 sm:px-6">
        {/* Mobile-friendly event header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={event.isActive ? "default" : "secondary"}>
              {event.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge variant="outline">{steps.length} steps</Badge>
          </div>
          {/* Mobile-optimized button group with larger tap targets */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => saveWordsMutation.mutate()}
              disabled={saveWordsMutation.isPending}
              className="text-pink-400 hover:text-pink-300 h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-save-words-${event.id}`}
            >
              <Heart className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyMutation.mutate()}
              disabled={copyMutation.isPending}
              className="text-blue-400 hover:text-blue-300 h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-copy-event-${event.id}`}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              className="text-red-400 hover:text-red-300 h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-delete-event-${event.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-9 w-9 p-0 sm:h-8 sm:w-8"
              data-testid={`button-expand-event-${event.id}`}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <CardTitle className="text-lg sm:text-xl">{event.title}</CardTitle>
        {event.description && (
          <p className="text-sm sm:text-base text-slate-400">{event.description}</p>
        )}
      </CardHeader>

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleContent>
          <CardContent className="px-3 sm:px-6">
            <div className="space-y-4">
              {steps.map((step, index) => (
                <EventStepCard
                  key={step.id}
                  step={step}
                  eventId={event.id}
                  onUpdate={onUpdate}
                  steps={steps}
                  stepIndex={index}
                />
              ))}
              
              <AddStepDialog eventId={event.id} onUpdate={onUpdate} />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function AddStepDialog({ eventId, onUpdate }: {
  eventId: string;
  onUpdate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateStepForm>({
    resolver: zodResolver(createStepSchema),
    defaultValues: {
      title: "",
      description: "",
      wordsToAdd: [],
      wordsToRemove: [],
    },
  });

  // Fetch existing steps to calculate available words to remove
  const { data: existingSteps = [] } = useQuery<EventStep[]>({
    queryKey: [`/api/events/${eventId}/steps`],
    enabled: open, // Only fetch when dialog is open
  });

  // Calculate words available to remove (from previous steps)
  const availableWordsToRemove = useMemo(() => {
    const cumulativeWords = new Set<string>();
    
    existingSteps.forEach(step => {
      // Add words from this step
      step.wordsToAdd?.forEach(word => cumulativeWords.add(word));
      // Remove words that were removed in this step
      step.wordsToRemove?.forEach(word => cumulativeWords.delete(word));
    });
    
    return Array.from(cumulativeWords).sort();
  }, [existingSteps]);

  // Handle string arrays manually instead of useFieldArray
  const [wordsToAdd, setWordsToAdd] = useState<string[]>([]);
  const [wordsToRemove, setWordsToRemove] = useState<string[]>([]);
  const [newAddWord, setNewAddWord] = useState("");
  const [newRemoveWord, setNewRemoveWord] = useState("");

  // Update form values when arrays change
  useEffect(() => {
    form.setValue("wordsToAdd", wordsToAdd);
    form.setValue("wordsToRemove", wordsToRemove);
  }, [wordsToAdd, wordsToRemove, form]);

  const createMutation = useMutation({
    mutationFn: (data: CreateStepForm) => 
      apiRequest("POST", `/api/events/${eventId}/steps`, data),
    onSuccess: () => {
      toast({ title: "Step created successfully" });
      setOpen(false);
      // Reset form and all state
      form.reset();
      setWordsToAdd([]);
      setWordsToRemove([]);
      setNewAddWord("");
      setNewRemoveWord("");
      onUpdate();
    },
    onError: () => {
      toast({ title: "Failed to create step", variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateStepForm) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full" data-testid="button-add-step">
          <Plus className="h-4 w-4 mr-2" />
          Add Step
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-dark-card border-dark-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto mx-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">Create New Step</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Title</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Step title" data-testid="input-new-step-title" className="text-base" />
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
                  <FormLabel className="text-sm">Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Step description" data-testid="input-new-step-description" className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <div>
                <FormLabel>Words to Add</FormLabel>
                <FormDescription>Words or phrases to add to the prompt at this step</FormDescription>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newAddWord}
                      onChange={(e) => setNewAddWord(e.target.value)}
                      placeholder="Enter word or phrase"
                      className="bg-white border-gray-300 text-black flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAddWord.trim()) {
                          e.preventDefault();
                          setWordsToAdd([...wordsToAdd, newAddWord.trim()]);
                          setNewAddWord("");
                        }
                      }}
                      data-testid="input-new-add-word"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (newAddWord.trim()) {
                          setWordsToAdd([...wordsToAdd, newAddWord.trim()]);
                          setNewAddWord("");
                        }
                      }}
                      className="border-dark-border"
                      data-testid="button-add-new-word-to-add"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {wordsToAdd.map((word, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="bg-green-500/20 text-green-300 border-green-500/30"
                      >
                        {word}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setWordsToAdd(wordsToAdd.filter((_, i) => i !== index))}
                          className="ml-1 p-0 h-4 w-4 hover:bg-red-500/20"
                          data-testid={`button-remove-new-add-${index}`}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <FormLabel>Words to Remove</FormLabel>
                <FormDescription>Words or phrases to remove from the prompt at this step</FormDescription>
                <div className="space-y-4">
                  {/* Show available words from previous steps */}
                  {availableWordsToRemove.length > 0 && (
                    <div>
                      <FormLabel className="text-sm text-slate-300">Available from Previous Steps</FormLabel>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-slate-800/30 rounded-md border border-slate-700 max-h-32 overflow-y-auto">
                        {availableWordsToRemove.map((word: string) => (
                          <label key={word} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-700/30 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={wordsToRemove.includes(word)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setWordsToRemove([...wordsToRemove, word]);
                                } else {
                                  setWordsToRemove(wordsToRemove.filter(w => w !== word));
                                }
                              }}
                              className="text-red-500 bg-slate-700 border-slate-600 rounded focus:ring-red-500"
                              data-testid={`checkbox-available-word-${word}`}
                            />
                            <span className="text-sm text-slate-300">{word}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Manual input section */}
                  <div>
                    <FormLabel className="text-sm text-slate-300">Or Add Manually</FormLabel>
                    <div className="flex gap-2">
                    <Input
                      value={newRemoveWord}
                      onChange={(e) => setNewRemoveWord(e.target.value)}
                      placeholder="Enter word or phrase to remove"
                      className="bg-white border-gray-300 text-black flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newRemoveWord.trim()) {
                          e.preventDefault();
                          setWordsToRemove([...wordsToRemove, newRemoveWord.trim()]);
                          setNewRemoveWord("");
                        }
                      }}
                      data-testid="input-new-remove-word"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (newRemoveWord.trim()) {
                          setWordsToRemove([...wordsToRemove, newRemoveWord.trim()]);
                          setNewRemoveWord("");
                        }
                      }}
                      className="border-dark-border"
                      data-testid="button-add-new-word-to-remove"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {wordsToRemove.map((word, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="bg-red-500/20 text-red-300 border-red-500/30"
                      >
                        {word}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setWordsToRemove(wordsToRemove.filter((_, i) => i !== index))}
                          className="ml-1 p-0 h-4 w-4 hover:bg-red-500/20"
                          data-testid={`button-remove-new-remove-${index}`}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-step" className="w-full sm:w-auto">
                {createMutation.isPending ? "Creating..." : "Create Step"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function FavoriteWordsManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: favoriteWords = [], isLoading } = useQuery<FavoritePromptWord[]>({
    queryKey: ["/api/favorite-words"],
  });

  const form = useForm<CreateFavoriteWordForm>({
    resolver: zodResolver(createFavoriteWordSchema),
    defaultValues: {
      word: "",
      category: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateFavoriteWordForm) => 
      apiRequest("POST", "/api/favorite-words", data),
    onSuccess: () => {
      toast({ title: "Favorite word added successfully" });
      setDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/favorite-words"] });
    },
    onError: () => {
      toast({ title: "Failed to add favorite word", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/favorite-words/${id}`),
    onSuccess: () => {
      toast({ title: "Favorite word deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/favorite-words"] });
    },
    onError: () => {
      toast({ title: "Failed to delete favorite word", variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateFavoriteWordForm) => {
    createMutation.mutate(data);
  };

  // Group words by category
  const groupedWords = favoriteWords.reduce((acc, word) => {
    const category = word.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(word);
    return acc;
  }, {} as Record<string, FavoritePromptWord[]>);

  return (
    <div className="space-y-6">
      {/* Mobile-friendly header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Favorite Prompt Words</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-favorite-word" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Favorite Word
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-dark-card border-dark-border w-[95vw] max-w-md sm:max-w-lg mx-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-lg">Add Favorite Word</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="word"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Word or Phrase</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter word or phrase" data-testid="input-favorite-word" className="text-base" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Category (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Quality, Style, Lighting" data-testid="input-favorite-category" className="text-base" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-favorite" className="w-full sm:w-auto">
                    {createMutation.isPending ? "Adding..." : "Add Word"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-slate-400">Loading favorite words...</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {Object.entries(groupedWords).map(([category, words]) => (
            <Card key={category} className="bg-dark-card border-dark-border">
              <CardHeader className="px-3 sm:px-6">
                <CardTitle className="text-base sm:text-lg">{category}</CardTitle>
                <p className="text-sm text-slate-400">{words.length} words</p>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="flex flex-wrap gap-2">
                  {words.map((word) => (
                    <div key={word.id} className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs sm:text-sm py-1">
                        {word.word}
                        {word.usage_count && word.usage_count > 0 && (
                          <span className="ml-2 text-xs text-slate-400">({word.usage_count})</span>
                        )}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(word.id)}
                        className="h-7 w-7 sm:h-6 sm:w-6 p-0 text-red-400 hover:text-red-300"
                        data-testid={`button-delete-favorite-${word.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Events() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const form = useForm<CreateEventForm>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: "",
      description: "",
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateEventForm) => apiRequest("POST", "/api/events", data),
    onSuccess: () => {
      toast({ title: "Event created successfully" });
      setDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: () => {
      toast({ title: "Failed to create event", variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateEventForm) => {
    createMutation.mutate(data);
  };

  const handleUpdate = () => {
    // Invalidate both events and all step queries
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        return Array.isArray(query.queryKey) && 
               typeof query.queryKey[0] === "string" &&
               query.queryKey[0].startsWith("/api/events/") && 
               query.queryKey[0].endsWith("/steps");
      }
    });
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Mobile-friendly header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="space-y-2">
            <Link href="/generate" data-testid="button-back-to-generate">
              <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Generate
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold">Events</h1>
            <p className="text-sm sm:text-base text-slate-400">Manage multi-step prompt building events and favorite words</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-event" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-dark-card border-dark-border w-[95vw] max-w-md sm:max-w-lg mx-auto">
              <DialogHeader>
                <DialogTitle className="text-white text-lg">Create New Event</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Title</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Event title" data-testid="input-event-title" className="text-base" />
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
                        <FormLabel className="text-sm">Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Event description" data-testid="input-event-description" className="text-base min-h-[100px]" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-event" className="w-full sm:w-auto">
                      {createMutation.isPending ? "Creating..." : "Create Event"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="events" className="space-y-6">
          <TabsList className="bg-dark-card border-dark-border">
            <TabsTrigger value="events" data-testid="tab-events">Events</TabsTrigger>
            <TabsTrigger value="favorites" data-testid="tab-favorites">Favorite Words</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-6">
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-slate-400">Loading events...</p>
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 mb-4">No events created yet</p>
                <Button onClick={() => setDialogOpen(true)} data-testid="button-create-first-event">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Event
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} onUpdate={handleUpdate} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="favorites">
            <FavoriteWordsManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}