import { Search, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form';
import type { Character } from '@shared/schema';

interface CharacterSectionProps {
  showCharacterSearch: boolean;
  setShowCharacterSearch: React.Dispatch<React.SetStateAction<boolean>>;
  characterSearchTerm: string;
  setCharacterSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  filteredCharacters: Character[];
  handleCharacterSelect: (character: Character) => void;
  selectedCharacter: Character | null;
  handleCharacterClear: () => void;
}

export function CharacterSection({
  showCharacterSearch,
  setShowCharacterSearch,
  characterSearchTerm,
  setCharacterSearchTerm,
  filteredCharacters,
  handleCharacterSelect,
  selectedCharacter,
  handleCharacterClear,
}: CharacterSectionProps) {
  return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <FormLabel>Character</FormLabel>
                      <div className="flex items-center gap-2">
                        {/* Character Search Button */}
                        <div className="relative">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowCharacterSearch(!showCharacterSearch)}
                            className="text-primary-500 hover:text-primary-400 p-1"
                            data-testid="button-character-search"
                          >
                            <Search className="h-4 w-4" />
                          </Button>

                          {showCharacterSearch && (
                            <div className="character-search-dropdown absolute top-full right-0 mt-1 w-80 bg-slate-800 border border-dark-border rounded-lg shadow-xl z-50">
                              <div className="p-3">
                                <div className="relative mb-3">
                                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                                  <Input
                                    type="text"
                                    placeholder="Search characters by name, description, or tags..."
                                    value={characterSearchTerm}
                                    onChange={(e) => setCharacterSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded-md text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                                    data-testid="input-character-search"
                                    autoFocus
                                  />
                                </div>

                                <div className="max-h-60 overflow-y-auto space-y-1">
                                  {filteredCharacters.length === 0 ? (
                                    <div className="p-3 text-center text-slate-400 text-sm">
                                      {characterSearchTerm ? 'No characters found' : 'Start typing to search...'}
                                    </div>
                                  ) : (
                                    filteredCharacters.map((character) => (
                                      <button
                                        key={character.id}
                                        onClick={() => handleCharacterSelect(character)}
                                        className="w-full text-left p-3 rounded-md hover:bg-dark-bg transition-colors"
                                        data-testid={`quick-select-character-${character.id}`}
                                      >
                                        <div className="flex items-start gap-3">
                                          {/* Character Image or Fallback Icon */}
                                          <div className="flex-shrink-0">
                                            {character.imageUrl ? (
                                              <img
                                                src={character.imageUrl}
                                                alt={character.name}
                                                className="w-10 h-10 rounded-lg object-cover border border-dark-border"
                                                onError={(e) => {
                                                  // Fallback to User icon if image fails to load
                                                  const target = e.target as HTMLImageElement;
                                                  target.style.display = 'none';
                                                  const fallback = target.nextElementSibling as HTMLElement;
                                                  if (fallback) fallback.style.display = 'flex';
                                                }}
                                              />
                                            ) : (
                                              <div className="w-10 h-10 rounded-lg bg-slate-700 border border-dark-border flex items-center justify-center">
                                                <User className="h-5 w-5 text-primary-500" />
                                              </div>
                                            )}
                                            {/* Hidden fallback for failed image loads */}
                                            {character.imageUrl && (
                                              <div className="w-10 h-10 rounded-lg bg-slate-700 border border-dark-border items-center justify-center" style={{display: 'none'}}>
                                                <User className="h-5 w-5 text-primary-500" />
                                              </div>
                                            )}
                                          </div>

                                          {/* Character Info */}
                                          <div className="flex-1 min-w-0">
                                            <span className="font-medium text-white text-sm">{character.name}</span>
                                            {character.description && (
                                              <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                                                {character.description}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Character Display */}
                    <div className="min-h-[60px]">
                      {selectedCharacter ? (
                        <div className="bg-dark-bg border border-dark-border rounded-lg p-3" data-testid="selected-character">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* Character Image or Fallback Icon */}
                              <div className="flex-shrink-0">
                                {selectedCharacter.imageUrl ? (
                                  <img
                                    src={selectedCharacter.imageUrl}
                                    alt={selectedCharacter.name}
                                    className="w-12 h-12 rounded-lg object-cover border border-dark-border"
                                    onError={(e) => {
                                      // Fallback to User icon if image fails to load
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const fallback = target.nextElementSibling as HTMLElement;
                                      if (fallback) fallback.style.display = 'flex';
                                    }}
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-slate-700 border border-dark-border flex items-center justify-center">
                                    <User className="h-6 w-6 text-primary-500" />
                                  </div>
                                )}
                                {/* Hidden fallback for failed image loads */}
                                {selectedCharacter.imageUrl && (
                                  <div className="w-12 h-12 rounded-lg bg-slate-700 border border-dark-border items-center justify-center" style={{display: 'none'}}>
                                    <User className="h-6 w-6 text-primary-500" />
                                  </div>
                                )}
                              </div>

                              {/* Character Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-medium text-white text-sm">{selectedCharacter.name}</span>
                                </div>
                                {selectedCharacter.description && (
                                  <p className="text-xs text-slate-400 line-clamp-3">
                                    {selectedCharacter.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleCharacterClear}
                              className="text-slate-400 hover:text-white p-1 flex-shrink-0"
                              data-testid="button-clear-character"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-dark-bg border border-dashed border-slate-600 rounded-lg p-3 text-center">
                          <div className="text-slate-400 text-sm">
                            <User className="h-4 w-4 mx-auto mb-1 opacity-50" />
                            No character selected
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Search and select a character to auto-populate prompts
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
  );
}
