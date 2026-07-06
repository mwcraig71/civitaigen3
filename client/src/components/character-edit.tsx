import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CharacterEditProps {
  imageId: string;
  initialCharacterName?: string | null;
  availableCharacters: string[];
  isOwner: boolean;
  onUpdated?: (characterName: string | null) => void;
  className?: string;
}

export function CharacterEdit({ 
  imageId, 
  initialCharacterName, 
  availableCharacters, 
  isOwner, 
  onUpdated,
  className = ""
}: CharacterEditProps) {
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState(initialCharacterName || 'none');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateCharacterMutation = useMutation({
    mutationFn: async ({ imageId, characterName }: { imageId: string; characterName: string | null }) => {
      return apiRequest('PUT', `/api/shared-images/${imageId}/character`, { characterName });
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Character Updated",
        description: `Character name ${variables.characterName ? `updated to "${variables.characterName}"` : 'removed'}`,
      });
      
      // Call the onUpdated callback if provided
      if (onUpdated) {
        onUpdated(variables.characterName);
      }
      
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images/characters'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error?.message || "Failed to update character name",
        variant: "destructive",
      });
    },
  });

  const handleEditCharacter = () => {
    const finalCharacterName = selectedCharacter === 'none' ? null : selectedCharacter;
    updateCharacterMutation.mutate({ imageId, characterName: finalCharacterName });
    setIsEditingCharacter(false);
  };

  const handleOpenDialog = () => {
    setSelectedCharacter(initialCharacterName || 'none');
    setIsEditingCharacter(true);
  };

  // Don't render anything if user is not the owner
  if (!isOwner) {
    return null;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpenDialog}
        className={`bg-black/50 hover:bg-black/70 text-white h-8 w-8 ${className}`}
        data-testid={`button-edit-character-${imageId}`}
        disabled={updateCharacterMutation.isPending}
      >
        <Edit3 className="h-3 w-3" />
      </Button>

      <Dialog open={isEditingCharacter} onOpenChange={setIsEditingCharacter}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Character</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Character:</label>
              <Select
                value={selectedCharacter}
                onValueChange={setSelectedCharacter}
                data-testid={`select-character-${imageId}`}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a character..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableCharacters.map((character) => (
                    <SelectItem key={character} value={character}>
                      {character}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditingCharacter(false)}
                className="flex-1"
                data-testid={`button-cancel-character-${imageId}`}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditCharacter}
                className="flex-1"
                data-testid={`button-save-character-${imageId}`}
                disabled={updateCharacterMutation.isPending || selectedCharacter === (initialCharacterName || 'none')}
              >
                {updateCharacterMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}