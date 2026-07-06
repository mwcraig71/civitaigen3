import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Edit, Plus, Gift, ArrowLeft } from "lucide-react";

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

export default function Promotions() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPromotion, setNewPromotion] = useState({
    name: "",
    description: "",
    buzzAmount: 150,
    isActive: true,
    maxUses: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: promotions = [], isLoading } = useQuery<SignupPromotion[]>({
    queryKey: ["/api/signup-promotions"],
  });

  const { data: activePromotion } = useQuery<SignupPromotion>({
    queryKey: ["/api/signup-promotions/active"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/signup-promotions", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions/active"] });
      setIsCreating(false);
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
      console.error('Create promotion error:', error);
      const errorMessage = error?.message || "Failed to create promotion";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/signup-promotions/${id}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions/active"] });
      setEditingId(null);
      toast({
        title: "Success",
        description: "Promotion updated successfully!",
      });
    },
    onError: (error: any) => {
      console.error('Update promotion error:', error);
      const errorMessage = error?.message || "Failed to update promotion";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/signup-promotions/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotions/active"] });
      toast({
        title: "Success",
        description: "Promotion deleted successfully!",
      });
    },
    onError: (error: any) => {
      console.error('Delete promotion error:', error);
      const errorMessage = error?.message || "Failed to delete promotion";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleCreate = async () => {
    const data = {
      name: newPromotion.name,
      description: newPromotion.description || null,
      buzzAmount: newPromotion.buzzAmount,
      isActive: newPromotion.isActive,
      maxUses: newPromotion.maxUses ? parseInt(newPromotion.maxUses) : null,
    };

    createMutation.mutate(data);
  };

  const handleToggleActive = async (promotion: SignupPromotion) => {
    updateMutation.mutate({
      id: promotion.id,
      data: { isActive: !promotion.isActive },
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this promotion?")) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" data-testid="button-back-to-admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Gift className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold">Signup Promotions</h1>
          </div>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2"
          data-testid="button-create-promotion"
        >
          <Plus className="h-4 w-4" />
          New Promotion
        </Button>
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

      {isCreating && (
        <Card>
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
                onChange={(e) =>
                  setNewPromotion({
                    ...newPromotion,
                    buzzAmount: parseInt(e.target.value) || 0,
                  })
                }
                min="0"
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
                onClick={handleCreate}
                disabled={createMutation.isPending || !newPromotion.name}
                data-testid="button-save-promotion"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsCreating(false)}
                data-testid="button-cancel-promotion"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {promotions.map((promotion) => (
          <Card key={promotion.id} className={promotion.isActive ? "" : "opacity-60"}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {promotion.name}
                  {promotion.isActive && (
                    <Badge className="bg-green-600">Active</Badge>
                  )}
                  <Badge variant="outline">
                    {promotion.buzzAmount} credits
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={promotion.isActive}
                    onCheckedChange={() => handleToggleActive(promotion)}
                    disabled={updateMutation.isPending}
                    data-testid={`switch-active-${promotion.id}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(promotion.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${promotion.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {promotion.description && (
                <p className="text-sm text-muted-foreground mb-3">
                  {promotion.description}
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Current Uses:</span>
                  <div className="text-muted-foreground">
                    {promotion.currentUses}
                    {promotion.maxUses && ` / ${promotion.maxUses}`}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Created:</span>
                  <div className="text-muted-foreground">
                    {new Date(promotion.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Status:</span>
                  <div className="text-muted-foreground">
                    {promotion.isActive ? "Active" : "Inactive"}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Max Uses:</span>
                  <div className="text-muted-foreground">
                    {promotion.maxUses || "Unlimited"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {promotions.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Gift className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No promotions yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first signup promotion to offer welcome bonuses to new users.
              </p>
              <Button
                onClick={() => setIsCreating(true)}
                data-testid="button-create-first-promotion"
              >
                Create First Promotion
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}