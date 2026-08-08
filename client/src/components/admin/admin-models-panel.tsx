import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, PackagePlus } from "lucide-react";
import type { Model } from "@shared/schema";

interface AdminModelsPanelProps {
  allModels?: Model[];
}

const CATEGORY_LABELS: Record<string, string> = {
  character: "Character",
  style: "Style",
};

export default function AdminModelsPanel({ allModels }: AdminModelsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [arnInput, setArnInput] = useState("");
  const [arnResult, setArnResult] = useState<{ name: string; arn: string } | null>(null);

  const importArnMutation = useMutation({
    mutationFn: async (arn: string) => {
      const res = await apiRequest("POST", "/api/models/import-arn", { arn });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      return data as { message: string; model: Model };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      setArnResult({ name: data.model.name, arn: data.model.arn ?? arnInput });
      setArnInput("");
      toast({ title: "Model imported", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ modelId, loraCategory }: { modelId: string; loraCategory: string | null }) => {
      return apiRequest("PATCH", `/api/admin/models/${modelId}`, { loraCategory });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({ title: "Model category updated" });
    },
    onError: () => {
      toast({ title: "Failed to update model category", variant: "destructive" });
    },
  });

  const updateGenerationAllowedMutation = useMutation({
    mutationFn: async ({ modelId, generationAllowed }: { modelId: string; generationAllowed: boolean }) => {
      return apiRequest("PATCH", `/api/admin/models/${modelId}`, { generationAllowed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({ title: "Generation access updated" });
    },
    onError: () => {
      toast({ title: "Failed to update generation access", variant: "destructive" });
    },
  });

  const loraModels = (allModels ?? []).filter(
    (m) => m.type?.toLowerCase() === "lora"
  );

  const checkpointModels = (allModels ?? []).filter(
    (m) => m.type?.toLowerCase() === "checkpoint"
  );

  const filtered = searchTerm.trim()
    ? loraModels.filter((m) =>
        m.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
      )
    : loraModels;

  const handleCategoryChange = (modelId: string, value: string) => {
    updateCategoryMutation.mutate({
      modelId,
      loraCategory: value === "auto" ? null : value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Import by AIR URN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Import Model by AIR URN
          </CardTitle>
          <CardDescription>
            Add a specific model version using its full AIR URN (e.g.{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              urn:air:krea2:checkpoint:civitai:2762538@3187539
            </code>
            ). Multiple versions of the same base model can coexist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={arnInput}
              onChange={(e) => { setArnInput(e.target.value); setArnResult(null); }}
              placeholder="urn:air:<base>:<type>:civitai:<modelId>@<versionId>"
              className="font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && arnInput.trim() && !importArnMutation.isPending) {
                  importArnMutation.mutate(arnInput.trim());
                }
              }}
            />
            <Button
              onClick={() => importArnMutation.mutate(arnInput.trim())}
              disabled={!arnInput.trim() || importArnMutation.isPending}
            >
              {importArnMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Import"
              )}
            </Button>
          </div>
          {arnResult && (
            <p className="text-sm text-green-600 dark:text-green-400">
              ✓ Imported <strong>{arnResult.name}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* LoRA Category Management */}
      <Card>
        <CardHeader>
          <CardTitle>LoRA Category Management</CardTitle>
          <CardDescription>
            Set the canonical category for each LoRA. Users will see the correct
            Character / Style grouping across all devices based on this setting.
            "Auto" falls back to the name-based heuristic (rly…, BeMyHero…).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="text"
            placeholder="Filter LoRAs…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {searchTerm ? `No LoRAs match "${searchTerm}"` : "No LoRA models found."}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((model) => {
                const currentValue = model.loraCategory ?? "auto";
                return (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                    data-testid={`admin-model-row-${model.id}`}
                  >
                    {model.imageUrl ? (
                      <img
                        src={model.imageUrl}
                        alt={model.name}
                        className="w-10 h-10 object-cover rounded shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{model.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {model.baseModel}
                        {model.loraCategory && (
                          <Badge
                            variant="secondary"
                            className={`ml-2 text-[10px] px-1.5 py-0 ${
                              model.loraCategory === "character"
                                ? "bg-purple-500/20 text-purple-300"
                                : "bg-blue-500/20 text-blue-300"
                            }`}
                          >
                            {CATEGORY_LABELS[model.loraCategory]}
                          </Badge>
                        )}
                      </p>
                    </div>
                    <Select
                      value={currentValue}
                      onValueChange={(v) => handleCategoryChange(model.id, v)}
                      disabled={
                        updateCategoryMutation.isPending &&
                        updateCategoryMutation.variables?.modelId === model.id
                      }
                    >
                      <SelectTrigger
                        className="w-36 h-8 text-xs"
                        data-testid={`admin-model-category-${model.id}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (heuristic)</SelectItem>
                        <SelectItem value="character">Character</SelectItem>
                        <SelectItem value="style">Style</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checkpoint Generation Access */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Picker — Allowed Checkpoints</CardTitle>
          <CardDescription>
            Toggle which checkpoint models regular users can pick in the generation
            panel. Admins are always unrestricted. Import a model first using the
            AIR URN importer above, then enable it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkpointModels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No checkpoint models found. Import one above.
            </p>
          ) : (
            <div className="space-y-2">
              {checkpointModels.map((model) => {
                const isPending =
                  updateGenerationAllowedMutation.isPending &&
                  (updateGenerationAllowedMutation.variables as any)?.modelId === model.id;
                return (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    {model.imageUrl ? (
                      <img
                        src={model.imageUrl}
                        alt={model.name}
                        className="w-10 h-10 object-cover rounded shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{model.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {model.baseModel}
                        {model.generationAllowed && (
                          <Badge
                            variant="secondary"
                            className="ml-2 text-[10px] px-1.5 py-0 bg-green-500/20 text-green-400"
                          >
                            Allowed
                          </Badge>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={model.generationAllowed ?? false}
                        onCheckedChange={(checked) =>
                          updateGenerationAllowedMutation.mutate({ modelId: model.id, generationAllowed: checked })
                        }
                        disabled={isPending}
                        aria-label={`Allow ${model.name} in generation picker`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Non-LoRA model overview */}
      <Card>
        <CardHeader>
          <CardTitle>All Models</CardTitle>
          <CardDescription>Overview of all models in the database</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(allModels ?? []).slice(0, 20).map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {model.imageUrl && (
                    <img
                      src={model.imageUrl}
                      alt={model.name}
                      className="w-10 h-10 object-cover rounded shrink-0"
                    />
                  )}
                  <div>
                    <p className="font-medium text-sm">{model.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {model.type} • {model.baseModel}
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {model.downloads ?? 0} downloads
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
