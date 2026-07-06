import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { EditProfileModal } from "@/components/edit-profile-modal";
import { 
  Settings, 
  Star, 
  Heart, 
  MessageCircle, 
  Download, 
  Eye, 
  Users, 
  UserPlus,
  Grid,
  List,
  Calendar,
  MapPin,
  Link as LinkIcon,
  Twitter,
  Instagram,
  Globe,
  Edit,
  Camera,
  Award,
  Flame,
  Zap,
  BookOpen,
  Image,
  ArrowLeft,
  Shield,
  Share2,
  Coins
} from "lucide-react";
import type { User, Model, Generation, Article, Collection, Follow } from "@shared/schema";

interface UserProfile extends User {
  isFollowing?: boolean;
  followerCount: number;
  followingCount: number;
  generationCount: number;
  articleCount: number;
  collectionCount: number;
}

interface UserStats {
  totalLikes: number;
  totalViews: number;
  totalDownloads: number;
  avgRating: number;
  joinedDaysAgo: number;
}

interface UserEarnings {
  sharesCount: number;
  creditsFromShares: number;
  likesReceived: number;
  creditsFromLikes: number;
  totalCreditsEarned: number;
}

export default function ProfilePage() {
  const [location] = useLocation();
  const pathParts = location.split("/");
  const userId = pathParts.length > 2 && pathParts[2] ? pathParts[2] : "me";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/users", userId],
  });

  const { data: userStats } = useQuery<UserStats>({
    queryKey: ["/api/users", userId, "stats"],
  });

  const { data: userModels } = useQuery<Model[]>({
    queryKey: ["/api/users", userId, "models"],
  });

  const { data: userGenerations } = useQuery<Generation[]>({
    queryKey: ["/api/users", userId, "generations"],
  });

  const { data: userArticles } = useQuery<Article[]>({
    queryKey: ["/api/users", userId, "articles"],
  });

  const { data: userCollections } = useQuery<Collection[]>({
    queryKey: ["/api/users", userId, "collections"],
  });

  const { data: followers } = useQuery<User[]>({
    queryKey: ["/api/users", userId, "followers"],
  });

  const { data: following } = useQuery<User[]>({
    queryKey: ["/api/users", userId, "following"],
  });

  const { data: earnings } = useQuery<UserEarnings>({
    queryKey: ["/api/user/earnings"],
    enabled: userId === "me",
  });

  const followMutation = useMutation({
    mutationFn: (action: "follow" | "unfollow") =>
      apiRequest("POST", `/api/users/${userId}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({
        title: profile?.isFollowing ? "Unfollowed" : "Following",
        description: profile?.isFollowing 
          ? `You unfollowed @${profile.username}` 
          : `You are now following @${profile?.username}`,
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<User>) =>
      apiRequest("PATCH", `/api/users/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
    },
  });

  const uploadProfileImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('profileImage', file);
      return apiRequest('POST', '/api/user/profile-image', formData);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile Picture Updated",
        description: "Your profile picture has been successfully updated.",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Failed to upload profile picture';
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });


  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading Profile...</h2>
          <p className="text-muted-foreground">Please wait while we load the profile.</p>
        </div>
      </div>
    );
  }

  const isOwnProfile = userId === "me";

  return (
    <div className="min-h-screen bg-background">
      {/* Back Button */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <Link href="/generate">
          <Button 
            variant="outline" 
            className="mb-4 bg-dark-card border-dark-border text-white hover:bg-dark-bg"
            data-testid="back-button"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Generator
          </Button>
        </Link>
      </div>

      {/* Cover Image */}
      <div className="relative h-48 md:h-64 bg-gradient-to-r from-primary/20 to-primary/5">
        {profile.coverImage && (
          <img
            src={profile.coverImage}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
        {isOwnProfile && (
          <Button
            variant="outline"
            size="sm"
            className="absolute top-4 right-4"
            data-testid="button-edit-cover"
          >
            <Camera className="mr-2 h-4 w-4" />
            Change Cover
          </Button>
        )}
      </div>

      {/* Profile Header */}
      <div className="max-w-7xl mx-auto px-6 -mt-16 relative z-10">
        <div className="bg-card rounded-lg border shadow-lg p-6">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-6">
            {/* Avatar */}
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-background">
                <AvatarImage src={profile.profileImageUrl || ""} />
                <AvatarFallback className="text-2xl">
                  {profile.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isOwnProfile && (
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute -bottom-2 -right-2"
                  onClick={() => setIsEditModalOpen(true)}
                  data-testid="button-edit-avatar"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl md:text-3xl font-bold">
                      {profile.displayName || profile.username}
                    </h1>
                    {profile.isVerified && (
                      <Award className="h-6 w-6 text-primary" />
                    )}
                    {profile.isSupporter && (
                      <Badge variant="secondary" className="gap-1">
                        <Flame className="h-3 w-3" />
                        Supporter
                      </Badge>
                    )}
                    {profile.isAdmin && (
                      <Badge variant="destructive" className="gap-1">
                        <Shield className="h-3 w-3" />
                        Admin
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mb-2">@{profile.username}</p>
                  {profile.bio && (
                    <p className="text-sm max-w-2xl">{profile.bio}</p>
                  )}
                  
                  {/* Social Links */}
                  <div className="flex items-center gap-4 mt-4">
                    {profile.website && (
                      <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                      >
                        <Globe className="mr-2 h-4 w-4" />
                        Website
                      </a>
                    )}
                    {profile.twitter && (
                      <a
                        href={`https://twitter.com/${profile.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                      >
                        <Twitter className="mr-2 h-4 w-4" />
                        Twitter
                      </a>
                    )}
                    {profile.instagram && (
                      <a
                        href={`https://instagram.com/${profile.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                      >
                        <Instagram className="mr-2 h-4 w-4" />
                        Instagram
                      </a>
                    )}
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="mr-2 h-4 w-4" />
                      Joined {userStats?.joinedDaysAgo || 0} days ago
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  {isOwnProfile ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setIsEditModalOpen(true)}
                        data-testid="button-edit-profile"
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Profile
                      </Button>
                      {profile.isAdmin && (
                        <Link href="/admin">
                          <Button
                            variant="default"
                            className="bg-red-600 hover:bg-red-700"
                            data-testid="button-admin-panel"
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Admin Panel
                          </Button>
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        variant={profile.isFollowing ? "outline" : "default"}
                        onClick={() => followMutation.mutate(profile.isFollowing ? "unfollow" : "follow")}
                        disabled={followMutation.isPending}
                        data-testid="button-follow"
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        {profile.isFollowing ? "Unfollow" : "Follow"}
                      </Button>
                      <Button variant="outline" data-testid="button-message">
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Message
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold">{profile.followerCount}</div>
                  <div className="text-sm text-muted-foreground">Followers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{profile.followingCount}</div>
                  <div className="text-sm text-muted-foreground">Following</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{userStats?.totalLikes || 0}</div>
                  <div className="text-sm text-muted-foreground">Total Likes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{userStats?.totalDownloads || 0}</div>
                  <div className="text-sm text-muted-foreground">Downloads</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{userStats?.avgRating?.toFixed(1) || "0.0"}</div>
                  <div className="text-sm text-muted-foreground">Avg Rating</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="overview" data-testid="tab-overview">
                <Eye className="mr-2 h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="models" data-testid="tab-models">
                <Zap className="mr-2 h-4 w-4" />
                Models ({userModels?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="generations" data-testid="tab-generations">
                <Image className="mr-2 h-4 w-4" />
                Images ({userGenerations?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="articles" data-testid="tab-articles">
                <BookOpen className="mr-2 h-4 w-4" />
                Articles ({userArticles?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="collections" data-testid="tab-collections">
                <Grid className="mr-2 h-4 w-4" />
                Collections ({userCollections?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="social" data-testid="tab-social">
                <Users className="mr-2 h-4 w-4" />
                Social
              </TabsTrigger>
            </TabsList>

            {/* View Mode Toggle */}
            {(activeTab === "models" || activeTab === "generations") && (
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none"
                  data-testid="button-grid-view"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                  data-testid="button-list-view"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="overview" className="space-y-6">
            {/* Earnings Card - Only show for own profile */}
            {isOwnProfile && earnings && (
              <Card className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border-yellow-600/30">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Coins className="h-5 w-5 text-yellow-500" />
                    Community Earnings
                  </CardTitle>
                  <CardDescription>
                    Credits earned from sharing images and receiving likes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-background/50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 text-2xl font-bold text-yellow-500">
                        <Share2 className="h-5 w-5" />
                        {earnings.sharesCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Images Shared</div>
                      <div className="text-sm text-green-500">+{earnings.creditsFromShares} credits</div>
                    </div>
                    <div className="text-center p-3 bg-background/50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 text-2xl font-bold text-pink-500">
                        <Heart className="h-5 w-5" />
                        {earnings.likesReceived}
                      </div>
                      <div className="text-xs text-muted-foreground">Likes Received</div>
                      <div className="text-sm text-green-500">+{earnings.creditsFromLikes} credits</div>
                    </div>
                    <div className="text-center p-3 bg-background/50 rounded-lg col-span-2">
                      <div className="flex items-center justify-center gap-1 text-3xl font-bold text-green-500">
                        <Coins className="h-6 w-6" />
                        {earnings.totalCreditsEarned}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Credits Earned</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    Earn 6 credits for each image you share, plus 1 credit for each like your images receive
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Recent Activity Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Recent Models */}
              {userModels && userModels.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Models</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {userModels.slice(0, 3).map((model) => (
                      <div key={model.id} className="flex items-center gap-3" data-testid={`recent-model-${model.id}`}>
                        {model.imageUrl && (
                          <img
                            src={model.imageUrl}
                            alt={model.name}
                            className="w-12 h-12 rounded object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{model.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {model.downloads} downloads
                          </p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recent Generations */}
              {userGenerations && userGenerations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Images</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      {userGenerations.slice(0, 6).map((generation) => (
                        <div key={generation.id} className="aspect-square" data-testid={`recent-generation-${generation.id}`}>
                          {generation.imageUrl && (
                            <img
                              src={generation.imageUrl}
                              alt="Generated image"
                              className="w-full h-full object-cover rounded"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Articles */}
              {userArticles && userArticles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Articles</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {userArticles.slice(0, 3).map((article) => (
                      <div key={article.id} className="space-y-1" data-testid={`recent-article-${article.id}`}>
                        <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center">
                            <Heart className="mr-1 h-3 w-3" />
                            {article.likes}
                          </span>
                          <span className="flex items-center">
                            <Eye className="mr-1 h-3 w-3" />
                            {article.views}
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="models">
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold mb-2">User Models</h3>
              <p className="text-muted-foreground">Models shared by this user</p>
            </div>
          </TabsContent>

          <TabsContent value="generations">
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold mb-2">Generated Images</h3>
              <p className="text-muted-foreground">Images created by this user</p>
            </div>
          </TabsContent>

          <TabsContent value="articles">
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold mb-2">Articles & Guides</h3>
              <p className="text-muted-foreground">Written content by this user</p>
            </div>
          </TabsContent>

          <TabsContent value="collections">
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold mb-2">Collections</h3>
              <p className="text-muted-foreground">Curated collections by this user</p>
            </div>
          </TabsContent>

          <TabsContent value="social" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Followers */}
              <Card>
                <CardHeader>
                  <CardTitle>Followers ({profile.followerCount})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {followers?.slice(0, 5).map((follower) => (
                    <div key={follower.id} className="flex items-center gap-3" data-testid={`follower-${follower.id}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={follower.profileImageUrl || ""} />
                        <AvatarFallback>{follower.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{follower.displayName || follower.username}</p>
                        <p className="text-xs text-muted-foreground">@{follower.username}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Following */}
              <Card>
                <CardHeader>
                  <CardTitle>Following ({profile.followingCount})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {following?.slice(0, 5).map((user) => (
                    <div key={user.id} className="flex items-center gap-3" data-testid={`following-${user.id}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.profileImageUrl || ""} />
                        <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{user.displayName || user.username}</p>
                        <p className="text-xs text-muted-foreground">@{user.username}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Profile Modal */}
      {profile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          currentUser={{
            username: profile.username,
            displayName: profile.displayName,
            bio: profile.bio,
            profileImage: profile.profileImageUrl,
            website: profile.website,
            twitter: profile.twitter,
            instagram: profile.instagram,
            deviantart: profile.deviantart,
            emailNotifications: profile.emailNotifications ?? undefined,
          }}
        />
      )}
    </div>
  );
}