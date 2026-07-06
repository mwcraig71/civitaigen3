import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface AIEnhancementResult {
  enhancedPrompt: string;
  negativePrompt?: string;
  explanation: string;
}

interface AIEnhancementDialogProps {
  aiEnhancementResult: AIEnhancementResult | null;
  setAiEnhancementResult: React.Dispatch<React.SetStateAction<AIEnhancementResult | null>>;
  handleAcceptAIEnhancement: () => void;
  handleRejectAIEnhancement: () => void;
}

export function AIEnhancementDialog({
  aiEnhancementResult,
  setAiEnhancementResult,
  handleAcceptAIEnhancement,
  handleRejectAIEnhancement,
}: AIEnhancementDialogProps) {
  return (
      <Dialog open={!!aiEnhancementResult} onOpenChange={() => setAiEnhancementResult(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              AI Enhanced Your Prompt
            </DialogTitle>
            <DialogDescription>
              {aiEnhancementResult?.explanation || 'AI has improved your prompt with suggestions.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Enhanced Prompt:</Label>
              <div className="mt-1 p-3 bg-muted/50 rounded-md border max-h-32 overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap">{aiEnhancementResult?.enhancedPrompt}</p>
              </div>
            </div>

            {aiEnhancementResult?.negativePrompt && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Enhanced Negative Prompt:</Label>
                <div className="mt-1 p-3 bg-muted/50 rounded-md border max-h-32 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{aiEnhancementResult?.negativePrompt}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleRejectAIEnhancement}>
              Keep Original
            </Button>
            <Button onClick={handleAcceptAIEnhancement} className="bg-purple-600 hover:bg-purple-700">
              <Sparkles className="w-4 h-4 mr-2" />
              Use Enhanced Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
