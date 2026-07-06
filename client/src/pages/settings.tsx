import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {   Settings as SettingsIcon, 
  CreditCard, 
  Zap, 
  User as UserIcon, 
  Bell, 
  Shield, 
  Palette, 
  Download,
  Coins,
  ArrowLeft,
  Key,
  Eye,
  EyeOff,
  Save,
  Trash2,
  ExternalLink,
  Info,
  Check,
  X,
  AlertTriangle,
  FileText,
  Copy,
  Heart,
  Globe,
  RefreshCw,
  MessageSquare,
  BookOpen, Users } from 'lucide-react';
import { Link } from 'wouter';
import type { User } from '@shared/schema';

interface ApiKeyStatus {
  hasApiKey: boolean;
  keyLength: number;
  maskedKey: string | null;
}

export default function SettingsPage() {
  const { toast } = useToast();

  // Referral program
  const { data: referral } = useQuery<{ code: string; referralCount: number }>({
    queryKey: ['/api/referral'],
  });
  const [redeemCode, setRedeemCode] = useState('');
  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest('POST', '/api/referral/redeem', { code });
      return response.json();
    },
    onSuccess: (data: { reward: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      setRedeemCode('');
      toast({ title: `+${data.reward} Buzz!`, description: 'Referral code redeemed.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Could not redeem code',
        description: error?.message || 'Invalid or already-used code',
        variant: 'destructive',
      });
    },
  });
  const copyReferralLink = () => {
    if (!referral?.code) return;
    const link = `${window.location.origin}/?ref=${referral.code}`;
    navigator.clipboard.writeText(link).then(
      () => toast({ title: 'Invite link copied', description: 'You each get 100 Buzz when a friend joins.' }),
      () => toast({ title: 'Copy failed', description: link })
    );
  };
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  
  // API Key management state
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  
  // External API key state
  const [generatedExternalKey, setGeneratedExternalKey] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedExternalKey, setCopiedExternalKey] = useState(false);

  // Account deletion state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [aiPromptInstructionsDraft, setAiPromptInstructionsDraft] = useState("");

  const { data: user } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  useEffect(() => {
    if (user) {
      setAiPromptInstructionsDraft(user.aiPromptInstructions ?? "");
    }
  }, [user?.aiPromptInstructions]);

  // Get API key status
  const { data: apiKeyStatus } = useQuery<ApiKeyStatus>({
    queryKey: ["/api/user/api-key-status"],
  });

  interface ExternalApiKeyStatus {
    hasKey: boolean;
    keyPrefix: string | null;
    dailyLimit: number;
    dailyUsage: number;
    createdAt: string | null;
  }

  const { data: externalKeyStatus } = useQuery<ExternalApiKeyStatus>({
    queryKey: ["/api/user/external-api-key"],
  });

  const generateExternalKeyMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/user/external-api-key'),
    onSuccess: async (response: any) => {
      const result = await response.json();
      setGeneratedExternalKey(result.key);
      queryClient.invalidateQueries({ queryKey: ['/api/user/external-api-key'] });
      toast({
        title: "API Key Generated",
        description: "Your new external API key has been created. Copy it now — it won't be shown again!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate API key",
        variant: "destructive",
      });
    },
  });

  const revokeExternalKeyMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/user/external-api-key'),
    onSuccess: () => {
      setGeneratedExternalKey(null);
      queryClient.invalidateQueries({ queryKey: ['/api/user/external-api-key'] });
      toast({
        title: "API Key Revoked",
        description: "Your external API key has been deactivated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Revocation Failed",
        description: error.message || "Failed to revoke API key",
        variant: "destructive",
      });
    },
  });

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText("0xa9023E435DA07ee9EC9fA8Aa32dA26e26a3305fE");
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toast({ title: "Address Copied", description: "Ethereum address copied to clipboard." });
    } catch {
      toast({ title: "Copy Failed", description: "Could not copy to clipboard. Please select and copy manually.", variant: "destructive" });
    }
  };

  const handleCopyExternalKey = async () => {
    if (generatedExternalKey) {
      try {
        await navigator.clipboard.writeText(generatedExternalKey);
        setCopiedExternalKey(true);
        setTimeout(() => setCopiedExternalKey(false), 2000);
        toast({ title: "API Key Copied", description: "API key copied to clipboard." });
      } catch {
        toast({ title: "Copy Failed", description: "Could not copy to clipboard. Please select and copy manually.", variant: "destructive" });
      }
    }
  };

  const handleBuyCredits = (packageId: string) => {
    // Redirect to buy credits page with package ID
    setLocation(`/buy-credits?packageId=${packageId}`);
  };

  // Check for payment success on page load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      toast({
        title: "Payment Successful!",
        description: "Your credits have been added to your account.",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/settings');
      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    }
  }, [toast, queryClient]);

  // Update API key mutation
  const updateApiKeyMutation = useMutation({
    mutationFn: (key: string) => apiRequest('POST', '/api/user/api-key', { apiKey: key }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-key-status'] });
      setApiKey("");
      setIsEditingApiKey(false);
      setShowApiKey(false);
      toast({
        title: "API Key Updated",
        description: "Your CivitAI API key has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update API key",
        variant: "destructive",
      });
    },
  });

  // Remove API key mutation
  const removeApiKeyMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/user/api-key'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-key-status'] });
      setApiKey("");
      setIsEditingApiKey(false);
      setShowApiKey(false);
      toast({
        title: "API Key Removed",
        description: "Your CivitAI API key has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Removal Failed",
        description: error.message || "Failed to remove API key",
        variant: "destructive",
      });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/user/delete-account'),
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account and all data have been permanently deleted.",
      });
      // Redirect to logout after successful deletion
      setTimeout(() => {
        window.location.href = '/api/logout';
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  // Update user preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: (preferences: { defaultLandingPage?: string; showWatermark?: boolean; aiPromptInstructions?: string }) => 
      apiRequest('PUT', '/api/user/preferences', preferences),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: "Preferences Updated",
        description: "Your preferences have been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  // Reset the self-learned style profile
  const resetStyleProfileMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/user/style-profile'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: "Learning Reset",
        description: "Your learned style profile has been cleared.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset learned style profile",
        variant: "destructive",
      });
    },
  });

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: "Invalid API Key",
        description: "Please enter a valid API key",
        variant: "destructive",
      });
      return;
    }
    updateApiKeyMutation.mutate(apiKey.trim());
  };

  const handleRemoveApiKey = () => {
    if (confirm("Are you sure you want to remove your CivitAI API key? You'll fall back to using the default shared API key.")) {
      removeApiKeyMutation.mutate();
    }
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmationText !== "DELETE MY ACCOUNT") {
      toast({
        title: "Confirmation Required",
        description: "Please type 'DELETE MY ACCOUNT' to confirm deletion.",
        variant: "destructive",
      });
      return;
    }
    deleteAccountMutation.mutate();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Loading Settings...</h2>
          <p className="text-muted-foreground">Please wait while we load your settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              className="hover:bg-muted flex-shrink-0"
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
                <SettingsIcon className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
                <span className="truncate">Settings</span>
              </h1>
              <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">
                Manage your account preferences
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Account Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Account Overview
              </CardTitle>
              <CardDescription>
                Your current account status and credits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium text-sm sm:text-base">Username</p>
                  <p className="text-muted-foreground text-sm">@{user.username}</p>
                </div>
                <Badge variant="secondary" className="text-xs">Active</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="p-1.5 sm:p-2 bg-primary/20 rounded-full flex-shrink-0">
                    <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base">Buzz Credits</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Available for generation
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl sm:text-2xl font-bold" data-testid="text-current-credits">
                    {user.buzzCredits}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">credits</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm sm:text-base">Total Images Generated</p>
                  <p className="text-muted-foreground text-xs sm:text-sm">Lifetime generation count</p>
                </div>
                <p className="text-lg sm:text-xl font-bold flex-shrink-0">{user.totalGenerated}</p>
              </div>
            </CardContent>
          </Card>

          {/* Invite Friends / Referral */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Invite Friends
              </CardTitle>
              <CardDescription>
                Share your link — you and your friend each get 100 Buzz when they join.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm sm:text-base">Your invite code</p>
                  <p className="text-lg font-mono font-bold tracking-widest" data-testid="text-referral-code">
                    {referral?.code || '········'}
                  </p>
                </div>
                <Button
                  onClick={copyReferralLink}
                  disabled={!referral?.code}
                  className="flex-shrink-0"
                  data-testid="button-copy-referral"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy link
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg">
                <p className="font-medium text-sm sm:text-base">Friends joined</p>
                <p className="text-xl font-bold" data-testid="text-referral-count">{referral?.referralCount ?? 0}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="redeem-code" className="text-sm">Have a code? Redeem it (new accounts only)</Label>
                <div className="flex gap-2">
                  <Input
                    id="redeem-code"
                    value={redeemCode}
                    onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                    placeholder="e.g. K7M2XQ9A"
                    maxLength={8}
                    className="font-mono tracking-widest"
                    data-testid="input-redeem-code"
                  />
                  <Button
                    onClick={() => redeemMutation.mutate(redeemCode)}
                    disabled={redeemCode.length !== 8 || redeemMutation.isPending}
                    variant="secondary"
                    data-testid="button-redeem-code"
                  >
                    Redeem
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CivitAI API Key Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                CivitAI API Key
              </CardTitle>
              <CardDescription>
                Configure your personal CivitAI API key to use your own quotas and access private models.
                <br />
                <a 
                  href="https://civitai.com/user/account" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1 text-primary hover:underline mt-2"
                >
                  Get your API key from CivitAI <ExternalLink className="h-3 w-3" />
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Current Status */}
              <div className="p-3 sm:p-4 border rounded-lg bg-muted/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-medium">Status:</span>
                      {apiKeyStatus?.hasApiKey ? (
                        <Badge className="gap-1 text-xs">
                          <Check className="h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <X className="h-3 w-3" />
                          Not Set
                        </Badge>
                      )}
                    </div>
                    {apiKeyStatus?.hasApiKey && (
                      <div className="text-xs sm:text-sm text-muted-foreground min-w-0">
                        Key: <code className="bg-muted px-1 rounded text-xs">{apiKeyStatus.maskedKey}</code>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingApiKey(!isEditingApiKey)}
                      data-testid="button-edit-api-key"
                      className="text-xs sm:text-sm"
                    >
                      {isEditingApiKey ? "Cancel" : "Edit"}
                    </Button>
                    {apiKeyStatus?.hasApiKey && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleRemoveApiKey}
                        disabled={removeApiKeyMutation.isPending}
                        data-testid="button-remove-api-key"
                        className="text-xs sm:text-sm"
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        <span className="hidden sm:inline">Remove</span>
                        <span className="sm:hidden">Del</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* API Key Input Form */}
              {isEditingApiKey && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <Label htmlFor="api-key">CivitAI API Key</Label>
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your CivitAI API key"
                      className="pr-10"
                      data-testid="input-api-key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowApiKey(!showApiKey)}
                      data-testid="button-toggle-visibility"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleSaveApiKey}
                      disabled={!apiKey.trim() || updateApiKeyMutation.isPending}
                      data-testid="button-save-api-key"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {updateApiKeyMutation.isPending ? "Saving..." : "Save API Key"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Info Section */}
              <div className="flex gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                    Why use your own API key?
                  </p>
                  <ul className="text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• <strong>67% discount on all generations</strong> (4 credits instead of 12)</li>
                    <li>• Use your personal CivitAI credits and quotas</li>
                    <li>• Access your private models and collections</li>
                    <li>• Higher generation limits and priority processing</li>
                    <li>• Full control over your usage and billing</li>
                  </ul>
                </div>
              </div>

              <Separator />

              {/* Pricing Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                  <h4 className="font-semibold text-primary mb-2">With Your API Key</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Cost per image:</span>
                      <span className="font-bold text-green-600">4 credits</span>
                    </div>
                    <div className="text-xs text-muted-foreground">67% discount applied</div>
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-muted/20">
                  <h4 className="font-semibold mb-2">Without API Key</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Cost per image:</span>
                      <span className="font-bold">12 credits</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Regular pricing</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Fallback Information */}
              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>Without a personal API key:</strong> You'll use our shared API key with limited quotas and access to public models only.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* External API Access */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                External API Access
              </CardTitle>
              <CardDescription>
                Generate a personal API key to access CiviVerse programmatically from your own apps, bots, or scripts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-3 sm:p-4 border rounded-lg bg-muted/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium">Status:</span>
                    {externalKeyStatus?.hasKey ? (
                      <Badge className="gap-1 text-xs">
                        <Check className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <X className="h-3 w-3" />
                        No Key
                      </Badge>
                    )}
                  </div>
                  {externalKeyStatus?.hasKey && (
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      Key: <code className="bg-muted px-1 rounded text-xs">{externalKeyStatus.keyPrefix}</code>
                    </div>
                  )}
                </div>
                {externalKeyStatus?.hasKey && (
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span>Daily usage: <strong>{externalKeyStatus.dailyUsage}</strong> / {externalKeyStatus.dailyLimit}</span>
                  </div>
                )}
              </div>

              {generatedExternalKey && (
                <div className="p-4 border-2 border-yellow-500/50 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    Your new API key (copy it now — it won't be shown again):
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white dark:bg-black/30 p-2 rounded text-xs font-mono break-all border">
                      {generatedExternalKey}
                    </code>
                    <Button size="sm" variant="outline" onClick={handleCopyExternalKey}>
                      {copiedExternalKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!externalKeyStatus?.hasKey ? (
                  <Button
                    onClick={() => {
                      if (confirm("Generate a new external API key? This will allow programmatic access to your account.")) {
                        generateExternalKeyMutation.mutate();
                      }
                    }}
                    disabled={generateExternalKeyMutation.isPending}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {generateExternalKeyMutation.isPending ? "Generating..." : "Generate API Key"}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("Regenerate your API key? This will revoke the current key and create a new one.")) {
                          generateExternalKeyMutation.mutate();
                        }
                      }}
                      disabled={generateExternalKeyMutation.isPending}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {generateExternalKeyMutation.isPending ? "Regenerating..." : "Regenerate Key"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Revoke your API key? Any apps or bots using it will stop working.")) {
                          revokeExternalKeyMutation.mutate();
                        }
                      }}
                      disabled={revokeExternalKeyMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {revokeExternalKeyMutation.isPending ? "Revoking..." : "Revoke Key"}
                    </Button>
                  </>
                )}
              </div>

              <div className="p-4 rounded-lg bg-muted/50 border">
                <p className="text-sm font-medium mb-2">Usage Example</p>
                <code className="block text-xs bg-black/80 text-green-400 p-3 rounded font-mono whitespace-pre-wrap">
{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://civiverse.com/api/v1/account`}
                </code>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">
                    API keys use your account credits.
                  </p>
                  <Link href="/api-docs">
                    <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                      <BookOpen className="h-3 w-3" />
                      View API Docs
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Crypto Donation */}
          <Card className="border-purple-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-purple-500" />
                Support CiviVerse
              </CardTitle>
              <CardDescription>
                Help keep CiviVerse running by sending a crypto donation. Every bit helps cover server and AI generation costs!
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-500/20 rounded-full">
                    <svg className="h-5 w-5 text-blue-400" viewBox="0 0 320 512" fill="currentColor">
                      <path d="M311.9 260.8L160 353.6 8 260.8 160 0l151.9 260.8zM160 383.4L8 290.6 160 512l152-221.4-152 92.8z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Ethereum (ETH)</p>
                    <p className="text-xs text-muted-foreground">ERC-20 compatible</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/20 dark:bg-white/10 p-2.5 rounded text-xs font-mono break-all border border-purple-500/20">
                    0xa9023E435DA07ee9EC9fA8Aa32dA26e26a3305fE
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyAddress}
                    className="flex-shrink-0 border-purple-500/30 hover:bg-purple-500/10"
                  >
                    {copiedAddress ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Thank you for your support! Donations go directly toward server costs and improving the platform.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Credit Purchase — hidden (free tier) */}
          {false && <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Purchase Credits
              </CardTitle>
              <CardDescription>
                ⚡ <strong>LIMITED TIME BETA PRICING!</strong> ⚡ Buy Buzz credits to generate more AI images. {apiKeyStatus?.hasApiKey 
                  ? "With your API key, each image costs only 4 credits (67% discount)!" 
                  : "Each image costs 12 credits, or 4 credits with your own CivitAI API key."
                } Storage fees over 500mb are additional. We're in beta figuring things out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {/* Power Pack */}
                <div className="border rounded-lg p-3 sm:p-4 hover:border-primary transition-colors">
                  <div className="text-center space-y-2 sm:space-y-3">
                    <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full w-fit mx-auto">
                      <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm sm:text-base">Power Pack</h3>
                      <p className="text-xl sm:text-2xl font-bold text-primary">1500</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">credits</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        ~{apiKeyStatus?.hasApiKey ? "375" : "125"} images
                        {apiKeyStatus?.hasApiKey && <span className="text-primary font-medium text-xs"> (with discount)</span>}
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-primary">$5.00</p>
                    </div>
                    <Button
                      onClick={() => handleBuyCredits("pkg-popular")}
                      disabled={isLoading}
                      className="w-full text-sm sm:text-base py-2"
                      data-testid="button-buy-1500-credits"
                    >
                      Buy Now
                    </Button>
                  </div>
                </div>

                {/* Creator Pack */}
                <div className="border-2 border-primary rounded-lg p-3 sm:p-4 relative">
                  <div className="absolute -top-2 sm:-top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-2 py-1">Most Popular</Badge>
                  </div>
                  <div className="text-center space-y-2 sm:space-y-3 mt-1 sm:mt-2">
                    <div className="p-2 sm:p-3 bg-primary/20 rounded-full w-fit mx-auto">
                      <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm sm:text-base">Creator Pack</h3>
                      <p className="text-xl sm:text-2xl font-bold text-primary">4000</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">credits</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        ~{apiKeyStatus?.hasApiKey ? "1000" : "333"} images
                        {apiKeyStatus?.hasApiKey && <span className="text-primary font-medium text-xs"> (with discount)</span>}
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-primary">$10.00</p>
                    </div>
                    <Button
                      onClick={() => handleBuyCredits("pkg-pro")}
                      disabled={isLoading}
                      className="w-full text-sm sm:text-base py-2"
                      data-testid="button-buy-4000-credits"
                    >
                      Buy Now
                    </Button>
                  </div>
                </div>

                {/* Mega Pack */}
                <div className="border rounded-lg p-3 sm:p-4 hover:border-primary transition-colors sm:col-span-2 lg:col-span-1">
                  <div className="text-center space-y-2 sm:space-y-3">
                    <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/20 rounded-full w-fit mx-auto">
                      <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm sm:text-base">Mega Pack</h3>
                      <p className="text-xl sm:text-2xl font-bold text-primary">10000</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">credits</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        ~{apiKeyStatus?.hasApiKey ? "2500" : "833"} images
                        {apiKeyStatus?.hasApiKey && <span className="text-primary font-medium text-xs"> (with discount)</span>}
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-primary">$20.00</p>
                    </div>
                    <Button
                      onClick={() => handleBuyCredits("pkg-mega")}
                      disabled={isLoading}
                      className="w-full text-sm sm:text-base py-2"
                      data-testid="button-buy-10000-credits"
                    >
                      Buy Now
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-xs sm:text-sm text-green-800 dark:text-green-200">
                  <strong>Secure Payment:</strong> All credit purchases are processed securely through Stripe. You will only be charged upon successful payment completion.
                </p>
              </div>
            </CardContent>
          </Card>}

          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Preferences
              </CardTitle>
              <CardDescription>
                Customize your experience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications about generation completion
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-email-notifications" />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Default Landing Page</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose which page to show when you first visit the site
                  </p>
                </div>
                <Switch 
                  checked={user?.defaultLandingPage === "generate"} 
                  onCheckedChange={(checked) => {
                    const newLandingPage = checked ? "generate" : "easy-mode";
                    updatePreferencesMutation.mutate({ defaultLandingPage: newLandingPage });
                  }}
                  disabled={updatePreferencesMutation.isPending || !user}
                  data-testid="switch-default-landing-page" 
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {user?.defaultLandingPage === "generate" ? "Generate Page (full interface)" : "Easy Mode (simplified interface)"}
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Show Logo Watermark</Label>
                  <p className="text-sm text-muted-foreground">
                    Add CiviVerse.com watermark to your generated images
                  </p>
                </div>
                <Switch 
                  checked={user?.showWatermark || false} 
                  onCheckedChange={(checked) => {
                    updatePreferencesMutation.mutate({ showWatermark: checked });
                  }}
                  disabled={updatePreferencesMutation.isPending || !user}
                  data-testid="switch-show-watermark" 
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="space-y-0.5">
                  <Label htmlFor="ai-prompt-instructions">AI Enhance Directions</Label>
                  <p className="text-sm text-muted-foreground">
                    These directions guide the AI Enhance button — tell it your preferred style, things to always include, or things to avoid. The enhance will only use your current prompt and these directions (no character data is pulled in). Max 2000 characters.
                  </p>
                </div>
                <Textarea
                  id="ai-prompt-instructions"
                  data-testid="textarea-ai-prompt-instructions"
                  placeholder="e.g. Always use cinematic lighting and shallow depth of field. Avoid cartoon styles. Prefer realistic skin textures."
                  rows={4}
                  maxLength={2000}
                  value={aiPromptInstructionsDraft}
                  onChange={(e) => setAiPromptInstructionsDraft(e.target.value)}
                  disabled={updatePreferencesMutation.isPending || !user}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {aiPromptInstructionsDraft.length}/2000
                  </span>
                  <Button
                    size="sm"
                    data-testid="button-save-ai-prompt-instructions"
                    onClick={() => updatePreferencesMutation.mutate({ aiPromptInstructions: aiPromptInstructionsDraft })}
                    disabled={
                      updatePreferencesMutation.isPending ||
                      !user ||
                      aiPromptInstructionsDraft === (user?.aiPromptInstructions || '')
                    }
                  >
                    {updatePreferencesMutation.isPending ? 'Saving…' : 'Save Instructions'}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="space-y-0.5">
                  <Label>Learned Style Profile</Label>
                  <p className="text-sm text-muted-foreground">
                    Each time you press Enhance, the AI quietly learns the styles and physical attributes you tend to like, and uses them to improve future prompts. Here's what it has picked up so far.
                  </p>
                </div>
                {(() => {
                  const profile = (user as any)?.learnedStyleProfile;
                  const groups: { label: string; items: string[] }[] = profile ? [
                    { label: 'Styles', items: profile.styles || [] },
                    { label: 'Physical attributes', items: profile.physicalAttributes || [] },
                    { label: 'Themes', items: profile.themes || [] },
                    { label: 'Avoid', items: profile.avoid || [] },
                  ] : [];
                  const hasAny = groups.some(g => g.items.length > 0);
                  if (!profile || !hasAny) {
                    return (
                      <p className="text-sm text-muted-foreground italic" data-testid="text-empty-style-profile">
                        Nothing learned yet — press Enhance a few times and your preferences will show up here.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-3" data-testid="container-style-profile">
                      {groups.filter(g => g.items.length > 0).map(g => (
                        <div key={g.label} className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">{g.label}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {g.items.map((item, i) => (
                              <Badge key={`${g.label}-${i}`} variant="secondary" className="text-xs">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                      {typeof profile.enhanceCount === 'number' && (
                        <p className="text-xs text-muted-foreground">
                          Learned from {profile.enhanceCount} enhance{profile.enhanceCount === 1 ? '' : 's'}.
                        </p>
                      )}
                    </div>
                  );
                })()}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-reset-style-profile"
                    onClick={() => {
                      if (confirm('Clear everything the AI has learned about your style? This cannot be undone.')) {
                        resetStyleProfileMutation.mutate();
                      }
                    }}
                    disabled={resetStyleProfileMutation.isPending || !user || !(user as any)?.learnedStyleProfile}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {resetStyleProfileMutation.isPending ? 'Resetting…' : 'Reset Learning'}
                  </Button>
                </div>
              </div>

              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-save Generations</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically save completed generations to your gallery
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-auto-save" />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>High Quality Previews</Label>
                  <p className="text-sm text-muted-foreground">
                    Use higher quality thumbnails (uses more bandwidth)
                  </p>
                </div>
                <Switch data-testid="switch-high-quality" />
              </div>
            </CardContent>
          </Card>

          {/* Privacy & Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy & Security
              </CardTitle>
              <CardDescription>
                Manage your privacy and security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Public Profile</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow others to view your profile and generations
                  </p>
                </div>
                <Switch data-testid="switch-public-profile" />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Analytics</Label>
                  <p className="text-sm text-muted-foreground">
                    Help improve the platform by sharing usage analytics
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-analytics" />
              </div>
            </CardContent>
          </Card>

          {/* Data Retention Policy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Data Retention
              </CardTitle>
              <CardDescription>
                How long your content is stored on the platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-cyan-500" />
                  <div>
                    <p className="font-medium">Community Shared Images</p>
                    <p className="text-sm text-muted-foreground">
                      Images shared to the community feed are stored for <strong>1 year (365 days)</strong> from the date they were shared.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-magenta-500" />
                  <div>
                    <p className="font-medium">Private Generations</p>
                    <p className="text-sm text-muted-foreground">
                      Images that are not shared to the community are stored for <strong>60 days</strong> from creation.
                    </p>
                  </div>
                </div>
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">
                  To keep your images longer, share them to the community feed. You can download your images anytime before they expire.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Legal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Legal Information
              </CardTitle>
              <CardDescription>
                Access legal documents and terms of service.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Link href="/terms" className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted transition-colors" data-testid="link-terms-settings">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Terms & Conditions</div>
                      <div className="text-sm text-muted-foreground">Platform usage terms and legal agreements</div>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link href="/feedback" className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted transition-colors" data-testid="link-feedback-settings">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Feedback</div>
                      <div className="text-sm text-muted-foreground">Share suggestions, report bugs, or leave a review</div>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Account Deletion */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Permanently delete your account and all associated data. This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <h4 className="font-semibold text-destructive mb-2">Account Deletion</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  <li>• Your user account and profile</li>
                  <li>• All generated images and metadata</li>
                  <li>• Characters you've created</li>
                  <li>• Your favorites and saved content</li>
                  <li>• Quality groups and scene collections</li>
                  <li>• Credit transaction history</li>
                  <li>• API key and preferences</li>
                  <li>• All other personal data</li>
                </ul>
                <p className="text-sm font-medium text-destructive mb-4">
                  ⚠️ This action is irreversible and cannot be undone.
                </p>
                
                {!showDeleteConfirmation ? (
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteConfirmation(true)}
                    data-testid="button-show-delete-confirmation"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete My Account
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="delete-confirmation">Type "DELETE MY ACCOUNT" to confirm:</Label>
                      <Input
                        id="delete-confirmation"
                        value={deleteConfirmationText}
                        onChange={(e) => setDeleteConfirmationText(e.target.value)}
                        placeholder="DELETE MY ACCOUNT"
                        className="mt-1"
                        data-testid="input-delete-confirmation"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmationText !== "DELETE MY ACCOUNT" || deleteAccountMutation.isPending}
                        data-testid="button-confirm-delete-account"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deleteAccountMutation.isPending ? "Deleting..." : "Permanently Delete Account"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDeleteConfirmation(false);
                          setDeleteConfirmationText("");
                        }}
                        disabled={deleteAccountMutation.isPending}
                        data-testid="button-cancel-delete"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}