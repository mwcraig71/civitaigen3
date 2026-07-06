import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Edit3, Check, AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface EventStep {
  stepNumber: number;
  stepTitle: string;
  originalPrompt: string;
  editedPrompt: string;
  hasChanges: boolean;
}

interface EventPromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (editedSteps: EventStep[]) => void;
  eventTitle: string;
  eventDescription?: string;
  steps: EventStep[];
  basePrompt: string;
}

export function EventPromptEditor({
  isOpen,
  onClose,
  onConfirm,
  eventTitle,
  eventDescription,
  steps: initialSteps,
  basePrompt
}: EventPromptEditorProps) {
  const [steps, setSteps] = useState<EventStep[]>(initialSteps);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // Sync steps with props when they change
  React.useEffect(() => {
    setSteps(initialSteps);
    setCurrentStepIndex(0); // Reset to first step when new event is loaded
  }, [initialSteps]);

  // Reset processing state when dialog closes
  React.useEffect(() => {
    if (!isOpen) {
      setIsProcessing(false);
      setIsTextareaFocused(false);
    }
  }, [isOpen]);

  const currentStep = steps[currentStepIndex];
  const totalSteps = steps.length;

  const updateStepPrompt = (stepIndex: number, newPrompt: string) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex 
        ? { 
            ...step, 
            editedPrompt: newPrompt,
            hasChanges: newPrompt !== step.originalPrompt
          }
        : step
    ));
  };

  const resetStepPrompt = (stepIndex: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex 
        ? { 
            ...step, 
            editedPrompt: step.originalPrompt,
            hasChanges: false
          }
        : step
    ));
  };

  const goToNextStep = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm(steps);
      // Reset processing state after successful completion
      setIsProcessing(false);
      onClose(); // Close the dialog
    } catch (error) {
      console.error('Error processing event prompts:', error);
      setIsProcessing(false); // Reset on error too
    }
  };

  const totalChanges = steps.filter(step => step.hasChanges).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-dark-card border-dark-border">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="text-white flex items-center gap-2 text-lg">
            <Edit3 className="h-4 w-4 text-purple-400" />
            Edit Prompts
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-2">
          {/* Event Info */}
          <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
              <h3 className="font-medium text-purple-300">{eventTitle}</h3>
              <Badge variant="outline" className="text-purple-300 border-purple-400">
                {totalSteps} steps
              </Badge>
              {totalChanges > 0 && (
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 border-amber-400">
                  {totalChanges} edited
                </Badge>
              )}
            </div>
            {eventDescription && (
              <p className="text-sm text-purple-200/80">{eventDescription}</p>
            )}
          </div>

          {/* Step Navigation */}
          <div className="flex items-center justify-between border-b border-dark-border pb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousStep}
                disabled={currentStepIndex === 0}
                className="border-dark-border hover:bg-dark-hover"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextStep}
                disabled={currentStepIndex === totalSteps - 1}
                className="border-dark-border hover:bg-dark-hover"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="text-center">
              <div className="text-lg font-medium text-white">
                Step {currentStepIndex + 1} of {totalSteps}
              </div>
              <div className="text-sm text-purple-300">{currentStep?.stepTitle}</div>
            </div>
            
            <div className="flex items-center gap-2">
              {currentStep?.hasChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetStepPrompt(currentStepIndex)}
                  className="text-slate-400 hover:text-white"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Current Step Prompt Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-purple-400">
                Step {currentStepIndex + 1}: {currentStep?.stepTitle}
              </label>
              {currentStep?.hasChanges && (
                <div className="flex items-center gap-1 text-xs text-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  Modified
                </div>
              )}
            </div>
            <Textarea
              value={currentStep?.editedPrompt || ''}
              onChange={(e) => updateStepPrompt(currentStepIndex, e.target.value)}
              onFocus={() => setIsTextareaFocused(true)}
              onBlur={() => setIsTextareaFocused(false)}
              className="min-h-[400px] sm:min-h-[300px] bg-dark-bg border-dark-border text-white placeholder:text-slate-500 resize-none text-sm leading-relaxed"
              placeholder="Enter the prompt for this step..."
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Characters: {currentStep?.editedPrompt?.length || 0}</span>
              <span className="text-purple-400">Review and modify the prompt before generation</span>
            </div>
          </div>

          {/* Step Progress Indicators */}
          <div className="flex gap-2 mt-4">
            {steps.map((step, index) => (
              <button
                key={index}
                onClick={() => setCurrentStepIndex(index)}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  index === currentStepIndex
                    ? 'bg-purple-500'
                    : step.hasChanges
                    ? 'bg-amber-500'
                    : index < currentStepIndex
                    ? 'bg-green-500'
                    : 'bg-dark-border'
                }`}
                title={`Step ${index + 1}: ${step.stepTitle}${step.hasChanges ? ' (Modified)' : ''}`}
              />
            ))}
          </div>
        </div>

        {!isTextareaFocused && (
          <DialogFooter className="flex-shrink-0 flex items-center justify-between pt-4 border-t border-dark-border">
            <div className="text-sm text-slate-400">
              {totalChanges > 0 ? (
                <span className="text-amber-300">
                  {totalChanges} step{totalChanges === 1 ? '' : 's'} modified
                </span>
              ) : (
                'No changes made'
              )}
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isProcessing}
                className="border-dark-border hover:bg-dark-hover"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isProcessing}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isProcessing ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Continue to Generation
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}