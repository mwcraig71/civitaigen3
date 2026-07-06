import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import type { Event } from '@shared/schema';

interface EventSelectorProps {
  selectedEvent: Event | null;
  selectedEventStepCount: number;
  form: ReturnType<typeof useGenerationSettings>['form'];
  events: Event[];
  handleEventSelect: (event: Event) => void;
  handleEventClear: () => void;
}

export function EventSelector({
  selectedEvent,
  selectedEventStepCount,
  form,
  events,
  handleEventSelect,
  handleEventClear,
}: EventSelectorProps) {
  return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <FormLabel>Event</FormLabel>
                    </div>

                    <div className="min-h-[60px]">
                      {selectedEvent ? (
                        <div className="bg-dark-bg border border-dark-border rounded-lg p-3" data-testid="selected-event">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="h-4 w-4 text-primary-500 flex-shrink-0" />
                                <span className="font-medium text-white text-sm">{selectedEvent.title}</span>
                                {selectedEventStepCount > 0 && (
                                  <span className="text-xs bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded-md">
                                    {selectedEventStepCount} steps
                                  </span>
                                )}
                              </div>
                              {selectedEvent.description && (
                                <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                                  {selectedEvent.description.length > 80 ? `${selectedEvent.description.substring(0, 80)}...` : selectedEvent.description}
                                </p>
                              )}
                              {selectedEventStepCount > 0 && (
                                <div className="space-y-1">
                                  <div className="text-xs text-yellow-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                                    Billing: {selectedEventStepCount} steps × {form.watch('quantity') || 1} images = {(selectedEventStepCount * (form.watch('quantity') || 1))} total generations
                                  </div>
                                  <div className="text-xs text-orange-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                                    BETA: Event processing is experimental - use at your own risk
                                  </div>
                                </div>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleEventClear}
                              className="text-slate-400 hover:text-white p-1 flex-shrink-0"
                              data-testid="button-clear-event"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <Select onValueChange={(value) => {
                            const event = events.find(e => e.id === value);
                            if (event) handleEventSelect(event);
                          }}>
                            <SelectTrigger className="bg-dark-bg border border-dashed border-slate-600 text-slate-400">
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 opacity-50" />
                                <SelectValue placeholder="Select an event..." />
                              </div>
                            </SelectTrigger>
                            <SelectContent className="bg-dark-card border-dark-border">
                              {events.length === 0 ? (
                                <div className="px-3 py-2 text-slate-500 text-sm">
                                  No events available. Create some in the Events section!
                                </div>
                              ) : (
                                events.map((event) => (
                                  <SelectItem key={event.id} value={event.id} className="text-white hover:bg-slate-700">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{event.title}</span>
                                      {event.description && (
                                        <span className="text-xs text-slate-400 line-clamp-1">
                                          {event.description.length > 60 ? `${event.description.substring(0, 60)}...` : event.description}
                                        </span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {!selectedEvent && (
                      <div className="space-y-1 mt-1">
                        <p className="text-xs text-slate-500">
                          Apply an event to add step-based prompt words
                        </p>
                        <p className="text-xs text-orange-400">
                          ⚠️ BETA: Event processing is experimental
                        </p>
                      </div>
                    )}
                  </div>
  );
}
