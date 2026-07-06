import { RefreshCw, X } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { useToast } from '@/hooks/use-toast';

interface GenerationParamsFieldsProps {
  form: ReturnType<typeof useGenerationSettings>['form'];
  toast: ReturnType<typeof useToast>['toast'];
  useFirstImageSeedOffset: boolean;
  setUseFirstImageSeedOffset: React.Dispatch<React.SetStateAction<boolean>>;
  user: unknown;
  updatePreferencesMutation: UseMutationResult<any, any, { showWatermark?: boolean }, unknown>;
}

export function GenerationParamsFields({
  form,
  toast,
  useFirstImageSeedOffset,
  setUseFirstImageSeedOffset,
  user,
  updatePreferencesMutation,
}: GenerationParamsFieldsProps) {
  return (
    <>
                  {/* Negative Prompt */}
                  <FormField
                    control={form.control}
                    name="negativePrompt"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Negative Prompt</FormLabel>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              form.setValue('negativePrompt', '');
                              toast({
                                title: "Negative Prompt Cleared",
                                description: "The negative prompt has been cleared.",
                              });
                            }}
                            className="h-6 px-2 text-xs bg-transparent border-dark-border text-slate-400 hover:text-white hover:bg-slate-700"
                            data-testid="button-clear-negative-prompt"
                          >
                            <X className="h-3 w-3 mr-1" />
                            Clear
                          </Button>
                        </div>
                        <FormControl>
                          <Textarea
                            placeholder="What to avoid in the image..."
                            className="bg-dark-bg border-dark-border resize-none"
                            rows={4}
                            data-testid="textarea-negative-prompt"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="seed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seed</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input
                                type="number"
                                className="bg-dark-card border-dark-border"
                                data-testid="input-seed"
                                placeholder="-1 (Random)"
                                value={field.value === -1 ? '' : field.value}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const newValue = value === '' ? -1 : parseInt(value);
                                  field.onChange(newValue);
                                }}
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                field.onChange(-1);
                              }}
                              className="bg-dark-card border-dark-border hover:bg-dark-bg"
                              data-testid="button-randomize-seed"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="seedIncrement"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seed Increment</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="bg-dark-card border-dark-border min-w-[80px]"
                              data-testid="input-seed-increment"
                              placeholder="3"
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === "") {
                                  field.onChange(undefined);
                                } else if (/^\d+$/.test(value)) {
                                  field.onChange(parseInt(value));
                                }
                              }}
                              onBlur={(e) => {
                                const value = e.target.value;
                                if (value === "" || field.value === undefined) {
                                  field.onChange(3);
                                } else {
                                  const numValue = parseInt(value);
                                  if (isNaN(numValue) || numValue < 1) {
                                    field.onChange(1);
                                  } else if (numValue > 100) {
                                    field.onChange(100);
                                  }
                                }
                              }}
                            />
                          </FormControl>
                          <p className="text-xs text-slate-500">How much to increase seed for each additional image</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="pt-3 mt-1 border-t border-dark-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Seed</h3>
                  </div>
                  {/* First Image Seed Offset */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="first-image-seed-offset"
                      checked={useFirstImageSeedOffset}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseFirstImageSeedOffset(checked);
                      }}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      data-testid="checkbox-first-image-seed-offset"
                    />
                    <label htmlFor="first-image-seed-offset" className="text-sm text-slate-700 dark:text-slate-300">
                      First Image Seed Offset (+3)
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Add 3 to the seed for the first image, then increment normally for additional images
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="steps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Steps</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="bg-dark-card border-dark-border"
                              data-testid="input-steps"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cfgScale"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CFG Scale</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.5"
                              className="bg-dark-card border-dark-border"
                              data-testid="input-cfg-scale"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="width"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Width</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                            <FormControl>
                              <SelectTrigger className="bg-dark-card border-dark-border">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="768">768</SelectItem>
                              <SelectItem value="832">832</SelectItem>
                              <SelectItem value="1024">1024</SelectItem>
                              <SelectItem value="1216">1216</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="height"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Height</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                            <FormControl>
                              <SelectTrigger className="bg-dark-card border-dark-border">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="768">768</SelectItem>
                              <SelectItem value="832">832</SelectItem>
                              <SelectItem value="1024">1024</SelectItem>
                              <SelectItem value="1216">1216</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="clipSkip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clip Skip</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="bg-dark-card border-dark-border"
                              data-testid="input-clip-skip"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="scheduler"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scheduler / Sampler</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-dark-card border-dark-border" data-testid="select-scheduler">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[400px]">
                              <SelectItem value="Euler">Euler</SelectItem>
                              <SelectItem value="Euler a">Euler a (Ancestral) ⭐</SelectItem>
                              <SelectItem value="DPM++ 2M">DPM++ 2M</SelectItem>
                              <SelectItem value="DPM++ 2M Karras">DPM++ 2M Karras 🔥</SelectItem>
                              <SelectItem value="DPM++ 2M SDE">DPM++ 2M SDE</SelectItem>
                              <SelectItem value="DPM++ 2M SDE Karras">DPM++ 2M SDE Karras (Photo)</SelectItem>
                              <SelectItem value="DPM++ 2S a">DPM++ 2S a</SelectItem>
                              <SelectItem value="DPM++ 2S a Karras">DPM++ 2S a Karras</SelectItem>
                              <SelectItem value="DPM++ 3M SDE">DPM++ 3M SDE</SelectItem>
                              <SelectItem value="DPM++ SDE">DPM++ SDE</SelectItem>
                              <SelectItem value="DPM++ SDE Karras">DPM++ SDE Karras</SelectItem>
                              <SelectItem value="DPM2">DPM2</SelectItem>
                              <SelectItem value="DPM2 a">DPM2 a</SelectItem>
                              <SelectItem value="DPM2 Karras">DPM2 Karras</SelectItem>
                              <SelectItem value="DPM2 a Karras">DPM2 a Karras</SelectItem>
                              <SelectItem value="DPM Fast">DPM Fast</SelectItem>
                              <SelectItem value="DPM Adaptive">DPM Adaptive</SelectItem>
                              <SelectItem value="Heun">Heun</SelectItem>
                              <SelectItem value="DDIM">DDIM</SelectItem>
                              <SelectItem value="UniPC">UniPC (Fast)</SelectItem>
                              <SelectItem value="UniPC BH2">UniPC BH2</SelectItem>
                              <SelectItem value="LCM">LCM (4-8 steps)</SelectItem>
                              <SelectItem value="DEIS">DEIS</SelectItem>
                              <SelectItem value="IPNDM_V">IPNDM_V (LoRA Heavy)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  </div>

                  <div className="pt-3 mt-1 border-t border-dark-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Output</h3>
                  </div>
                  {/* Watermark Control */}
                  <div className="flex items-center justify-between p-4 rounded-lg border border-dark-border bg-dark-bg">
                    <div className="space-y-1">
                      <Label htmlFor="watermark-toggle" className="text-base font-medium text-white">
                        CiviVerse Logo Watermark
                      </Label>
                      <p className="text-sm text-slate-300">
                        Add a small CiviVerse.com logo watermark to your generated images
                      </p>
                    </div>
                    <Switch
                      id="watermark-toggle"
                      checked={(user as any)?.showWatermark || false}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({ showWatermark: checked })
                      }
                      disabled={updatePreferencesMutation.isPending}
                      data-testid="switch-watermark"
                      className="data-[state=checked]:bg-primary-500 data-[state=unchecked]:bg-slate-600"
                    />
                  </div>
    </>
  );
}
