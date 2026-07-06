import { useState, useEffect } from 'react';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { useToast } from '@/hooks/use-toast';
import { defaultTags } from './constants';

type GenerationForm = ReturnType<typeof useGenerationSettings>['form'];
type Toast = ReturnType<typeof useToast>['toast'];

// Quick tags state cluster extracted verbatim from GenerationPanel.
// Hook order inside GenerationPanel is unchanged: the four useState calls and
// the persistence useEffect run in exactly the same sequence they did inline.
export function useQuickTags(form: GenerationForm, toast: Toast) {
  const [quickTags, setQuickTags] = useState<string[]>(() => {
    const stored = localStorage.getItem('generationPanel_quickTags');
    return stored ? JSON.parse(stored) : defaultTags;
  });

  const [isEditingTags, setIsEditingTags] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Save tags to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('generationPanel_quickTags', JSON.stringify(quickTags));
  }, [quickTags]);

  // Handle adding/removing tag to/from prompt (toggle)
  const handleAddTag = (tagText: string) => {
    const currentPrompt = form.getValues('prompt') || '';
    const isTagSelected = selectedTags.has(tagText);
    let newPrompt;

    if (isTagSelected) {
      // Remove tag from prompt
      const tagRegex = new RegExp(`(, )?${tagText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(, )?`, 'g');
      newPrompt = currentPrompt
        .replace(tagRegex, (match, leadingComma, trailingComma) => {
          if (leadingComma && trailingComma) return ', ';
          return '';
        })
        .replace(/^, /, '') // Remove leading comma
        .replace(/, $/, '') // Remove trailing comma
        .trim();

      // Update selected tags state
      const newSelectedTags = new Set(selectedTags);
      newSelectedTags.delete(tagText);
      setSelectedTags(newSelectedTags);

      toast({
        title: "Tag Removed",
        description: `Removed "${tagText}" from prompt`,
      });
    } else {
      // Add tag to prompt
      if (currentPrompt.trim()) {
        newPrompt = currentPrompt + ', ' + tagText;
      } else {
        newPrompt = tagText;
      }

      // Update selected tags state
      const newSelectedTags = new Set(selectedTags);
      newSelectedTags.add(tagText);
      setSelectedTags(newSelectedTags);

      toast({
        title: "Tag Added",
        description: `Added "${tagText}" to prompt`,
      });
    }

    form.setValue('prompt', newPrompt);
  };

  // Handle adding new custom tag
  const handleAddNewTag = () => {
    if (newTagText.trim()) {
      setQuickTags([...quickTags, newTagText.trim()]);
      setNewTagText('');
      toast({
        title: "Tag Created",
        description: `Added new tag: "${newTagText.trim()}"`,
      });
    }
  };

  // Handle deleting a tag
  const handleDeleteTag = (index: number) => {
    const tagToDelete = quickTags[index];
    setQuickTags(quickTags.filter((_, i) => i !== index));
    toast({
      title: "Tag Deleted",
      description: `Removed tag: "${tagToDelete}"`,
    });
  };

  // Reset tags to defaults
  const handleResetTags = () => {
    setQuickTags(defaultTags);
    toast({
      title: "Tags Reset",
      description: "Reset to default tags",
    });
  };

  return {
    quickTags,
    setQuickTags,
    isEditingTags,
    setIsEditingTags,
    newTagText,
    setNewTagText,
    selectedTags,
    setSelectedTags,
    handleAddTag,
    handleAddNewTag,
    handleDeleteTag,
    handleResetTags,
  };
}
