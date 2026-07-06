import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sceneMatrixData } from "@/data/scene-matrix-data";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Search, Copy, Eye, Upload, Download, FileText, X } from "lucide-react";
import { Link } from "wouter";

function CategorySection({ 
  title, 
  data, 
  icon,
  onSelect,
  categoryKey
}: { 
  title: string; 
  data: Record<string, string[]>; 
  icon: React.ReactNode;
  onSelect: (item: string) => void;
  categoryKey: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(Object.keys(data)[0]);

  const filteredItems = (data[selectedSubcategory] || []).filter(item => 
    item.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>
          Click any item to copy it to your clipboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-4">
          {Object.keys(data).map((subcategory) => (
            <Button
              key={subcategory}
              variant={selectedSubcategory === subcategory ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedSubcategory(subcategory)}
              className="capitalize"
            >
              {subcategory}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
          {filteredItems.map((item, index) => (
            <Button
              key={index}
              variant="ghost"
              size="sm"
              onClick={() => onSelect(item)}
              className="h-auto p-2 text-left justify-start break-words whitespace-normal"
              title={`Click to copy: ${item}`}
            >
              <span className="text-xs">{item}</span>
            </Button>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No items found matching "{searchTerm}"
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SceneMatrix() {
  const [copiedItem, setCopiedItem] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(text);
    setTimeout(() => setCopiedItem(""), 2000);
    
    // Add to selected items if not already there
    if (!selectedItems.includes(text)) {
      setSelectedItems(prev => [...prev, text]);
    }
  };

  const removeSelectedItem = (item: string) => {
    setSelectedItems(prev => prev.filter(i => i !== item));
  };

  const copyAllSelected = () => {
    const combined = selectedItems.join(", ");
    navigator.clipboard.writeText(combined);
    setCopiedItem("All selected items");
    setTimeout(() => setCopiedItem(""), 2000);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-start gap-4 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2">Scene Matrix</h1>
          <p className="text-muted-foreground">
            Organize and select scene elements for your image generations. Click items to copy them to your clipboard.
          </p>
        </div>
      </div>

      {selectedItems.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Selected Elements</CardTitle>
              <Button onClick={copyAllSelected} size="sm" variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map((item, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  onClick={() => removeSelectedItem(item)}
                  title="Click to remove"
                >
                  {item} ×
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {copiedItem && (
        <div className="fixed top-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg z-50">
          Copied: {copiedItem}
        </div>
      )}

      <Tabs defaultValue="scene-builder" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="scene-builder">Scene Builder</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="outfit">Outfit</TabsTrigger>
          <TabsTrigger value="position">Position</TabsTrigger>
          <TabsTrigger value="props">Props</TabsTrigger>
          <TabsTrigger value="lighting">Lighting</TabsTrigger>
          <TabsTrigger value="camera">Camera</TabsTrigger>
          <TabsTrigger value="adult">Adult</TabsTrigger>
        </TabsList>

        <TabsContent value="scene-builder">
          <Card>
            <CardHeader>
              <CardTitle>Scene Builder</CardTitle>
              <CardDescription>Coming soon - intelligent scene building with category matching</CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="location">
          <CategorySection
            title="Location & Environment"
            data={sceneMatrixData.location}
            icon={<Eye className="h-5 w-5" />}
            onSelect={copyToClipboard}
            categoryKey="location"
          />
        </TabsContent>

        <TabsContent value="outfit">
          <CategorySection
            title="Outfits & Clothing"
            data={sceneMatrixData.outfit}
            icon={<Eye className="h-5 w-5" />}
            onSelect={copyToClipboard}
            categoryKey="outfit"
          />
        </TabsContent>

        <TabsContent value="position">
          <CategorySection
            title="Position & Action"
            data={sceneMatrixData.position}
            icon={<Eye className="h-5 w-5" />}
            onSelect={copyToClipboard}
            categoryKey="position"
          />
        </TabsContent>

        <TabsContent value="props">
          <CategorySection
            title="Props & Objects"
            data={sceneMatrixData.props}
            icon={<Eye className="h-5 w-5" />}
            onSelect={copyToClipboard}
            categoryKey="props"
          />
        </TabsContent>

        <TabsContent value="lighting">
          <CategorySection
            title="Lighting & Atmosphere"
            data={sceneMatrixData.lighting}
            icon={<Eye className="h-5 w-5" />}
            onSelect={copyToClipboard}
            categoryKey="lighting"
          />
        </TabsContent>

        <TabsContent value="camera">
          <CategorySection
            title="Camera & Composition"
            data={sceneMatrixData.camera}
            icon={<Eye className="h-5 w-5" />}
            onSelect={copyToClipboard}
            categoryKey="camera"
          />
        </TabsContent>

        <TabsContent value="adult">
          <CategorySection
            title="Adult & Mature Themes"
            data={sceneMatrixData.adult}
            icon={<Eye className="h-5 w-5" />}
            onSelect={copyToClipboard}
            categoryKey="adult"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}