import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, X, Check, Edit2, Plus, Trash2 } from 'lucide-react';

export interface PromptModifier {
  id: string;
  label: string;
  description: string;
  modifier: string;
  category: 'style' | 'quality' | 'mood' | 'effect';
}

interface ModifiersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedModifiers: string[], quantity: number, updatedPrompt?: string) => void;
  imageCharacter?: string;
  imageScene?: string;
  imagePrompt?: string;
}

// Custom hook for managing user's modifier preferences
const useUserModifiers = () => {
  const [userModifiers, setUserModifiers] = useState<PromptModifier[]>([]);
  const [adultContentEnabled, setAdultContentEnabled] = useState<boolean | null>(null);
  const [showChoiceDialog, setShowChoiceDialog] = useState<boolean>(false);
  
  // Load preferences and modifiers from localStorage on mount
  useEffect(() => {
    const savedModifiers = localStorage.getItem('fipfap-user-modifiers');
    const savedAdultChoice = localStorage.getItem('fipfap-adult-content-choice');
    
    if (savedAdultChoice !== null) {
      // User has made a choice before
      const isAdultEnabled = savedAdultChoice === 'true';
      setAdultContentEnabled(isAdultEnabled);
      
      if (savedModifiers) {
        try {
          setUserModifiers(JSON.parse(savedModifiers));
        } catch (error) {
          console.error('Failed to load user modifiers:', error);
          // Fallback to appropriate defaults
          setUserModifiers(isAdultEnabled ? ADULT_DEFAULT_MODIFIERS : SAFE_DEFAULT_MODIFIERS);
        }
      } else {
        // Use appropriate defaults based on choice
        setUserModifiers(isAdultEnabled ? ADULT_DEFAULT_MODIFIERS : SAFE_DEFAULT_MODIFIERS);
      }
    } else {
      // First time user - show choice dialog
      setShowChoiceDialog(true);
      // Temporarily load safe defaults until choice is made
      setUserModifiers(SAFE_DEFAULT_MODIFIERS);
    }
  }, []);
  
  // Handle adult content choice
  const setAdultChoice = (enableAdult: boolean) => {
    setAdultContentEnabled(enableAdult);
    setShowChoiceDialog(false);
    localStorage.setItem('fipfap-adult-content-choice', enableAdult.toString());
    
    // Set appropriate default modifiers based on choice
    const defaultModifiers = enableAdult ? ADULT_DEFAULT_MODIFIERS : SAFE_DEFAULT_MODIFIERS;
    setUserModifiers(defaultModifiers);
    localStorage.setItem('fipfap-user-modifiers', JSON.stringify(defaultModifiers));
  };
  
  // Save to localStorage when modifiers change
  const saveModifiers = (newModifiers: PromptModifier[]) => {
    setUserModifiers(newModifiers);
    localStorage.setItem('fipfap-user-modifiers', JSON.stringify(newModifiers));
  };
  
  return { 
    userModifiers, 
    saveModifiers, 
    adultContentEnabled, 
    showChoiceDialog, 
    setAdultChoice 
  };
};

// Safe default modifiers for general users
const SAFE_DEFAULT_MODIFIERS: PromptModifier[] = [
  {
    id: 'artistic',
    label: 'Artistic Style',
    description: 'Enhanced artistic rendering',
    modifier: 'masterpiece, artistic, highly detailed',
    category: 'style'
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Movie-like dramatic lighting',
    modifier: 'cinematic lighting, dramatic shadows, film grain',
    category: 'mood'
  },
  {
    id: 'vibrant',
    label: 'Vibrant Colors',
    description: 'Rich, saturated colors',
    modifier: 'vibrant colors, saturated, colorful',
    category: 'style'
  },
  {
    id: 'soft',
    label: 'Soft & Dreamy',
    description: 'Gentle, ethereal atmosphere',
    modifier: 'soft lighting, dreamy, ethereal, gentle',
    category: 'mood'
  },
  {
    id: 'detailed',
    label: 'Ultra Detailed',
    description: 'Maximum detail and sharpness',
    modifier: 'ultra detailed, sharp focus, 8k, high resolution',
    category: 'quality'
  },
  {
    id: 'fantasy',
    label: 'Fantasy Element',
    description: 'Magical, fantasy atmosphere',
    modifier: 'fantasy, magical, enchanted, mystical',
    category: 'effect'
  },
  {
    id: 'professional',
    label: 'Professional',
    description: 'Studio-quality photography',
    modifier: 'professional photography, studio lighting, perfect composition',
    category: 'quality'
  },
  {
    id: 'anime',
    label: 'Anime Style',
    description: 'Anime/manga aesthetic',
    modifier: 'anime style, manga, cel shading, anime aesthetic',
    category: 'style'
  }
];

// Enhanced adult content modifiers for users who opt-in
const ADULT_DEFAULT_MODIFIERS: PromptModifier[] = [
  {
    id: 'blow-job',
    label: 'Blow Job',
    description: 'Oral intimate scene',
    modifier: 'medium_breasts, 1boy, large veiny penis, slimy penis, mouth open, tongue, drool, pre cum, blow job',
    category: 'style'
  },
  {
    id: 'dildo',
    label: 'Dildo',
    description: 'Toy interaction scene',
    modifier: 'blue dildo, gapping pussy, gapping ass hole, happy',
    category: 'effect'
  },
  {
    id: 'riding-dick',
    label: 'Riding Dick',
    description: 'Cowgirl position scene',
    modifier: '1boy, large veiny penis, fucking, ridding penis, medium_breasts, cow girl, chin down, mouth open, slimy penis',
    category: 'style'
  },
  {
    id: 'panties-aside',
    label: 'Panties pulled to the side',
    description: 'Clothing adjustment scene',
    modifier: 'medium_breasts, panties pulled to the side, gapping pussy, slimy pussy, gapping asshole',
    category: 'quality'
  },
  {
    id: 'two-boys',
    label: '2boys',
    description: 'Multiple partner scene',
    modifier: '2boys, large veiny penis, gapping pussy, gapping asshole, mouth open, blow job, licking large penis shaft, butt plug, slimy penis',
    category: 'effect'
  },
  {
    id: 'masturbating',
    label: 'Masturbating',
    description: 'Solo intimate scene',
    modifier: 'panties pulled to the side, gapping pussy, butt plug, scared, pre cum, slimy pussy, hand on clit, mouth open, chin down',
    category: 'mood'
  },
  {
    id: 'messy-blow-job',
    label: 'Messy Blow Job',
    description: 'Intense oral scene',
    modifier: '1man, throat fucking, submissive obedience, open mouth tongue out, waiting to get throat fucked, sloppy, drooling, grab, submissive, sitting, blushing, admiring cock, staring at cock, tears, crying, running makeup, drooling, large_breasts, messy hair, sweaty skin, shiny skin, tears, thick thighs, both head grab, big cock, blowjob, cum, tongue, cum dripping from mouth, cum dripping from chin, black eyes, moody, expressive, slimy penis',
    category: 'style'
  },
  {
    id: 'bending-over',
    label: 'Bending over',
    description: 'Rear position scene',
    modifier: 'bending over, gapping asshole, small ass',
    category: 'effect'
  }
];

const getCategoryColor = (category: PromptModifier['category']) => {
  switch (category) {
    case 'style': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'quality': return 'bg-green-500/20 text-green-300 border-green-500/30';
    case 'mood': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'effect': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  }
};

export function ModifiersSheet({ isOpen, onClose, onConfirm, imageCharacter, imageScene, imagePrompt }: ModifiersSheetProps) {
  const [selectedModifiers, setSelectedModifiers] = useState<Set<string>>(new Set());
  const [editingModifier, setEditingModifier] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PromptModifier>>({});
  const [quantity, setQuantity] = useState<number>(2);
  const [breastSize, setBreastSize] = useState<number>(2);
  const [assSize, setAssSize] = useState<number>(2);
  const [hairyPussy, setHairyPussy] = useState<boolean>(false);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  // Track initial slider values to detect changes
  const [initialBreastSize, setInitialBreastSize] = useState<number>(2);
  const [initialAssSize, setInitialAssSize] = useState<number>(2);
  const { userModifiers, saveModifiers, adultContentEnabled, showChoiceDialog, setAdultChoice } = useUserModifiers();

  // Breast size mapping functions  
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

  // Map breast size terms to slider values
  const detectBreastSize = (prompt: string): number => {
    const lowercasePrompt = prompt.toLowerCase();
    
    // Check for small variants
    if (lowercasePrompt.includes('small_breasts') || lowercasePrompt.includes('small tits') || lowercasePrompt.includes('small boobs')) return 1;
    
    // Check for huge variants first (before large, since huge_breasts contains "large")
    if (lowercasePrompt.includes('huge_breasts') || lowercasePrompt.includes('huge tits') || lowercasePrompt.includes('huge boobs')) return 5;
    
    // Check for large variants  
    if (lowercasePrompt.includes('large_breasts') || lowercasePrompt.includes('large tits') || lowercasePrompt.includes('big tits') || lowercasePrompt.includes('big boobs') || lowercasePrompt.includes('large boobs')) return 3;
    
    // Check for medium variants
    if (lowercasePrompt.includes('medium_breasts') || lowercasePrompt.includes('medium tits') || lowercasePrompt.includes('medium boobs')) return 2;
    
    return 2; // Default to medium
  };

  // Map slider values to breast size terms
  const getBreastSizeTerm = (value: number): string => {
    switch (value) {
      case 1: return 'small_breasts';
      case 2: return 'medium_breasts';
      case 3: return 'large_breasts';
      case 4: return 'large_breasts'; // Map extra large to large
      case 5: return 'huge_breasts';
      default: return 'medium_breasts';
    }
  };

  // Replace breast size term in prompt
  const replaceBreastSize = (prompt: string, newSize: number): string => {
    // Include both proper terms and inappropriate terms to clean out
    const breastSizeTerms = [
      // Proper terminology
      'small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'perky_breasts', 'natural_breasts',
      // Inappropriate terms to remove
      'small tits', 'medium tits', 'large tits', 'big tits', 'huge tits', 'perky tits', 'natural tits', 'enhanced tits',
      'small boobs', 'medium boobs', 'large boobs', 'big boobs', 'huge boobs', 'perky boobs'
    ];
    let updatedPrompt = prompt;
    
    // Remove existing breast size terms (both proper and inappropriate)
    breastSizeTerms.forEach(term => {
      const regex = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      updatedPrompt = updatedPrompt.replace(regex, '').replace(/,\s*,/g, ',').trim();
    });
    
    // Clean up multiple spaces and commas
    updatedPrompt = updatedPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    
    // Add new breast size term at the beginning
    const newTerm = getBreastSizeTerm(newSize);
    if (updatedPrompt.startsWith(',')) {
      updatedPrompt = updatedPrompt.substring(1).trim();
    }
    updatedPrompt = updatedPrompt.endsWith(',') ? updatedPrompt : updatedPrompt + ',';
    return `${newTerm}, ${updatedPrompt}`.replace(/,\s*$/, '');
  };

  // Ass size mapping functions
  const getAssSizeLabel = (value: number): string => {
    switch (value) {
      case 1: return 'Small';
      case 2: return 'Medium'; 
      case 3: return 'Large';
      case 4: return 'Extra Large';
      case 5: return 'Huge';
      default: return 'Medium';
    }
  };

  // Map ass size terms to slider values
  const detectAssSize = (prompt: string): number => {
    const lowercasePrompt = prompt.toLowerCase();
    if (lowercasePrompt.includes('small_ass')) return 1;
    if (lowercasePrompt.includes('medium_ass')) return 2;
    if (lowercasePrompt.includes('large_ass') || lowercasePrompt.includes('big_ass')) return 3;
    if (lowercasePrompt.includes('extra_large_ass') || lowercasePrompt.includes('xl_ass')) return 4;
    if (lowercasePrompt.includes('huge_ass')) return 5;
    // Also check space format for backwards compatibility
    if (lowercasePrompt.includes('small ass')) return 1;
    if (lowercasePrompt.includes('medium ass')) return 2;
    if (lowercasePrompt.includes('large ass') || lowercasePrompt.includes('big ass')) return 3;
    if (lowercasePrompt.includes('extra large ass') || lowercasePrompt.includes('xl ass')) return 4;
    if (lowercasePrompt.includes('huge ass')) return 5;
    return 2; // Default to medium
  };

  // Map slider values to ass size terms
  const getAssSizeTerm = (value: number): string => {
    switch (value) {
      case 1: return 'small_ass';
      case 2: return 'medium_ass';
      case 3: return 'large_ass';
      case 4: return 'extra_large_ass';
      case 5: return 'huge_ass';
      default: return 'medium_ass';
    }
  };

  // Replace ass size term in prompt
  const replaceAssSize = (prompt: string, newSize: number): string => {
    const assSizeTerms = [
      'small_ass', 'medium_ass', 'large_ass', 'big_ass', 'extra_large_ass', 'xl_ass', 'huge_ass',
      'small ass', 'medium ass', 'large ass', 'big ass', 'extra large ass', 'xl ass', 'huge ass' // backwards compatibility
    ];
    let updatedPrompt = prompt;
    
    // Remove existing ass size terms
    assSizeTerms.forEach(term => {
      const regex = new RegExp(`\\b${term.replace(/_/g, '[_ ]')}\\b`, 'gi');
      updatedPrompt = updatedPrompt.replace(regex, '').replace(/,\s*,/g, ',').trim();
    });
    
    // Add new ass size term at the beginning
    const newTerm = getAssSizeTerm(newSize);
    if (updatedPrompt.startsWith(',')) {
      updatedPrompt = updatedPrompt.substring(1).trim();
    }
    updatedPrompt = updatedPrompt.endsWith(',') ? updatedPrompt : updatedPrompt + ',';
    return `${newTerm}, ${updatedPrompt}`.replace(/,\s*$/, '');
  };


  // Hairy pussy detection and replacement functions
  const detectHairyPussy = (prompt: string): boolean => {
    return prompt.toLowerCase().includes('hairy_pussy');
  };

  const toggleHairyPussy = (prompt: string, enabled: boolean): string => {
    let updatedPrompt = prompt;
    const regex = new RegExp('\\bhairy_pussy\\b', 'gi');
    
    // Remove existing hairy_pussy term
    updatedPrompt = updatedPrompt.replace(regex, '').replace(/,\s*,/g, ',').trim();
    
    // Add hairy_pussy if enabled
    if (enabled) {
      // Clean up extra spaces and commas
      if (updatedPrompt.startsWith(',')) {
        updatedPrompt = updatedPrompt.substring(1).trim();
      }
      updatedPrompt = updatedPrompt.endsWith(',') ? updatedPrompt : updatedPrompt + ',';
      updatedPrompt = `hairy_pussy, ${updatedPrompt}`.replace(/,\s*$/, '');
    } else {
      // Clean up any double commas or trailing commas
      updatedPrompt = updatedPrompt.replace(/,\s*,/g, ',');
      if (updatedPrompt.startsWith(',')) {
        updatedPrompt = updatedPrompt.substring(1).trim();
      }
      if (updatedPrompt.endsWith(',')) {
        updatedPrompt = updatedPrompt.slice(0, -1).trim();
      }
    }
    
    return updatedPrompt;
  };

  // Initialize sizes and checkboxes from prompt when modal opens
  useEffect(() => {
    if (isOpen) {
      if (imagePrompt) {
        // Detect from prompt if available
        const detectedBreastSize = detectBreastSize(imagePrompt);
        const detectedAssSize = detectAssSize(imagePrompt);
        const detectedHairyPussy = detectHairyPussy(imagePrompt);
        setBreastSize(detectedBreastSize);
        setAssSize(detectedAssSize);
        setHairyPussy(detectedHairyPussy);
        // Store initial values to track changes
        setInitialBreastSize(detectedBreastSize);
        setInitialAssSize(detectedAssSize);
        
        // Apply both sizes to create initial current prompt
        const updatedPrompt = replaceBothSizes(imagePrompt, detectedBreastSize, detectedAssSize);
        console.log('🎯 Size slider initialization:', {
          original: imagePrompt.substring(0, 100) + '...',
          updated: updatedPrompt.substring(0, 100) + '...',
          breastSize: detectedBreastSize,
          assSize: detectedAssSize,
          hairyPussy: detectedHairyPussy
        });
        setCurrentPrompt(updatedPrompt);
      } else {
        // Default to medium sizes if no prompt
        setBreastSize(2);
        setAssSize(3);
        setHairyPussy(false);
        // Store initial values
        setInitialBreastSize(2);
        setInitialAssSize(3);
        // Create a basic prompt with default sizes
        const basicPrompt = 'masterpiece, best quality';
        const updatedPrompt = replaceBothSizes(basicPrompt, 2, 2);
        setCurrentPrompt(updatedPrompt);
      }
    }
  }, [isOpen, imagePrompt]);

  // Combined size replacement function that handles both breast and ass sizes
  const replaceBothSizes = (prompt: string, breastSize: number, assSize: number): string => {
    // Include both proper terms and inappropriate terms to clean out
    const breastSizeTerms = [
      // Proper terminology
      'small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'perky_breasts', 'natural_breasts',
      // Inappropriate terms to remove
      'small tits', 'medium tits', 'large tits', 'big tits', 'huge tits', 'perky tits', 'natural tits', 'enhanced tits',
      'small boobs', 'medium boobs', 'large boobs', 'big boobs', 'huge boobs', 'perky boobs'
    ];
    const assSizeTerms = ['small_ass', 'tight_ass', 'medium_ass', 'large_ass', 'big_ass', 'huge_ass'];
    let updatedPrompt = prompt;
    
    // Remove all existing size terms first (both proper and inappropriate)
    [...breastSizeTerms, ...assSizeTerms].forEach(term => {
      const regex = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      updatedPrompt = updatedPrompt.replace(regex, '').replace(/,\s*,/g, ',').trim();
    });
    
    // Clean up multiple spaces and commas
    updatedPrompt = updatedPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',');
    if (updatedPrompt.startsWith(',')) {
      updatedPrompt = updatedPrompt.substring(1).trim();
    }
    if (updatedPrompt.endsWith(',')) {
      updatedPrompt = updatedPrompt.slice(0, -1).trim();
    }
    
    // Add new size terms at the beginning
    const newBreastTerm = getBreastSizeTerm(breastSize);
    const newAssTerm = getAssSizeTerm(assSize);
    
    return `${newBreastTerm}, ${newAssTerm}, ${updatedPrompt}`;
  };

  const handleBreastSizeChange = (value: number[]) => {
    const newSize = value[0];
    setBreastSize(newSize);
    
    // Update current prompt with both sizes
    if (currentPrompt || imagePrompt) {
      const basePrompt = currentPrompt || imagePrompt || '';
      const updatedPrompt = replaceBothSizes(basePrompt, newSize, assSize);
      console.log('🔄 Breast size changed:', {
        newBreastSize: newSize,
        assSize: assSize,
        updated: updatedPrompt.substring(0, 100) + '...'
      });
      setCurrentPrompt(updatedPrompt);
    }
  };

  const handleAssSizeChange = (value: number[]) => {
    const newSize = value[0];
    setAssSize(newSize);
    
    // Update current prompt with both sizes
    if (currentPrompt || imagePrompt) {
      const basePrompt = currentPrompt || imagePrompt || '';
      const updatedPrompt = replaceBothSizes(basePrompt, breastSize, newSize);
      console.log('🔄 Ass size changed:', {
        breastSize: breastSize,
        newAssSize: newSize,
        updated: updatedPrompt.substring(0, 100) + '...'
      });
      setCurrentPrompt(updatedPrompt);
    }
  };

  const handleHairyPussyChange = (checked: boolean) => {
    setHairyPussy(checked);
    
    // Update current prompt with hairy_pussy
    if (currentPrompt || imagePrompt) {
      const basePrompt = currentPrompt || imagePrompt || '';
      const updatedPrompt = toggleHairyPussy(basePrompt, checked);
      console.log('🔄 Hairy pussy changed:', {
        enabled: checked,
        updated: updatedPrompt.substring(0, 100) + '...'
      });
      setCurrentPrompt(updatedPrompt);
    }
  };

  const handleModifierToggle = (modifierId: string) => {
    const newSelected = new Set(selectedModifiers);
    if (newSelected.has(modifierId)) {
      newSelected.delete(modifierId);
    } else {
      newSelected.add(modifierId);
    }
    setSelectedModifiers(newSelected);
  };
  
  const handleEditStart = (modifier: PromptModifier) => {
    setEditingModifier(modifier.id);
    setEditForm(modifier);
  };
  
  const handleEditSave = () => {
    if (!editingModifier || !editForm.label || !editForm.modifier) return;
    
    const updatedModifiers = userModifiers.map(m => 
      m.id === editingModifier 
        ? { ...m, ...editForm } as PromptModifier
        : m
    );
    saveModifiers(updatedModifiers);
    setEditingModifier(null);
    setEditForm({});
  };
  
  const handleEditCancel = () => {
    setEditingModifier(null);
    setEditForm({});
  };
  
  const handleAddModifier = () => {
    const newModifier: PromptModifier = {
      id: `custom-${Date.now()}`,
      label: 'Custom Modifier',
      description: 'Your custom enhancement',
      modifier: 'add your prompt here',
      category: 'style'
    };
    saveModifiers([...userModifiers, newModifier]);
    handleEditStart(newModifier);
  };
  
  const handleDeleteModifier = (modifierId: string) => {
    const updatedModifiers = userModifiers.filter(m => m.id !== modifierId);
    saveModifiers(updatedModifiers);
    setSelectedModifiers(prev => {
      const newSet = new Set(prev);
      newSet.delete(modifierId);
      return newSet;
    });
  };

  const handleConfirm = () => {
    const selectedModifierStrings = Array.from(selectedModifiers).map(id => {
      const modifier = userModifiers.find(m => m.id === id);
      return modifier?.modifier || '';
    }).filter(Boolean);
    
    onConfirm(selectedModifierStrings, quantity, currentPrompt);
    setSelectedModifiers(new Set()); // Reset for next time
    setQuantity(2); // Reset quantity for next time
    // Don't reset breast and ass size - keep user preferences
    setCurrentPrompt(''); // Reset prompt for next time
    onClose();
  };

  const handleCancel = () => {
    setSelectedModifiers(new Set()); // Reset selections
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleCancel}>
      <SheetContent 
        side="bottom" 
        className="h-[65vh] max-h-[500px] sm:h-[75vh] bg-dark-card border-dark-border rounded-t-xl overflow-y-auto"
        data-testid="modifiers-sheet"
      >
        {showChoiceDialog ? (
          // First-time user choice dialog
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="space-y-4">
              <Sparkles className="h-12 w-12 text-purple-400 mx-auto" />
              <h2 className="text-2xl font-bold text-white">Content Preferences</h2>
              <p className="text-slate-400 max-w-md">
                Choose your preferred content type for modifier suggestions. You can always change this later by clearing your browser data.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <Button
                onClick={() => setAdultChoice(false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4"
                data-testid="choice-safe-content"
              >
                <div className="text-center">
                  <div className="font-semibold">Safe Content</div>
                  <div className="text-sm opacity-80">General artistic modifiers</div>
                </div>
              </Button>
              
              <Button
                onClick={() => setAdultChoice(true)}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-4"
                data-testid="choice-adult-content"
              >
                <div className="text-center">
                  <div className="font-semibold">Adult Content</div>
                  <div className="text-sm opacity-80">Enhanced intimate modifiers</div>
                </div>
              </Button>
            </div>
            
            <p className="text-xs text-slate-500 max-w-sm">
              By selecting adult content, you confirm you are 18+ and consent to explicit material.
            </p>
          </div>
        ) : (
          // Main modifiers interface
          <>
            <SheetHeader className="text-center pb-4">
              <SheetTitle className="flex items-center justify-center gap-2 text-white text-xl">
                <Sparkles className="h-5 w-5 text-purple-400" />
                Enhance Your Generation
              </SheetTitle>
              <SheetDescription className="text-slate-400">
                {imageCharacter && imageScene ? (
                  <>Creating a new variation of <span className="text-purple-400 font-medium">{imageCharacter}</span> in <span className="text-blue-400 font-medium">{imageScene}</span></>
                ) : (
                  'Select modifiers to enhance your image generation'
                )}
              </SheetDescription>
            </SheetHeader>

        <Separator className="bg-dark-border" />

        {/* Size Sliders */}
        {adultContentEnabled && (
          <div className="px-6 py-4 bg-dark-bg/50 border-b border-dark-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Breast Size Slider */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-white flex items-center gap-2">
                  Breast Size
                  <Badge variant="secondary" className="text-xs">
                    {getSizeLabel(breastSize)}
                  </Badge>
                </Label>
                <div className="px-2">
                  <Slider
                    value={[breastSize]}
                    onValueChange={handleBreastSizeChange}
                    min={1}
                    max={5}
                    step={1}
                    className="w-full"
                    data-testid="breast-size-slider"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>Small</span>
                    <span>Medium</span>
                    <span>Large</span>
                    <span>XL</span>
                    <span>Huge</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Adjust breast size - changes will be applied to the enhanced prompt
                </p>
              </div>

              {/* Ass Size Slider */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-white flex items-center gap-2">
                  Ass Size
                  <Badge variant="secondary" className="text-xs">
                    {getAssSizeLabel(assSize)}
                  </Badge>
                </Label>
                <div className="px-2">
                  <Slider
                    value={[assSize]}
                    onValueChange={handleAssSizeChange}
                    min={1}
                    max={5}
                    step={1}
                    className="w-full"
                    data-testid="ass-size-slider"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>Small</span>
                    <span>Medium</span>
                    <span>Large</span>
                    <span>XL</span>
                    <span>Huge</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Adjust ass size - changes will be applied to the enhanced prompt
                </p>
              </div>
            </div>
            
            {/* Additional Options */}
            <div className="mt-6 pt-4 border-t border-dark-border">
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="hairy-pussy"
                  checked={hairyPussy}
                  onCheckedChange={handleHairyPussyChange}
                  className="border-dark-border data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  data-testid="hairy-pussy-checkbox"
                />
                <Label 
                  htmlFor="hairy-pussy" 
                  className="text-sm font-medium text-white cursor-pointer"
                >
                  Hairy Pussy
                </Label>
              </div>
              <p className="text-xs text-slate-500 mt-2 ml-6">
                Add hairy_pussy term to the prompt
              </p>
            </div>
          </div>
        )}

        {/* Modifiers Grid */}
        <ScrollArea className="flex-1 px-1 h-[calc(75vh-250px)] sm:h-[calc(80vh-200px)]">
          <div className="py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {userModifiers.map((modifier) => {
                const isSelected = selectedModifiers.has(modifier.id);
                const isEditing = editingModifier === modifier.id;
                
                if (isEditing) {
                  return (
                    <Card key={modifier.id} className="border-2 border-yellow-500 bg-yellow-500/10">
                      <CardContent className="p-4 space-y-3">
                        <Input
                          value={editForm.label || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, label: e.target.value }))}
                          placeholder="Modifier Name"
                          className="bg-dark-bg border-dark-border text-white"
                          data-testid={`edit-label-${modifier.id}`}
                        />
                        <Input
                          value={editForm.description || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Description"
                          className="bg-dark-bg border-dark-border text-white"
                          data-testid={`edit-description-${modifier.id}`}
                        />
                        <Textarea
                          value={editForm.modifier || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, modifier: e.target.value }))}
                          placeholder="Prompt text to add"
                          className="bg-dark-bg border-dark-border text-white min-h-[60px]"
                          data-testid={`edit-modifier-${modifier.id}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleEditSave}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            data-testid={`save-edit-${modifier.id}`}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleEditCancel}
                            className="border-dark-border text-slate-400"
                            data-testid={`cancel-edit-${modifier.id}`}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                
                return (
                  <Card 
                    key={modifier.id}
                    className={`cursor-pointer transition-all duration-200 border-2 ${
                      isSelected 
                        ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20' 
                        : 'border-dark-border bg-dark-bg hover:border-purple-500/50 hover:bg-purple-500/5'
                    }`}
                    onClick={() => handleModifierToggle(modifier.id)}
                    data-testid={`modifier-${modifier.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white text-sm">{modifier.label}</h3>
                          {isSelected && (
                            <Check className="h-4 w-4 text-purple-400" data-testid={`modifier-selected-${modifier.id}`} />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge className={`text-xs px-2 py-1 ${getCategoryColor(modifier.category)}`}>
                            {modifier.category}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditStart(modifier);
                            }}
                            className="h-6 w-6 p-0 hover:bg-dark-hover"
                            data-testid={`edit-${modifier.id}`}
                          >
                            <Edit2 className="h-3 w-3 text-slate-400 hover:text-white" />
                          </Button>
                          {modifier.id.startsWith('custom-') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteModifier(modifier.id);
                              }}
                              className="h-6 w-6 p-0 hover:bg-red-600/20"
                              data-testid={`delete-${modifier.id}`}
                            >
                              <Trash2 className="h-3 w-3 text-red-400 hover:text-red-300" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              
              {/* Add New Modifier Button */}
              <Card className="border-2 border-dashed border-dark-border hover:border-purple-500/50 cursor-pointer transition-colors">
                <CardContent 
                  className="p-4 flex flex-col items-center justify-center min-h-[120px] text-center"
                  onClick={handleAddModifier}
                >
                  <Plus className="h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm text-slate-400 font-medium">Add Custom Modifier</p>
                  <p className="text-xs text-slate-500">Create your own enhancement</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>

        <Separator className="bg-dark-border" />

        {/* Footer with action buttons */}
        <SheetFooter className="pt-4 pb-4">
          {/* Quantity Selector */}
          <div className="mb-4">
            <p className="text-sm font-medium text-white mb-3">Number of Images</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((num) => (
                <Button
                  key={num}
                  variant={quantity === num ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuantity(num)}
                  className={`flex-1 transition-all duration-200 ${
                    quantity === num
                      ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600'
                      : 'border-dark-border text-slate-400 hover:text-white hover:border-white/20'
                  }`}
                  data-testid={`quantity-selector-${num}`}
                >
                  {num}
                </Button>
              ))}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              className="flex-1 border-dark-border text-slate-400 hover:text-white hover:border-white/20"
              data-testid="button-cancel-modifiers"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            
            <Button 
              onClick={handleConfirm}
              disabled={selectedModifiers.size === 0 && breastSize === initialBreastSize && assSize === initialAssSize}
              className={`flex-1 text-white transition-all duration-200 ${
                selectedModifiers.size === 0 && breastSize === initialBreastSize && assSize === initialAssSize
                  ? 'bg-gray-600 hover:bg-gray-600 cursor-not-allowed opacity-70' 
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
              data-testid="button-confirm-modifiers"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {selectedModifiers.size === 0 && breastSize === initialBreastSize && assSize === initialAssSize
                ? 'Select modifiers to generate'
                : selectedModifiers.size === 0
                  ? `Generate ${quantity} Image${quantity !== 1 ? 's' : ''} with size changes`
                  : `Generate ${quantity} Image${quantity !== 1 ? 's' : ''} with ${selectedModifiers.size} Modifier${selectedModifiers.size !== 1 ? 's' : ''}`
              }
            </Button>
          </div>
          
          {selectedModifiers.size > 0 && (
            <div className="text-center mt-2">
              <p className="text-xs text-slate-500">
                Selected modifiers will be added to your original prompt
              </p>
            </div>
          )}
        </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}