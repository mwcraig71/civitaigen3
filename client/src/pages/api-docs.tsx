import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check, ChevronDown, ChevronRight, Key, Zap, Image, Users, MapPin, Calendar, BookOpen, Volume2, ArrowLeft } from 'lucide-react';
import Header from '@/components/header';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-gray-300 hover:text-white transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CodeBlock({ code, lang = 'json' }: { code: string; lang?: string }) {
  return (
    <div className="relative mt-2">
      <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm text-gray-200 overflow-x-auto whitespace-pre-wrap font-mono">
        {code}
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-600 text-white',
    POST: 'bg-green-600 text-white',
    PUT: 'bg-yellow-600 text-white',
    DELETE: 'bg-red-600 text-white',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono ${colors[method] || 'bg-gray-600 text-white'}`}>
      {method}
    </span>
  );
}

function EndpointSection({
  method,
  path,
  description,
  auth = true,
  requestBody,
  responseBody,
  params,
  notes,
}: {
  method: string;
  path: string;
  description: string;
  auth?: boolean;
  requestBody?: string;
  responseBody?: string;
  params?: Array<{ name: string; type: string; required: boolean; description: string }>;
  notes?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-700 rounded-lg mb-3 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 hover:bg-slate-750 text-left transition-colors"
      >
        <MethodBadge method={method} />
        <code className="text-purple-300 text-sm font-mono flex-1">{path}</code>
        <span className="text-gray-400 text-sm hidden sm:block">{description}</span>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 bg-slate-800/50 border-t border-slate-700 space-y-4">
          <p className="text-gray-300 text-sm">{description}</p>
          {auth && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 rounded px-3 py-2">
              <Key className="h-3.5 w-3.5" />
              Requires <code className="font-mono">Authorization: Bearer cv_...</code> header
            </div>
          )}
          {notes && (
            <div className="text-xs text-blue-300 bg-blue-400/10 rounded px-3 py-2">{notes}</div>
          )}
          {params && params.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Parameters</p>
              <div className="space-y-1">
                {params.map(p => (
                  <div key={p.name} className="flex items-start gap-2 text-sm">
                    <code className="text-purple-300 font-mono shrink-0">{p.name}</code>
                    <Badge variant="outline" className={`text-xs shrink-0 ${p.required ? 'border-red-500 text-red-400' : 'border-gray-600 text-gray-400'}`}>
                      {p.required ? 'required' : 'optional'}
                    </Badge>
                    <span className="text-gray-500 text-xs">{p.type}</span>
                    <span className="text-gray-300 text-xs">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {requestBody && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Request Body</p>
              <CodeBlock code={requestBody} />
            </div>
          )}
          {responseBody && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Response</p>
              <CodeBlock code={responseBody} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-700">
        <Icon className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

const BASE = 'https://your-domain.com/api/v1';

export default function ApiDocs() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Back link — only shown when logged in */}
        {isAuthenticated && (
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="mb-6 text-gray-400 hover:text-white -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Settings
            </Button>
          </Link>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">API Documentation</h1>
          <p className="text-gray-400">
            Use the CiviVerse API to generate images, manage your scenes and events, and build automations — all from your own scripts, bots, or applications.
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="bg-slate-800 border border-slate-700 mb-6 flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="scenes">Scenes</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="story">Story / TTS</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6">
            <Section icon={Key} title="Getting Your API Key">
              <p className="text-gray-300 text-sm mb-4">
                Every registered user can generate a personal API key from the Settings page. Go to <Link href="/settings"><span className="text-purple-400 underline cursor-pointer">Settings</span></Link> and look for the <strong className="text-white">API Access</strong> section to create or revoke your key.
              </p>
              <p className="text-gray-300 text-sm mb-4">
                Bot accounts (created by an admin) can also obtain a key by logging in via the API:
              </p>
              <CodeBlock lang="bash" code={`POST ${BASE}/login

{
  "username": "your_bot_username",
  "password": "your_bot_password"
}`} />
              <p className="text-gray-400 text-xs mt-2">The response includes an <code className="text-purple-300">apiKey</code> field. Each login rotates the key.</p>
            </Section>

            <Section icon={Key} title="Authentication">
              <p className="text-gray-300 text-sm mb-3">
                Pass your API key as a Bearer token in every request:
              </p>
              <CodeBlock lang="bash" code={`Authorization: Bearer cv_abc123...`} />
              <p className="text-gray-300 text-sm mt-4 mb-3">Full example using <code className="text-purple-300">curl</code>:</p>
              <CodeBlock lang="bash" code={`curl -X GET ${BASE}/account \\
  -H "Authorization: Bearer cv_YOUR_KEY_HERE"`} />
            </Section>

            <Section icon={Zap} title="Credits & Rate Limits">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <p className="text-sm font-semibold text-white mb-1">Without CivitAI key</p>
                  <p className="text-2xl font-bold text-yellow-400">12 credits</p>
                  <p className="text-xs text-gray-400">per image generated</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <p className="text-sm font-semibold text-white mb-1">With your own CivitAI key</p>
                  <p className="text-2xl font-bold text-green-400">4 credits</p>
                  <p className="text-xs text-gray-400">per image generated (67% cheaper)</p>
                </div>
              </div>
              <p className="text-gray-300 text-sm">
                Every account receives <strong className="text-white">500 free Buzz credits</strong> and is automatically topped up every 30 days when your balance runs low. Each API key also has a <strong className="text-white">daily request limit</strong> (default 5 000/day), which resets at midnight UTC.
              </p>
            </Section>

            <Section icon={BookOpen} title="Generation Polling Pattern">
              <p className="text-gray-300 text-sm mb-3">
                Image generation is asynchronous. After submitting a job, poll the status endpoint until <code className="text-purple-300">status</code> becomes <code className="text-green-400">"completed"</code> or <code className="text-red-400">"failed"</code>.
              </p>
              <CodeBlock code={`// 1. Submit the job
POST /api/v1/generate → { generationId: "abc123", status: "processing" }

// 2. Poll every 2–3 seconds
GET /api/v1/generations/abc123
→ { status: "processing", completedImages: 0, quantity: 2 }
→ { status: "processing", completedImages: 1, quantity: 2 }
→ { status: "completed",  completedImages: 2, images: [...] }`} />
            </Section>

            <Section icon={BookOpen} title="Base URL">
              <CodeBlock code={`https://your-domain.com/api/v1`} />
              <p className="text-gray-400 text-xs mt-2">Replace <code className="text-purple-300">your-domain.com</code> with the actual domain where CiviVerse is hosted.</p>
            </Section>
          </TabsContent>

          {/* ── GENERATE ─────────────────────────────────────────── */}
          <TabsContent value="generate">
            <Section icon={Image} title="Image Generation">
              <EndpointSection
                method="POST"
                path="/api/v1/easy-generate"
                description="Easy mode — pick a character and/or scene and generate. The prompt is built automatically."
                requestBody={`{
  "characterId": "char_abc123",   // optional — character ID from /characters
  "sceneId":     "scene_xyz456",  // optional — scene ID from /scenes
  "characterAge": 25,             // optional — overrides character default age
  "extraPrompt":  "smiling",      // optional — extra words appended to prompt
  "quantity":     2               // optional (1–12), default 1
}`}
                responseBody={`{
  "generationId":   "gen_abc123",
  "status":         "processing",
  "prompt":         "masterpiece, best quality, ...",
  "characterName":  "Aria",
  "sceneName":      "Sunny Beach",
  "creditsUsed":    12,
  "creditsRemaining": 488,
  "quantity":       2
}`}
                notes="This mirrors the Easy Mode page flow. No prompt crafting needed — just supply IDs."
              />

              <EndpointSection
                method="POST"
                path="/api/v1/generate"
                description="Advanced generation — full control over every parameter."
                params={[
                  { name: 'prompt', type: 'string', required: true, description: 'Comma-separated prompt terms' },
                  { name: 'negativePrompt', type: 'string', required: false, description: 'Terms to avoid in the image' },
                  { name: 'quantity', type: 'number', required: false, description: '1–12 images, default 1' },
                  { name: 'width', type: 'number', required: false, description: 'Pixels (256–2048), default 832' },
                  { name: 'height', type: 'number', required: false, description: 'Pixels (256–2048), default 1216' },
                  { name: 'steps', type: 'number', required: false, description: '1–50, default 28' },
                  { name: 'cfgScale', type: 'number', required: false, description: '1–20, default 7' },
                  { name: 'seed', type: 'number', required: false, description: 'Specific seed for reproducibility' },
                  { name: 'scheduler', type: 'string', required: false, description: '"Euler" (default), "DPM++ 2M", etc.' },
                  { name: 'clipSkip', type: 'number', required: false, description: '1–12, default 2' },
                  { name: 'loras', type: 'array', required: false, description: '[{ "id": "lora_id", "strength": 0.8 }]' },
                  { name: 'characterId', type: 'string', required: false, description: 'Attach character metadata to the generation' },
                  { name: 'characterName', type: 'string', required: false, description: 'Character name label' },
                  { name: 'sceneName', type: 'string', required: false, description: 'Scene name label' },
                ]}
                requestBody={`{
  "prompt":   "masterpiece, best quality, 1girl, red hair",
  "quantity": 2,
  "steps":    28,
  "loras":    [{ "id": "lora_abc", "strength": 0.75 }]
}`}
                responseBody={`{
  "generationId":     "gen_abc123",
  "status":           "processing",
  "creditsUsed":      24,
  "creditsRemaining": 476,
  "quantity":         2
}`}
                notes="Model is always CyberRealistic Pony. modelId in the request body is accepted but ignored."
              />

              <EndpointSection
                method="POST"
                path="/api/v1/generate"
                description="Image-to-image generation — transform an existing image using a text prompt."
                params={[
                  { name: 'prompt', type: 'string', required: true, description: 'Comma-separated prompt terms describing the output' },
                  { name: 'sourceImageUrl', type: 'string', required: true, description: 'Public URL of the source image to transform' },
                  { name: 'negativePrompt', type: 'string', required: false, description: 'Terms to avoid in the output' },
                  { name: 'generationType', type: 'string', required: false, description: '"img2img" — automatically set when sourceImageUrl is provided' },
                  { name: 'steps', type: 'number', required: false, description: '1–50, default 28' },
                  { name: 'cfgScale', type: 'number', required: false, description: '1–20, default 7' },
                  { name: 'width', type: 'number', required: false, description: 'Pixels (256–2048), default 832' },
                  { name: 'height', type: 'number', required: false, description: 'Pixels (256–2048), default 1216' },
                ]}
                requestBody={`{
  "prompt":         "masterpiece, best quality, 1girl, smiling",
  "sourceImageUrl": "https://example.com/photo.jpg",
  "generationType": "img2img",
  "steps":          28,
  "cfgScale":       7
}`}
                responseBody={`{
  "generationId":     "gen_abc123",
  "status":           "processing",
  "creditsUsed":      12,
  "creditsRemaining": 488,
  "quantity":         1
}`}
                notes='Automatically sets generationType to "img2img" when sourceImageUrl is present. Poll /generations/{id} for results.'
              />

              <EndpointSection
                method="POST"
                path="/api/v1/generate-video"
                description="Image-to-video generation — animate a static image into a short video clip."
                params={[
                  { name: 'prompt', type: 'string', required: true, description: 'Motion description / what the animation should do' },
                  { name: 'sourceImageUrl', type: 'string', required: true, description: 'Public URL of the image to animate' },
                  { name: 'negativePrompt', type: 'string', required: false, description: 'Terms to avoid' },
                  { name: 'videoEngine', type: 'string', required: false, description: '"wan" (default), "haiper", "kling", or "minimax"' },
                  { name: 'durationSeconds', type: 'number', required: false, description: '1–10 seconds, default 4' },
                  { name: 'fps', type: 'number', required: false, description: '8–30 fps, default 16' },
                  { name: 'motionStrength', type: 'number', required: false, description: '0.0–1.0 motion intensity' },
                  { name: 'seed', type: 'number', required: false, description: 'Specific seed for reproducibility' },
                ]}
                requestBody={`{
  "prompt":         "gentle breeze, hair flowing, cinematic",
  "sourceImageUrl": "https://example.com/portrait.jpg",
  "videoEngine":    "wan",
  "durationSeconds": 4,
  "fps":            16
}`}
                responseBody={`{
  "generationId":     "gen_abc123",
  "status":           "processing",
  "creditsUsed":      80,
  "creditsRemaining": 420
}`}
                notes="Costs 80 Buzz per video. Poll /generations/{id} — when status is 'completed', the videoUrl field contains the MP4. Requires a publicly accessible source image URL."
              />

              <EndpointSection
                method="GET"
                path="/api/v1/generations/{id}"
                description="Poll the status of a generation job. Works for txt2img, img2img, and img2vid jobs. When status is 'completed', check generationType to find the result field (imageUrl for images, videoUrl for videos)."
                responseBody={`{
  "id":                  "gen_abc123",
  "status":              "completed",
  "generationType":      "txt2img",
  "prompt":              "masterpiece, best quality, ...",
  "imageUrl":            "https://...",
  "videoUrl":            null,
  "videoThumbnailUrl":   null,
  "videoDurationSeconds": null,
  "videoFps":            null,
  "videoModelEngine":    null,
  "seed":                1234567890,
  "width":               832,
  "height":              1216,
  "quantity":            2,
  "completedImages":     2,
  "images": [
    { "id": "gen_abc123", "imageUrl": "https://...", "seed": 111, "status": "completed" },
    { "id": "gen_abc124", "imageUrl": "https://...", "seed": 222, "status": "completed" }
  ],
  "creditsUsed":    24,
  "createdAt":      "2026-03-14T10:00:00Z",
  "completedAt":    "2026-03-14T10:00:45Z"
}`}
              />

              <EndpointSection
                method="GET"
                path="/api/v1/generations"
                description="List your past generations."
                params={[
                  { name: 'limit', type: 'number', required: false, description: 'Max results (1–100), default 20' },
                  { name: 'offset', type: 'number', required: false, description: 'Pagination offset, default 0' },
                ]}
                responseBody={`{
  "generations": [
    {
      "id":          "gen_abc123",
      "status":      "completed",
      "prompt":      "masterpiece, ...",
      "imageUrl":    "https://...",
      "cost":        12,
      "createdAt":   "2026-03-14T10:00:00Z",
      "completedAt": "2026-03-14T10:00:45Z"
    }
  ],
  "total":   42,
  "hasMore": true
}`}
              />
            </Section>
          </TabsContent>

          {/* ── SCENES ─────────────────────────────────────────── */}
          <TabsContent value="scenes">
            <Section icon={MapPin} title="Scenes">
              <p className="text-gray-400 text-sm mb-4">
                Scenes are reusable combinations of location, outfit, and pose. Build them in the <Link href="/scene-builder"><span className="text-purple-400 underline cursor-pointer">Scene Builder</span></Link> or create them directly via the API, then reference them by ID in <code className="text-purple-300">/easy-generate</code>.
              </p>

              <EndpointSection
                method="GET"
                path="/api/v1/scenes"
                description="List your scenes and publicly shared scenes."
                responseBody={`{
  "scenes": [
    {
      "id":               "scene_xyz456",
      "title":            "Sunny Beach",
      "description":      "Tropical beach at midday",
      "prompt":           "beach, sunny, waves, palm trees",
      "locationCategory": "Outdoors",
      "location":         "beach",
      "outfitCategory":   "Swimwear",
      "outfit":           "bikini",
      "poseCategory":     "Standing",
      "pose":             "hands on hips",
      "isShared":         false,
      "isFavorite":       true,
      "createdAt":        "2026-03-14T09:00:00Z"
    }
  ]
}`}
              />

              <EndpointSection
                method="GET"
                path="/api/v1/scenes/{id}"
                description="Get full details of a single scene (including raw sceneData)."
                responseBody={`{
  "id":               "scene_xyz456",
  "title":            "Sunny Beach",
  "prompt":           "beach, sunny, waves, palm trees",
  "locationCategory": "Outdoors",
  "location":         "beach",
  "outfitCategory":   "Swimwear",
  "outfit":           "bikini",
  "poseCategory":     "Standing",
  "pose":             "hands on hips",
  "sceneData":        { "lighting": "natural", "mood": "warm" },
  "isShared":         false,
  "createdAt":        "2026-03-14T09:00:00Z"
}`}
              />

              <EndpointSection
                method="POST"
                path="/api/v1/scenes"
                description="Create a new scene."
                params={[
                  { name: 'title', type: 'string', required: true, description: 'Display name for the scene' },
                  { name: 'prompt', type: 'string', required: true, description: 'Prompt terms describing the scene' },
                  { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
                  { name: 'locationCategory', type: 'string', required: false, description: 'e.g. "Outdoors", "Indoor"' },
                  { name: 'location', type: 'string', required: false, description: 'Specific location name' },
                  { name: 'outfitCategory', type: 'string', required: false, description: 'e.g. "Swimwear", "Casual"' },
                  { name: 'outfit', type: 'string', required: false, description: 'Specific outfit description' },
                  { name: 'poseCategory', type: 'string', required: false, description: 'e.g. "Standing", "Sitting"' },
                  { name: 'pose', type: 'string', required: false, description: 'Specific pose description' },
                  { name: 'tags', type: 'string[]', required: false, description: 'Array of tag strings' },
                  { name: 'isShared', type: 'boolean', required: false, description: 'Share publicly, default false' },
                  { name: 'sceneData', type: 'object', required: false, description: 'Arbitrary key-value metadata' },
                ]}
                requestBody={`{
  "title":            "Sunny Beach",
  "prompt":           "beach, sunny, ocean waves, clear sky",
  "locationCategory": "Outdoors",
  "location":         "beach",
  "outfitCategory":   "Swimwear",
  "outfit":           "bikini",
  "poseCategory":     "Standing",
  "pose":             "hands on hips",
  "tags":             ["beach", "summer"]
}`}
                responseBody={`{
  "id":        "scene_xyz456",
  "title":     "Sunny Beach",
  "prompt":    "beach, sunny, ocean waves, clear sky",
  "createdAt": "2026-03-14T09:00:00Z"
}`}
              />

              <EndpointSection
                method="DELETE"
                path="/api/v1/scenes/{id}"
                description="Delete one of your scenes."
                responseBody={`{ "success": true }`}
              />
            </Section>
          </TabsContent>

          {/* ── EVENTS ─────────────────────────────────────────── */}
          <TabsContent value="events">
            <Section icon={Calendar} title="Events">
              <p className="text-gray-400 text-sm mb-4">
                Events are multi-step prompt sequences. Each step adds or removes words from a base prompt, letting you build narrative progressions (e.g. a character getting undressed step by step). Manage them in the <Link href="/events"><span className="text-purple-400 underline cursor-pointer">Events</span></Link> page or via the API.
              </p>

              <EndpointSection
                method="GET"
                path="/api/v1/events"
                description="List all your events, each including their steps."
                responseBody={`{
  "events": [
    {
      "id":          "evt_abc",
      "title":       "Beach Day",
      "description": "Character relaxes at the beach",
      "isActive":    true,
      "createdAt":   "2026-03-14T08:00:00Z",
      "steps": [
        {
          "id":           "step_1",
          "stepNumber":   1,
          "title":        "Arrival",
          "wordsToAdd":   ["walking on beach", "casual"],
          "wordsToRemove":[]
        },
        {
          "id":           "step_2",
          "stepNumber":   2,
          "title":        "Swimming",
          "wordsToAdd":   ["in water", "wet"],
          "wordsToRemove":["casual"]
        }
      ]
    }
  ]
}`}
              />

              <EndpointSection
                method="GET"
                path="/api/v1/events/{id}"
                description="Get a single event with all its steps."
              />

              <EndpointSection
                method="POST"
                path="/api/v1/events"
                description="Create a new event."
                params={[
                  { name: 'title', type: 'string', required: true, description: 'Name of the event' },
                  { name: 'description', type: 'string', required: false, description: 'What the event is about' },
                  { name: 'isActive', type: 'boolean', required: false, description: 'Default true' },
                ]}
                requestBody={`{
  "title":       "Beach Day",
  "description": "Character progressively relaxes at the beach"
}`}
                responseBody={`{
  "id":        "evt_abc",
  "title":     "Beach Day",
  "createdAt": "2026-03-14T08:00:00Z",
  "steps":     []
}`}
              />

              <EndpointSection
                method="DELETE"
                path="/api/v1/events/{id}"
                description="Delete an event and all its steps."
                responseBody={`{ "success": true }`}
              />

              <EndpointSection
                method="POST"
                path="/api/v1/events/{id}/steps"
                description="Add a step to an event."
                params={[
                  { name: 'stepNumber', type: 'number', required: true, description: 'Order position (1-based)' },
                  { name: 'title', type: 'string', required: true, description: 'Step name' },
                  { name: 'description', type: 'string', required: false, description: 'What happens in this step' },
                  { name: 'wordsToAdd', type: 'string[]', required: false, description: 'Prompt terms added at this step' },
                  { name: 'wordsToRemove', type: 'string[]', required: false, description: 'Prompt terms removed at this step' },
                ]}
                requestBody={`{
  "stepNumber":    2,
  "title":         "Swimming",
  "wordsToAdd":    ["in water", "wet hair"],
  "wordsToRemove": ["casual outfit"]
}`}
                responseBody={`{
  "id":           "step_2",
  "stepNumber":   2,
  "title":        "Swimming",
  "wordsToAdd":   ["in water", "wet hair"],
  "wordsToRemove":["casual outfit"]
}`}
              />

              <EndpointSection
                method="PUT"
                path="/api/v1/events/{id}/steps/{stepId}"
                description="Update an existing step."
                params={[
                  { name: 'title', type: 'string', required: false, description: 'New title' },
                  { name: 'description', type: 'string', required: false, description: 'New description' },
                  { name: 'stepNumber', type: 'number', required: false, description: 'New order position' },
                  { name: 'wordsToAdd', type: 'string[]', required: false, description: 'Replacement add list' },
                  { name: 'wordsToRemove', type: 'string[]', required: false, description: 'Replacement remove list' },
                ]}
                requestBody={`{
  "wordsToAdd": ["in water", "wet hair", "splashing"]
}`}
              />

              <EndpointSection
                method="DELETE"
                path="/api/v1/events/{id}/steps/{stepId}"
                description="Remove a step from an event."
                responseBody={`{ "success": true }`}
              />

              <div className="mt-4 bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-white mb-2">Using Events with Generate</p>
                <p className="text-gray-300 text-sm mb-3">
                  To generate images for each step of an event, apply the step's <code className="text-purple-300">wordsToAdd</code> and <code className="text-purple-300">wordsToRemove</code> to your base prompt, then call <code className="text-purple-300">POST /api/v1/generate</code>:
                </p>
                <CodeBlock code={`// Step 1 base prompt
let prompt = "masterpiece, best quality, 1girl, at beach, casual outfit";

// Apply step 2 (wordsToAdd + wordsToRemove)
const wordsToAdd    = ["in water", "wet hair"];
const wordsToRemove = ["casual outfit"];

const terms = prompt.split(",").map(t => t.trim())
  .filter(t => !wordsToRemove.some(r => t.toLowerCase().includes(r.toLowerCase())));
terms.push(...wordsToAdd);
prompt = terms.join(", ");

// Submit generation
POST /api/v1/generate { "prompt": prompt, "quantity": 1 }`} />
              </div>
            </Section>
          </TabsContent>

          {/* ── CHARACTERS ─────────────────────────────────────── */}
          <TabsContent value="characters">
            <Section icon={Users} title="Characters">
              <p className="text-gray-400 text-sm mb-4">
                Characters store a base prompt, LoRA configuration, and negative prompt for consistent generation. Create them in the <Link href="/characters"><span className="text-purple-400 underline cursor-pointer">Characters</span></Link> page. Use their ID in <code className="text-purple-300">/easy-generate</code> or extract their <code className="text-purple-300">basePrompt</code> and <code className="text-purple-300">loras</code> for <code className="text-purple-300">/generate</code>.
              </p>

              <EndpointSection
                method="GET"
                path="/api/v1/characters"
                description="List your characters plus all publicly shared characters."
                responseBody={`{
  "characters": [
    {
      "id":             "char_abc123",
      "name":           "Aria",
      "description":    "Tall, red hair, green eyes",
      "basePrompt":     "1girl, red hair, green eyes, slender",
      "negativePrompt": "bad anatomy, extra limbs",
      "tags":           ["redhead", "fantasy"],
      "baseModel":      "Pony",
      "loras": [
        { "id": "lora_111", "strength": 0.8 }
      ]
    }
  ]
}`}
              />
            </Section>

            <Section icon={BookOpen} title="Models">
              <EndpointSection
                method="GET"
                path="/api/v1/models"
                description="List all available models (checkpoints and LoRAs) in the library."
                responseBody={`{
  "models": [
    {
      "id":        "model_abc",
      "name":      "CyberRealistic Pony",
      "type":      "Checkpoint",
      "baseModel": "Pony",
      "civitaiId": "443821",
      "isNSFW":    true
    }
  ]
}`}
              />

              <EndpointSection
                method="GET"
                path="/api/v1/models/{id}"
                description="Get details for a specific model."
              />
            </Section>
          </TabsContent>

          {/* ── STORY / TTS ─────────────────────────────────────── */}
          <TabsContent value="story">
            <Section icon={BookOpen} title="Story Generation">
              <p className="text-gray-400 text-sm mb-4">
                Generate an adult erotic story based on an image prompt or scene description.
              </p>

              <EndpointSection
                method="POST"
                path="/api/v1/story"
                description="Generate an explicit story from an image/scene description."
                params={[
                  { name: 'imagePrompt', type: 'string', required: true, description: 'Scene or image description to write about' },
                  { name: 'userComments', type: 'string', required: false, description: 'Additional writing directions' },
                  { name: 'pov', type: 'string', required: false, description: '"first_person" (default), "character", or "third_person"' },
                  { name: 'storyLength', type: 'string', required: false, description: '"short" (400–600 words), "medium" (600–900), "long" (800–1200)' },
                  { name: 'persona', type: 'object', required: false, description: '{ age, gender, build, description } — reader persona' },
                ]}
                requestBody={`{
  "imagePrompt":  "beautiful woman on a sunny beach in a bikini",
  "pov":          "first_person",
  "storyLength":  "medium",
  "userComments": "Make it playful and flirtatious",
  "persona": {
    "age":    "30s",
    "gender": "male",
    "build":  "athletic"
  }
}`}
                responseBody={`{
  "story": "The warm sand presses between my toes as I approach..."
}`}
              />
            </Section>

            <Section icon={Volume2} title="Text-to-Speech">
              <p className="text-gray-400 text-sm mb-4">
                Convert text to audio using OpenAI TTS or the Kokoro model.
              </p>

              <EndpointSection
                method="POST"
                path="/api/v1/tts"
                description="Convert text to speech audio."
                params={[
                  { name: 'text', type: 'string', required: true, description: 'Text to convert to audio' },
                  { name: 'model', type: 'string', required: false, description: '"openai" (default) or "kokoro"' },
                  { name: 'voice', type: 'string', required: false, description: 'Voice name (see lists below)' },
                  { name: 'speed', type: 'number', required: false, description: '0.5–2.0, default 1.0' },
                ]}
                requestBody={`{
  "text":  "Welcome to CiviVerse. Enjoy your stay.",
  "model": "openai",
  "voice": "nova",
  "speed": 1.0
}`}
                responseBody={`// OpenAI response:
{
  "audioBase64": "//NExAA...",
  "format": "mp3"
}

// Kokoro response:
{
  "audioUrl": "https://replicate.delivery/..."
}`}
                notes="OpenAI voices: alloy, echo, fable, onyx, nova, shimmer. Kokoro voices: af_bella, af_nova, af_sarah, af_sky, am_adam, am_michael, bm_george, bm_lewis, and more."
              />
            </Section>
          </TabsContent>

          {/* ── ACCOUNT ─────────────────────────────────────────── */}
          <TabsContent value="account">
            <Section icon={Key} title="Account">
              <EndpointSection
                method="GET"
                path="/api/v1/account"
                description="Get your account info, credit balance, and API key usage."
                responseBody={`{
  "id":            "user_abc",
  "username":      "myusername",
  "credits":       488,
  "totalGenerated": 42,
  "dailyUsage":    15,
  "dailyLimit":    5000
}`}
              />

              <EndpointSection
                method="POST"
                path="/api/v1/login"
                description="Bot accounts only — authenticate and receive a rotating API key."
                auth={false}
                requestBody={`{
  "username": "bot_username",
  "password": "bot_password"
}`}
                responseBody={`{
  "userId":   "user_abc",
  "username": "bot_username",
  "credits":  500,
  "apiKey":   "cv_abc123..."
}`}
                notes="Each login invalidates the previous key and issues a new one. Regular users should get their key from the Settings page instead."
              />
            </Section>

            <Section icon={BookOpen} title="Error Codes">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 pr-4 text-gray-400 font-medium">Status</th>
                      <th className="text-left py-2 pr-4 text-gray-400 font-medium">Meaning</th>
                      <th className="text-left py-2 text-gray-400 font-medium">Fix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {[
                      ['400', 'Validation error', 'Check the request body against the parameter list'],
                      ['400', 'Insufficient credits', 'Wait for monthly top-up or add your own CivitAI key'],
                      ['401', 'Missing/invalid API key', 'Check the Authorization header format'],
                      ['403', 'API key revoked', 'Generate a new key from Settings'],
                      ['404', 'Not found', 'Check the ID is correct and belongs to your account'],
                      ['429', 'Daily rate limit exceeded', 'Wait until midnight UTC for the limit to reset'],
                      ['500', 'Internal server error', 'Retry after a short delay'],
                    ].map(([code, meaning, fix]) => (
                      <tr key={`${code}-${meaning}`}>
                        <td className="py-2 pr-4"><code className="text-red-400 font-mono">{code}</code></td>
                        <td className="py-2 pr-4 text-gray-300">{meaning}</td>
                        <td className="py-2 text-gray-400 text-xs">{fix}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
