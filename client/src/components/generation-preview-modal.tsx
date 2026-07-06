import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, AlertCircle, Send, X } from 'lucide-react';
import { Model, GenerationFormData } from '@/types';

interface GenerationPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  generationData: GenerationFormData;
  selectedModel: Model | null;
  isLoading: boolean;
}

export default function GenerationPreviewModal({
  isOpen,
  onClose,
  onApprove,
  generationData,
  selectedModel,
  isLoading
}: GenerationPreviewModalProps) {
  if (!selectedModel) return null;

  const estimatedCost = 5; // Buzz credits

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-dark-surface border-dark-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Send className="h-5 w-5 text-primary-500" />
            Review CivitAI Generation Request
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Model Information */}
          <Card className="bg-dark-bg border-dark-border">
            <CardHeader>
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Selected Model
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h3 className="font-medium text-white">{selectedModel.name}</h3>
                <div className="flex gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {selectedModel.type}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-slate-400">
                    {selectedModel.baseModel}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-yellow-500">
                    ⭐ {((selectedModel.rating || 0) / 10).toFixed(1)}
                  </Badge>
                </div>
              </div>
              {selectedModel.description && (
                <p className="text-sm text-slate-400 line-clamp-2">
                  {selectedModel.description.replace(/<[^>]*>/g, '').substring(0, 150)}...
                </p>
              )}
            </CardContent>
          </Card>

          {/* Generation Parameters */}
          <Card className="bg-dark-bg border-dark-border">
            <CardHeader>
              <CardTitle className="text-sm text-white">Generation Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Prompt */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Prompt</label>
                <div className="mt-1 p-3 bg-dark-surface rounded border border-dark-border">
                  <p className="text-sm text-white whitespace-pre-wrap">{generationData.prompt}</p>
                </div>
              </div>

              {/* Negative Prompt */}
              {generationData.negativePrompt && (
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Negative Prompt</label>
                  <div className="mt-1 p-3 bg-dark-surface rounded border border-dark-border">
                    <p className="text-sm text-slate-300">{generationData.negativePrompt}</p>
                  </div>
                </div>
              )}

              <Separator className="bg-dark-border" />

              {/* Technical Parameters */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Dimensions</label>
                    <p className="text-sm text-white">{generationData.width} × {generationData.height}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Steps</label>
                    <p className="text-sm text-white">{generationData.steps}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wide">CFG Scale</label>
                    <p className="text-sm text-white">{generationData.cfgScale}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Scheduler</label>
                    <p className="text-sm text-white">{generationData.scheduler}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Clip Skip</label>
                    <p className="text-sm text-white">{generationData.clipSkip}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Seed</label>
                    <p className="text-sm text-white">{generationData.seed === -1 ? 'Random' : generationData.seed}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost and API Information */}
          <Card className="bg-dark-bg border-dark-border">
            <CardHeader>
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                CivitAI API Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Estimated Cost:</span>
                <span className="text-sm text-white font-medium">{estimatedCost} Buzz Credits</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">API Endpoint:</span>
                <span className="text-xs text-slate-400 font-mono">civitai.com/api/v1/generate</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Model ID:</span>
                <span className="text-xs text-slate-400 font-mono">{selectedModel.civitaiId || selectedModel.id}</span>
              </div>
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
                <p className="text-xs text-yellow-400">
                  This will send a real generation request to CivitAI's API. Make sure you have sufficient Buzz credits in your CivitAI account.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="border-dark-border text-slate-300 hover:bg-dark-bg"
            data-testid="button-cancel-generation"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={onApprove}
            disabled={isLoading}
            className="bg-primary-600 hover:bg-primary-700 text-white"
            data-testid="button-approve-generation"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {isLoading ? 'Sending to CivitAI...' : 'Send to CivitAI'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}