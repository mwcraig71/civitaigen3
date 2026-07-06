import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Zap } from "lucide-react";
import { Model } from "@shared/schema";
import { useQuery } from '@tanstack/react-query';

interface GenerationData {
  prompt: string;
  negativePrompt: string;
  modelId: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  scheduler: string;
  clipSkip: number;
  seed: number;
  quantity: number;
  loras: Array<{id: string; strength: number}>;
  // Event-specific data
  isEventBased?: boolean;
  eventTitle?: string;
  eventDescription?: string;
  originalPrompt?: string;
  firstStepTitle?: string;
  totalSteps?: number;
}

interface GenerationConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  generationData: GenerationData;
  model: Model | null;
  isSubmitting: boolean;
}

export function GenerationConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  generationData,
  model,
  isSubmitting
}: GenerationConfirmationModalProps) {
  // Calculate total images: for events it's steps × quantity, for normal it's just quantity
  const totalImages = generationData.isEventBased 
    ? (generationData.totalSteps || 1) * (generationData.quantity || 1)
    : (generationData.quantity || 1);
  
  const estimatedCost = totalImages * 2.7; // Approximate cost based on CivitAI pricing

  // Fetch all models to get LoRA details
  const { data: allModels = [] } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  // Get the complete model data (including ARN) from the full models list
  const completeModel = allModels.find(m => m.id === model?.id) || model;

  // Get LoRA models for the selected LoRAs
  const selectedLoraModels = (generationData.loras || []).map(lora => {
    const loraModel = allModels.find(model => model.id === lora.id);
    return { ...lora, model: loraModel };
  }).filter(lora => lora.model);

  // Build LoRA syntax string for display
  const loraSyntax = selectedLoraModels.map(lora => {
    const loraName = lora.model?.name?.replace(/\s+/g, '_') || lora.id;
    return `<lora:${loraName}:${lora.strength.toFixed(2)}>`;
  }).join(' ');

  // Full prompt with LoRA syntax included
  const fullPromptWithLoras = generationData.prompt + (loraSyntax ? ` ${loraSyntax}` : '');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[90vh] sm:h-auto sm:max-h-[90vh] bg-dark-card border-dark-border flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Zap className="h-5 w-5" />
            Confirm Generation
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {generationData.isEventBased 
              ? `Review your Event generation: ${generationData.totalSteps || 1} steps × ${generationData.quantity || 1} images = ${totalImages} total generations`
              : "Review your settings before submitting to CivitAI for generation"
            }
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Event Information */}
            {generationData.isEventBased && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white">Event Generation</h3>
                  <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      <h4 className="font-medium text-purple-300">{generationData.eventTitle}</h4>
                      <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-md">
                        {generationData.totalSteps} steps
                      </span>
                    </div>
                    {generationData.eventDescription && (
                      <p className="text-sm text-purple-200/80 mb-3">{generationData.eventDescription}</p>
                    )}
                    <div className="text-xs text-purple-300 space-y-1">
                      <div>• {generationData.totalSteps} steps × {generationData.quantity} images = {totalImages} total generations</div>
                      <div>• Sequential processing with 3-second delays</div>
                      <div>• Each step adds unique words to your prompt</div>
                    </div>
                  </div>
                </div>

                <Separator className="bg-dark-border" />
              </>
            )}

            {/* Model Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Selected Model</h3>
              <div className="bg-dark-bg rounded-lg p-4 border border-dark-border">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-white">{completeModel?.name || "Loading..."}</h4>
                    <p className="text-sm text-slate-400 mt-1 font-mono break-all">
                      ARN: {completeModel?.arn || "No ARN available"}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      Base Model: {completeModel?.baseModel} • Type: {completeModel?.type}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {completeModel?.rating}/50 rating
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {completeModel?.downloads?.toLocaleString()} downloads
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-dark-border" />

            {/* Prompt Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Prompts</h3>
              <div className="space-y-3">
                <div className="bg-dark-bg rounded-lg p-4 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    {generationData.isEventBased ? "Base Prompt + First Step" : "Positive Prompt"}
                    {loraSyntax && " (with LoRA weights)"}
                  </label>
                  {generationData.isEventBased && generationData.originalPrompt ? (
                    <div className="space-y-3 mt-1">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Original Prompt:</div>
                        <p className="text-sm text-slate-300 leading-relaxed">{generationData.originalPrompt}</p>
                      </div>
                      <div>
                        <div className="text-xs text-purple-400 mb-1">
                          + Step 1: {generationData.firstStepTitle}
                        </div>
                        <p className="text-sm text-white leading-relaxed">
                          {generationData.prompt}
                          {loraSyntax && (
                            <span className="text-purple-300 font-mono text-xs ml-1">{loraSyntax}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <p className="text-sm text-white leading-relaxed">
                        {generationData.prompt || "No prompt specified"}
                      </p>
                      {loraSyntax && (
                        <p className="text-sm text-purple-300 font-mono mt-2 leading-relaxed bg-purple-500/10 p-2 rounded">
                          {loraSyntax}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {generationData.negativePrompt && (
                  <div className="bg-dark-bg rounded-lg p-4 border border-dark-border">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Negative Prompt</label>
                    <p className="text-sm text-white mt-1 leading-relaxed">
                      {generationData.negativePrompt}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-dark-border" />

            {/* LoRA Models */}
            {selectedLoraModels.length > 0 && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white">LoRA Models ({selectedLoraModels.length})</h3>
                  <div className="space-y-3">
                    {selectedLoraModels.map((lora) => (
                      <div key={lora.id} className="bg-dark-bg rounded-lg p-4 border border-dark-border">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              {lora.model?.imageUrl && (
                                <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                                  <img
                                    src={lora.model.imageUrl}
                                    alt={lora.model.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div>
                                <h4 className="font-medium text-white text-sm">{lora.model?.name}</h4>
                                <p className="text-xs text-slate-400">{lora.model?.baseModel}</p>
                              </div>
                            </div>
                            {lora.model?.activationWords && lora.model.activationWords.length > 0 && (
                              <div className="mt-3">
                                <label className="text-xs text-slate-400 uppercase tracking-wide">Activation Words</label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {lora.model.activationWords.slice(0, 5).map((word: string, index: number) => (
                                    <Badge 
                                      key={index} 
                                      variant="outline" 
                                      className="text-xs py-0 px-2 bg-blue-500/10 border-blue-500/20 text-blue-300"
                                    >
                                      {word}
                                    </Badge>
                                  ))}
                                  {lora.model.activationWords.length > 5 && (
                                    <span className="text-xs text-slate-400">+{lora.model.activationWords.length - 5} more</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="text-right ml-4">
                            <label className="text-xs text-slate-400 uppercase tracking-wide">Strength</label>
                            <p className="text-sm font-medium text-white">{lora.strength.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="bg-dark-border" />
              </>
            )}

            {/* Generation Parameters */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Generation Parameters</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Dimensions</label>
                  <p className="text-sm text-white">{generationData.width} × {generationData.height}</p>
                </div>
                <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Steps</label>
                  <p className="text-sm text-white">{generationData.steps}</p>
                </div>
                <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">CFG Scale</label>
                  <p className="text-sm text-white">{generationData.cfgScale}</p>
                </div>
                <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Scheduler</label>
                  <p className="text-sm text-white">{generationData.scheduler}</p>
                </div>
                <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    {generationData.isEventBased ? "Total Images" : "Quantity"}
                  </label>
                  {generationData.isEventBased ? (
                    <div>
                      <p className="text-sm text-white">{totalImages} Total Images</p>
                      <p className="text-xs text-slate-400">{generationData.totalSteps} steps × {generationData.quantity} images</p>
                    </div>
                  ) : (
                    <p className="text-sm text-white">{generationData.quantity || 1} {(generationData.quantity || 1) === 1 ? 'Image' : 'Images'}</p>
                  )}
                </div>
                <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">CLIP Skip</label>
                  <p className="text-sm text-white">{generationData.clipSkip}</p>
                </div>
                <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Seed</label>
                  <p className="text-sm text-white">{generationData.seed === -1 ? "Random" : generationData.seed}</p>
                </div>
              </div>
            </div>

            <Separator className="bg-dark-border" />

            {/* Cost Estimation */}
            <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-amber-400">Estimated Cost</h4>
                  <p className="text-xs text-amber-300/80">
                    Based on CivitAI pricing ({totalImages} total {totalImages === 1 ? 'generation' : 'generations'})
                  </p>
                  {generationData.isEventBased && (
                    <p className="text-xs text-orange-400 mt-1">
                      ⚠️ Event processing will charge for each step individually
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-amber-400">~{estimatedCost.toFixed(1)} Buzz</p>
                  <p className="text-xs text-amber-300/70">~2.7 Buzz per generation</p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-dark-border flex-shrink-0 bg-dark-card">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 border-dark-border hover:bg-dark-bg"
            data-testid="button-cancel-generation"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            data-testid="button-confirm-generation"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Generate Image
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}