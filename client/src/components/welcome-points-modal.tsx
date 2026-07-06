import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Coins, Share2, Heart, Zap } from "lucide-react";

interface WelcomePointsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WelcomePointsModal({ isOpen, onClose }: WelcomePointsModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "Welcome to CiviVerse! 🎉",
      icon: <Sparkles className="h-8 w-8 text-purple-500" />,
      content: (
        <div className="text-center space-y-4">
          <p className="text-lg text-muted-foreground">
            Get ready to create amazing AI art and earn rewards for sharing with our community!
          </p>
          <div className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-3 text-purple-700 dark:text-purple-300">
              How Our Point System Works
            </h3>
            <p className="text-sm text-purple-600 dark:text-purple-400">
              Learn how to create images and earn points back through community engagement!
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Creating Images Costs Points",
      icon: <Zap className="h-8 w-8 text-blue-500" />,
      content: (
        <div className="space-y-4">
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="p-6 text-center">
              <div className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Generation Cost</div>
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">12</div>
              <div className="text-sm text-muted-foreground">points per image</div>
            </CardContent>
          </Card>
          <p className="text-center text-muted-foreground">
            Each AI-generated image costs 12 points to create using our advanced models and LoRAs.
          </p>
        </div>
      )
    },
    {
      title: "Earn Points Back by Sharing!",
      icon: <Share2 className="h-8 w-8 text-green-500" />,
      content: (
        <div className="space-y-4">
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="p-6 text-center">
              <div className="text-green-600 dark:text-green-400 font-semibold mb-2">Share Reward</div>
              <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-2">6</div>
              <div className="text-sm text-muted-foreground">points when you share to community</div>
            </CardContent>
          </Card>
          <p className="text-center text-muted-foreground">
            Share your creations with the community and get 6 points back immediately!
          </p>
        </div>
      )
    },
    {
      title: "Get Likes, Earn More Points!",
      icon: <Heart className="h-8 w-8 text-red-500" />,
      content: (
        <div className="space-y-4">
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-6 text-center">
              <div className="text-red-600 dark:text-red-400 font-semibold mb-2">Like Reward</div>
              <div className="text-4xl font-bold text-red-600 dark:text-red-400 mb-2">1</div>
              <div className="text-sm text-muted-foreground">point for every like you receive</div>
            </CardContent>
          </Card>
          <p className="text-center text-muted-foreground">
            The more people like your shared images, the more points you earn back!
          </p>
        </div>
      )
    },
    {
      title: "Your Point Economy Summary",
      icon: <Coins className="h-8 w-8 text-yellow-500" />,
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-red-500" />
                <span className="font-medium text-red-700 dark:text-red-300">Create Image</span>
              </div>
              <Badge variant="destructive">-12 points</Badge>
            </div>
            
            <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Share2 className="h-5 w-5 text-green-500" />
                <span className="font-medium text-green-700 dark:text-green-300">Share to Community</span>
              </div>
              <Badge className="bg-green-600 hover:bg-green-700">+6 points</Badge>
            </div>
            
            <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Heart className="h-5 w-5 text-red-500" />
                <span className="font-medium text-red-700 dark:text-red-300">Receive Like</span>
              </div>
              <Badge className="bg-red-600 hover:bg-red-700">+1 point</Badge>
            </div>
          </div>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
            <p className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
              💡 Tip: Share your images and engage with the community to offset creation costs!
            </p>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = steps[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900">
            {currentStepData.icon}
          </div>
          <DialogTitle className="text-xl font-semibold">
            {currentStepData.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Learn about the CiviVerse point system and how to earn points back through community engagement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex justify-center space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index === currentStep
                    ? 'bg-purple-600'
                    : index < currentStep
                    ? 'bg-purple-300'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="min-h-[200px]">
            {currentStepData.content}
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="flex-1 mr-2"
              data-testid="button-previous-step"
            >
              Previous
            </Button>
            
            <Button
              onClick={handleNext}
              className="flex-1 ml-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              data-testid={currentStep === steps.length - 1 ? "button-start-creating" : "button-next-step"}
            >
              {currentStep === steps.length - 1 ? "Start Creating!" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}