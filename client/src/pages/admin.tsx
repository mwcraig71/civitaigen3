import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { 
  Shield, 
  Users, 
  Image, 
  Database, 
  Settings, 
  Crown, 
  ArrowLeft, 
  UserCheck, 
  UserX,
  User as UserIcon,
  CreditCard,
  RefreshCw,
  BarChart3,
  AlertTriangle,
  Eye,
  Flag,
  FileText,
  CheckCircle,
  XCircle,
  Trash2,
  HardDrive,
  Plus,
  MessageSquare,
  Clock,
  Play,
  Folder,
  FolderOpen,
  Archive,
  Gift,
  Edit,
  Download,
  Copy,
  X,
  Save,
  Edit2,
  Image as ImageIcon,
  Power,
  Wrench,
  Maximize2,
  Key,
  Zap
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { User, Generation, Model, Character } from "@shared/schema";
import type { Generation as GenerationType } from "@/types";
import { insertCharacterSchema } from "@shared/schema";
import ImageGallery from "@/components/image-gallery";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import ImageModal from '@/components/image-modal';

// TrackingButton Component
function TrackingButton({ user }: { user: User }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isTracking, setIsTracking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Check tracking status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/admin/tracking/status/${user.id}`, { credentials: 'include' });
        const data = await response.json();
        setIsTracking(data.isTracking);
        setSessionId(data.session?.id || null);
      } catch (error) {
        console.error('Failed to check tracking status:', error);
      }
    };
    checkStatus();
  }, [user.id]);
  
  const startTracking = async () => {
    try {
      const response = await apiRequest('POST', '/api/admin/tracking/start', { userId: user.id });
      const data = await response.json();
      setIsTracking(true);
      setSessionId(data.session.id);
      toast({
        title: "Tracking Started",
        description: `Now tracking ${user.username}'s activity`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to Start Tracking",
        description: error.message || "Could not start tracking",
        variant: "destructive",
      });
    }
  };
  
  const stopTracking = async () => {
    try {
      const response = await apiRequest('POST', '/api/admin/tracking/stop', { userId: user.id });
      const data = await response.json();
      const sid = data.sessionId;
      setIsTracking(false);
      
      // Download the tracking log
      window.location.href = `/api/admin/tracking/download/${sid}`;
      
      toast({
        title: "Tracking Stopped",
        description: "Downloading tracking log...",
      });
      
      setSessionId(null);
    } catch (error: any) {
      toast({
        title: "Failed to Stop Tracking",
        description: error.message || "Could not stop tracking",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Button
      variant={isTracking ? "default" : "outline"}
      size="sm"
      onClick={isTracking ? stopTracking : startTracking}
      data-testid={`button-${isTracking ? 'stop' : 'start'}-tracking-${user.id}`}
    >
      <Eye className="h-4 w-4 mr-2" />
      {isTracking ? 'Stop Tracking' : 'Track'}
    </Button>
  );
}

interface AdminStats {
  totalUsers: number;
  totalGenerations: number;
  totalModels: number;
  activeUsers: number;
  onlineUsers: number;
  creditsConsumed: number;
  totalUpscales: number;
}

interface SignupPromotion {
  id: string;
  name: string;
  description?: string;
  buzzAmount: number;
  isActive: boolean;
  startDate: string;
  endDate?: string;
  maxUses?: number;
  currentUses: number;
  createdAt: string;
  updatedAt: string;
}

interface MaintenanceMode {
  enabled: boolean;
  setting: {
    id: string;
    key: string;
    value: string;
    description: string | null;
    updatedBy: string;
    updatedAt: string;
    createdAt: string;
  } | null;
  message: string;
}

interface RatingFilter {
  enabled: boolean;
  setting: {
    id: string;
    key: string;
    value: string;
    description: string | null;
    updatedBy: string;
    updatedAt: string;
    createdAt: string;
  } | null;
  message: string;
}

interface ImageProvider {
  provider: 'civitai' | 'diffus';
  diffusAvailable: boolean;
  setting: {
    id: string;
    key: string;
    value: string;
    description: string | null;
    updatedBy: string;
    updatedAt: string;
    createdAt: string;
  } | null;
  message: string;
}

const addCreditsSchema = z.object({
  userId: z.string().min(1, "Please select a user"),
  credits: z.number().min(1, "Credits must be at least 1").max(10000, "Maximum 10,000 credits at once")
});

const createCharacterSchema = insertCharacterSchema.extend({
  tags: z.array(z.string()).optional().default([]),
  imageUrl: z.string().optional(),
  category: z.string().default("User Characters/Female"),
  source: z.string().default("User"),
});

type CreateCharacterForm = z.infer<typeof createCharacterSchema>;

// Helper functions for size labels
const getSizeLabel = (value: number): string => {
  switch (value) {
    case 1: return 'Small';
    case 2: return 'Medium';
    case 3: return 'Large';
    case 4: return 'Extra Large';
    case 5: return 'Huge';
    default: return 'Medium';
  }
};

// Character Image Selector Component - same as in characters.tsx
function CharacterImageSelector({ character, form }: {
  character?: Character;
  form: any;
}) {
  const [showSelector, setShowSelector] = useState(false);
  const { data: generationsData } = useQuery<{generations: Generation[]}>({
    queryKey: ["/api/generations"],
  });

  const generations = generationsData?.generations || [];
  const completedGenerations = generations.filter(gen => 
    gen.status === "completed" && gen.imageUrl
  );

  const currentImageUrl = form.watch("imageUrl");

  const selectImage = (imageUrl: string) => {
    form.setValue("imageUrl", imageUrl);
    setShowSelector(false);
  };

  const removeImage = () => {
    form.setValue("imageUrl", "");
  };

  if (!showSelector && !currentImageUrl) {
    return (
      <div className="space-y-2">
        <FormLabel>Character Image</FormLabel>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowSelector(true)}
          className="w-full h-32 border-dashed"
          data-testid="button-select-image"
        >
          <div className="flex flex-col items-center gap-2">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Choose from generated images
            </span>
          </div>
        </Button>
      </div>
    );
  }

  if (currentImageUrl && !showSelector) {
    return (
      <div className="space-y-2">
        <FormLabel>Character Image</FormLabel>
        <div className="relative">
          <img
            src={currentImageUrl}
            alt="Character preview"
            className="w-full h-32 object-cover rounded-lg border"
            data-testid="img-character-preview"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowSelector(true)}
              className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
              data-testid="button-change-image"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={removeImage}
              className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
              data-testid="button-remove-image"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FormLabel>Choose Character Image</FormLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowSelector(false)}
          data-testid="button-cancel-selector"
        >
          Cancel
        </Button>
      </div>
      
      {completedGenerations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No generated images available. Create some images first!
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {completedGenerations.map((generation) => (
            <button
              key={generation.id}
              type="button"
              onClick={() => selectImage(generation.imageUrl!)}
              className="relative aspect-square overflow-hidden rounded-lg border hover:border-primary transition-colors"
              data-testid={`button-select-generation-${generation.id}`}
            >
              <img
                src={generation.imageUrl!}
                alt={generation.prompt}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Sanitization Rules Types
interface SanitizationRule {
  id: string;
  ruleType: string;
  pattern: string;
  replacement: string | null;
  isEnabled: boolean;
  isSystemRule: boolean;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// Sanitization Rules Section Component
function SanitizationRulesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRule, setNewRule] = useState({ ruleType: 'positive_remove', pattern: '', replacement: '', description: '' });
  const [editingRule, setEditingRule] = useState<SanitizationRule | null>(null);

  const { data: rules = [], isLoading } = useQuery<SanitizationRule[]>({
    queryKey: ['/api/admin/sanitization-rules'],
  });

  const createMutation = useMutation({
    mutationFn: async (rule: { ruleType: string; pattern: string; replacement?: string; description?: string }) => {
      const response = await apiRequest('POST', '/api/admin/sanitization-rules', rule);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sanitization-rules'] });
      setNewRule({ ruleType: 'positive_remove', pattern: '', replacement: '', description: '' });
      toast({ title: 'Rule Created', description: 'Sanitization rule created successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<SanitizationRule> }) => {
      const response = await apiRequest('PATCH', `/api/admin/sanitization-rules/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sanitization-rules'] });
      setEditingRule(null);
      toast({ title: 'Rule Updated', description: 'Sanitization rule updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/sanitization-rules/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sanitization-rules'] });
      toast({ title: 'Rule Deleted', description: 'Sanitization rule deleted successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const ruleTypes = [
    { value: 'positive_remove', label: 'Remove from Prompt', description: 'Words/phrases to remove from user prompts' },
    { value: 'positive_replace', label: 'Replace in Prompt', description: 'Words/phrases to replace with alternatives' },
    { value: 'negative_add', label: 'Add to Negative', description: 'Words to always add to negative prompts' },
    { value: 'negative_block', label: 'Block from Negative', description: 'Prevent users from removing these from negative prompts' },
  ];

  const groupedRules = ruleTypes.map(type => ({
    ...type,
    rules: rules.filter(r => r.ruleType === type.value),
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.pattern.trim()) return;
    createMutation.mutate({
      ruleType: newRule.ruleType,
      pattern: newRule.pattern.trim(),
      replacement: newRule.ruleType === 'positive_replace' ? newRule.replacement.trim() : undefined,
      description: newRule.description.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Prompt Sanitization Rules</h2>
          <p className="text-muted-foreground">Manage content filtering rules for prompts and negative prompts</p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Shield className="h-3 w-3" />
          {rules.length} Rules
        </Badge>
      </div>

      {/* Add New Rule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Rule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <Select value={newRule.ruleType} onValueChange={(v) => setNewRule({ ...newRule, ruleType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ruleTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pattern (word or phrase)</Label>
                <Input
                  value={newRule.pattern}
                  onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                  placeholder="e.g., young girl"
                />
              </div>
              {newRule.ruleType === 'positive_replace' && (
                <div className="space-y-2">
                  <Label>Replacement</Label>
                  <Input
                    value={newRule.replacement}
                    onChange={(e) => setNewRule({ ...newRule, replacement: e.target.value })}
                    placeholder="e.g., woman"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="Why this rule exists"
                />
              </div>
            </div>
            <Button type="submit" disabled={createMutation.isPending || !newRule.pattern.trim()}>
              {createMutation.isPending ? 'Adding...' : 'Add Rule'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Rules by Type */}
      {groupedRules.map(group => (
        <Card key={group.value}>
          <CardHeader>
            <CardTitle className="text-lg">{group.label}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {group.rules.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No rules in this category</p>
            ) : (
              <div className="space-y-2">
                {group.rules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <Switch
                        checked={rule.isEnabled}
                        onCheckedChange={(checked) => updateMutation.mutate({ id: rule.id, updates: { isEnabled: checked } })}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{rule.pattern}</code>
                          {rule.ruleType === 'positive_replace' && rule.replacement && (
                            <>
                              <span className="text-muted-foreground">→</span>
                              <code className="text-sm font-mono bg-green-500/20 text-green-600 px-2 py-0.5 rounded">{rule.replacement}</code>
                            </>
                          )}
                          {rule.isSystemRule && (
                            <Badge variant="secondary" className="text-xs">System</Badge>
                          )}
                          {!rule.isEnabled && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingRule(rule)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Edit Rule Dialog */}
      <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Rule</DialogTitle>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Pattern</Label>
                <Input
                  value={editingRule.pattern}
                  onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                />
              </div>
              {editingRule.ruleType === 'positive_replace' && (
                <div className="space-y-2">
                  <Label>Replacement</Label>
                  <Input
                    value={editingRule.replacement || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, replacement: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={editingRule.description || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingRule(null)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate({
                    id: editingRule.id,
                    updates: {
                      pattern: editingRule.pattern,
                      replacement: editingRule.replacement,
                      description: editingRule.description,
                    },
                  })}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form for adding credits
  const addCreditsForm = useForm<z.infer<typeof addCreditsSchema>>({
    resolver: zodResolver(addCreditsSchema),
    defaultValues: {
      userId: "",
      credits: undefined // Start with undefined instead of 100
    }
  });
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");
  
  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [generationToDelete, setGenerationToDelete] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState("");

  // Promotions state
  const [isCreatingPromotion, setIsCreatingPromotion] = useState(false);
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [newPromotion, setNewPromotion] = useState({
    name: "",
    description: "",
    buzzAmount: 150,
    isActive: true,
    maxUses: "",
  });

  // Airdrop state
  const [showAirdropDialog, setShowAirdropDialog] = useState(false);
  const [airdropForm, setAirdropForm] = useState({
    amount: 100,
    reason: "",
  });

  // Full-size image modal states
  const [fullSizeImage, setFullSizeImage] = useState<any>(null);
  const [showFullImageDialog, setShowFullImageDialog] = useState(false);
  
  // Full prompt modal states
  const [fullPromptImage, setFullPromptImage] = useState<any>(null);
  const [showFullPromptDialog, setShowFullPromptDialog] = useState(false);

  // Character images modal states
  const [selectedCharacterForImages, setSelectedCharacterForImages] = useState<Character | null>(null);
  const [showCharacterImagesDialog, setShowCharacterImagesDialog] = useState(false);

  // User images modal states (for credit management section)
  const [selectedUserForImages, setSelectedUserForImages] = useState<User | null>(null);
  const [showUserImagesDialog, setShowUserImagesDialog] = useState(false);

  // External API Key management state
  const [newBotName, setNewBotName] = useState("");
  const [newBotCredits, setNewBotCredits] = useState("10000");
  const [newBotDailyLimit, setNewBotDailyLimit] = useState("1200");
  const [newBotPassword, setNewBotPassword] = useState("");
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [viewingFullSizeImage, setViewingFullSizeImage] = useState<Generation | null>(null);
  const [imageToDelete, setImageToDelete] = useState<Generation | null>(null);

  // Check if user is admin
  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  // Redirect if not admin
  useEffect(() => {
    if (user && !user.isAdmin) {
      toast({
        title: "Access Denied",
        description: "You don't have admin privileges",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation('/');
      }, 1000);
    }
  }, [user, setLocation, toast]);

  // Admin queries
  const { data: adminStats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: !!user?.isAdmin,
  });

  // Query for user preferences analytics
  const { data: userPreferencesAnalytics } = useQuery<{
    breastSize: { size: number; count: number }[];
    assSize: { size: number; count: number }[];
  }>({
    queryKey: ["/api/admin/user-preferences-analytics"],
    enabled: !!user?.isAdmin,
  });

  // Online users query
  const { data: onlineUsersData } = useQuery<{onlineUsers: any[], count: number, timestamp: string}>({
    queryKey: ["/api/admin/online-users"],
    enabled: !!user?.isAdmin,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // State for sorting and pagination
  const [sortBy, setSortBy] = useState<'lastActiveAt' | 'alphabetical' | 'createdAt'>('createdAt');
  const [currentPage, setCurrentPage] = useState(1);
  
  const { data: usersData } = useQuery<{users: User[], pagination: any}>({
    queryKey: ["/api/admin/users", { sortBy, search: userSearch }],
    queryFn: () => {
      const params = new URLSearchParams({
        sortBy
      });
      if (userSearch.trim()) {
        params.append('search', userSearch.trim());
      }
      return apiRequest('GET', `/api/admin/users?${params}`).then(r => r.json());
    },
    enabled: !!user?.isAdmin,
  });
  
  // Get users from API response (already sorted and filtered by backend)
  const allUsers = usersData?.users || [];
  const pagination = usersData?.pagination;
  
  // Use backend sorting directly - no client-side re-sorting
  const filteredUsers = allUsers;

  // Admin gallery pagination state
  const [adminPage, setAdminPage] = useState(1);
  const [allAdminGenerations, setAllAdminGenerations] = useState<Generation[]>([]);
  const [adminHasMore, setAdminHasMore] = useState(true);
  const [adminTotal, setAdminTotal] = useState(0);

  const { data: generationsData, isLoading: isLoadingAdminGenerations } = useQuery<{generations: Generation[], total: number, page: number, limit: number, hasMore: boolean}>({
    queryKey: ["/api/admin/generations", adminPage, usernameFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: adminPage.toString(),
        limit: '80'
      });
      if (usernameFilter) {
        params.append('username', usernameFilter);
      }
      return apiRequest('GET', `/api/admin/generations?${params}`).then(r => r.json());
    },
    enabled: !!user?.isAdmin,
  });

  // Update all generations when new data comes in
  useEffect(() => {
    if (generationsData) {
      if (adminPage === 1) {
        // First page - replace all
        setAllAdminGenerations(generationsData.generations);
      } else {
        // Additional pages - append
        setAllAdminGenerations(prev => [...prev, ...generationsData.generations]);
      }
      setAdminHasMore(generationsData.hasMore);
      setAdminTotal(generationsData.total);
    }
  }, [generationsData, adminPage]);

  // Reset to first page and invalidate query when username filter changes
  useEffect(() => {
    setAdminPage(1);
    setAllAdminGenerations([]);
    // Invalidate the query to force a refetch with new filter
    queryClient.invalidateQueries({ queryKey: ["/api/admin/generations"] });
  }, [usernameFilter]);
  
  const allGenerations = allAdminGenerations;
  
  // Dedicated query for Recent Generation Log (500 latest)
  const { data: recentGenerations } = useQuery<(Generation & { user?: User })[]>({
    queryKey: ["/api/admin/generations/recent"],
    enabled: !!user?.isAdmin,
  });

  const loadMoreAdminGenerations = () => {
    if (adminHasMore && !isLoadingAdminGenerations) {
      setAdminPage(prev => prev + 1);
    }
  };

  const { data: allModels } = useQuery<Model[]>({
    queryKey: ["/api/admin/models"],
    enabled: !!user?.isAdmin,
  });

  const { data: allCharacters } = useQuery<Character[]>({
    queryKey: ["/api/characters"],
    enabled: !!user?.isAdmin,
  });

  // Platform settings query
  const { data: platformSettings } = useQuery<any[]>({
    queryKey: ["/api/admin/settings"],
    enabled: !!user?.isAdmin,
  });

  // User feedback query
  const { data: allFeedback } = useQuery<any[]>({
    queryKey: ["/api/admin/feedback"],
    enabled: !!user?.isAdmin,
  });

  // Moderation logs queries
  const { data: moderationLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/moderation-logs"],
    enabled: !!user?.isAdmin && activeTab === "moderation",
  });

  const { data: reportedImages } = useQuery<any[]>({
    queryKey: ["/api/admin/reported-images"],
    enabled: !!user?.isAdmin,
  });

  // External API Keys query
  const { data: externalApiKeys } = useQuery<{ keys: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    dailyLimit: number;
    dailyUsage: number;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
  }> }>({
    queryKey: ['/api/api-keys'],
    enabled: !!user?.isAdmin && activeTab === "api",
  });

  const createBotMutation = useMutation({
    mutationFn: (data: { botName: string; credits: number; dailyLimit: number; password?: string }) =>
      apiRequest('POST', '/api/admin/create-bot-account', data),
    onSuccess: async (response: any) => {
      const result = await response.json();
      setGeneratedApiKey(result.apiKey.key);
      queryClient.invalidateQueries({ queryKey: ['/api/api-keys'] });
      toast({
        title: "Bot Account Created",
        description: `Bot "${result.bot.username}" created with ${result.bot.credits} credits.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create bot account",
        variant: "destructive",
      });
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/api-keys'] });
      toast({ title: "API Key Revoked" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to revoke key", description: error.message, variant: "destructive" });
    },
  });

  const { data: botAccounts } = useQuery<{ bots: Array<{
    id: string;
    username: string;
    displayName: string | null;
    email: string | null;
    credits: number;
    totalGenerations: number;
    createdAt: string | null;
  }> }>({
    queryKey: ['/api/admin/bot-accounts'],
    enabled: !!user?.isAdmin && activeTab === "api",
  });

  const impersonateMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('POST', `/api/admin/impersonate/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      window.location.href = '/';
    },
    onError: (error: any) => {
      toast({ title: "Impersonation Failed", description: error.message, variant: "destructive" });
    },
  });

  // Maintenance mode query
  const { data: maintenanceStatus, refetch: refetchMaintenanceStatus } = useQuery<MaintenanceMode>({
    queryKey: ["/api/system/maintenance"],
    enabled: !!user?.isAdmin,
  });

  // Maintenance mode mutation
  const toggleMaintenanceMutation = useMutation({
    mutationFn: (data: { enabled: boolean; message?: string }) => 
      apiRequest('POST', '/api/system/maintenance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/maintenance"] });
      refetchMaintenanceStatus();
      toast({
        title: "Maintenance Mode Updated",
        description: maintenanceStatus?.enabled 
          ? "Maintenance mode disabled - users can now access the app" 
          : "Maintenance mode enabled - only admins can access the app",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update Maintenance Mode",
        description: error.message || "Failed to toggle maintenance mode",
        variant: "destructive",
      });
    },
  });

  // Rating filter query and mutation
  const { data: ratingFilterStatus, refetch: refetchRatingFilterStatus } = useQuery<RatingFilter>({
    queryKey: ["/api/system/rating-filter"],
    enabled: !!user?.isAdmin,
  });

  const toggleRatingFilterMutation = useMutation({
    mutationFn: (data: { enabled: boolean }) =>
      apiRequest('POST', '/api/system/rating-filter', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/rating-filter"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shared-images"] });
      refetchRatingFilterStatus();
      toast({
        title: "Rating Filter Updated",
        description: ratingFilterStatus?.enabled 
          ? "Rating filter disabled - all content ratings are visible" 
          : "Rating filter enabled - only R and PG content shown to all users",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update Rating Filter",
        description: error.message || "Failed to toggle rating filter",
        variant: "destructive",
      });
    },
  });

  // Image provider query and mutation
  const { data: imageProviderStatus, refetch: refetchImageProviderStatus } = useQuery<ImageProvider>({
    queryKey: ["/api/system/image-provider"],
    enabled: !!user?.isAdmin,
  });

  const toggleImageProviderMutation = useMutation({
    mutationFn: (data: { provider: 'civitai' | 'diffus' }) =>
      apiRequest('POST', '/api/system/image-provider', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/image-provider"] });
      refetchImageProviderStatus();
      toast({
        title: "Image Provider Updated",
        description: imageProviderStatus?.provider === 'civitai'
          ? "Now using Diffus API for image generation" 
          : "Now using CivitAI API for image generation",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update Image Provider",
        description: error.message || "Failed to toggle image provider",
        variant: "destructive",
      });
    },
  });

  // Reported image moderation mutations
  const approveReportedImageMutation = useMutation({
    mutationFn: (imageId: string) => 
      apiRequest('POST', `/api/admin/reported-images/${imageId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reported-images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/generations"] });
      toast({
        title: "Image Approved",
        description: "Reported image has been approved and restored to public view",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Approve Image",
        description: error.message || "Failed to approve reported image",
        variant: "destructive",
      });
    },
  });

  const deleteReportedImageMutation = useMutation({
    mutationFn: (imageId: string) => 
      apiRequest('DELETE', `/api/admin/reported-images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reported-images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/generations"] });
      toast({
        title: "Image Deleted",
        description: "Reported image has been permanently deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete Image",
        description: error.message || "Failed to delete reported image",
        variant: "destructive",
      });
    },
  });

  // Promotions queries
  const { data: promotions = [] } = useQuery<SignupPromotion[]>({
    queryKey: ["/api/signup-promotions"],
    enabled: !!user?.isAdmin,
  });

  const { data: activePromotion } = useQuery<SignupPromotion>({
    queryKey: ["/api/signup-promotions/active"],
    enabled: !!user?.isAdmin,
  });

  // Object storage queries
  const [selectedFolder, setSelectedFolder] = useState('cards/prompts/');
  const { data: storageStats } = useQuery<any>({
    queryKey: ["/api/admin/object-storage/stats"],
    enabled: !!user?.isAdmin,
  });

  const { data: folderContents } = useQuery<any>({
    queryKey: ["/api/admin/object-storage", selectedFolder],
    queryFn: () => apiRequest('GET', `/api/admin/object-storage?folder=${selectedFolder}`).then(r => r.json()),
    enabled: !!user?.isAdmin,
  });

  // Admin actions
  const resetCreditsMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/reset-credits'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      toast({
        title: "Credits Reset",
        description: "Demo user credits reset to 500",
      });
    },
  });

  // System reset mutations
  const resetWebSocketMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/reset-websocket'),
    onSuccess: (response: any) => {
      toast({
        title: "WebSocket Reset",
        description: response?.message || "All WebSocket connections have been reset",
      });
    },
    onError: (error: any) => {
      toast({
        title: "WebSocket Reset Failed",
        description: error.message || "Failed to reset WebSocket connections",
        variant: "destructive",
      });
    },
  });

  const refreshModelsMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/models/refresh'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/models'] });
      toast({
        title: "Models Refreshed",
        description: "Model cache has been refreshed from CivitAI",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Model Refresh Failed",
        description: error.message || "Failed to refresh models",
        variant: "destructive",
      });
    },
  });

  const clearCacheMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/clear-cache'),
    onSuccess: (response: any) => {
      // Invalidate all queries to force fresh data
      queryClient.invalidateQueries();
      toast({
        title: "Cache Cleared",
        description: response?.message || "All application caches have been cleared",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cache Clear Failed",
        description: error.message || "Failed to clear application cache",
        variant: "destructive",
      });
    },
  });

  const restartSystemMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/restart-system'),
    onSuccess: (response: any) => {
      toast({
        title: "System Restart Initiated",
        description: response?.message || "System restart has been initiated",
      });
      // Refresh page after a delay to reconnect
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    },
    onError: (error: any) => {
      toast({
        title: "System Restart Failed",
        description: error.message || "Failed to restart system",
        variant: "destructive",
      });
    },
  });

  const addCreditsMutation = useMutation({
    mutationFn: ({ userId, credits }: { userId: string; credits: number }) => 
      apiRequest('POST', '/api/admin/add-credits', { userId, credits }),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] }); // Refresh current user's data too
      addCreditsForm.reset();
      toast({
        title: "Credits Added",
        description: response?.message || "Credits added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Credits",
        description: error.message || "Failed to add credits to user",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmitAddCredits = (data: z.infer<typeof addCreditsSchema>) => {
    addCreditsMutation.mutate(data);
  };

  // Delete character mutation
  const deleteCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      const response = await fetch(`/api/admin/characters/${characterId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to delete character');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({ title: "Character deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete character", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleDeleteCharacter = (character: Character) => {
    if (window.confirm(`Are you sure you want to delete the character "${character.name}"? This action cannot be undone.`)) {
      deleteCharacterMutation.mutate(character.id);
    }
  };

  // Character images query
  const { data: characterImages = [], isLoading: loadingCharacterImages } = useQuery<Generation[]>({
    queryKey: ["/api/admin/characters", selectedCharacterForImages?.id, "images"],
    queryFn: async () => {
      if (!selectedCharacterForImages) return [];
      const response = await fetch(`/api/admin/characters/${selectedCharacterForImages.id}/images`);
      if (!response.ok) throw new Error('Failed to fetch character images');
      const data = await response.json();
      return data.images;
    },
    enabled: !!selectedCharacterForImages,
  });

  const handleViewCharacterImages = (character: Character) => {
    setSelectedCharacterForImages(character);
    setShowCharacterImagesDialog(true);
  };

  // User images query for credit management section
  const { data: userImagesData, isLoading: loadingUserImages } = useQuery<{ generations: Generation[]; total: number }>({
    queryKey: ["/api/admin/generations", { userId: selectedUserForImages?.id }],
    queryFn: async () => {
      if (!selectedUserForImages) return { generations: [], total: 0 };
      const response = await fetch(`/api/admin/generations?userId=${selectedUserForImages.id}&limit=100`);
      if (!response.ok) throw new Error('Failed to fetch user images');
      return response.json();
    },
    enabled: !!selectedUserForImages,
  });

  const handleViewUserImages = (user: User) => {
    setSelectedUserForImages(user);
    setShowUserImagesDialog(true);
  };

  // Delete generation dialog handlers
  const handleDeleteGeneration = (generation: any) => {
    setGenerationToDelete(generation);
    setDeleteReason("");
    setShowDeleteDialog(true);
  };

  const confirmDeleteGeneration = () => {
    if (generationToDelete) {
      deleteGenerationMutation.mutate({ 
        id: generationToDelete.id, 
        reason: deleteReason.trim() || undefined
      });
      setShowDeleteDialog(false);
      setGenerationToDelete(null);
      setDeleteReason("");
    }
  };

  const cancelDeleteGeneration = () => {
    setShowDeleteDialog(false);
    setGenerationToDelete(null);
    setDeleteReason("");
  };

  const toggleAdminMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('POST', `/api/admin/users/${userId}/toggle-admin`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      toast({
        title: "User Updated",
        description: "Admin status has been toggled",
      });
    },
  });

  // Flag user for policy violation mutation
  const flagUserMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('POST', `/api/admin/users/${userId}/flag`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      toast({
        title: "User Flagged",
        description: "User has been flagged for policy violation review",
        variant: "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Flag User",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // CSV export mutation
  const exportCSVMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/export-users-csv', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }
      
      return response.blob();
    },
    onSuccess: (blob) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "CSV Export Complete",
        description: "User data has been downloaded as CSV",
      });
    },
    onError: (error: any) => {
      toast({
        title: "CSV Export Failed",
        description: error.message || "Failed to export user data",
        variant: "destructive",
      });
    },
  });

  // CSV export handler
  const handleExportUsersCSV = () => {
    exportCSVMutation.mutate();
  };

  const clearStorageMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/admin/clear-storage');
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/generations'] });
      toast({
        title: "Storage Cleared",
        description: `Successfully deleted ${data.summary.totalDeleted} files from object storage`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Storage Cleanup Failed",
        description: error.message || "Failed to clear storage",
        variant: "destructive",
      });
    },
  });

  // User lock/unlock mutations
  const lockUserMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) => 
      apiRequest('POST', `/api/admin/users/${userId}/lock`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      toast({
        title: "User Locked",
        description: "User account has been locked successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Lock User",
        description: error.message || "Failed to lock user account",
        variant: "destructive",
      });
    },
  });

  const unlockUserMutation = useMutation({
    mutationFn: (userId: string) => 
      apiRequest('POST', `/api/admin/users/${userId}/unlock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      toast({
        title: "User Unlocked",
        description: "User account has been unlocked successfully",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) => 
      apiRequest('DELETE', `/api/admin/users/${userId}`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({
        title: "User Deleted",
        description: "User account has been permanently deleted",
      });
    },
    onError: (error: any) => {
      console.error("Delete user error:", error);
      toast({
        title: "Delete Failed",
        description: error?.message || "Failed to delete user. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Platform settings mutations
  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value, description }: { key: string; value: string; description?: string }) => 
      apiRequest('PUT', `/api/admin/settings/${key}`, { value, description }),
    onSuccess: () => {
      // Force refetch to update UI immediately
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.refetchQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: "Setting Updated",
        description: "Platform setting has been updated successfully",
      });
    },
  });

  // Feedback management mutations
  const updateFeedbackMutation = useMutation({
    mutationFn: ({ id, status, adminResponse }: { id: string; status: string; adminResponse?: string }) => 
      apiRequest('PUT', `/api/admin/feedback/${id}`, { status, adminResponse }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feedback'] });
      toast({
        title: "Feedback Updated",
        description: "Feedback status has been updated successfully",
      });
    },
  });

  // Delete generation mutation  
  const deleteGenerationMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return await apiRequest('DELETE', `/api/admin/generations/${id}`, { reason });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/generations'] });
      toast({
        title: "Image Deleted",
        description: `Image deleted successfully. ${data.user ? `User ${data.user.username} will be notified.` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: `Failed to delete image: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Content rating mutation
  const contentRatingMutation = useMutation({
    mutationFn: async ({ generationId, rating }: { generationId: string; rating: string }) => {
      const response = await apiRequest('PATCH', `/api/admin/generations/${generationId}/rating`, { contentRating: rating });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Rating Updated",
        description: "Content rating has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/generations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update rating",
        variant: "destructive",
      });
    }
  });

  const updateContentRating = (generationId: string, rating: string) => {
    contentRatingMutation.mutate({ generationId, rating });
  };

  // Promotions mutations
  const createPromotionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/signup-promotions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions/active"] });
      setIsCreatingPromotion(false);
      setNewPromotion({
        name: "",
        description: "",
        buzzAmount: 150,
        isActive: true,
        maxUses: "",
      });
      toast({
        title: "Success",
        description: "Promotion created successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create promotion",
        variant: "destructive",
      });
    },
  });

  const updatePromotionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/signup-promotions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions/active"] });
      setEditingPromotionId(null);
      toast({
        title: "Success",
        description: "Promotion updated successfully!",
      });
    },
  });

  const deletePromotionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/signup-promotions/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions/active"] });
      toast({
        title: "Success",
        description: "Promotion deleted successfully!",
      });
    },
  });

  // Airdrop mutation
  const airdropMutation = useMutation({
    mutationFn: async (data: { amount: number; reason?: string }) => {
      return apiRequest("POST", "/api/admin/airdrop-buzz", data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/admin/users' });
      setShowAirdropDialog(false);
      setAirdropForm({ amount: 100, reason: "" });
      toast({
        title: "Airdrop Successful! 🎉",
        description: `${response.message} (Total: ${response.totalBuzzDistributed} buzz)`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Airdrop Failed",
        description: error?.message || "Failed to airdrop buzz to users",
        variant: "destructive",
      });
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Loading Admin Panel...</h2>
          <p className="text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            You don't have administrator privileges to access this area.
          </p>
          <Link href="/">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background transition-all duration-200">
      {/* Header */}
      <div className="border-b bg-card/50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Link href="/">
                <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3 transition-all duration-200 hover:scale-105">
                  <ArrowLeft className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Back to App</span>
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                <h1 className="text-lg sm:text-2xl font-bold">Admin Dashboard</h1>
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Crown className="h-3 w-3" />
                  <span className="hidden sm:inline">Administrator</span>
                </Badge>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground self-end sm:self-center">
              Welcome, {user.displayName || user.username}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Mobile-friendly tab navigation */}
          <div className="mb-6 overflow-x-auto">
            <TabsList className="w-max min-w-full grid grid-cols-7 sm:grid-cols-13 gap-1 h-auto p-1 transition-all duration-200">
              <TabsTrigger value="overview" data-testid="tab-overview" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Users className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Users</span>
              </TabsTrigger>
              <TabsTrigger value="gallery" data-testid="tab-gallery" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Eye className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Gallery</span>
              </TabsTrigger>
              <TabsTrigger value="models" data-testid="tab-models" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Database className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Models</span>
              </TabsTrigger>
              <TabsTrigger value="promotions" data-testid="tab-promotions" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Gift className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Promos</span>
              </TabsTrigger>
              <TabsTrigger value="feedback" data-testid="tab-feedback" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Feedback</span>
              </TabsTrigger>
              <TabsTrigger value="storage" data-testid="tab-storage" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Archive className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Storage</span>
              </TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Flag className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Reports</span>
              </TabsTrigger>
              <TabsTrigger value="moderation" data-testid="tab-moderation" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Mod Logs</span>
              </TabsTrigger>
              <TabsTrigger value="characters" data-testid="tab-characters" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <UserIcon className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Characters</span>
              </TabsTrigger>
              <TabsTrigger value="tools" data-testid="tab-tools" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Settings className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Settings</span>
              </TabsTrigger>
              <TabsTrigger value="sanitization" data-testid="tab-sanitization" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Shield className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Filters</span>
              </TabsTrigger>
              <TabsTrigger value="api" data-testid="tab-api" className="flex-col gap-1 h-16 sm:h-10 sm:flex-row transition-all duration-200">
                <Key className="h-4 w-4" />
                <span className="text-xs sm:text-sm">API</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-6 transition-all duration-200">
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">{adminStats?.totalUsers || 0}</div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md border-green-200 dark:border-green-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Online Now</CardTitle>
                  <div className="relative">
                    <Users className="h-4 w-4 text-green-500" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{adminStats?.onlineUsers || 0}</div>
                  <p className="text-xs text-muted-foreground">Connected users</p>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Generations</CardTitle>
                  <Image className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">{adminStats?.totalGenerations || 0}</div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Models</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">{adminStats?.totalModels || 0}</div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Credits Consumed</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">{adminStats?.creditsConsumed || 0}</div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md border-purple-200 dark:border-purple-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Upscales</CardTitle>
                  <ImageIcon className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">{adminStats?.totalUpscales || 0}</div>
                  <p className="text-xs text-muted-foreground">Images upscaled</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 transition-all duration-200">
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Recent Generation Log</CardTitle>
                  <CardDescription>Latest 500 generations from all users</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto space-y-3 border rounded-md p-3">
                    {recentGenerations?.map((generation) => (
                      <div key={generation.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                              <UserIcon className="h-3 w-3 text-primary" />
                            </div>
                            <p className="text-sm font-medium truncate">
                              {generation.user?.username || 'Unknown User'}
                            </p>
                            <Badge variant="outline" className="text-xs ml-auto">
                              {generation.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {generation.prompt || 'No prompt available'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {generation.createdAt 
                              ? formatInTimeZone(new Date(generation.createdAt), 'America/New_York', 'MMM dd • h:mm:ss a')
                              : 'Unknown time'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!recentGenerations || recentGenerations.length === 0) && (
                      <div className="text-center py-8">
                        <Clock className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No recent activity</p>
                      </div>
                    )}
                    {recentGenerations && recentGenerations.length > 0 && (
                      <div className="text-center py-2 border-t mt-3 pt-3">
                        <p className="text-xs text-muted-foreground">
                          Showing {recentGenerations.length} most recent generations
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="relative">
                      <Users className="h-5 w-5 text-green-500" />
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                    Users Online Now
                  </CardTitle>
                  <CardDescription>
                    Currently connected users ({onlineUsersData?.count || 0} online)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {onlineUsersData?.onlineUsers && onlineUsersData.onlineUsers.length > 0 ? (
                      onlineUsersData.onlineUsers.map((user: any) => (
                        <div key={user.id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <div>
                              <p className="text-sm font-medium">
                                {user.displayName || user.username}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {user.isAdmin && (
                              <Badge variant="default" className="text-xs">
                                Admin
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4">
                        <Users className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No users currently online</p>
                      </div>
                    )}
                  </div>
                  {onlineUsersData?.timestamp && (
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      Last updated: {formatInTimeZone(new Date(onlineUsersData.timestamp), 'America/New_York', 'h:mm:ss a zzz')}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                  <CardDescription>Platform health and performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span>Database</span>
                      <Badge variant="default">Healthy</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>CivitAI Integration</span>
                      <Badge variant="default">Online</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Object Storage</span>
                      <Badge variant="default">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Generation Queue</span>
                      <Badge variant="secondary">Processing</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* User Preferences Analytics Section */}
            {userPreferencesAnalytics && (userPreferencesAnalytics.breastSize.length > 0 || userPreferencesAnalytics.assSize.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 transition-all duration-200">
                {/* Breast Size Analytics */}
                {userPreferencesAnalytics.breastSize.length > 0 && (
                  <Card className="transition-all duration-200 hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Body Attribute Preferences - Breast Size
                      </CardTitle>
                      <CardDescription>User preferences collected during fip-fap onboarding (scale 1-5)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={userPreferencesAnalytics.breastSize.map(item => ({
                            size: `Size ${item.size}`,
                            count: item.count
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="size" />
                            <YAxis />
                            <Tooltip 
                              formatter={(value: number) => [value, 'Users']}
                              labelFormatter={(label: string) => `${label}`}
                            />
                            <Bar dataKey="count" fill="#8884d8" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 text-center">
                        <p className="text-sm text-muted-foreground">
                          Total responses: {userPreferencesAnalytics.breastSize.reduce((sum, item) => sum + item.count, 0)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Ass Size Analytics */}
                {userPreferencesAnalytics.assSize.length > 0 && (
                  <Card className="transition-all duration-200 hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Body Attribute Preferences - Ass Size
                      </CardTitle>
                      <CardDescription>User preferences collected during fip-fap onboarding (scale 1-5)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={userPreferencesAnalytics.assSize.map(item => ({
                            size: `Size ${item.size}`,
                            count: item.count
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="size" />
                            <YAxis />
                            <Tooltip 
                              formatter={(value: number) => [value, 'Users']}
                              labelFormatter={(label: string) => `${label}`}
                            />
                            <Bar dataKey="count" fill="#82ca9d" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 text-center">
                        <p className="text-sm text-muted-foreground">
                          Total responses: {userPreferencesAnalytics.assSize.reduce((sum, item) => sum + item.count, 0)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage user accounts, permissions, and moderation actions</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Search and Sorting Controls */}
                <div className="flex flex-col gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Search Users</Label>
                    <Input
                      placeholder="Search by name, username, or email (searches all users)..."
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setCurrentPage(1); // Reset to first page on search
                      }}
                      className="max-w-md"
                      data-testid="input-user-management-search"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Sort Users</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={sortBy === 'createdAt' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSortBy('createdAt');
                          setCurrentPage(1);
                        }}
                        data-testid="button-sort-date-joined"
                      >
                        <Clock className="h-4 w-4 mr-2" />
                        Date Joined
                      </Button>
                      <Button
                        variant={sortBy === 'alphabetical' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSortBy('alphabetical');
                          setCurrentPage(1);
                        }}
                        data-testid="button-sort-alphabetical"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Alphabetical
                      </Button>
                      <Button
                        variant={sortBy === 'lastActiveAt' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSortBy('lastActiveAt');
                          setCurrentPage(1);
                        }}
                        data-testid="button-sort-last-active"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Last Active
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Export Data</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportUsersCSV}
                      disabled={exportCSVMutation.isPending}
                      data-testid="button-export-csv"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportCSVMutation.isPending ? 'Exporting...' : 'Download CSV'}
                    </Button>
                  </div>
                  
                  {pagination && (
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-medium">Page {pagination.page} of {pagination.totalPages}</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.totalUsers)} of {pagination.totalUsers} users
                        </span>
                        {pagination.hasMore && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            data-testid="button-next-page"
                          >
                            Next 300
                          </Button>
                        )}
                        {pagination.page > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => prev - 1)}
                            data-testid="button-previous-page"
                          >
                            Previous
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </div>
                
                {userSearch && filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No users found matching "{userSearch}"
                  </div>
                )}
                
                <div className="space-y-3 sm:space-y-4">
                  {filteredUsers?.map((user) => (
                    <div key={user.id} className="flex flex-col gap-3 p-3 sm:p-4 border rounded-lg transition-all duration-200 hover:bg-muted/50">
                      {/* User Info */}
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm sm:text-base break-words min-w-0 max-w-full">{user.displayName || user.username}</p>
                            {user.isAdmin && <Badge variant="default" className="text-xs">Admin</Badge>}
                            {user.isVerified && <Badge className="text-xs">Verified</Badge>}
                            {user.isSupporter && <Badge variant="secondary" className="text-xs">Supporter</Badge>}
                            {user.isLocked && <Badge variant="destructive" className="text-xs">Locked</Badge>}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground break-all">@{user.username} • {user.email}</p>
                          <div className="flex flex-wrap gap-1 sm:gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{user.buzzCredits || 0} credits</Badge>
                            <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">{user.upscaleCount || 0} upscales</Badge>
                          </div>
                          {user.isLocked && user.lockReason && (
                            <p className="text-xs text-red-600 mt-1">Locked: {user.lockReason}</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <TrackingButton user={user} />
                        
                        <Button
                          variant="outline"
                          size="sm"
                          className="transition-all duration-200 hover:scale-105"
                          onClick={() => toggleAdminMutation.mutate(user.id)}
                          disabled={toggleAdminMutation.isPending}
                        >
                          {user.isAdmin ? <UserX className="h-4 w-4 mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                          {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                        </Button>
                        
                        {user.isLocked ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unlockUserMutation.mutate(user.id)}
                            disabled={unlockUserMutation.isPending}
                          >
                            <UserCheck className="mr-2 h-4 w-4" />
                            Unlock Account
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = prompt('Enter reason for locking this account:');
                              if (reason) {
                                lockUserMutation.mutate({ userId: user.id, reason });
                              }
                            }}
                            disabled={lockUserMutation.isPending}
                          >
                            <UserX className="mr-2 h-4 w-4" />
                            Lock Account
                          </Button>
                        )}
                        
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            const reason = prompt(`Are you sure you want to permanently delete ${user.displayName || user.username}'s account?\n\nPlease enter the reason for deletion (required):`);
                            if (reason && reason.trim()) {
                              deleteUserMutation.mutate({ userId: user.id, reason: reason.trim() });
                            } else if (reason !== null) {
                              alert('Reason is required for user deletion.');
                            }
                          }}
                          disabled={deleteUserMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Account
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          {/* Gallery Tab */}
          <TabsContent value="gallery" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>Admin Gallery</CardTitle>
                <CardDescription>View and moderate all generated images from all users</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Username Filter */}
                <div className="mb-6 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <Label htmlFor="username-filter" className="text-sm font-medium">
                        Filter by Username
                      </Label>
                      <Input
                        id="username-filter"
                        placeholder="Enter username to filter images..."
                        value={usernameFilter}
                        onChange={(e) => setUsernameFilter(e.target.value)}
                        className="mt-1"
                        data-testid="input-username-filter"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        onClick={() => setUsernameFilter("")}
                        disabled={!usernameFilter}
                        className="whitespace-nowrap"
                        data-testid="button-clear-filter"
                      >
                        Clear Filter
                      </Button>
                    </div>
                  </div>
                  {usernameFilter && (
                    <div className="text-sm text-muted-foreground">
                      Filtering by username: <span className="font-medium">{usernameFilter}</span>
                    </div>
                  )}
                </div>
                {/* Backend filtering handles username search */}
                {(() => {
                  const filteredGenerations = allGenerations || [];

                  return (
                    <div>
                      {/* Results count */}
                      <div className="mb-4 text-sm text-muted-foreground">
                        {usernameFilter ? (
                          <span>
                            Found {filteredGenerations.length} images 
                            {filteredGenerations.length !== allGenerations?.length && 
                              ` out of ${allGenerations?.length || 0} total`
                            } for "{usernameFilter}"
                          </span>
                        ) : (
                          <span>Showing {allGenerations?.length || 0} total images</span>
                        )}
                      </div>

                      {/* Gallery Grid */}
                      {filteredGenerations.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {filteredGenerations.map((generation: any) => (
                      <div key={generation.id} className="relative group border rounded-lg p-3 space-y-3 transition-all duration-200 hover:shadow-md">
                        {/* Image */}
                        <div 
                          className="relative aspect-[3/4] rounded-md overflow-hidden bg-muted cursor-pointer"
                          onClick={() => {
                            setSelectedImage(generation);
                            setShowImageModal(true);
                          }}
                        >
                          <img
                            src={generation.imageUrl}
                            alt="Generated image"
                            className="w-full h-full object-cover transition-transform hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                            <Eye className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                          </div>
                        </div>
                        
                        {/* User Info */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <UserIcon className="h-3 w-3 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {generation.user?.username || 'Unknown User'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {generation.user?.email || 'No email'}
                              </p>
                            </div>
                          </div>
                          
                          {/* Prompt Preview */}
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {generation.prompt || 'No prompt available'}
                          </p>
                          
                          {/* Generation Info & Rating */}
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{generation.createdAt ? new Date(generation.createdAt).toLocaleDateString() : 'Unknown'}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{generation.status}</Badge>
                              {generation.contentRating && generation.contentRating !== 'unrated' && (
                                <Badge 
                                  variant={generation.contentRating === 'pg' ? 'default' : 'destructive'} 
                                  className="text-xs"
                                >
                                  {generation.contentRating.toUpperCase()}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Content Rating Buttons */}
                        <div className="grid grid-cols-3 gap-1 pt-2 border-t">
                          <Button
                            size="sm" 
                            variant="outline"
                            className={`text-xs h-8 ${
                              generation.contentRating === 'pg' 
                                ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600' 
                                : 'hover:bg-gray-100'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateContentRating(generation.id, 'pg');
                            }}
                            data-testid={`button-rating-pg-${generation.id}`}
                          >
                            PG
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`text-xs h-8 ${
                              generation.contentRating === 'r' 
                                ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600' 
                                : 'hover:bg-gray-100'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateContentRating(generation.id, 'r');
                            }}
                            data-testid={`button-rating-r-${generation.id}`}
                          >
                            R
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`text-xs h-8 ${
                              !generation.contentRating || generation.contentRating === 'unrated' 
                                ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600' 
                                : 'hover:bg-gray-100'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateContentRating(generation.id, 'unrated');
                            }}
                            data-testid={`button-rating-clear-${generation.id}`}
                          >
                            Clear
                          </Button>
                        </div>
                        
                        {/* Admin Actions */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Save image
                              const link = document.createElement('a');
                              link.href = generation.imageUrl;
                              link.download = `generation-${generation.id}.jpg`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              toast({
                                title: "Image Saved",
                                description: "Image has been downloaded successfully",
                              });
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Save Image
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Save prompt to text file
                              const username = generation.user?.username || 'Unknown';
                              const email = generation.user?.email || 'No email';
                              const createdAt = generation.createdAt ? new Date(generation.createdAt).toLocaleString() : 'Unknown';
                              const promptText = generation.prompt || 'No prompt available';
                              const negativePromptText = generation.negativePrompt || 'None';
                              const modelId = generation.modelId || 'Unknown';
                              const steps = generation.steps || 25;
                              const cfgScale = (generation.cfgScale || 70) / 10;
                              const width = generation.width || 512;
                              const height = generation.height || 768;
                              const seed = generation.seed || 'Unknown';
                              
                              const promptData = [
                                'Generation ID: ' + generation.id,
                                'User: ' + username + ' (' + email + ')',
                                'Created: ' + createdAt,
                                '',
                                'PROMPT:',
                                promptText,
                                '',
                                'NEGATIVE PROMPT:',
                                negativePromptText,
                                '',
                                'SETTINGS:',
                                'Model: ' + modelId,
                                'Steps: ' + steps,
                                'CFG Scale: ' + cfgScale,
                                'Size: ' + width + 'x' + height,
                                'Seed: ' + seed
                              ].join('\n');
                              
                              const blob = new Blob([promptData], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `prompt-${generation.id}.txt`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(url);
                              toast({
                                title: "Prompt Saved",
                                description: "Prompt data has been saved to text file",
                              });
                            }}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Save Prompt
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs col-span-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGeneration(generation);
                            }}
                            disabled={deleteGenerationMutation.isPending}
                            data-testid={`button-delete-generation-${generation.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete Image
                          </Button>
                        </div>
                      </div>
                          ))}
                        </div>
                      )}

                      {/* No results messages */}
                      {usernameFilter && filteredGenerations.length === 0 && allGenerations && allGenerations.length > 0 && (
                        <div className="text-center py-8 sm:py-16">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted rounded-full mx-auto mb-4 sm:mb-6 flex items-center justify-center">
                            <UserIcon className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg sm:text-xl font-medium mb-2 sm:mb-3">No images found</h3>
                          <p className="text-muted-foreground mb-4">
                            No images found for username "{usernameFilter}"
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => setUsernameFilter("")}
                            data-testid="button-clear-no-results"
                          >
                            Clear Filter
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {(!allGenerations || allGenerations.length === 0) && (
                  <div className="text-center py-8 sm:py-16">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted rounded-full mx-auto mb-4 sm:mb-6 flex items-center justify-center">
                      <Image className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-medium mb-2 sm:mb-3">No generated images found</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto px-4">
                      Generated images from all users will appear here once available.
                    </p>
                  </div>
                )}
                
                {/* Load More Button */}
                {allGenerations && allGenerations.length > 0 && adminHasMore && (
                  <div className="flex justify-center pt-6">
                    <Button
                      onClick={loadMoreAdminGenerations}
                      disabled={isLoadingAdminGenerations}
                      variant="outline"
                      size="lg"
                      className="min-w-[200px]"
                      data-testid="button-load-more-admin"
                    >
                      {isLoadingAdminGenerations ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Loading more...
                        </>
                      ) : (
                        `Load More Images (${adminTotal - allGenerations.length} remaining)`
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enhanced Image Modal with Navigation */}
            {selectedImage && (
              <ImageModal
                generation={selectedImage}
                allGenerations={(allGenerations || []) as unknown as GenerationType[]}
                isOpen={showImageModal}
                onClose={() => setShowImageModal(false)}
              />
            )}

            {/* Delete Generation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={(open) => open ? setShowDeleteDialog(true) : cancelDeleteGeneration()}>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Delete Image</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete this image? This action cannot be undone.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="delete-reason">Reason for deletion (optional - will be sent to user if provided):</Label>
                    <Textarea
                      id="delete-reason"
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      placeholder="Enter reason for deletion (optional)..."
                      className="min-h-[100px]"
                      autoFocus
                      data-testid="textarea-delete-reason"
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button 
                      variant="outline" 
                      onClick={cancelDeleteGeneration}
                      data-testid="button-cancel-delete"
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={confirmDeleteGeneration}
                      disabled={deleteGenerationMutation.isPending}
                      data-testid="button-confirm-delete"
                    >
                      {deleteGenerationMutation.isPending ? 'Deleting...' : 'Delete Image'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-red-500" />
                  Reported Images
                </CardTitle>
                <CardDescription>
                  Review and moderate user-reported content
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportedImages && reportedImages.length > 0 ? (
                  <div className="space-y-4">
                    {reportedImages.map((image: any) => (
                      <div key={image.id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-start gap-4">
                          <img 
                            src={image.generationId ? `/api/images/${image.generationId}` : image.imageUrl} 
                            alt="Reported content" 
                            className="w-24 h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => {
                              setFullSizeImage(image);
                              setShowFullImageDialog(true);
                            }}
                            data-testid={`img-reported-thumbnail-${image.id}`}
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">Image Report</h4>
                              <Badge variant="destructive">
                                Flagged
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              <strong>Reason:</strong> {image.moderationReason || 'User reported inappropriate content'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <strong>Reports:</strong> {image.reportCount || 1} report(s)
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <strong>Reported:</strong> {image.moderatedAt ? new Date(image.moderatedAt).toLocaleString() : 'Unknown'}
                            </p>
                            <p 
                              className="text-sm text-muted-foreground line-clamp-2 cursor-pointer hover:text-foreground transition-colors"
                              onClick={() => {
                                setFullPromptImage(image);
                                setShowFullPromptDialog(true);
                              }}
                              data-testid={`text-prompt-preview-${image.id}`}
                            >
                              <strong>Prompt:</strong> {image.prompt}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => approveReportedImageMutation.mutate(image.id)}
                            disabled={approveReportedImageMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {approveReportedImageMutation.isPending ? 'Approving...' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteReportedImageMutation.mutate(image.id)}
                            disabled={deleteReportedImageMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {deleteReportedImageMutation.isPending ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground mb-2">No Reported Images</h3>
                    <p className="text-sm text-muted-foreground">
                      All reported content has been reviewed or no reports have been made.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Full-size Image Dialog */}
            <Dialog open={showFullImageDialog} onOpenChange={setShowFullImageDialog}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Full Image View</DialogTitle>
                </DialogHeader>
                {fullSizeImage && (
                  <div className="flex flex-col items-center space-y-4">
                    <img
                      src={fullSizeImage.generationId ? `/api/images/${fullSizeImage.generationId}` : fullSizeImage.imageUrl}
                      alt="Full size reported content"
                      className="max-w-full max-h-[70vh] object-contain rounded border"
                      data-testid="img-reported-fullsize"
                    />
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><strong>Report ID:</strong> {fullSizeImage.id}</p>
                      <p><strong>Reason:</strong> {fullSizeImage.moderationReason || 'User reported inappropriate content'}</p>
                      <p><strong>Reports:</strong> {fullSizeImage.reportCount || 1} report(s)</p>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Full Prompt Dialog */}
            <Dialog open={showFullPromptDialog} onOpenChange={setShowFullPromptDialog}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Full Prompt</DialogTitle>
                </DialogHeader>
                {fullPromptImage && (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap break-words" data-testid="text-prompt-full">
                        {fullPromptImage.prompt}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><strong>Report ID:</strong> {fullPromptImage.id}</p>
                      <p><strong>Reason:</strong> {fullPromptImage.moderationReason || 'User reported inappropriate content'}</p>
                      <p><strong>Reports:</strong> {fullPromptImage.reportCount || 1} report(s)</p>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Character Images Dialog */}
            <Dialog open={showCharacterImagesDialog} onOpenChange={setShowCharacterImagesDialog}>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>
                    Images for "{selectedCharacterForImages?.name}"
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col h-[70vh]">
                  {loadingCharacterImages ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p>Loading images...</p>
                      </div>
                    </div>
                  ) : characterImages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Images Found</h3>
                        <p className="text-muted-foreground">
                          No images have been generated with this character yet.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ScrollArea className="h-full">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                        {characterImages.map((generation) => (
                          <div key={generation.id} className="space-y-2">
                            <div className="relative aspect-square overflow-hidden rounded-lg border group">
                              {generation.imageUrl ? (
                                <img
                                  src={`/api/images/${generation.id}`}
                                  alt={generation.prompt}
                                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                              ) : (
                                <div className="w-full h-full bg-muted flex items-center justify-center">
                                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {generation.createdAt ? new Date(generation.createdAt).toLocaleDateString() : 'Unknown date'}
                              </p>
                              {generation.prompt && (
                                <p className="text-xs font-mono bg-muted p-2 rounded line-clamp-3">
                                  {generation.prompt.slice(0, 100)}
                                  {generation.prompt.length > 100 && '...'}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
                <div className="flex justify-between items-center pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Total: {characterImages.length} image(s)
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowCharacterImagesDialog(false)}
                  >
                    Close
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

          </TabsContent>

          {/* Moderation Tab */}
          <TabsContent value="moderation" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 transition-all duration-200">
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Pending Content
                  </CardTitle>
                  <CardDescription>
                    Content awaiting moderation approval
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Pending Generations:</span>
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-600 border-yellow-200">
                        {allGenerations?.filter(g => g.moderationStatus === 'pending').length || 0}
                      </Badge>
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      size="sm"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Review Pending
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flag className="h-5 w-5 text-red-500" />
                    Content Reports
                  </CardTitle>
                  <CardDescription>
                    User-reported inappropriate content
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Open Reports:</span>
                      <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                        {reportedImages?.length || 0}
                      </Badge>
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      size="sm"
                      onClick={() => setActiveTab("reports")}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      View Reports
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Moderation Stats
                  </CardTitle>
                  <CardDescription>
                    Recent moderation activity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Approved Today:</span>
                      <span className="text-green-600">
                        {allGenerations?.filter(g => {
                          const today = new Date().toDateString();
                          return g.moderatedAt && new Date(g.moderatedAt).toDateString() === today && g.moderationStatus === 'approved';
                        }).length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Rejected Today:</span>
                      <span className="text-red-600">
                        {allGenerations?.filter(g => {
                          const today = new Date().toDateString();
                          return g.moderatedAt && new Date(g.moderatedAt).toDateString() === today && g.moderationStatus === 'rejected';
                        }).length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Flagged Content:</span>
                      <span className="text-yellow-600">
                        {allGenerations?.filter(g => g.moderationStatus === 'flagged').length || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quick Moderation Actions</CardTitle>
                <CardDescription>
                  Bulk operations and moderation tools
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button variant="outline" className="h-20 flex flex-col gap-2">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    <span>Bulk Approve</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col gap-2">
                    <XCircle className="h-6 w-6 text-red-500" />
                    <span>Bulk Reject</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col gap-2">
                    <Flag className="h-6 w-6 text-yellow-500" />
                    <span>Review Flagged</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>Model Management</CardTitle>
                <CardDescription>Manage AI models and their settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {allModels?.slice(0, 10).map((model) => (
                    <div key={model.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        {model.imageUrl && (
                          <img 
                            src={model.imageUrl} 
                            alt={model.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        )}
                        <div>
                          <p className="font-medium">{model.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {model.type} • {model.baseModel}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline">{model.downloads} downloads</Badge>
                            <Badge variant="outline">{model.likes} likes</Badge>
                            {model.featured && <Badge>Featured</Badge>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          {/* Promotions Tab */}
          <TabsContent value="promotions" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Gift className="h-8 w-8 text-primary" />
                <div>
                  <h2 className="text-2xl font-bold">Signup Promotions</h2>
                  <p className="text-muted-foreground">Manage promotional offers for new users</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowAirdropDialog(true)}
                  variant="outline"
                  className="flex items-center gap-2"
                  data-testid="button-airdrop-buzz"
                >
                  <CreditCard className="h-4 w-4" />
                  Airdrop Buzz
                </Button>
                <Button
                  onClick={() => setIsCreatingPromotion(true)}
                  className="flex items-center gap-2"
                  data-testid="button-create-promotion"
                >
                  <Plus className="h-4 w-4" />
                  New Promotion
                </Button>
              </div>
            </div>

            {activePromotion && (
              <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
                <CardHeader>
                  <CardTitle className="text-green-700 dark:text-green-300">
                    Active Promotion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{activePromotion.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {activePromotion.description}
                      </p>
                    </div>
                    <Badge className="bg-green-600 text-white">
                      {activePromotion.buzzAmount} credits
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {isCreatingPromotion && (
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Create New Promotion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">Promotion Name</Label>
                    <Input
                      id="name"
                      value={newPromotion.name}
                      onChange={(e) =>
                        setNewPromotion({ ...newPromotion, name: e.target.value })
                      }
                      placeholder="e.g., Welcome Bonus"
                      data-testid="input-promotion-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      value={newPromotion.description}
                      onChange={(e) =>
                        setNewPromotion({
                          ...newPromotion,
                          description: e.target.value,
                        })
                      }
                      placeholder="Brief description of the promotion"
                      data-testid="input-promotion-description"
                    />
                  </div>

                  <div>
                    <Label htmlFor="buzzAmount">Credits Amount</Label>
                    <Input
                      id="buzzAmount"
                      type="number"
                      value={newPromotion.buzzAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Remove leading zeros and convert to number
                        const numValue = value === '' ? 0 : parseInt(value.replace(/^0+/, '') || '0');
                        setNewPromotion({
                          ...newPromotion,
                          buzzAmount: numValue,
                        });
                      }}
                      min="0"
                      step="1"
                      data-testid="input-promotion-amount"
                    />
                  </div>

                  <div>
                    <Label htmlFor="maxUses">Max Uses (optional)</Label>
                    <Input
                      id="maxUses"
                      type="number"
                      value={newPromotion.maxUses}
                      onChange={(e) =>
                        setNewPromotion({ ...newPromotion, maxUses: e.target.value })
                      }
                      placeholder="Leave empty for unlimited"
                      data-testid="input-promotion-max-uses"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isActive"
                      checked={newPromotion.isActive}
                      onCheckedChange={(checked) =>
                        setNewPromotion({ ...newPromotion, isActive: checked })
                      }
                      data-testid="switch-promotion-active"
                    />
                    <Label htmlFor="isActive">Active</Label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const promotionData = {
                          name: newPromotion.name,
                          description: newPromotion.description || undefined,
                          buzzAmount: newPromotion.buzzAmount,
                          isActive: newPromotion.isActive,
                          maxUses: newPromotion.maxUses ? parseInt(newPromotion.maxUses) : undefined,
                        };
                        createPromotionMutation.mutate(promotionData);
                      }}
                      disabled={createPromotionMutation.isPending || !newPromotion.name}
                      data-testid="button-save-promotion"
                    >
                      {createPromotionMutation.isPending ? "Creating..." : "Create"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreatingPromotion(false)}
                      data-testid="button-cancel-promotion"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6">
              {promotions?.length === 0 ? (
                <Card className="transition-all duration-200 hover:shadow-md">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Gift className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Promotions Yet</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      Create your first signup promotion to offer welcome bonuses to new users.
                    </p>
                    <Button
                      onClick={() => setIsCreatingPromotion(true)}
                      data-testid="button-create-first-promotion"
                    >
                      Create First Promotion
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                promotions?.map((promotion) => (
                  <Card key={promotion.id}>
                    {editingPromotionId === promotion.id ? (
                      <>
                        <CardHeader>
                          <CardTitle>Edit Promotion</CardTitle>
                          <CardDescription>Update the promotion details below</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="text-sm font-medium">Name</label>
                            <Input
                              value={newPromotion.name || promotion.name}
                              onChange={(e) => setNewPromotion(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Enter promotion name"
                              data-testid="input-edit-promotion-name"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Description (Optional)</label>
                            <Input
                              value={newPromotion.description || promotion.description || ""}
                              onChange={(e) => setNewPromotion(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Enter promotion description"
                              data-testid="input-edit-promotion-description"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Credit Amount</label>
                            <Input
                              type="number"
                              value={newPromotion.buzzAmount || promotion.buzzAmount}
                              onChange={(e) => setNewPromotion(prev => ({ ...prev, buzzAmount: parseInt(e.target.value) || 0 }))}
                              placeholder="Enter credit amount"
                              data-testid="input-edit-promotion-credits"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Max Uses (Optional)</label>
                            <Input
                              type="number"
                              value={newPromotion.maxUses || promotion.maxUses || ""}
                              onChange={(e) => setNewPromotion(prev => ({ ...prev, maxUses: e.target.value }))}
                              placeholder="Leave empty for unlimited uses"
                              data-testid="input-edit-promotion-max-uses"
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`edit-active-${promotion.id}`}
                              checked={newPromotion.isActive !== undefined ? newPromotion.isActive : promotion.isActive}
                              onChange={(e) => setNewPromotion(prev => ({ ...prev, isActive: e.target.checked }))}
                              data-testid="checkbox-edit-promotion-active"
                            />
                            <label htmlFor={`edit-active-${promotion.id}`} className="text-sm font-medium">
                              Active
                            </label>
                          </div>
                          <div className="flex items-center gap-2 pt-4">
                            <Button
                              onClick={() => {
                                const promotionData = {
                                  name: newPromotion.name || promotion.name,
                                  description: newPromotion.description || promotion.description || undefined,
                                  buzzAmount: newPromotion.buzzAmount || promotion.buzzAmount,
                                  isActive: newPromotion.isActive !== undefined ? newPromotion.isActive : promotion.isActive,
                                  maxUses: newPromotion.maxUses ? parseInt(newPromotion.maxUses) : promotion.maxUses || undefined,
                                };
                                updatePromotionMutation.mutate({ id: promotion.id, data: promotionData });
                              }}
                              disabled={updatePromotionMutation.isPending}
                              data-testid="button-save-edit-promotion"
                            >
                              {updatePromotionMutation.isPending ? "Updating..." : "Update"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingPromotionId(null);
                                setNewPromotion({
                                  name: "",
                                  description: "",
                                  buzzAmount: 150,
                                  isActive: true,
                                  maxUses: "",
                                });
                              }}
                              data-testid="button-cancel-edit-promotion"
                            >
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </>
                    ) : (
                      <>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <CardTitle>{promotion.name}</CardTitle>
                              <Badge variant={promotion.isActive ? "default" : "secondary"}>
                                {promotion.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingPromotionId(promotion.id);
                                  setNewPromotion({
                                    name: promotion.name,
                                    description: promotion.description || "",
                                    buzzAmount: promotion.buzzAmount,
                                    isActive: promotion.isActive,
                                    maxUses: promotion.maxUses?.toString() || "",
                                  });
                                }}
                                data-testid={`button-edit-promotion-${promotion.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this promotion?")) {
                                    deletePromotionMutation.mutate(promotion.id);
                                  }
                                }}
                                data-testid={`button-delete-promotion-${promotion.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {promotion.description && (
                              <p className="text-muted-foreground">{promotion.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm">
                              <span>
                                <strong>Credits:</strong> {promotion.buzzAmount}
                              </span>
                              {promotion.maxUses && (
                                <span>
                                  <strong>Uses:</strong> {promotion.currentUses}/{promotion.maxUses}
                                </span>
                              )}
                              <span>
                                <strong>Created:</strong> {new Date(promotion.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </>
                    )}
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Moderation Logs Tab */}
          <TabsContent value="moderation" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid grid-cols-1 gap-6">
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Moderation Action Logs</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = '/api/admin/moderation-logs/download';
                        link.download = `moderation-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.csv`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      data-testid="button-download-logs"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download CSV
                    </Button>
                  </CardTitle>
                  <CardDescription>View all moderation actions taken by administrators</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {moderationLogs && moderationLogs.length > 0 ? (
                      moderationLogs.map((log: any) => (
                        <div key={log.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={
                                log.action === 'user_deleted' ? 'destructive' : 
                                log.action === 'deleted' ? 'destructive' : 
                                log.action === 'flagged' ? 'default' : 'secondary'
                              }>
                                {log.action.replace('_', ' ').toUpperCase()}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {log.contentType}: {log.contentId.slice(0, 8)}...
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Unknown date'}
                              </span>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">User:</span> {log.username || log.userEmail || 'Unknown User'} 
                              {log.userEmail && log.username && (
                                <span className="text-muted-foreground ml-1">({log.userEmail})</span>
                              )}
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">Reason:</span> {log.reason || 'No reason provided'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium">Moderator:</span> {log.moderatorEmail || 'Unknown'}
                            </div>
                            {log.previousStatus && (
                              <div className="text-sm text-muted-foreground">
                                <span className="font-medium">Status change:</span> {log.previousStatus} → {log.newStatus}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {log.contentType === 'user' && (
                              <Badge variant="outline">User Action</Badge>
                            )}
                            {log.contentType === 'generation' && (
                              <Badge variant="outline">Content Action</Badge>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p>No moderation actions recorded yet</p>
                        <p className="text-sm">When admins delete posts or users, they will appear here</p>
                      </div>
                    )}
                  </div>
                  
                  {moderationLogs && moderationLogs.length > 0 && (
                    <div className="mt-6 p-4 bg-muted rounded-lg">
                      <h4 className="font-medium mb-2">Moderation Log Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Total Actions:</span> {moderationLogs.length}
                        </div>
                        <div>
                          <span className="font-medium">User Deletions:</span> {moderationLogs.filter((log: any) => log.action === 'user_deleted').length}
                        </div>
                        <div>
                          <span className="font-medium">Content Removed:</span> {moderationLogs.filter((log: any) => log.action === 'deleted').length}
                        </div>
                        <div>
                          <span className="font-medium">Content Flagged:</span> {moderationLogs.filter((log: any) => log.action === 'flagged').length}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Characters Management Tab */}
          <TabsContent value="characters" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle>Character Management</CardTitle>
                    <CardDescription>View and edit all characters from all users</CardDescription>
                  </div>
                  <Button 
                    onClick={() => setShowCreateDialog(true)}
                    className="shrink-0 w-full sm:w-auto"
                    size="sm"
                    data-testid="button-create-character"
                  >
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline ml-2">Create Character</span>
                    <span className="sm:hidden">Create New Character</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {allCharacters && allCharacters.length > 0 ? (
                    <div className="grid gap-4">
                      {allCharacters.map((character) => (
                        <div key={character.id} className="border rounded-lg p-3 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex items-start space-x-3">
                              {character.imageUrl && (
                                <img 
                                  src={character.imageUrl} 
                                  alt={character.name}
                                  className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                                />
                              )}
                              <div className="space-y-1 min-w-0 flex-1">
                                <h4 className="font-medium text-sm sm:text-base truncate">{character.name}</h4>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                  Created by: {character.userId}
                                </p>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                  Category: {character.category || 'Uncategorized'}
                                </p>
                                {character.description && (
                                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                                    {character.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                              <div className="flex gap-2">
                                <Badge variant={character.isPublic ? "default" : "secondary"} className="text-xs">
                                  {character.isPublic ? "Public" : "Private"}
                                </Badge>
                                <Badge variant={character.isShared ? "default" : "outline"} className="text-xs">
                                  {character.isShared ? "Shared" : "User Only"}
                                </Badge>
                              </div>
                              <div className="flex gap-1 sm:gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => setEditingCharacter(character)}
                                  data-testid={`button-edit-character-${character.id}`}
                                  className="text-xs px-2 py-1 h-7"
                                >
                                  <Edit className="h-3 w-3 sm:mr-1" />
                                  <span className="hidden sm:inline">Edit</span>
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="secondary" 
                                  onClick={() => handleViewCharacterImages(character)}
                                  data-testid={`button-view-images-${character.id}`}
                                  className="text-xs px-2 py-1 h-7"
                                >
                                  <Eye className="h-3 w-3 sm:mr-1" />
                                  <span className="hidden sm:inline">Images</span>
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive" 
                                  onClick={() => handleDeleteCharacter(character)}
                                  data-testid={`button-delete-character-${character.id}`}
                                  className="text-xs px-2 py-1 h-7"
                                >
                                  <Trash2 className="h-3 w-3 sm:mr-1" />
                                  <span className="hidden sm:inline">Delete</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                          {character.basePrompt && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs text-muted-foreground mb-1">Base Prompt:</p>
                              <p className="text-sm font-mono bg-muted p-2 rounded">
                                {character.basePrompt.slice(0, 200)}
                                {character.basePrompt.length > 200 && '...'}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <UserIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Characters Found</h3>
                      <p className="text-muted-foreground">No characters have been created yet.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Platform Settings Tab */}
          <TabsContent value="tools" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Platform Settings</CardTitle>
                  <CardDescription>Control platform behavior and access</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Block New Signups</h4>
                      <p className="text-sm text-muted-foreground">Prevent new users from creating accounts</p>
                    </div>
                    <Button
                      size="sm"
                      variant={platformSettings?.find(s => s.key === 'signups_blocked')?.value === 'true' ? 'destructive' : 'outline'}
                      onClick={() => {
                        const currentValue = platformSettings?.find(s => s.key === 'signups_blocked')?.value;
                        const newValue = currentValue === 'true' ? 'false' : 'true';
                        updateSettingMutation.mutate({
                          key: 'signups_blocked',
                          value: newValue,
                          description: 'Controls whether new user signups are allowed'
                        });
                      }}
                      disabled={updateSettingMutation.isPending}
                    >
                      {platformSettings?.find(s => s.key === 'signups_blocked')?.value === 'true' ? 'Signups Blocked' : 'Signups Allowed'}
                    </Button>
                  </div>
                  
                  <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
                    <strong>Note:</strong> When signups are blocked, existing users can still log in, but new users cannot create accounts.
                  </div>
                </CardContent>
              </Card>

              {/* Maintenance Mode Card */}
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Power className="h-5 w-5" />
                    Maintenance Mode
                  </CardTitle>
                  <CardDescription>Block all non-admin access for system maintenance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">System Maintenance</h4>
                      <p className="text-sm text-muted-foreground">
                        {maintenanceStatus?.enabled 
                          ? "Maintenance mode is active - only admins can access the app" 
                          : "App is operational - all users can access normally"
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${maintenanceStatus?.enabled ? 'bg-red-500' : 'bg-green-500'}`} />
                      <Button
                        size="sm"
                        variant={maintenanceStatus?.enabled ? 'destructive' : 'outline'}
                        onClick={() => {
                          toggleMaintenanceMutation.mutate({
                            enabled: !maintenanceStatus?.enabled,
                            message: maintenanceMessage || 'The application is currently under maintenance. Please try again later.'
                          });
                        }}
                        disabled={toggleMaintenanceMutation.isPending}
                        data-testid={maintenanceStatus?.enabled ? "button-disable-maintenance" : "button-enable-maintenance"}
                      >
                        {toggleMaintenanceMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Power className="h-4 w-4 mr-2" />
                        )}
                        {maintenanceStatus?.enabled ? 'Disable Maintenance' : 'Enable Maintenance'}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maintenance-message">Custom Maintenance Message</Label>
                    <Textarea
                      id="maintenance-message"
                      placeholder="Enter a custom message for users during maintenance..."
                      value={maintenanceMessage}
                      onChange={(e) => setMaintenanceMessage(e.target.value)}
                      className="min-h-[80px]"
                      data-testid="textarea-maintenance-message"
                    />
                    <p className="text-xs text-muted-foreground">
                      This message will be shown to users when maintenance mode is active.
                    </p>
                  </div>

                  {maintenanceStatus?.setting && (
                    <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <strong>Last Updated:</strong> {format(new Date(maintenanceStatus.setting.updatedAt), 'PPp')}
                        </div>
                        <div>
                          <strong>By:</strong> {maintenanceStatus.setting.updatedBy}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded">
                    <strong>⚠️ Warning:</strong> When maintenance mode is enabled, all regular users will be blocked from accessing the application. Only admin users can continue to use the system.
                  </div>
                </CardContent>
              </Card>

              {/* Global Rating Filter Card */}
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Global Content Rating Filter
                  </CardTitle>
                  <CardDescription>Control content ratings shown to all users</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Rating Filter</h4>
                      <p className="text-sm text-muted-foreground">
                        {ratingFilterStatus?.enabled 
                          ? "Filter is active - only R and PG rated content visible to all users" 
                          : "Filter is inactive - all content ratings are visible to all users"
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${ratingFilterStatus?.enabled ? 'bg-blue-500' : 'bg-gray-500'}`} />
                      <Button
                        size="sm"
                        variant={ratingFilterStatus?.enabled ? 'default' : 'outline'}
                        onClick={() => {
                          toggleRatingFilterMutation.mutate({
                            enabled: !ratingFilterStatus?.enabled
                          });
                        }}
                        disabled={toggleRatingFilterMutation.isPending}
                        data-testid={ratingFilterStatus?.enabled ? "button-disable-rating-filter" : "button-enable-rating-filter"}
                      >
                        {toggleRatingFilterMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Shield className="h-4 w-4 mr-2" />
                        )}
                        {ratingFilterStatus?.enabled ? 'Disable Filter' : 'Enable Filter'}
                      </Button>
                    </div>
                  </div>

                  {ratingFilterStatus?.setting && (
                    <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <strong>Last Updated:</strong> {format(new Date(ratingFilterStatus.setting.updatedAt), 'PPp')}
                        </div>
                        <div>
                          <strong>By:</strong> {ratingFilterStatus.setting.updatedBy}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded">
                    <strong>ℹ️ Info:</strong> When enabled, this filter automatically restricts all users to viewing only R and PG rated content in the FipFap gallery. More explicit content ratings (NC-17, X) will be hidden from view.
                  </div>
                </CardContent>
              </Card>

              {/* Image Provider Card */}
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-purple-500" />
                    Image Generation Provider
                  </CardTitle>
                  <CardDescription>Select the API provider for image generation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Current Provider</h4>
                      <p className="text-sm text-muted-foreground">
                        {imageProviderStatus?.provider === 'diffus' 
                          ? "Using Diffus API for image generation" 
                          : "Using CivitAI API for image generation"
                        }
                      </p>
                      {!imageProviderStatus?.diffusAvailable && (
                        <p className="text-sm text-yellow-600 mt-1">
                          Diffus API key not configured
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${imageProviderStatus?.provider === 'diffus' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                      <Button
                        size="sm"
                        variant={imageProviderStatus?.provider === 'diffus' ? 'default' : 'outline'}
                        onClick={() => {
                          toggleImageProviderMutation.mutate({
                            provider: imageProviderStatus?.provider === 'civitai' ? 'diffus' : 'civitai'
                          });
                        }}
                        disabled={toggleImageProviderMutation.isPending || (!imageProviderStatus?.diffusAvailable && imageProviderStatus?.provider === 'civitai')}
                        data-testid="button-toggle-image-provider"
                      >
                        {toggleImageProviderMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <ImageIcon className="h-4 w-4 mr-2" />
                        )}
                        {imageProviderStatus?.provider === 'diffus' ? 'Switch to CivitAI' : 'Switch to Diffus'}
                      </Button>
                    </div>
                  </div>

                  {imageProviderStatus?.setting && (
                    <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <strong>Last Updated:</strong> {format(new Date(imageProviderStatus.setting.updatedAt), 'PPp')}
                        </div>
                        <div>
                          <strong>By:</strong> {imageProviderStatus.setting.updatedBy}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded">
                    <strong>ℹ️ Info:</strong> Use this to switch between image generation APIs. CivitAI is the primary provider, but you can switch to Diffus as a backup when CivitAI is experiencing issues. Diffus requires a separate API key configured in secrets.
                  </div>
                </CardContent>
              </Card>
              
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Credit Management</CardTitle>
                  <CardDescription>Add credits to user accounts</CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...addCreditsForm}>
                    <form onSubmit={addCreditsForm.handleSubmit(onSubmitAddCredits)} className="space-y-4">
                      <FormField
                        control={addCreditsForm.control}
                        name="userId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Select User</FormLabel>
                            <div className="space-y-2">
                              <Input
                                placeholder="Search users by name, username, or email..."
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                data-testid="input-user-search"
                              />
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-user">
                                    <SelectValue placeholder="Choose a user..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-60 overflow-y-auto">
                                  {filteredUsers?.map((user) => (
                                    <SelectItem 
                                      key={user.id} 
                                      value={user.id}
                                      className={user.lockReason?.includes('FLAGGED') ? 'text-red-500 font-semibold' : ''}
                                    >
                                      {user.lockReason?.includes('FLAGGED') && '🚩 '}
                                      {user.displayName || user.username} (@{user.username}) - {user.buzzCredits || 0} credits
                                    </SelectItem>
                                  ))}
                                  {filteredUsers?.length === 0 && userSearch && (
                                    <div className="py-4 text-center text-sm text-muted-foreground">
                                      No users found matching "{userSearch}"
                                    </div>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={addCreditsForm.control}
                        name="credits"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Credits to Add</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="Enter amount (e.g., 100)"
                                value={field.value || ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === "") {
                                    field.onChange(undefined);
                                  } else {
                                    const numValue = parseInt(value);
                                    if (!isNaN(numValue)) {
                                      field.onChange(numValue);
                                    }
                                  }
                                }}
                                data-testid="input-credits"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="flex gap-2">
                        <Button 
                          type="submit" 
                          disabled={addCreditsMutation.isPending}
                          className="flex-1"
                          data-testid="button-add-credits"
                        >
                          {addCreditsMutation.isPending ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-4 w-4" />
                          )}
                          Add Credits
                        </Button>
                        {addCreditsForm.watch("userId") && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const selectedUser = allUsers?.find(u => u.id === addCreditsForm.watch("userId"));
                              if (selectedUser) {
                                handleViewUserImages(selectedUser);
                              }
                            }}
                            data-testid="button-view-user-images"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Images
                          </Button>
                        )}
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Storage Information</CardTitle>
                  <CardDescription>Object storage status and usage</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      Storage Status
                    </span>
                    <Badge variant="default">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total Images</span>
                    <Badge variant="outline">{adminStats?.totalGenerations || 0}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
                    <strong>⚠️ Warning:</strong> Clearing storage will permanently delete all generated images and metadata files from object storage. Database records will remain but image references will be cleared.
                  </div>
                </CardContent>
              </Card>

              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                  <CardDescription>System overview at a glance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>Active Generations:</span>
                    <span>{allGenerations?.filter(g => g.status === 'processing').length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed Today:</span>
                    <span>{allGenerations?.filter(g => {
                      const today = new Date().toDateString();
                      return g.createdAt && new Date(g.createdAt).toDateString() === today && g.status === 'completed';
                    }).length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Admin Users:</span>
                    <span>{allUsers?.filter(u => u.isAdmin).length || 0}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Video Generation Settings */}
              <Card className="transition-all duration-200 hover:shadow-md md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Video Generation Settings
                  </CardTitle>
                  <CardDescription>Configure Transform Studio video generation costs and limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg space-y-2">
                      <h4 className="font-medium text-sm">Img2Img Cost</h4>
                      <p className="text-2xl font-bold">{platformSettings?.find(s => s.key === 'transform_img2img_cost')?.value || '15'}</p>
                      <p className="text-xs text-muted-foreground">Buzz per image transform</p>
                      <div className="flex gap-2">
                        {[10, 15, 20, 25].map(v => (
                          <Button key={v} size="sm" variant={platformSettings?.find(s => s.key === 'transform_img2img_cost')?.value === String(v) ? 'default' : 'outline'}
                            onClick={() => updateSettingMutation.mutate({ key: 'transform_img2img_cost', value: String(v), description: 'Cost in Buzz for image-to-image transform' })}
                            disabled={updateSettingMutation.isPending}
                          >{v}</Button>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg space-y-2">
                      <h4 className="font-medium text-sm">Img2Vid Cost</h4>
                      <p className="text-2xl font-bold">{platformSettings?.find(s => s.key === 'transform_img2vid_cost')?.value || '80'}</p>
                      <p className="text-xs text-muted-foreground">Buzz per video generation</p>
                      <div className="flex gap-2">
                        {[50, 80, 100, 150].map(v => (
                          <Button key={v} size="sm" variant={platformSettings?.find(s => s.key === 'transform_img2vid_cost')?.value === String(v) ? 'default' : 'outline'}
                            onClick={() => updateSettingMutation.mutate({ key: 'transform_img2vid_cost', value: String(v), description: 'Cost in Buzz for image-to-video generation' })}
                            disabled={updateSettingMutation.isPending}
                          >{v}</Button>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg space-y-2">
                      <h4 className="font-medium text-sm">Max Video Duration</h4>
                      <p className="text-2xl font-bold">{platformSettings?.find(s => s.key === 'video_max_duration_seconds')?.value || '10'}s</p>
                      <p className="text-xs text-muted-foreground">Maximum seconds per clip</p>
                      <div className="flex gap-2">
                        {[4, 6, 8, 10].map(v => (
                          <Button key={v} size="sm" variant={platformSettings?.find(s => s.key === 'video_max_duration_seconds')?.value === String(v) ? 'default' : 'outline'}
                            onClick={() => updateSettingMutation.mutate({ key: 'video_max_duration_seconds', value: String(v), description: 'Maximum video duration in seconds' })}
                            disabled={updateSettingMutation.isPending}
                          >{v}s</Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg space-y-2 md:col-span-3">
                    <h4 className="font-medium text-sm">Allowed Video Engines</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      Comma-separated list of engines users can select. Leave unset to allow all.
                      Current: <strong>{platformSettings?.find(s => s.key === 'allowed_video_engines')?.value || 'all engines'}</strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'WAN only (NSFW-safe)', value: 'wan-comfy-2.1' },
                        { label: 'WAN all variants', value: 'wan-comfy-2.1,wan-fal-2.2,wan-fal-2.5' },
                        { label: 'Kling 2.5', value: 'kling-2.5' },
                        { label: 'WAN + Kling', value: 'wan-comfy-2.1,wan-fal-2.2,wan-fal-2.5,kling-2.5' },
                        { label: 'All engines', value: 'wan-comfy-2.1,wan-fal-2.2,wan-fal-2.5,kling-2.5,vidu-q3,ltx-2' },
                      ].map(preset => (
                        <Button key={preset.value} size="sm"
                          variant={platformSettings?.find(s => s.key === 'allowed_video_engines')?.value === preset.value ? 'default' : 'outline'}
                          onClick={() => updateSettingMutation.mutate({ key: 'allowed_video_engines', value: preset.value, description: 'Comma-separated list of allowed video engines' })}
                          disabled={updateSettingMutation.isPending}
                        >{preset.label}</Button>
                      ))}
                      <Button size="sm" variant="ghost"
                        onClick={() => updateSettingMutation.mutate({ key: 'allowed_video_engines', value: '', description: 'Comma-separated list of allowed video engines' })}
                        disabled={updateSettingMutation.isPending}
                      >All (clear)</Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground p-3 bg-muted rounded md:col-span-3">
                    <strong>Note:</strong> Cost changes apply to new jobs only. The Transform Studio UI reads these settings at submit time. The server falls back to environment variables <code>TRANSFORM_IMG2IMG_COST</code> / <code>TRANSFORM_IMG2VID_COST</code> if the settings are not set here.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Object Storage Tab */}
          <TabsContent value="storage" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Storage Stats Overview */}
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Archive className="h-5 w-5" />
                    Object Storage Overview
                  </CardTitle>
                  <CardDescription>
                    Manage and monitor files stored in the cloud object storage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {storageStats ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {storageStats.folders.map((folder: any) => (
                        <div key={folder.folder} className="text-center p-3 border rounded-lg">
                          <div className="flex items-center justify-center mb-2">
                            <Folder className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <h4 className="font-medium text-sm mb-1">{folder.folder.replace('/', '')}</h4>
                          <p className="text-2xl font-bold">{folder.fileCount}</p>
                          <p className="text-xs text-muted-foreground">
                            {(folder.totalSize / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-muted-foreground">Loading storage statistics...</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Folder Browser */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5" />
                    Browse Folders
                  </CardTitle>
                  <CardDescription>
                    Select a folder to view its contents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { folder: 'cards/prompts/', label: 'Prompt Cards', icon: '🎯' },
                      { folder: 'cards/characters/', label: 'Character Cards', icon: '👤' },
                      { folder: 'cards/scenes/', label: 'Scene Cards', icon: '🎬' },
                      { folder: 'images/', label: 'Generated Images', icon: '🖼️' },
                      { folder: 'metadata/', label: 'Metadata Files', icon: '📄' }
                    ].map((item) => (
                      <Button
                        key={item.folder}
                        variant={selectedFolder === item.folder ? 'default' : 'outline'}
                        className="w-full justify-start h-auto p-3"
                        onClick={() => setSelectedFolder(item.folder)}
                        data-testid={`button-folder-${item.folder.replace('/', '')}`}
                      >
                        <span className="mr-3 text-lg">{item.icon}</span>
                        <div className="text-left">
                          <div className="font-medium">{item.label}</div>
                          <div className="text-xs text-muted-foreground">{item.folder}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Folder Contents */}
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">
                    {selectedFolder.replace('/', '')} Contents
                  </CardTitle>
                  <CardDescription>
                    {folderContents?.totalFiles || 0} files
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {folderContents ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {folderContents.files.length > 0 ? (
                        folderContents.files.map((file: any) => (
                          <div key={file.name} className="flex items-center gap-2 p-2 border rounded text-xs">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{file.name.split('/').pop()}</p>
                              <p className="text-muted-foreground">
                                {(parseInt(file.size) / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <div className="text-muted-foreground">
                              {new Date(file.updated).toLocaleDateString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4">
                          <Folder className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No files in this folder</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-xs text-muted-foreground">Loading...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Image Preview for Cards Folders */}
            {selectedFolder.startsWith('cards/') && folderContents?.files?.length > 0 && (
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Image Previews</CardTitle>
                  <CardDescription>
                    Visual preview of images in the {selectedFolder.replace('/', '')} folder
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {folderContents.files.slice(0, 12).map((file: any) => (
                      <div key={file.name} className="border rounded-lg p-2">
                        <div className="aspect-square bg-muted rounded mb-2 flex items-center justify-center">
                          <Image className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-xs truncate font-medium">
                          {file.name.split('/').pop()?.split('-')[0] || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(file.created).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                  {folderContents.files.length > 12 && (
                    <div className="text-center mt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing 12 of {folderContents.files.length} files
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Platform Settings Tab */}
          <TabsContent value="tools" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>Platform Settings</CardTitle>
                  <CardDescription>Control platform behavior and access</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                </CardContent>
              </Card>

              {/* System Reset Tools */}
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    System Reset Tools
                  </CardTitle>
                  <CardDescription>
                    Reset various system components for debugging and maintenance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      onClick={() => resetWebSocketMutation.mutate()}
                      disabled={resetWebSocketMutation.isPending}
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      data-testid="button-reset-websocket"
                    >
                      <RefreshCw className={`mr-2 h-3 w-3 ${resetWebSocketMutation.isPending ? 'animate-spin' : ''}`} />
                      {resetWebSocketMutation.isPending ? 'Resetting...' : 'Reset WebSocket'}
                    </Button>
                    
                    <Button
                      onClick={() => clearCacheMutation.mutate()}
                      disabled={clearCacheMutation.isPending}
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      data-testid="button-clear-cache"
                    >
                      <Trash2 className={`mr-2 h-3 w-3 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
                      {clearCacheMutation.isPending ? 'Clearing...' : 'Clear Cache'}
                    </Button>
                    
                    <Button
                      onClick={() => refreshModelsMutation.mutate()}
                      disabled={refreshModelsMutation.isPending}
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      data-testid="button-refresh-models"
                    >
                      <Database className={`mr-2 h-3 w-3 ${refreshModelsMutation.isPending ? 'animate-spin' : ''}`} />
                      {refreshModelsMutation.isPending ? 'Refreshing...' : 'Refresh Models'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Dangerous Operations - Full Width */}
            <Card className="transition-all duration-200 hover:shadow-md border-red-200 dark:border-red-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  Dangerous Operations
                </CardTitle>
                <CardDescription className="text-red-600 dark:text-red-400">
                  Use these tools with caution - they may cause temporary service interruption
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button
                    onClick={() => resetCreditsMutation.mutate()}
                    disabled={resetCreditsMutation.isPending}
                    variant="outline"
                    className="justify-start"
                    data-testid="button-reset-credits"
                  >
                    <CreditCard className={`mr-2 h-4 w-4 ${resetCreditsMutation.isPending ? 'animate-spin' : ''}`} />
                    {resetCreditsMutation.isPending ? 'Resetting...' : 'Reset Credits'}
                  </Button>
                  
                  <Button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to restart the system? This will cause a brief service interruption.')) {
                        restartSystemMutation.mutate();
                      }
                    }}
                    disabled={restartSystemMutation.isPending}
                    variant="destructive"
                    className="justify-start"
                    data-testid="button-restart-system"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${restartSystemMutation.isPending ? 'animate-spin' : ''}`} />
                    {restartSystemMutation.isPending ? 'Restarting...' : 'Restart System'}
                  </Button>
                  
                  <Button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear all storage? This will delete ALL images and metadata permanently!')) {
                        clearStorageMutation.mutate();
                      }
                    }}
                    disabled={clearStorageMutation.isPending}
                    variant="destructive"
                    className="justify-start"
                    data-testid="button-clear-storage"
                  >
                    <HardDrive className={`mr-2 h-4 w-4 ${clearStorageMutation.isPending ? 'animate-spin' : ''}`} />
                    {clearStorageMutation.isPending ? 'Clearing...' : 'Clear Storage'}
                  </Button>
                </div>
                
                <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    <strong>Warning:</strong> Dangerous operations may cause service interruption and data loss. 
                    Use only when necessary for debugging or maintenance.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Feedback Tab */}
          <TabsContent value="feedback" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid grid-cols-1 gap-6">
              <Card className="transition-all duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle>User Feedback Management</CardTitle>
                  <CardDescription>Review and respond to user feedback, bug reports, and feature requests</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {allFeedback && allFeedback.length > 0 ? (
                      allFeedback.map((feedback: any) => (
                        <div key={feedback.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <h4 className="font-medium">{feedback.title}</h4>
                              <div className="flex items-center gap-2">
                                {feedback.status === 'open' && (
                                  <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Open</Badge>
                                )}
                                {feedback.status === 'in_progress' && (
                                  <Badge variant="default"><Play className="mr-1 h-3 w-3" />In Progress</Badge>
                                )}
                                {feedback.status === 'resolved' && (
                                  <Badge variant="default" className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Resolved</Badge>
                                )}
                                {feedback.status === 'closed' && (
                                  <Badge variant="outline"><XCircle className="mr-1 h-3 w-3" />Closed</Badge>
                                )}
                                <Badge variant="outline" className="capitalize">
                                  {feedback.type.replace('_', ' ')}
                                </Badge>
                                <Badge variant={feedback.priority === 'urgent' ? 'destructive' : 'outline'}>
                                  {feedback.priority}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">By {feedback.userName || feedback.userId} • {new Date(feedback.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const newStatus = feedback.status === 'resolved' ? 'open' : 'resolved';
                                  updateFeedbackMutation.mutate({ 
                                    id: feedback.id, 
                                    status: newStatus
                                  });
                                }}
                                disabled={updateFeedbackMutation.isPending}
                              >
                                {feedback.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const response = prompt('Enter admin response:');
                                  if (response) {
                                    updateFeedbackMutation.mutate({ 
                                      id: feedback.id, 
                                      status: 'in_progress',
                                      adminResponse: response
                                    });
                                  }
                                }}
                                disabled={updateFeedbackMutation.isPending}
                              >
                                Respond
                              </Button>
                            </div>
                          </div>
                          <div className="bg-muted p-3 rounded">
                            <p className="text-sm whitespace-pre-wrap">{feedback.description}</p>
                          </div>
                          {feedback.adminResponse && (
                            <div className="bg-primary/10 p-3 rounded">
                              <h5 className="font-medium text-sm mb-1">Admin Response:</h5>
                              <p className="text-sm whitespace-pre-wrap">{feedback.adminResponse}</p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No feedback submitted yet</h3>
                        <p className="text-muted-foreground">
                          User feedback and reports will appear here when submitted.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Sanitization Rules Tab */}
          <TabsContent value="sanitization" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <SanitizationRulesSection />
          </TabsContent>

          <TabsContent value="api" className="space-y-4 sm:space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  External API Access
                </CardTitle>
                <CardDescription>
                  Manage API keys for external bots and services to access CiviVerse features.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {generatedApiKey && (
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-sm font-medium text-green-400 mb-2">New API Key Generated - Save it now!</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-black/30 rounded text-xs font-mono break-all select-all">{generatedApiKey}</code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedApiKey);
                          toast({ title: "Copied to clipboard" });
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">This key won't be shown again. Store it securely.</p>
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => setGeneratedApiKey(null)}>Dismiss</Button>
                  </div>
                )}

                {!showCreateBot ? (
                  <Button onClick={() => setShowCreateBot(true)} className="w-full">
                    <Zap className="h-4 w-4 mr-2" />
                    Create Bot Account + API Key
                  </Button>
                ) : (
                  <div className="p-4 border rounded-lg space-y-3">
                    <h4 className="font-medium">Create Bot Account</h4>
                    <div>
                      <Label>Bot Name</Label>
                      <Input value={newBotName} onChange={e => setNewBotName(e.target.value)} placeholder="AI Bot" />
                    </div>
                    <div>
                      <Label>Password (for bot login)</Label>
                      <Input type="password" value={newBotPassword} onChange={e => setNewBotPassword(e.target.value)} placeholder="Set a login password" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Credits</Label>
                        <Input type="number" value={newBotCredits} onChange={e => setNewBotCredits(e.target.value)} />
                      </div>
                      <div>
                        <Label>Daily Limit</Label>
                        <Input type="number" value={newBotDailyLimit} onChange={e => setNewBotDailyLimit(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          createBotMutation.mutate({
                            botName: newBotName || "AI Bot",
                            credits: parseInt(newBotCredits) || 10000,
                            dailyLimit: parseInt(newBotDailyLimit) || 1200,
                            password: newBotPassword || undefined,
                          });
                          setShowCreateBot(false);
                          setNewBotName("");
                          setNewBotPassword("");
                        }}
                        disabled={createBotMutation.isPending}
                      >
                        {createBotMutation.isPending ? "Creating..." : "Create"}
                      </Button>
                      <Button variant="outline" onClick={() => setShowCreateBot(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {botAccounts?.bots && botAccounts.bots.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Bot Accounts</h4>
                    {botAccounts.bots.map(bot => (
                      <div key={bot.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{bot.displayName || bot.username}</p>
                          <p className="text-xs text-muted-foreground">@{bot.username}</p>
                          <p className="text-xs text-muted-foreground">
                            Credits: {bot.credits} | Generations: {bot.totalGenerations}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => impersonateMutation.mutate(bot.id)}
                          disabled={impersonateMutation.isPending}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Impersonate
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {externalApiKeys?.keys && externalApiKeys.keys.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Active API Keys</h4>
                    {externalApiKeys.keys.filter(k => k.isActive).map(key => (
                      <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}</p>
                          <p className="text-xs text-muted-foreground">
                            Usage: {key.dailyUsage}/{key.dailyLimit} today
                            {key.lastUsedAt && ` | Last used: ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => revokeApiKeyMutation.mutate(key.id)}
                          disabled={revokeApiKeyMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Production Base URL</h4>
                    <code className="block p-2 bg-black/30 rounded text-xs font-mono select-all">https://civiverse.com/api/v1</code>
                    <p className="text-xs text-muted-foreground mt-2">All requests require the header:</p>
                    <code className="block p-2 bg-black/30 rounded text-xs font-mono mt-1">Authorization: Bearer &lt;your_api_key&gt;</code>
                    <code className="block p-2 bg-black/30 rounded text-xs font-mono mt-1">Content-Type: application/json</code>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">POST /login</h4>
                    <p className="text-xs text-muted-foreground mb-2">Bot login with username and password. No API key required.</p>
                    <pre className="p-2 bg-black/30 rounded text-xs font-mono overflow-x-auto whitespace-pre">{`{
  "username": "my_bot",
  "password": "bot_password"
}`}</pre>
                    <p className="text-xs text-muted-foreground mt-1">Response: {`{ userId, username, credits, apiKey }`}</p>
                    <p className="text-xs text-muted-foreground">Returns a fresh API key (rotates old one). Use it for all subsequent requests.</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">GET /account</h4>
                    <p className="text-xs text-muted-foreground mb-1">Check credits and usage. No body required.</p>
                    <p className="text-xs text-muted-foreground">Response: {`{ credits, dailyUsage, dailyLimit, username }`}</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">GET /models</h4>
                    <p className="text-xs text-muted-foreground">Lists all available models. Returns array of {`{ id, name, type }`}</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">GET /characters</h4>
                    <p className="text-xs text-muted-foreground">Lists all characters. Returns array with id, name, loras, etc.</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">POST /generate</h4>
                    <p className="text-xs text-muted-foreground mb-2">Generate images. JSON body:</p>
                    <pre className="p-2 bg-black/30 rounded text-xs font-mono overflow-x-auto whitespace-pre">{`{
  "prompt": "masterpiece, best quality, 1girl, ...",  // required
  "modelId": "model-uuid-here",                       // required
  "negativePrompt": "bad quality, worst quality",     // optional, default ""
  "width": 832,          // optional, 256-2048, default 832
  "height": 1216,        // optional, 256-2048, default 1216
  "steps": 28,           // optional, 1-50, default 28
  "cfgScale": 70,        // optional, 10-200, default 70
  "seed": 12345,         // optional, random if omitted
  "scheduler": "Euler",  // optional, default "Euler"
  "clipSkip": 2,         // optional, 1-12, default 2
  "quantity": 1,         // optional, 1-12, default 1
  "loras": [             // optional, default []
    { "id": "lora-uuid", "strength": 0.8 }
  ],
  "characterId": "char-uuid",   // optional
  "characterName": "Name",      // optional
  "sceneName": "Scene"          // optional
}`}</pre>
                    <p className="text-xs text-muted-foreground mt-2">Response: {`{ generationId, status, creditsUsed, creditsRemaining }`}</p>
                    <p className="text-xs text-muted-foreground">Cost: 4 credits/image (with own CivitAI key) or 12 credits/image (platform key)</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">GET /generations/:id</h4>
                    <p className="text-xs text-muted-foreground mb-1">Check generation status. Poll until status is "completed".</p>
                    <p className="text-xs text-muted-foreground">Response: {`{ id, status, prompt, imageUrl, seed, width, height, ... }`}</p>
                    <p className="text-xs text-muted-foreground">Statuses: "pending" → "processing" → "completed" or "failed"</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">GET /generations?limit=20&offset=0</h4>
                    <p className="text-xs text-muted-foreground">List past generations. Max limit: 100.</p>
                    <p className="text-xs text-muted-foreground">Response: {`{ generations: [...], total, hasMore }`}</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">POST /story</h4>
                    <p className="text-xs text-muted-foreground mb-2">Generate a story. JSON body:</p>
                    <pre className="p-2 bg-black/30 rounded text-xs font-mono overflow-x-auto whitespace-pre">{`{
  "imagePrompt": "scene description...",  // required
  "userComments": "extra directions",     // optional
  "pov": "first_person",                 // "first_person"|"character"|"third_person"
  "storyLength": "medium",               // "short"|"medium"|"long"
  "persona": {                           // optional
    "age": "25", "gender": "male",
    "build": "athletic", "description": "..."
  }
}`}</pre>
                    <p className="text-xs text-muted-foreground mt-2">Response: {`{ story: "..." }`}</p>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">POST /tts</h4>
                    <p className="text-xs text-muted-foreground mb-2">Text-to-speech. JSON body:</p>
                    <pre className="p-2 bg-black/30 rounded text-xs font-mono overflow-x-auto whitespace-pre">{`{
  "text": "Text to speak...",    // required
  "model": "openai",             // "openai" or "kokoro"
  "voice": "nova",               // voice name
  "speed": 1.0                   // 0.5 - 2.0
}`}</pre>
                    <p className="text-xs text-muted-foreground mt-2">OpenAI response: {`{ audioBase64, format: "mp3" }`}</p>
                    <p className="text-xs text-muted-foreground">Kokoro response: {`{ audioUrl }`}</p>
                  </div>

                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Quick Example (curl)</h4>
                    <pre className="p-2 bg-black/30 rounded text-xs font-mono overflow-x-auto whitespace-pre">{`curl -X POST https://civiverse.com/api/v1/generate \\
  -H "Authorization: Bearer cv_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "masterpiece, best quality, 1girl, smile",
    "modelId": "your-model-id",
    "width": 832,
    "height": 1216,
    "steps": 28
  }'`}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* User Images Dialog - Outside tabs so it's always available */}
      <Dialog open={showUserImagesDialog} onOpenChange={setShowUserImagesDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Images by "{selectedUserForImages?.displayName || selectedUserForImages?.username}" ({userImagesData?.total || 0} total)
            </DialogTitle>
            {selectedUserForImages && (
              <div className="flex justify-start pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Flag user "${selectedUserForImages.displayName || selectedUserForImages.username}" for policy violation? This will mark them for review.`)) {
                      flagUserMutation.mutate(selectedUserForImages.id);
                    }
                  }}
                  disabled={flagUserMutation?.isPending}
                  data-testid="button-flag-user"
                >
                  <Flag className="h-4 w-4 mr-1" />
                  {selectedUserForImages.lockReason?.includes('FLAGGED') ? 'Already Flagged' : 'Flag User'}
                </Button>
              </div>
            )}
          </DialogHeader>
          <div className="flex flex-col h-[70vh]">
            {loadingUserImages ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p>Loading images...</p>
                </div>
              </div>
            ) : !userImagesData?.generations || userImagesData.generations.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Images Found</h3>
                  <p className="text-muted-foreground">
                    This user hasn't generated any images yet.
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
                  {userImagesData.generations.map((generation) => (
                    <div key={generation.id} className="group relative">
                      <div 
                        className="relative aspect-square overflow-hidden rounded-lg border cursor-pointer bg-muted"
                        onClick={() => setViewingFullSizeImage(generation)}
                      >
                        {generation.imageUrl ? (
                          <img
                            src={`/api/images/${generation.id}`}
                            alt={generation.prompt || 'Generated image'}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        {/* Overlay buttons */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button size="sm" variant="secondary" className="h-8 w-8 p-0">
                            <Maximize2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive" 
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setImageToDelete(generation);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {generation.createdAt ? new Date(generation.createdAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing: {userImagesData?.generations?.length || 0} of {userImagesData?.total || 0} image(s)
            </p>
            <Button 
              variant="outline" 
              onClick={() => setShowUserImagesDialog(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Size Image Viewer */}
      <Dialog open={!!viewingFullSizeImage} onOpenChange={() => setViewingFullSizeImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>View Image</DialogTitle>
          </DialogHeader>
          {viewingFullSizeImage && (
            <div className="relative flex flex-col gap-2">
              <div className="flex justify-end gap-2">
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => {
                    setImageToDelete(viewingFullSizeImage);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
              <div className="flex items-center justify-center max-h-[80vh] overflow-auto">
                <img
                  src={`/api/images/${viewingFullSizeImage.id}`}
                  alt={viewingFullSizeImage.prompt || 'Generated image'}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              </div>
              {viewingFullSizeImage.prompt && (
                <p className="text-xs font-mono bg-muted p-2 rounded max-h-20 overflow-auto">
                  {viewingFullSizeImage.prompt}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Image Confirmation Dialog */}
      <Dialog open={!!imageToDelete} onOpenChange={() => setImageToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Image
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this image? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setImageToDelete(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (imageToDelete) {
                  deleteGenerationMutation.mutate({ id: imageToDelete.id, reason: "Admin deletion from user images view" });
                  setImageToDelete(null);
                  setViewingFullSizeImage(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/generations"] });
                }
              }}
              disabled={deleteGenerationMutation.isPending}
            >
              {deleteGenerationMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Character Edit Dialog */}
      {editingCharacter && (
        <CharacterDialog 
          character={editingCharacter} 
          onClose={() => setEditingCharacter(null)} 
        />
      )}
      
      {/* Character Create Dialog */}
      {showCreateDialog && (
        <CharacterDialog 
          character={undefined} 
          onClose={() => setShowCreateDialog(false)} 
        />
      )}

      {/* Airdrop Dialog */}
      <Dialog open={showAirdropDialog} onOpenChange={setShowAirdropDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Airdrop Buzz to All Users
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="airdrop-amount">Buzz Amount</Label>
              <Input
                id="airdrop-amount"
                type="number"
                value={airdropForm.amount}
                onChange={(e) => setAirdropForm({ ...airdropForm, amount: parseInt(e.target.value) || 0 })}
                placeholder="100"
                min="1"
                max="10000"
                data-testid="input-airdrop-amount"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Maximum 10,000 buzz per airdrop for safety
              </p>
            </div>
            
            <div>
              <Label htmlFor="airdrop-reason">Reason (optional)</Label>
              <Textarea
                id="airdrop-reason"
                value={airdropForm.reason}
                onChange={(e) => setAirdropForm({ ...airdropForm, reason: e.target.value })}
                placeholder="e.g., Holiday bonus, Maintenance compensation, etc."
                data-testid="input-airdrop-reason"
              />
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>⚠️ Warning:</strong> This will give {airdropForm.amount || 0} buzz to ALL existing users. 
                This action cannot be undone.
              </p>
              {adminStats && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                  Estimated total: {(airdropForm.amount || 0) * (adminStats.totalUsers || 0)} buzz
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => airdropMutation.mutate({ amount: airdropForm.amount, reason: airdropForm.reason })}
                disabled={airdropMutation.isPending || !airdropForm.amount || airdropForm.amount < 1}
                className="flex-1"
                data-testid="button-confirm-airdrop"
              >
                {airdropMutation.isPending ? "Processing..." : "Confirm Airdrop"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAirdropDialog(false)}
                disabled={airdropMutation.isPending}
                data-testid="button-cancel-airdrop"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Character editing dialog component - same as in characters.tsx but adapted for admin use
function CharacterDialog({ character, onClose }: {
  character?: Character;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!character;
  
  const { data: models = [] } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });
  
  const form = useForm<CreateCharacterForm>({
    resolver: zodResolver(createCharacterSchema),
    defaultValues: {
      name: character?.name || "",
      description: character?.description || "",
      basePrompt: character?.basePrompt || "",
      negativePrompt: character?.negativePrompt || "",
      imageUrl: character?.imageUrl || "",
      tags: character?.tags ?? [],
      isPublic: character?.isPublic || false,
      category: character?.category || "User Characters/Female",
      source: character?.source || "User",
      age: character?.age ?? 20,
      baseModel: character?.baseModel ?? "none",
      steps: character?.steps ?? undefined,
      cfgScale: character?.cfgScale ? character.cfgScale / 10 : undefined, // Convert back from integer storage
      seed: character?.seed ?? undefined,
      loras: character?.loras ?? [],
    },
  });

  // Reset form when character changes (for editing)
  useEffect(() => {
    if (character) {
      form.reset({
        name: character.name || "",
        description: character.description || "",
        basePrompt: character.basePrompt || "",
        negativePrompt: character.negativePrompt || "",
        imageUrl: character.imageUrl || "",
        tags: character.tags ?? [],
        isPublic: character.isPublic || false,
        category: character.category || "User Characters/Female",
        source: character.source || "User",
        age: character.age ?? 20,
        baseModel: character.baseModel ?? "none",
        steps: character.steps ?? undefined,
        cfgScale: character.cfgScale ? character.cfgScale / 10 : undefined,
        seed: character.seed ?? undefined,
        loras: character.loras ?? [],
      });
    }
  }, [character, form]);

  const createMutation = useMutation({
    mutationFn: async (data: CreateCharacterForm) => {
      // Convert CFG scale to integer for storage (multiply by 10)
      const processedData = {
        ...data,
        cfgScale: data.cfgScale ? Math.round(data.cfgScale * 10) : undefined,
        baseModel: data.baseModel === "none" ? undefined : data.baseModel, // Convert "none" to undefined
      };
      
      const response = await apiRequest("POST", "/api/characters", processedData);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({ title: "Character created successfully!" });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create character", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CreateCharacterForm) => {
      // Convert CFG scale to integer for storage (multiply by 10)
      const processedData = {
        ...data,
        cfgScale: data.cfgScale ? Math.round(data.cfgScale * 10) : undefined,
        baseModel: data.baseModel === "none" ? undefined : data.baseModel, // Convert "none" to undefined
      };
      
      const response = await fetch(`/api/characters/${character!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processedData),
      });
      if (!response.ok) throw new Error("Failed to update character");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({ title: "Character updated successfully!" });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update character", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const onSubmit = (data: CreateCharacterForm) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Character" : "Create Character"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-character-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value || ""} data-testid="textarea-character-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="basePrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Prompt</FormLabel>
                  <FormControl>
                    <Textarea {...field} className="min-h-[100px]" data-testid="textarea-character-base-prompt" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="negativePrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Negative Prompt</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value || ""} className="min-h-[80px]" data-testid="textarea-character-negative-prompt" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-character-category" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="age"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Age: {field.value || 20} years old</FormLabel>
                  <FormControl>
                    <Slider
                      min={18}
                      max={45}
                      step={1}
                      value={[field.value || 20]}
                      onValueChange={(values) => field.onChange(values[0])}
                      className="w-full"
                      data-testid="slider-character-age"
                    />
                  </FormControl>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>18</span>
                    <span>45</span>
                  </div>
                  <FormDescription>
                    Set the character's age for prompt generation (e.g., "20yo")
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="breastSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Breast Size: {getSizeLabel(field.value || 2)}</FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={5}
                        step={1}
                        value={[field.value || 2]}
                        onValueChange={(values) => field.onChange(values[0])}
                        className="w-full"
                        data-testid="slider-character-breast-size"
                      />
                    </FormControl>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Small</span>
                      <span>Huge</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ass Size: {getSizeLabel(field.value || 2)}</FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={5}
                        step={1}
                        value={[field.value || 2]}
                        onValueChange={(values) => field.onChange(values[0])}
                        className="w-full"
                        data-testid="slider-character-ass-size"
                      />
                    </FormControl>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Small</span>
                      <span>Huge</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <CharacterImageSelector character={character} form={form} />

            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Public Character</FormLabel>
                    <FormDescription>
                      Make this character available to all users
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value || false}
                      onCheckedChange={field.onChange}
                      data-testid="switch-character-public"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-character-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isEditing ? updateMutation.isPending : createMutation.isPending} data-testid="button-character-save">
                {isEditing ? (updateMutation.isPending ? "Updating..." : "Update Character") : (createMutation.isPending ? "Creating..." : "Create Character")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}