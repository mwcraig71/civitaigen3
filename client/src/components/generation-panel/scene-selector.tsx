import { Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SavedScene } from '@shared/schema';

interface SceneSelectorProps {
  selectedScene: SavedScene | null;
  savedScenes: SavedScene[];
  handleSceneSelect: (scene: SavedScene) => void;
  handleSceneClear: () => void;
}

export function SceneSelector({
  selectedScene,
  savedScenes,
  handleSceneSelect,
  handleSceneClear,
}: SceneSelectorProps) {
  return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <FormLabel>Saved Scene</FormLabel>
                    </div>

                    <div className="min-h-[60px]">
                      {selectedScene ? (
                        <div className="bg-dark-bg border border-dark-border rounded-lg p-3" data-testid="selected-scene">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Wand2 className="h-4 w-4 text-primary-500 flex-shrink-0" />
                                <span className="font-medium text-white text-sm">{selectedScene.title}</span>
                              </div>
                              <p className="text-xs text-slate-400 line-clamp-2">
                                {selectedScene.prompt.length > 80 ? `${selectedScene.prompt.substring(0, 80)}...` : selectedScene.prompt}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleSceneClear}
                              className="text-slate-400 hover:text-white p-1 flex-shrink-0"
                              data-testid="button-clear-scene"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <Select onValueChange={(value) => {
                            const scene = savedScenes.find(s => s.id === value);
                            if (scene) handleSceneSelect(scene);
                          }}>
                            <SelectTrigger className="bg-dark-bg border border-dashed border-slate-600 text-slate-400">
                              <div className="flex items-center gap-2">
                                <Wand2 className="h-4 w-4 opacity-50" />
                                <SelectValue placeholder="Select a saved scene..." />
                              </div>
                            </SelectTrigger>
                            <SelectContent className="bg-dark-card border-dark-border">
                              {savedScenes.length === 0 ? (
                                <div className="px-3 py-2 text-slate-500 text-sm">
                                  No saved scenes available. Create some in Scene Builder!
                                </div>
                              ) : (
                                savedScenes.map((scene) => (
                                  <SelectItem key={scene.id} value={scene.id} className="text-white hover:bg-slate-700">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{scene.title}</span>
                                      <span className="text-xs text-slate-400 line-clamp-1">
                                        {scene.prompt.length > 60 ? `${scene.prompt.substring(0, 60)}...` : scene.prompt}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {!selectedScene && (
                      <p className="text-xs text-slate-500 mt-1">
                        Apply a saved scene to auto-populate your prompt
                      </p>
                    )}
                  </div>
  );
}
