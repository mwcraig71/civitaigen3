import { RefreshCw, Search, X } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { Model } from '@/types';
import { DIFFUS_MODEL_NAME } from './constants';

interface ModelSelectionSectionProps {
  isDiffusProvider: boolean;
  form: ReturnType<typeof useGenerationSettings>['form'];
  showModelSearch: boolean;
  setShowModelSearch: React.Dispatch<React.SetStateAction<boolean>>;
  modelSearchTerm: string;
  setModelSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  filteredModels: Model[];
  handleModelSelect: (modelId: string) => void;
  refreshModelsMutation: UseMutationResult<any, any, void, unknown>;
  models: Model[];
  modelsLoading: boolean;
}

export function ModelSelectionSection({
  isDiffusProvider,
  form,
  showModelSearch,
  setShowModelSearch,
  modelSearchTerm,
  setModelSearchTerm,
  filteredModels,
  handleModelSelect,
  refreshModelsMutation,
  models,
  modelsLoading,
}: ModelSelectionSectionProps) {
  return (
    <>
                  {isDiffusProvider ? (
                    <div className="space-y-2">
                      <FormLabel>Model</FormLabel>
                      <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                          <span className="text-sm text-purple-300 font-medium">Diffus Provider Active</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Using fixed model: <span className="text-purple-300 font-mono">{DIFFUS_MODEL_NAME}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                  <FormField
                    control={form.control}
                    name="modelId"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Model</FormLabel>
                          <div className="flex items-center space-x-2">
                            {/* Quick Model Search */}
                            <div className="relative">
                              <Button
                                type="button"
                                variant="ghost"
                                size="default"
                                onClick={() => setShowModelSearch(!showModelSearch)}
                                className="text-blue-500 hover:text-blue-400 min-h-[44px] min-w-[44px] px-3 py-2 sm:p-1 sm:min-h-0 sm:min-w-0"
                                data-testid="button-quick-search"
                                title="Quick model search"
                              >
                                <Search className="h-5 w-5 sm:h-4 sm:w-4" />
                                <span className="ml-2 sm:hidden">Search</span>
                              </Button>

                              {showModelSearch && (
                                <>
                                  {/* Mobile overlay to close dropdown */}
                                  <div
                                    className="fixed inset-0 z-40 sm:hidden"
                                    onClick={() => setShowModelSearch(false)}
                                  />
                                  <div className="absolute right-0 sm:right-0 top-full mt-2 w-screen sm:w-80 left-1/2 transform -translate-x-1/2 sm:left-auto sm:transform-none bg-dark-card border border-dark-border rounded-lg shadow-lg z-50 model-search-dropdown max-w-sm sm:max-w-none mx-auto sm:mx-0">
                                    <div className="p-4 sm:p-3">
                                      <div className="flex items-center justify-between mb-3 sm:hidden">
                                        <h3 className="text-white font-medium">Search Models</h3>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setShowModelSearch(false)}
                                          className="p-1"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      <div className="relative mb-3">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                          type="text"
                                          placeholder="Search models..."
                                          value={modelSearchTerm}
                                          onChange={(e) => setModelSearchTerm(e.target.value)}
                                          className="w-full pl-10 pr-4 py-3 sm:py-2 bg-dark-bg border border-dark-border rounded-md text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none text-base sm:text-sm"
                                          data-testid="input-model-search"
                                          autoFocus
                                        />
                                      </div>

                                      <div className="max-h-80 sm:max-h-60 overflow-y-auto space-y-1">
                                        {filteredModels.length === 0 ? (
                                          <div className="p-4 sm:p-3 text-center text-slate-400 text-base sm:text-sm">
                                            {modelSearchTerm ? 'No models found' : 'Start typing to search...'}
                                          </div>
                                        ) : (
                                          filteredModels.slice(0, 10).map((model) => (
                                            <button
                                              key={model.id}
                                              onClick={() => handleModelSelect(model.id)}
                                              className="w-full text-left p-4 sm:p-3 rounded-md hover:bg-dark-bg transition-colors min-h-[60px] sm:min-h-0"
                                              data-testid={`quick-select-model-${model.id}`}
                                            >
                                              <div className="flex flex-col">
                                                <span className="font-medium text-white text-base sm:text-sm">{model.name}</span>
                                                <span className="text-sm sm:text-xs text-slate-400 mt-1 sm:mt-0">
                                                  {model.type} • {model.baseModel} • ⭐ {((model.rating || 0) / 10).toFixed(1)}
                                                </span>
                                              </div>
                                            </button>
                                          ))
                                        )}
                                      </div>

                                      {filteredModels.length > 10 && (
                                        <div className="text-sm sm:text-xs text-slate-400 text-center pt-3 sm:pt-2 border-t border-dark-border">
                                          Showing 10 of {filteredModels.length} results
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Refresh Button */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="default"
                              onClick={() => refreshModelsMutation.mutate()}
                              disabled={refreshModelsMutation.isPending}
                              className="text-primary-500 hover:text-primary-400 min-h-[44px] min-w-[44px] px-3 py-2 sm:p-1 sm:min-h-0 sm:min-w-0"
                              data-testid="button-refresh-models"
                            >
                              <RefreshCw className={`h-5 w-5 sm:h-4 sm:w-4 ${refreshModelsMutation.isPending ? 'animate-spin' : ''}`} />
                              <span className="ml-2 sm:hidden">Refresh</span>
                            </Button>
                          </div>
                        </div>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-dark-bg border-dark-border min-h-[50px] sm:min-h-[40px]" data-testid="select-model">
                              <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-80 sm:max-h-60">
                            {modelsLoading ? (
                              <div className="p-6 sm:p-4 text-center">
                                <div className="w-5 h-5 sm:w-4 sm:h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                <span className="text-base sm:text-sm text-slate-400">Loading models from CivitAI...</span>
                              </div>
                            ) : models.length === 0 ? (
                              <div className="p-6 sm:p-4 text-center">
                                <span className="text-base sm:text-sm text-slate-400">No models available</span>
                              </div>
                            ) : (
                              models.map((model) => (
                                <SelectItem key={model.id} value={model.id} className="min-h-[60px] sm:min-h-[50px] p-4 sm:p-3">
                                  <div className="flex flex-col w-full">
                                    <span className="font-medium text-base sm:text-sm">{model.name}</span>
                                    <span className="text-sm sm:text-xs text-slate-400 mt-1 sm:mt-0">
                                      {model.type} • {model.baseModel} • ⭐ {((model.rating || 0) / 10).toFixed(1)}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}
    </>
  );
}
