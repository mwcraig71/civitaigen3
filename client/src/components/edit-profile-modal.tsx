import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Camera, Upload, X, Image, Check } from 'lucide-react';

const profileUpdateSchema = z.object({
  displayName: z.string().max(100, 'Display name must be 100 characters or less').optional(),
  bio: z.string().max(500, 'Bio must be 500 characters or less').optional(),
  website: z.string().url('Invalid website URL').or(z.literal('')).optional(),
  twitter: z.string().url('Invalid Twitter URL').or(z.literal('')).optional(),
  instagram: z.string().url('Invalid Instagram URL').or(z.literal('')).optional(),
  deviantart: z.string().url('Invalid DeviantArt URL').or(z.literal('')).optional(),
  emailNotifications: z.boolean().optional(),
});

type ProfileUpdateForm = z.infer<typeof profileUpdateSchema>;

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    username?: string;
    displayName?: string | null;
    bio?: string | null;
    profileImage?: string | null;
    website?: string | null;
    twitter?: string | null;
    instagram?: string | null;
    deviantart?: string | null;
    emailNotifications?: boolean;
  };
}

export function EditProfileModal({ isOpen, onClose, currentUser }: EditProfileModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(currentUser.profileImage || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);

  const form = useForm<ProfileUpdateForm>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      displayName: currentUser.displayName || '',
      bio: currentUser.bio || '',
      website: currentUser.website || '',
      twitter: currentUser.twitter || '',
      instagram: currentUser.instagram || '',
      deviantart: currentUser.deviantart || '',
      emailNotifications: currentUser.emailNotifications ?? false,
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileUpdateForm) => {
      return apiRequest('PUT', '/api/user/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully updated.',
      });
      onClose();
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Failed to update profile';
      toast({
        title: 'Update Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Query to get user's generations for image library
  const { data: userGenerations } = useQuery<{ id: string; imageUrl?: string | null; prompt?: string | null }[]>({
    queryKey: ['/api/users/me/generations'],
    enabled: isOpen, // Only fetch when modal is open
  });

  const setProfileFromGenerationMutation = useMutation({
    mutationFn: async (generationId: string) => {
      return apiRequest('POST', '/api/user/profile-image/from-generation', { generationId });
    },
    onSuccess: (data: any) => {
      setProfileImagePreview(data.profileImageUrl);
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'me'] });
      toast({
        title: 'Profile Picture Updated',
        description: 'Your profile picture has been successfully updated.',
      });
      setSelectedGenerationId(null);
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Failed to set profile picture';
      toast({
        title: 'Update Failed',
        description: errorMessage,
        variant: 'destructive',
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
      setProfileImagePreview(data.profileImageUrl);
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'me'] });
      toast({
        title: 'Profile Picture Updated',
        description: 'Your profile picture has been successfully updated.',
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Failed to upload profile picture';
      toast({
        title: 'Upload Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid File Type',
          description: 'Please select an image file (PNG, JPG, etc.)',
          variant: 'destructive',
        });
        return;
      }
      
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: 'Please select an image smaller than 5MB',
          variant: 'destructive',
        });
        return;
      }
      
      setSelectedFile(file);
      
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setProfileImagePreview(previewUrl);
    }
  };

  const handleUploadClick = () => {
    if (selectedFile) {
      uploadProfileImageMutation.mutate(selectedFile);
      setSelectedFile(null);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleRemoveImage = () => {
    setProfileImagePreview(null);
    setSelectedFile(null);
    setSelectedGenerationId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectFromLibrary = (generationId: string, imageUrl: string) => {
    setSelectedGenerationId(generationId);
    setProfileImagePreview(imageUrl);
    setSelectedFile(null); // Clear any selected file
  };

  const handleConfirmLibrarySelection = () => {
    if (selectedGenerationId) {
      setProfileFromGenerationMutation.mutate(selectedGenerationId);
    }
  };

  const onSubmit = (data: ProfileUpdateForm) => {
    updateProfileMutation.mutate(data);
  };

  const handleCancel = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-dark-card border-dark-border">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Edit Profile</DialogTitle>
          <DialogDescription className="text-slate-400">
            Update your profile information and preferences.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Profile Picture */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Profile Picture</h3>
            
            {/* Current Profile Picture Preview */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profileImagePreview || ''} />
                  <AvatarFallback className="text-2xl">
                    {currentUser.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {profileImagePreview && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                    onClick={handleRemoveImage}
                    data-testid="button-remove-profile-image"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              
              {selectedGenerationId && (
                <Button
                  type="button"
                  onClick={handleConfirmLibrarySelection}
                  disabled={setProfileFromGenerationMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-confirm-library-selection"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {setProfileFromGenerationMutation.isPending ? 'Setting...' : 'Set as Profile Picture'}
                </Button>
              )}
            </div>

            {/* Profile Picture Source Selection */}
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-dark-bg">
                <TabsTrigger value="upload" className="data-[state=active]:bg-dark-hover text-white">
                  Upload New
                </TabsTrigger>
                <TabsTrigger value="library" className="data-[state=active]:bg-dark-hover text-white">
                  From Library
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="space-y-4 mt-4">
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUploadClick}
                    disabled={uploadProfileImageMutation.isPending}
                    className="border-dark-border hover:bg-dark-hover text-white"
                    data-testid="button-upload-profile-image"
                  >
                    {selectedFile ? (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        {uploadProfileImageMutation.isPending ? 'Uploading...' : 'Upload Selected'}
                      </>
                    ) : (
                      <>
                        <Camera className="mr-2 h-4 w-4" />
                        Choose Photo
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-slate-400">
                    PNG, JPG up to 5MB
                  </p>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-profile-image"
                />
              </TabsContent>
              
              <TabsContent value="library" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <p className="text-sm text-slate-400">Select from your generated images:</p>
                  
                  {userGenerations && userGenerations.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {userGenerations.slice(0, 12).map((generation: any) => (
                        <div
                          key={generation.id}
                          className={`relative cursor-pointer rounded-lg border-2 transition-colors ${
                            selectedGenerationId === generation.id
                              ? 'border-blue-500'
                              : 'border-transparent hover:border-gray-500'
                          }`}
                          onClick={() => handleSelectFromLibrary(generation.id, `/api/images/${generation.id}`)}
                          data-testid={`image-library-item-${generation.id}`}
                        >
                          <img
                            src={`/api/images/${generation.id}`}
                            alt="Generated image"
                            className="w-full h-20 object-cover rounded"
                          />
                          {selectedGenerationId === generation.id && (
                            <div className="absolute inset-0 bg-blue-500/20 rounded flex items-center justify-center">
                              <Check className="h-6 w-6 text-blue-500" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No generated images found</p>
                      <p className="text-sm">Generate some images first to use them as profile pictures</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Basic Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-white">Display Name</Label>
              <Input
                id="displayName"
                {...form.register('displayName')}
                placeholder="Enter your display name"
                className="bg-dark-bg border-dark-border text-white"
                data-testid="input-display-name"
              />
              {form.formState.errors.displayName && (
                <p className="text-red-400 text-sm">{form.formState.errors.displayName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-white">Bio</Label>
              <Textarea
                id="bio"
                {...form.register('bio')}
                placeholder="Tell us about yourself..."
                className="bg-dark-bg border-dark-border text-white min-h-[100px] resize-none"
                data-testid="textarea-bio"
              />
              <div className="flex justify-between text-sm">
                <span className="text-red-400">
                  {form.formState.errors.bio?.message}
                </span>
                <span className="text-slate-500">
                  {form.watch('bio')?.length || 0}/500
                </span>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Social Links</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="website" className="text-white">Website</Label>
                <Input
                  id="website"
                  {...form.register('website')}
                  placeholder="https://your-website.com"
                  className="bg-dark-bg border-dark-border text-white"
                  data-testid="input-website"
                />
                {form.formState.errors.website && (
                  <p className="text-red-400 text-sm">{form.formState.errors.website.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitter" className="text-white">Twitter</Label>
                <Input
                  id="twitter"
                  {...form.register('twitter')}
                  placeholder="https://twitter.com/username"
                  className="bg-dark-bg border-dark-border text-white"
                  data-testid="input-twitter"
                />
                {form.formState.errors.twitter && (
                  <p className="text-red-400 text-sm">{form.formState.errors.twitter.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagram" className="text-white">Instagram</Label>
                <Input
                  id="instagram"
                  {...form.register('instagram')}
                  placeholder="https://instagram.com/username"
                  className="bg-dark-bg border-dark-border text-white"
                  data-testid="input-instagram"
                />
                {form.formState.errors.instagram && (
                  <p className="text-red-400 text-sm">{form.formState.errors.instagram.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="deviantart" className="text-white">DeviantArt</Label>
                <Input
                  id="deviantart"
                  {...form.register('deviantart')}
                  placeholder="https://deviantart.com/username"
                  className="bg-dark-bg border-dark-border text-white"
                  data-testid="input-deviantart"
                />
                {form.formState.errors.deviantart && (
                  <p className="text-red-400 text-sm">{form.formState.errors.deviantart.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Preferences</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-white">Email Notifications</Label>
                  <p className="text-sm text-slate-400">
                    Receive email notifications about your account activity
                  </p>
                </div>
                <Switch
                  {...form.register('emailNotifications')}
                  checked={form.watch('emailNotifications')}
                  onCheckedChange={(checked) => form.setValue('emailNotifications', checked)}
                  data-testid="switch-email-notifications"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-3 pt-6 border-t border-dark-border">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={updateProfileMutation.isPending}
              className="border-dark-border hover:bg-dark-hover text-white"
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}