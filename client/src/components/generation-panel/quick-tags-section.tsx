import { Edit, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tagLabels } from './constants';

interface QuickTagsSectionProps {
  quickTags: string[];
  isEditingTags: boolean;
  setIsEditingTags: React.Dispatch<React.SetStateAction<boolean>>;
  newTagText: string;
  setNewTagText: React.Dispatch<React.SetStateAction<string>>;
  selectedTags: Set<string>;
  handleAddTag: (tagText: string) => void;
  handleAddNewTag: () => void;
  handleDeleteTag: (index: number) => void;
  handleResetTags: () => void;
}

export function QuickTagsSection({
  quickTags,
  isEditingTags,
  setIsEditingTags,
  newTagText,
  setNewTagText,
  selectedTags,
  handleAddTag,
  handleAddNewTag,
  handleDeleteTag,
  handleResetTags,
}: QuickTagsSectionProps) {
  return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-slate-500">Quick Add Tags:</div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setIsEditingTags(!isEditingTags)}
                            className="text-xs px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-600 rounded transition-all"
                            data-testid="button-edit-tags"
                          >
                            <Edit className="h-3 w-3 mr-1 inline" />
                            {isEditingTags ? 'Done' : 'Edit'}
                          </button>
                          {isEditingTags && (
                            <button
                              type="button"
                              onClick={handleResetTags}
                              className="text-xs px-2 py-1 text-slate-400 hover:text-white hover:bg-red-500/20 rounded transition-all"
                              data-testid="button-reset-tags"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {quickTags.map((tag, index) => (
                          <div key={index} className="relative group">
                            <button
                              type="button"
                              onClick={() => !isEditingTags && handleAddTag(tag)}
                              disabled={isEditingTags}
                              className={`px-2 py-1 text-xs rounded border transition-all ${
                                isEditingTags
                                  ? 'bg-slate-700 text-slate-400 border-slate-600 cursor-default'
                                  : selectedTags.has(tag)
                                  ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500 hover:border-blue-600 cursor-pointer'
                                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border-slate-600 hover:border-slate-500 cursor-pointer'
                              }`}
                              data-testid={`tag-${index}`}
                              title={tag}
                            >
                              {tagLabels[tag] || tag}
                            </button>
                            {isEditingTags && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTag(index)}
                                className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-all"
                                data-testid={`delete-tag-${index}`}
                              >
                                <X className="h-2 w-2" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add new tag input */}
                      {isEditingTags && (
                        <div className="mt-3 flex gap-2">
                          <Input
                            value={newTagText}
                            onChange={(e) => setNewTagText(e.target.value)}
                            placeholder="Add new tag..."
                            className="flex-1 text-xs h-8 bg-dark-bg border-dark-border"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNewTag();
                              }
                            }}
                            data-testid="input-new-tag"
                          />
                          <Button
                            type="button"
                            onClick={handleAddNewTag}
                            size="sm"
                            className="h-8 px-3 text-xs"
                            data-testid="button-add-tag"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
  );
}
