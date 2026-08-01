import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  Film,
  Wand2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiRequest } from "@/lib/queryClient";
import type { Generation, User as UserType } from "@/types";

type Mode = "img2img" | "img2vid";

const VIDEO_ENGINES: { value: string; label: string; hint: string }[] = [
  { value: "wan-comfy-2.1", label: "WAN 2.1 (Civitai)", hint: "Best for adult content — runs on Civitai hardware" },
  { value: "wan-fal-2.2", label: "WAN 2.2 (FAL)", hint: "Higher quality, SFW only" },
  { value: "wan-fal-2.5", label: "WAN 2.5 (FAL)", hint: "Newest WAN, SFW only" },
  { value: "kling-2.5", label: "Kling 2.5 Turbo", hint: "Fast cinematic motion, SFW only" },
  { value: "vidu-q3", label: "Vidu Q3", hint: "Smooth anime / stylized motion, SFW only" },
  { value: "ltx-2", label: "LTX 2", hint: "Lightricks open model, fast" },
  { value: "grok-img2vid", label: "Grok Video (xAI)", hint: "xAI Grok-Imagine-Video, ~1–4 min, SFW only" },
];

export default function Transform() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery<UserType>({ queryKey: ["/api/auth/user"] });
  const { messageQueue, setMessageQueue } = useWebSocket(currentUser?.id || "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Mode>("img2img");
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [sourceImageObjectPath, setSourceImageObjectPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  // img2img runs on Flux 2 "Klein" (Civitai-hosted). Klein bands: CFG 1–20
  // (sweet spot 4–6, default 5), steps 4–50 (default 20). denoise maps to
  // Klein's `strength` (0=keep source, 1=discard; 0.3–0.5 preserves composition).
  const [kleinVersion, setKleinVersion] = useState<"4b" | "9b">("4b");
  const [denoise, setDenoise] = useState(0.4);
  const [steps, setSteps] = useState(20);
  const [cfg, setCfg] = useState(5);

  // img2vid
  const [videoEngine, setVideoEngine] = useState<string>("wan-comfy-2.1");
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(16);
  const [motion, setMotion] = useState(5);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Generation | null>(null);

  // Poll active job when present (small interval — WS handles fast path)
  const { data: jobData } = useQuery<Generation>({
    queryKey: ["/api/generations", activeJobId],
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const g = q.state.data as Generation | undefined;
      return g && (g.status === "completed" || g.status === "failed")
        ? false
        : 4000;
    },
  });

  useEffect(() => {
    if (jobData) setActiveJob(jobData);
  }, [jobData]);

  // WS-driven instant completion
  useEffect(() => {
    if (!messageQueue.length || !activeJobId) return;
    let handled = false;
    for (const msg of messageQueue) {
      const m: any = msg;
      if (
        (m.type === "generation_image_ready" || m.type === "generation_batch_complete") &&
        (m.generationId === activeJobId || m.batchId === activeJobId)
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/generations", activeJobId] });
        queryClient.invalidateQueries({ queryKey: ["/api/generations"] });
        handled = true;
      }
      if (m.type === "generation_update" && m.generationId === activeJobId && m.status === "failed") {
        toast({
          title: "Transform failed",
          description: m.message || "CivitAI rejected the job.",
          variant: "destructive",
        });
        handled = true;
      }
    }
    if (handled) setMessageQueue([]);
  }, [messageQueue, activeJobId, queryClient, toast, setMessageQueue]);

  // Re-encode through <canvas> to drop EXIF/GPS/maker-note metadata before
  // the file ever leaves the browser. CivitAI still gets a clean PNG/JPEG.
  const stripExif = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(objUrl); return reject(new Error("Canvas unavailable")); }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(objUrl);
        const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Re-encode failed"))),
          outType,
          0.95,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("Could not decode image")); };
      img.src = objUrl;
    });

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image", variant: "destructive" });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 12 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const cleanBlob = await stripExif(file);
      const contentType = cleanBlob.type || "image/jpeg";
      const res = await fetch("/api/transform/upload-url", { method: "POST" });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, readURL, objectPath } = await res.json();
      const put = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: cleanBlob,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setSourceImageUrl(readURL);
      setSourceImageObjectPath(objectPath || null);
      toast({ title: "Source image uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!sourceImageUrl) throw new Error("Please upload a source image first");
      if (!prompt.trim()) throw new Error("Please describe what you want");
      const body: any = {
        mode,
        sourceImageUrl,
        ...(sourceImageObjectPath ? { sourceImageObjectPath } : {}),
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
      };
      if (mode === "img2img") {
        Object.assign(body, {
          kleinVersion,
          denoiseStrength: denoise,
          steps,
          cfgScale: cfg,
        });
      } else {
        Object.assign(body, {
          videoEngine,
          durationSeconds: duration,
          fps,
          motionStrength: motion,
        });
      }
      return await apiRequest("POST", "/api/transform", body);
    },
    onSuccess: async (res: any) => {
      const data = await res.json();
      setActiveJobId(data.id);
      setActiveJob(null);
      toast({
        title: mode === "img2vid" ? "Video transform queued" : "Image transform queued",
        description: `Cost: ${data.cost} Buzz · waiting on CivitAI...`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (e: any) => {
      toast({ title: "Transform failed", description: e.message, variant: "destructive" });
    },
  });

  const ResultPanel = () => {
    if (!activeJobId) return null;
    const status = activeJob?.status || "pending";
    const isVideo = mode === "img2vid" || (activeJob as any)?.videoUrl;
    return (
      <Card className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)]">
        <CardHeader>
          <CardTitle className="flex items-center text-lg font-[Orbitron,sans-serif] text-[hsl(180,100%,70%)]">
            <Sparkles className="mr-2 h-5 w-5 text-[hsl(60,100%,50%)]" />
            Result
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status !== "completed" && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-10 w-10 animate-spin mb-3 text-[hsl(180,100%,60%)]" />
              <p className="text-sm">Status: {status}</p>
              <p className="text-xs mt-1 opacity-70">
                {isVideo
                  ? "Video generation usually takes 1–4 minutes"
                  : "Image transforms usually complete in 30–90 seconds"}
              </p>
            </div>
          )}
          {status === "completed" && isVideo && (activeJob as any)?.videoUrl && (
            <video
              src={(activeJob as any).videoUrl}
              controls
              autoPlay
              loop
              poster={(activeJob as any).videoThumbnailUrl || sourceImageUrl || undefined}
              className="w-full rounded-lg border border-[hsl(180,50%,20%)]"
              data-testid="result-video"
            />
          )}
          {status === "completed" && !isVideo && activeJob?.imageUrl && (
            <img
              src={`/api/images/${activeJob.id}`}
              alt="Transformed"
              className="w-full rounded-lg border border-[hsl(180,50%,20%)]"
              data-testid="result-image"
            />
          )}
          {status === "completed" && (
            <div className="mt-3 flex gap-2">
              <Link href="/generations">
                <Button variant="outline" size="sm">View in Gallery</Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveJobId(null);
                  setActiveJob(null);
                }}
              >
                Run another
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-[hsl(240,20%,4%)] text-white">
      <div className="border-b border-[hsl(180,50%,20%)] bg-[hsl(240,25%,6%)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Link href="/generate">
            <Button variant="ghost" size="sm" data-testid="button-back-transform">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-[Orbitron,sans-serif] tracking-wider uppercase bg-gradient-to-r from-[hsl(180,100%,50%)] via-[hsl(320,100%,60%)] to-[hsl(270,100%,65%)] bg-clip-text text-transparent">
            Transform Studio
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)]">
            <CardHeader>
              <CardTitle className="flex items-center text-lg font-[Orbitron,sans-serif] text-[hsl(180,100%,70%)]">
                <Upload className="mr-2 h-5 w-5 text-[hsl(60,100%,50%)]" />
                Source Image
              </CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                data-testid="input-source-file"
              />
              {sourceImageUrl ? (
                <div className="relative">
                  <img
                    src={sourceImageUrl}
                    alt="Source"
                    className="w-full max-h-96 object-contain rounded-lg border border-[hsl(180,50%,20%)] bg-black/40"
                    data-testid="img-source-preview"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSourceImageUrl(null)}
                    className="absolute top-2 right-2"
                    data-testid="button-clear-source"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="w-full border-2 border-dashed border-[hsl(180,50%,20%)] hover:border-[hsl(180,100%,50%)] rounded-lg py-16 flex flex-col items-center justify-center text-slate-400 transition-all"
                  data-testid="dropzone-source"
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  ) : (
                    <Upload className="h-8 w-8 mb-2" />
                  )}
                  <p className="text-sm">
                    {uploading ? "Uploading..." : "Drag & drop an image, or click to browse"}
                  </p>
                  <p className="text-xs opacity-60 mt-1">PNG / JPG / WebP · max 12 MB</p>
                </button>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)]">
            <CardHeader>
              <CardTitle className="text-lg font-[Orbitron,sans-serif] text-[hsl(180,100%,70%)]">
                Transform Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList className="grid grid-cols-2 bg-[hsl(240,25%,10%)]">
                  <TabsTrigger value="img2img" data-testid="tab-img2img">
                    <ImageIcon className="h-4 w-4 mr-2" /> Image → Image
                  </TabsTrigger>
                  <TabsTrigger value="img2vid" data-testid="tab-img2vid">
                    <Film className="h-4 w-4 mr-2" /> Image → Video
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="img2img" className="space-y-4 pt-4">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(240,25%,10%)] border border-[hsl(180,50%,20%)] text-sm text-slate-400">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span>Powered by <span className="text-cyan-300 font-medium">Flux 2 Klein ({kleinVersion})</span></span>
                  </div>

                  {/* Quality tier toggle */}
                  <div className="space-y-1.5">
                    <Label>Quality</Label>
                    <div className="flex rounded-md border border-[hsl(180,50%,20%)] overflow-hidden text-sm">
                      <button
                        type="button"
                        onClick={() => setKleinVersion("4b")}
                        className={`flex-1 px-3 py-2 transition-colors ${
                          kleinVersion === "4b"
                            ? "bg-cyan-500/20 text-cyan-300 font-medium"
                            : "bg-[hsl(240,25%,10%)] text-slate-400 hover:text-slate-200"
                        }`}
                        data-testid="btn-klein-4b"
                      >
                        Klein 4b · Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setKleinVersion("9b")}
                        className={`flex-1 px-3 py-2 transition-colors border-l border-[hsl(180,50%,20%)] ${
                          kleinVersion === "9b"
                            ? "bg-purple-500/20 text-purple-300 font-medium"
                            : "bg-[hsl(240,25%,10%)] text-slate-400 hover:text-slate-200"
                        }`}
                        data-testid="btn-klein-9b"
                      >
                        Klein 9b · High Quality
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      {kleinVersion === "4b"
                        ? "~12 Buzz · faster · good for most transforms"
                        : "~24 Buzz · higher fidelity · 2× cost"}
                    </p>
                  </div>
                  <div>
                    <Label>Denoise Strength: {denoise.toFixed(2)}</Label>
                    <Slider
                      value={[denoise]}
                      onValueChange={([v]) => setDenoise(v)}
                      min={0.1}
                      max={0.95}
                      step={0.05}
                      data-testid="slider-denoise"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Lower = closer to source · higher = more creative reinterpretation
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Steps: {steps}</Label>
                      <Slider value={[steps]} onValueChange={([v]) => setSteps(v)} min={4} max={50} step={1} />
                      <p className="text-xs text-slate-500 mt-1">20 is plenty for Klein</p>
                    </div>
                    <div>
                      <Label>Guidance (CFG): {cfg.toFixed(1)}</Label>
                      <Slider value={[cfg]} onValueChange={([v]) => setCfg(v)} min={1} max={20} step={0.5} />
                      <p className="text-xs text-slate-500 mt-1">Sweet spot 4–6 (5 recommended)</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="img2vid" className="space-y-4 pt-4">
                  <div>
                    <Label>Video Engine</Label>
                    <Select value={videoEngine} onValueChange={setVideoEngine}>
                      <SelectTrigger className="bg-[hsl(240,25%,10%)] border-[hsl(180,50%,20%)]" data-testid="select-video-engine">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)]">
                        {VIDEO_ENGINES.map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            {e.label} — <span className="opacity-70">{e.hint}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Duration: {duration}s</Label>
                      <Slider value={[duration]} onValueChange={([v]) => setDuration(v)} min={3} max={5} step={1} />
                    </div>
                    <div>
                      <Label>FPS: {fps}</Label>
                      <Slider value={[fps]} onValueChange={([v]) => setFps(v === 16 ? 16 : 24)} min={16} max={24} step={8} />
                    </div>
                  </div>
                  <div>
                    <Label>Motion Strength: {motion}</Label>
                    <Slider value={[motion]} onValueChange={([v]) => setMotion(v)} min={0} max={10} step={1} />
                  </div>
                </TabsContent>
              </Tabs>

              <div>
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    mode === "img2vid"
                      ? "Describe the motion: e.g. 'slow cinematic camera dolly forward, hair flowing in wind'"
                      : "Describe the new look: e.g. 'anime style, cel shaded, vibrant colors'"
                  }
                  rows={3}
                  className="bg-[hsl(240,25%,10%)] border-[hsl(180,50%,20%)]"
                  data-testid="textarea-prompt"
                />
              </div>
              <div>
                <Label htmlFor="neg">Negative Prompt (optional)</Label>
                <Input
                  id="neg"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="low quality, blurry, deformed"
                  className="bg-[hsl(240,25%,10%)] border-[hsl(180,50%,20%)]"
                  data-testid="input-negative"
                />
              </div>

              <Button
                onClick={() => submit.mutate()}
                disabled={submit.isPending || !sourceImageUrl}
                size="lg"
                className="w-full bg-gradient-to-r from-[hsl(180,100%,40%)] to-[hsl(320,100%,50%)] hover:opacity-90 text-white font-[Orbitron,sans-serif] tracking-wider uppercase"
                data-testid="button-transform-submit"
              >
                {submit.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    {mode === "img2vid"
                      ? "Animate Image (~120 Buzz)"
                      : "Transform Image (~15 Buzz)"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ResultPanel />
          <Card className="bg-[hsl(240,25%,8%)] border-[hsl(180,50%,20%)]">
            <CardHeader>
              <CardTitle className="text-base text-[hsl(180,100%,70%)]">Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400 space-y-2">
              <p>• <strong>img2img</strong>: Lower denoise (0.2–0.4) preserves your composition; higher (0.6–0.9) reimagines it.</p>
              <p>• <strong>img2vid</strong>: A portrait works best for animation. Describe the motion explicitly.</p>
              <p>• Your source image is private — only you can see it unless you publish the result.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
