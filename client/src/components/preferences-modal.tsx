import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Heart, Sparkles, Mail } from 'lucide-react';

export interface UserPreferences {
  breastSize: number; // 1-5 scale (small to huge)
  assSize: number;    // 1-5 scale (small to huge)
  emailNotifications: boolean; // Email opt-in preference
}

interface PreferencesModalProps {
  isOpen: boolean;
  onComplete: (preferences: UserPreferences) => void;
}

const getSizeLabel = (value: number): string => {
  switch (value) {
    case 1: return 'Small';
    case 2: return 'Medium';
    case 3: return 'Large';
    case 4: return 'Extra Large';
    case 5: return 'Huge';
    default: return 'Medium';
  }
};

const getSizeDescription = (type: 'breast' | 'ass', value: number): string => {
  if (type === 'breast') {
    switch (value) {
      case 1: return 'A-B cup, petite and natural';
      case 2: return 'C cup, perfectly proportioned';
      case 3: return 'D cup, full and shapely';
      case 4: return 'DD-E cup, voluptuous curves';
      case 5: return 'F+ cup, impressively large';
      default: return 'C cup, perfectly proportioned';
    }
  } else {
    switch (value) {
      case 1: return 'Petite and tight, athletic build';
      case 2: return 'Nicely shaped, balanced curves';
      case 3: return 'Full and round, curvy figure';
      case 4: return 'Voluptuous and shapely';
      case 5: return 'Exceptionally curvy and full';
      default: return 'Nicely shaped, balanced curves';
    }
  }
};

export function PreferencesModal({ isOpen, onComplete }: PreferencesModalProps) {
  const [breastSize, setBreastSize] = useState<number>(3); // Default to Large
  const [assSize, setAssSize] = useState<number>(3);       // Default to Large
  const [emailNotifications, setEmailNotifications] = useState<boolean>(false); // Default to opt-out for user choice

  const handleComplete = () => {
    const preferences: UserPreferences = {
      breastSize,
      assSize,
      emailNotifications
    };
    onComplete(preferences);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-md mx-auto bg-dark-card border-dark-border rounded-xl"
        data-testid="preferences-modal"
      >
        <DialogHeader className="text-center pb-4">
          <DialogTitle className="flex items-center justify-center gap-2 text-white text-xl">
            <Heart className="h-5 w-5 text-pink-400" />
            Personalize Your Experience
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Welcome to CiviVerse! Let's customize your experience
          </DialogDescription>
        </DialogHeader>

        <Separator className="bg-dark-border" />

        <div className="space-y-6 py-4">
          {/* Breast Size Preference */}
          <Card className="border-dark-border bg-dark-bg">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-white font-medium mb-2">Preferred Breast Size</h3>
                  <div className="text-pink-400 text-lg font-semibold" data-testid="breast-size-label">
                    {getSizeLabel(breastSize)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {getSizeDescription('breast', breastSize)}
                  </p>
                </div>
                
                <div className="px-3">
                  <Slider
                    value={[breastSize]}
                    onValueChange={(value) => setBreastSize(value[0])}
                    min={1}
                    max={5}
                    step={1}
                    className="w-full"
                    data-testid="breast-size-slider"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-2">
                    <span>Small</span>
                    <span>Medium</span>
                    <span>Large</span>
                    <span>XL</span>
                    <span>Huge</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ass Size Preference */}
          <Card className="border-dark-border bg-dark-bg">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-white font-medium mb-2">Preferred Ass Size</h3>
                  <div className="text-purple-400 text-lg font-semibold" data-testid="ass-size-label">
                    {getSizeLabel(assSize)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {getSizeDescription('ass', assSize)}
                  </p>
                </div>
                
                <div className="px-3">
                  <Slider
                    value={[assSize]}
                    onValueChange={(value) => setAssSize(value[0])}
                    min={1}
                    max={5}
                    step={1}
                    className="w-full"
                    data-testid="ass-size-slider"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-2">
                    <span>Small</span>
                    <span>Medium</span>
                    <span>Large</span>
                    <span>XL</span>
                    <span>Huge</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Notifications Preference */}
          <Card className="border-dark-border bg-dark-bg">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-400" />
                      <h3 className="text-white font-medium">Email Notifications</h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Get notified about account activity, new features, and updates
                    </p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                    className="data-[state=checked]:bg-blue-500"
                    data-testid="email-notifications-switch"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="bg-dark-border" />

        {/* Footer */}
        <div className="pt-4 pb-32 sm:pb-4">
          <Button 
            onClick={handleComplete}
            className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white"
            data-testid="button-complete-preferences"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Continue to Experience
          </Button>
          
          <p className="text-xs text-slate-500 text-center mt-3">
            You can update these preferences anytime in your user profile settings
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}