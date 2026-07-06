import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  MessageSquare, 
  Bug, 
  Lightbulb, 
  AlertTriangle,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Play
} from "lucide-react";
import type { User, UserFeedback } from "@shared/schema";

const feedbackSchema = z.object({
  type: z.string().min(1, "Please select a feedback type"),
  title: z.string().min(1, "Title is required").max(100, "Title must be 100 characters or less"),
  description: z.string().min(10, "Description must be at least 10 characters").max(1000, "Description must be 1000 characters or less"),
  priority: z.string().default("medium")
});

const feedbackTypes = [
  { value: "error_report", label: "Error Report", icon: Bug, description: "Report bugs or errors you encountered" },
  { value: "recommendation", label: "Recommendation", icon: Lightbulb, description: "Suggest improvements or new features" },
  { value: "bug_report", label: "Bug Report", icon: AlertTriangle, description: "Report technical issues or problems" },
  { value: "feature_request", label: "Feature Request", icon: MessageSquare, description: "Request new functionality" }
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "open":
      return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Open</Badge>;
    case "in_progress":
      return <Badge variant="default"><Play className="mr-1 h-3 w-3" />In Progress</Badge>;
    case "resolved":
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Resolved</Badge>;
    case "closed":
      return <Badge variant="outline"><XCircle className="mr-1 h-3 w-3" />Closed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "urgent":
      return <Badge variant="destructive">Urgent</Badge>;
    case "high":
      return <Badge variant="destructive" className="bg-orange-600">High</Badge>;
    case "medium":
      return <Badge variant="default">Medium</Badge>;
    case "low":
      return <Badge variant="outline">Low</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

export default function FeedbackPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");

  // Check if user is authenticated
  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  // Get user's feedback history
  const { data: userFeedback } = useQuery<UserFeedback[]>({
    queryKey: ['/api/feedback'],
    enabled: !!user,
  });

  // Form for submitting feedback
  const form = useForm<z.infer<typeof feedbackSchema>>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      type: "",
      title: "",
      description: "",
      priority: "medium"
    }
  });

  // Submit feedback mutation
  const submitFeedbackMutation = useMutation({
    mutationFn: (data: z.infer<typeof feedbackSchema>) => 
      apiRequest('POST', '/api/feedback', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feedback'] });
      form.reset();
      setActiveTab("history");
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! We'll review it and get back to you.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Submit Feedback",
        description: error.message || "There was an error submitting your feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof feedbackSchema>) => {
    submitFeedbackMutation.mutate(data);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Sign In Required</h2>
          <p className="text-muted-foreground mb-4">
            Please sign in to submit feedback and recommendations.
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to App
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Feedback & Support</h1>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Help us improve CiviVerse
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 mb-8 bg-muted p-1 rounded-lg">
          <Button
            variant={activeTab === "submit" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("submit")}
            className="flex-1"
          >
            <Send className="mr-2 h-4 w-4" />
            Submit Feedback
          </Button>
          <Button
            variant={activeTab === "history" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("history")}
            className="flex-1"
          >
            <Clock className="mr-2 h-4 w-4" />
            My Feedback ({userFeedback?.length || 0})
          </Button>
        </div>

        {activeTab === "submit" && (
          <div className="space-y-6">
            {/* Feedback Types */}
            <Card>
              <CardHeader>
                <CardTitle>What type of feedback would you like to share?</CardTitle>
                <CardDescription>
                  Choose the category that best describes your feedback
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {feedbackTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <div
                        key={type.value}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          form.watch("type") === type.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => form.setValue("type", type.value)}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <h3 className="font-medium">{type.label}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {type.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Feedback Form */}
            <Card>
              <CardHeader>
                <CardTitle>Tell us more</CardTitle>
                <CardDescription>
                  Provide details about your feedback to help us understand and address it
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Brief summary of your feedback"
                              {...field}
                              data-testid="input-title"
                            />
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
                            <Textarea
                              placeholder="Please provide detailed information about your feedback. Include steps to reproduce if reporting a bug, or explain your suggestion in detail."
                              className="min-h-[120px]"
                              {...field}
                              data-testid="textarea-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-priority">
                                <SelectValue placeholder="Select priority level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low - Minor improvement or suggestion</SelectItem>
                              <SelectItem value="medium">Medium - Important but not urgent</SelectItem>
                              <SelectItem value="high">High - Significant issue affecting use</SelectItem>
                              <SelectItem value="urgent">Urgent - Critical problem blocking functionality</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={submitFeedbackMutation.isPending || !form.watch("type")}
                      data-testid="button-submit-feedback"
                    >
                      {submitFeedbackMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Submit Feedback
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-6">
            {userFeedback && userFeedback.length > 0 ? (
              userFeedback.map((feedback) => (
                <Card key={feedback.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{feedback.title}</CardTitle>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(feedback.status)}
                          {getPriorityBadge(feedback.priority)}
                          <Badge variant="outline" className="capitalize">
                            {feedback.type.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {feedback.createdAt ? new Date(feedback.createdAt).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {feedback.description}
                      </p>
                    </div>
                    
                    {feedback.adminResponse && (
                      <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2 text-primary">Admin Response</h4>
                        <p className="text-sm whitespace-pre-wrap">
                          {feedback.adminResponse}
                        </p>
                        {feedback.respondedAt && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Responded on {new Date(feedback.respondedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No feedback submitted yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Your feedback history will appear here once you submit your first report or suggestion.
                  </p>
                  <Button onClick={() => setActiveTab("submit")} variant="outline">
                    <Send className="mr-2 h-4 w-4" />
                    Submit Your First Feedback
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}