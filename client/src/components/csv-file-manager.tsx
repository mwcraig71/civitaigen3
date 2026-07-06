import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, Download, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CSVFileManagerProps {
  category: string;
  categoryDisplayName: string;
  description: string;
  onDataUpdated?: () => void;
}

export function CSVFileManager({ category, categoryDisplayName, description, onDataUpdated }: CSVFileManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fileContent, setFileContent] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/scene-data/download/${category}`);
      if (!response.ok) {
        throw new Error("Failed to download CSV");
      }
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${category}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Complete",
        description: `${categoryDisplayName} CSV file downloaded successfully.`,
      });
    },
    onError: (error) => {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download CSV file. Please try again.",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (fileContent: string) => {
      return apiRequest("POST", `/api/scene-data/upload/${category}`, { fileContent });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Upload Successful",
        description: `${data.message}`,
      });
      setUploadDialogOpen(false);
      setFileContent("");
      onDataUpdated?.();
      queryClient.invalidateQueries({ queryKey: [`/api/scene-data/${category}`] });
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload file. Please check the format and try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === "text/csv" || file.type === "text/plain")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFileContent(content);
      };
      reader.readAsText(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a valid CSV or text file.",
        variant: "destructive",
      });
    }
  };

  const handleUpload = () => {
    if (!fileContent.trim()) {
      toast({
        title: "No Content",
        description: "Please select a file first.",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate(fileContent);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {categoryDisplayName} File Manager
        </CardTitle>
        <CardDescription>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            CSV files must have headers: subcategory, name, description. Plain text files should have one item per line.
          </AlertDescription>
        </Alert>
        
        <div className="flex gap-2">
          <Button
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
            variant="outline"
            className="flex items-center gap-2"
            data-testid={`button-download-${category}`}
          >
            <Download className="h-4 w-4" />
            {downloadMutation.isPending ? "Downloading..." : "Download Current"}
          </Button>

          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                data-testid={`button-upload-${category}`}
              >
                <Upload className="h-4 w-4" />
                Upload New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Upload {categoryDisplayName} CSV</DialogTitle>
                <DialogDescription>
                  Upload a CSV file to replace the current {categoryDisplayName.toLowerCase()} data.
                  The file must have headers: subcategory, name, description
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="csv-file">Select CSV or Text File</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv,.txt"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    data-testid={`input-csv-file-${category}`}
                  />
                </div>
                
                {fileContent && (
                  <div>
                    <Label>File Preview (first 200 characters)</Label>
                    <div className="mt-2 p-3 bg-muted rounded-md text-sm font-mono">
                      {fileContent.substring(0, 200)}
                      {fileContent.length > 200 && "..."}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUploadDialogOpen(false);
                      setFileContent("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={uploadMutation.isPending || !fileContent}
                    data-testid={`button-confirm-upload-${category}`}
                  >
                    {uploadMutation.isPending ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}