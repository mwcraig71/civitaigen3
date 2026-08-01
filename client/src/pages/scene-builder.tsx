import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Copy, Wand2, Save, Search, Trash2, ChevronDown, ChevronRight, Edit2, FileText, Heart, Filter, SortAsc, Tag, X, Check, ImageIcon, RotateCcw, Upload, Download, Share } from "lucide-react";
import { Link } from "wouter";
import { CSVFileManager } from "@/components/csv-file-manager";
import { sceneBuilderData, eyeOptions } from "@/data/scene-builder-data";
import { sceneMatrixData } from "@/data/scene-matrix-data";
import { Badge } from "@/components/ui/badge";
import { Eye, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown } from "lucide-react";
import type { SavedScene } from "@shared/schema";

function SceneBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [builtPrompt, setBuiltPrompt] = useState("");
  const [selectedExplicitOptions, setSelectedExplicitOptions] = useState<string[]>([]);
  const [selectedEyeOptions, setSelectedEyeOptions] = useState<string[]>([]);
  const [selectedHairStyle, setSelectedHairStyle] = useState<string>("none");
  const [selectedGazeDirection, setSelectedGazeDirection] = useState<string>("none");
  const [customWords, setCustomWords] = useState<string>("");
  
  // Category state for four-level system
  const [selectedLocationCategory, setSelectedLocationCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedOutfitCategory, setSelectedOutfitCategory] = useState("");
  const [selectedOutfit, setSelectedOutfit] = useState("");
  const [selectedPoseCategory, setSelectedPoseCategory] = useState("");
  const [selectedPose, setSelectedPose] = useState("");

  // Saved scenes state
  const [showSavedScenes, setShowSavedScenes] = useState(true);
  const [showCategories, setShowCategories] = useState(false);
  const [editingScene, setEditingScene] = useState<SavedScene | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ 
    title: "", 
    prompt: "", 
    description: "", 
    tags: [] as string[],
    imageUrl: ""
  });
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiOptions, setAiOptions] = useState<{
    titleOptions: string[];
    descriptionOptions: string[];
  } | null>(null);
  const [showAiSelection, setShowAiSelection] = useState(false);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number | null>(null);
  const [selectedDescriptionIndex, setSelectedDescriptionIndex] = useState<number | null>(null);
  const [showImageSelector, setShowImageSelector] = useState(false);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterOutfit, setFilterOutfit] = useState("all");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "title" | "category">("date");
  const [sceneFilters, setSceneFilters] = useState({
    locationCategory: "all",
    location: "",
    outfit: "",
    pose: "",
  });
  const [sceneType, setSceneType] = useState<"user" | "shared">("user");

  // Scene Matrix state
  const [copiedItem, setCopiedItem] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isEditingMatrix, setIsEditingMatrix] = useState(false);
  const [customMatrixData, setCustomMatrixData] = useState(() => {
    const savedData = localStorage.getItem('customSceneMatrixData');
    return savedData ? JSON.parse(savedData) : sceneMatrixData;
  });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSubcategory, setShowAddSubcategory] = useState("");
  
  // JSON Repair state
  const [repairedJsonData, setRepairedJsonData] = useState<{content: string, filename: string} | null>(null);
  
  // Block visibility state with persistence
  const [visibleBlocks, setVisibleBlocks] = useState(() => {
    const saved = localStorage.getItem('sceneBuilder-visibleBlocks');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // If parsing fails, use defaults
      }
    }
    return {
      locations: true,
      outfits: true,
      bodyAttributes: true,
      poseExpression: true,
      technicalSettings: true,
      explicitOptions: true,
      eyes: true
    };
  });

  // Fetch user saved scenes
  const { data: userSavedScenes = [], refetch: refetchSavedScenes } = useQuery<SavedScene[]>({
    queryKey: ["/api/saved-scenes"],
  });

  // Fetch shared scenes
  const { data: sharedScenes = [] } = useQuery<SavedScene[]>({
    queryKey: ["/api/saved-scenes/shared"],
  });

  // Combine scenes based on selected type
  const savedScenes = sceneType === "user" ? userSavedScenes : sharedScenes;

  // Save scene mutation
  const saveSceneMutation = useMutation({
    mutationFn: async (sceneData: any) => {
      return await apiRequest("POST", "/api/saved-scenes", sceneData);
    },
    onSuccess: () => {
      toast({
        title: "Scene Saved",
        description: "Your scene has been saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-scenes"] });
    },
    onError: (error) => {
      console.error("Save scene error:", error);
      toast({
        title: "Error",
        description: "Failed to save scene",
        variant: "destructive",
      });
    },
  });

  // Delete scene mutation
  const deleteSceneMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      return await apiRequest("DELETE", `/api/saved-scenes/${sceneId}`);
    },
    onSuccess: () => {
      toast({
        title: "Scene Deleted",
        description: "Scene has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-scenes"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete scene",
        variant: "destructive",
      });
    },
  });

  // Edit scene mutation
  const editSceneMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/saved-scenes/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Scene Updated",
        description: "Scene has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-scenes"] });
      setIsEditDialogOpen(false);
      setEditingScene(null);
    },
    onError: () => {
      toast({
        title: "Error", 
        description: "Failed to update scene",
        variant: "destructive",
      });
    },
  });

  // Organize data by category for intelligent matching
  const locationsByCategory = {
    "The Mall & Retail": sceneBuilderData.theMallRetailLocations,
    "Home & Indoor Spaces": sceneBuilderData.homeIndoorSpacesLocations,
    "Nature & Parks": sceneBuilderData.natureParksLocations,
    "School & Campus": sceneBuilderData.schoolCampusLocations,
    "Sports & Recreation": sceneBuilderData.sportsRecreationLocations,
    "Urban & City Life": sceneBuilderData.urbanCityLifeLocations,
    "Water Activities & Beaches": sceneBuilderData.waterActivitiesBeachesLocations,
    "Work & Career": sceneBuilderData.workCareerLocations,
    "Fantasy & Creative": sceneBuilderData.fantasyCreativeLocations,
  };

  const outfitsByCategory = {
    "The Mall & Retail": sceneBuilderData.theMallRetailOutfits,
    "Home & Indoor Spaces": sceneBuilderData.homeIndoorSpacesOutfits,
    "Nature & Parks": sceneBuilderData.natureParksOutfits,
    "School & Campus": sceneBuilderData.schoolCampusOutfits,
    "Sports & Recreation": sceneBuilderData.sportsRecreationOutfits,
    "Urban & City Life": sceneBuilderData.urbanCityLifeOutfits,
    "Water Activities & Beaches": sceneBuilderData.waterActivitiesBeachesOutfits,
    "Work & Career": sceneBuilderData.workCareerOutfits,
    "Fantasy & Creative": sceneBuilderData.fantasyCreativeOutfits,
  };

  const posesByCategory = {
    "Body / Physical Poses": sceneBuilderData.bodyPhysicalPoses,
    "The Mall & Retail": sceneBuilderData.theMallRetailPoses,
    "Home & Indoor Spaces": sceneBuilderData.homeIndoorSpacesPoses,
    "Nature & Parks": sceneBuilderData.natureParksPoses,
    "School & Campus": sceneBuilderData.schoolCampusPoses,
    "Sports & Recreation": sceneBuilderData.sportsRecreationPoses,
    "Urban & City Life": sceneBuilderData.urbanCityLifePoses,
    "Water Activities & Beaches": sceneBuilderData.waterActivitiesBeachesPoses,
    "Work & Career": sceneBuilderData.workCareerPoses,
    "Fantasy & Creative": sceneBuilderData.fantasyCreativePoses,
  };

  // Auto-default outfit and pose categories when location category changes
  useEffect(() => {
    if (selectedLocationCategory) {
      // Default outfit category to match location category
      if (outfitsByCategory[selectedLocationCategory as keyof typeof outfitsByCategory]) {
        setSelectedOutfitCategory(selectedLocationCategory);
        setSelectedOutfit(""); // Reset specific outfit selection
        setSelectedOptions(prev => {
          const newOptions = { ...prev };
          delete newOptions.outfit; // Remove outfit from built prompt
          return {
            ...newOptions,
            outfitCategory: selectedLocationCategory
          };
        });
      }
      
      // Default pose category to match location category  
      if (posesByCategory[selectedLocationCategory as keyof typeof posesByCategory]) {
        setSelectedPoseCategory(selectedLocationCategory);
        setSelectedPose(""); // Reset specific pose selection
        setSelectedOptions(prev => {
          const newOptions = { ...prev };
          delete newOptions.pose; // Remove pose from built prompt
          return {
            ...newOptions,
            poseCategory: selectedLocationCategory
          };
        });
      }
    }
  }, [selectedLocationCategory]);

  const categories = [
    { key: 'outfitCategory', title: 'Outfit Category', data: Object.keys(outfitsByCategory) },
    { key: 'locationCategory', title: 'Location Category', data: Object.keys(locationsByCategory) },
    { key: 'poseCategory', title: 'Pose Category', data: Object.keys(posesByCategory) },
    { key: 'combinedPantyOptions', title: 'Panty Options', data: sceneBuilderData.combinedPantyOptions },
    { key: 'bodySizeDescriptions', title: 'Body Size Descriptions', data: sceneBuilderData.bodySizeDescriptions },
    { key: 'buttocksDescriptions', title: 'Buttocks Descriptions', data: sceneBuilderData.buttocksDescriptions },
    { key: 'breastDescriptions', title: 'Breast Descriptions', data: sceneBuilderData.breastDescriptions },
    { key: 'nippleDescriptions', title: 'Nipple Descriptions', data: sceneBuilderData.nippleDescriptions },
    { key: 'pubicHairDescriptions', title: 'Pubic Hair Descriptions', data: sceneBuilderData.pubicHairDescriptions },
    { key: 'faceExpressions', title: 'Face Expression Descriptions', data: sceneBuilderData.faceExpressions },
    { key: 'sexualPositions', title: 'Position', data: sceneBuilderData.sexualPositions },
    { key: 'lightingDescriptions', title: 'Lighting Descriptions', data: sceneBuilderData.lightingDescriptions },
    { key: 'cameraDescriptions', title: 'Camera Descriptions', data: sceneBuilderData.cameraDescriptions },
    { key: 'perspectiveDescriptions', title: 'Perspective Descriptions', data: sceneBuilderData.perspectiveDescriptions },
    { key: 'explicitOptions', title: 'Explicit Options', data: sceneBuilderData.explicitOptions }
  ];

  // Get available outfits, locations, and poses for the selected categories
  const availableOutfits = selectedOutfitCategory ? outfitsByCategory[selectedOutfitCategory as keyof typeof outfitsByCategory] || [] : [];
  // Filter locations by selected category
  const availableLocations = selectedLocationCategory ? locationsByCategory[selectedLocationCategory as keyof typeof locationsByCategory] || [] : [];
  const availablePoses = selectedPoseCategory ? posesByCategory[selectedPoseCategory as keyof typeof posesByCategory] || [] : [];

  // Handle explicit options (multiple selections)
  const handleExplicitOptionChange = (option: string, checked: boolean) => {
    setSelectedExplicitOptions(prev => {
      if (checked) {
        return [...prev, option];
      } else {
        return prev.filter(item => item !== option);
      }
    });
  };

  // Clear all explicit options
  const clearAllExplicitOptions = () => {
    setSelectedExplicitOptions([]);
  };

  // Toggle block visibility with persistence
  const toggleBlockVisibility = (blockKey: keyof typeof visibleBlocks) => {
    setVisibleBlocks((prev: typeof visibleBlocks) => {
      const newState = {
        ...prev,
        [blockKey]: !prev[blockKey]
      };
      // Save to localStorage
      localStorage.setItem('sceneBuilder-visibleBlocks', JSON.stringify(newState));
      return newState;
    });
  };

  // Handle eye options (multiple selections)
  const handleEyeOptionChange = (option: string, checked: boolean) => {
    setSelectedEyeOptions(prev => {
      if (checked) {
        return [...prev, option];
      } else {
        return prev.filter(item => item !== option);
      }
    });
  };

  // Clear all eye options
  const clearAllEyeOptions = () => {
    setSelectedEyeOptions([]);
  };

  const handleOptionChange = (categoryKey: string, value: string) => {
    if (categoryKey === 'outfitCategory') {
      setSelectedOutfitCategory(value);
      setSelectedOutfit(""); // Reset outfit selection when category changes
      setSelectedOptions(prev => {
        const newOptions = { ...prev };
        delete newOptions.outfit; // Remove outfit from built prompt
        return {
          ...newOptions,
          [categoryKey]: value
        };
      });
    } else if (categoryKey === 'outfit') {
      setSelectedOutfit(value);
      setSelectedOptions(prev => ({
        ...prev,
        [categoryKey]: value
      }));
    } else if (categoryKey === 'locationCategory') {
      const actualValue = value === 'none' ? '' : value;
      setSelectedLocationCategory(actualValue);
      setSelectedLocation(""); // Reset location selection when category changes
      setSelectedOptions(prev => {
        const newOptions = { ...prev };
        delete newOptions.location; // Remove location from built prompt
        return {
          ...newOptions,
          [categoryKey]: actualValue
        };
      });
    } else if (categoryKey === 'location') {
      const actualValue = value === 'none' ? '' : value;
      setSelectedLocation(actualValue);
      setSelectedOptions(prev => ({
        ...prev,
        [categoryKey]: actualValue
      }));
    } else if (categoryKey === 'poseCategory') {
      setSelectedPoseCategory(value);
      setSelectedPose(""); // Reset pose selection when category changes
      setSelectedOptions(prev => {
        const newOptions = { ...prev };
        delete newOptions.pose; // Remove pose from built prompt
        return {
          ...newOptions,
          [categoryKey]: value
        };
      });
    } else if (categoryKey === 'pose') {
      setSelectedPose(value);
      setSelectedOptions(prev => ({
        ...prev,
        [categoryKey]: value
      }));
    } else {
      setSelectedOptions(prev => ({
        ...prev,
        [categoryKey]: value
      }));
    }
  };

  const saveAndCopyPrompt = () => {
    // Exclude category selections from the final prompt, only include actual descriptions
    const selectedValues = Object.entries(selectedOptions)
      .filter(([key, value]) => {
        // Exclude category selections - only include specific outfit/pose/location descriptions
        if (key === 'outfitCategory' || key === 'poseCategory' || key === 'locationCategory') {
          return false;
        }
        return value && value !== "none";
      })
      .map(([key, value]) => value);
    
    // Add hair style if selected
    if (selectedHairStyle && selectedHairStyle !== "none") {
      selectedValues.push(selectedHairStyle);
    }
    
    // Add gaze direction if selected
    if (selectedGazeDirection && selectedGazeDirection !== "none") {
      selectedValues.push(selectedGazeDirection);
    }
    
    // Add selected explicit options and eye options
    const allValues = [...selectedValues, ...selectedExplicitOptions, ...selectedEyeOptions];
    
    // Add custom words at the end if provided
    if (customWords.trim()) {
      allValues.push(customWords.trim());
    }
    
    const prompt = allValues.join(", ");
    setBuiltPrompt(prompt);
    
    if (prompt) {
      // Copy to clipboard
      navigator.clipboard.writeText(prompt);
      
      // Show success toast
      toast({
        title: "Prompt Saved & Copied",
        description: "Your custom prompt has been saved and copied to clipboard",
      });
      
      // Auto-save the scene
      const sceneData = {
        title: generateSceneTitle(),
        prompt: prompt,
        locationCategory: selectedLocationCategory || null,
        location: selectedLocation || null,
        outfitCategory: selectedOutfitCategory || null,
        outfit: selectedOutfit || null,
        poseCategory: selectedPoseCategory || null,
        pose: selectedPose || null,
        sceneData: {
          locationCategory: selectedLocationCategory,
          outfitCategory: selectedOutfitCategory,
          poseCategory: selectedPoseCategory,
          location: selectedLocation,
          outfit: selectedOutfit,
          pose: selectedPose,
          ...selectedOptions,
          explicitOptions: selectedExplicitOptions,
          eyeOptions: selectedEyeOptions,
          hairStyle: selectedHairStyle,
          gazeDirection: selectedGazeDirection
        }
      };
      
      saveSceneMutation.mutate(sceneData);
    } else {
      toast({
        title: "Error",
        description: "Please select at least one option to build a prompt.",
        variant: "destructive",
      });
    }
  };

  const clearAll = () => {
    setSelectedOptions({});
    setBuiltPrompt("");
    setSelectedOutfitCategory("");
    setSelectedOutfit("");
    setSelectedLocationCategory("");
    setSelectedLocation("");
    setSelectedPoseCategory("");
    setSelectedPose("");
    setSelectedExplicitOptions([]);
    setSelectedEyeOptions([]);
    setSelectedHairStyle("none");
    setSelectedGazeDirection("none");
  };

  // Generate automatic title for saved scene
  const generateSceneTitle = () => {
    const location = selectedLocation || selectedLocationCategory || "Scene";
    
    // Count existing scenes with this location to generate incremental number
    const existingCount = savedScenes.filter(scene => 
      scene.title.startsWith(location)
    ).length;
    
    const nextNumber = String(existingCount + 1).padStart(3, '0');
    
    return `${location} ${nextNumber}`;
  };

  // Save current scene
  const saveCurrentScene = () => {
    console.log("Save scene clicked. Built prompt:", builtPrompt);
    
    if (!builtPrompt) {
      toast({
        title: "Error",
        description: "Please build a prompt first before saving",
        variant: "destructive",
      });
      return;
    }

    const sceneData = {
      title: generateSceneTitle(),
      prompt: builtPrompt,
      locationCategory: selectedLocationCategory || null,
      location: selectedLocation || null,
      outfitCategory: selectedOutfitCategory || null,
      outfit: selectedOutfit || null,
      poseCategory: selectedPoseCategory || null,
      pose: selectedPose || null,
      sceneData: { ...selectedOptions, explicitOptions: selectedExplicitOptions, eyeOptions: selectedEyeOptions, hairStyle: selectedHairStyle, gazeDirection: selectedGazeDirection },
    };

    console.log("Saving scene data:", sceneData);
    saveSceneMutation.mutate(sceneData);
  };

  // Load a saved scene
  const loadSavedScene = (scene: SavedScene) => {
    console.log("Loading scene:", scene);
    
    try {
      // Load the scene data
      const sceneData = scene.sceneData as any || {};
      console.log("Scene data:", sceneData);
      
      setSelectedOptions(sceneData);
      setBuiltPrompt(scene.prompt);
      
      // Set individual state variables
      setSelectedLocationCategory(scene.locationCategory || "");
      setSelectedLocation(scene.location || "");
      setSelectedOutfitCategory(scene.outfitCategory || "");
      setSelectedOutfit(scene.outfit || "");
      setSelectedPoseCategory(scene.poseCategory || "");
      setSelectedPose(scene.pose || "");
      
      // Restore explicit options, eye options, and hair style if they exist
      setSelectedExplicitOptions(sceneData.explicitOptions || []);
      setSelectedEyeOptions(sceneData.eyeOptions || []);
      setSelectedHairStyle(sceneData.hairStyle || "none");
      setSelectedGazeDirection(sceneData.gazeDirection || "none");
      
      // Hide saved scenes panel
      setShowSavedScenes(false);
      
      toast({
        title: "Scene Loaded",
        description: `Loaded "${scene.title}"`,
      });
    } catch (error) {
      console.error("Error loading scene:", error);
      toast({
        title: "Error",
        description: "Failed to load scene",
        variant: "destructive",
      });
    }
  };

  // Scene Matrix functions
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

  // Scene Matrix editing functions
  const saveMatrixData = (newData: any) => {
    setCustomMatrixData(newData);
    localStorage.setItem('customSceneMatrixData', JSON.stringify(newData));
  };

  const addNewCategory = () => {
    if (!newCategoryName.trim()) return;
    const newData = {
      ...customMatrixData,
      [newCategoryName.toLowerCase()]: {
        general: ["new item"]
      }
    };
    saveMatrixData(newData);
    setNewCategoryName("");
    setShowAddCategory(false);
    toast({
      title: "Category Added",
      description: `Added new category: ${newCategoryName}`,
    });
  };

  const addNewSubcategory = (categoryKey: string) => {
    if (!newSubcategoryName.trim()) return;
    const newData = {
      ...customMatrixData,
      [categoryKey]: {
        ...customMatrixData[categoryKey],
        [newSubcategoryName.toLowerCase()]: ["new item"]
      }
    };
    saveMatrixData(newData);
    setNewSubcategoryName("");
    setShowAddSubcategory("");
    toast({
      title: "Subcategory Added",
      description: `Added new subcategory: ${newSubcategoryName}`,
    });
  };

  const addNewItem = (categoryKey: string, subcategoryKey: string) => {
    const itemKey = `${categoryKey}-${subcategoryKey}`;
    const itemText = newItemTexts[itemKey];
    if (!itemText?.trim()) return;
    const newData = {
      ...customMatrixData,
      [categoryKey]: {
        ...customMatrixData[categoryKey],
        [subcategoryKey]: [
          ...customMatrixData[categoryKey][subcategoryKey],
          itemText
        ]
      }
    };
    saveMatrixData(newData);
    setNewItemTexts(prev => ({...prev, [itemKey]: ""}));
    toast({
      title: "Item Added",
      description: `Added: ${itemText}`,
    });
  };

  const updateNewItemText = useCallback((categoryKey: string, subcategoryKey: string, value: string) => {
    const itemKey = `${categoryKey}-${subcategoryKey}`;
    setNewItemTexts(prev => ({...prev, [itemKey]: value}));
  }, []);

  const removeItem = (categoryKey: string, subcategoryKey: string, itemIndex: number) => {
    const newData = {
      ...customMatrixData,
      [categoryKey]: {
        ...customMatrixData[categoryKey],
        [subcategoryKey]: customMatrixData[categoryKey][subcategoryKey].filter((_: any, i: number) => i !== itemIndex)
      }
    };
    saveMatrixData(newData);
    toast({
      title: "Item Removed",
      description: "Item has been removed",
    });
  };

  const resetMatrixData = () => {
    saveMatrixData(sceneMatrixData);
    toast({
      title: "Reset Complete",
      description: "Scene matrix has been reset to defaults",
    });
  };

  // Download Scene Matrix data as JSON file
  const downloadMatrixData = () => {
    try {
      const dataToExport = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        sceneMatrix: customMatrixData
      };
      
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `scene-matrix-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Matrix Downloaded",
        description: "Scene Matrix data has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download Scene Matrix data.",
        variant: "destructive",
      });
    }
  };

  // Upload and import Scene Matrix data from JSON file
  const uploadMatrixData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      toast({
        title: "Invalid File",
        description: "Please select a valid JSON file.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);
        
        // Validate the structure
        if (!importedData.sceneMatrix || typeof importedData.sceneMatrix !== 'object') {
          throw new Error('Invalid Scene Matrix data structure');
        }
        
        // Check if the imported data has the expected categories
        const requiredCategories = ['location', 'outfit', 'position'];
        const hasValidStructure = requiredCategories.every(category => 
          importedData.sceneMatrix[category] && typeof importedData.sceneMatrix[category] === 'object'
        );
        
        if (!hasValidStructure) {
          throw new Error('Missing required categories in Scene Matrix data');
        }
        
        // Import the data
        saveMatrixData(importedData.sceneMatrix);
        
        toast({
          title: "Matrix Imported",
          description: `Scene Matrix data imported successfully${importedData.version ? ` (v${importedData.version})` : ''}.`,
        });
        
      } catch (error) {
        console.error('Import error:', error);
        toast({
          title: "Import Failed",
          description: "Failed to import Scene Matrix data. Please check the file format.",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsText(file);
    // Reset the input so the same file can be uploaded again
    event.target.value = '';
  };

  // Download complete Scene Builder Beta data as JSON file
  const downloadSceneBuilderData = () => {
    try {
      const dataToExport = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        sceneBuilderData: {
          // Current user selections/state
          currentSelections: {
            selectedOptions,
            selectedExplicitOptions,
            selectedEyeOptions,
            selectedHairStyle,
            selectedGazeDirection,
            selectedLocationCategory,
            selectedLocation,
            selectedOutfitCategory,
            selectedOutfit,
            selectedPoseCategory,
            selectedPose
          },
          // Static data structures from scene-builder-data.ts
          staticData: {
            sceneBuilderData,
            eyeOptions
          }
        }
      };
      
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `scene-builder-beta-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Scene Builder Data Downloaded",
        description: "Complete Scene Builder Beta data has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download Scene Builder data.",
        variant: "destructive",
      });
    }
  };

  // Auto-fix common JSON formatting issues
  const fixJsonFormat = (jsonString: string): string => {
    try {
      // First, try to parse as-is
      JSON.parse(jsonString);
      return jsonString; // No fixes needed
    } catch (error) {
      console.log('JSON parse failed, attempting auto-fix...');
      
      let fixedJson = jsonString;
      
      // Fix 1: Add missing commas in arrays
      // This regex finds patterns like "string" followed by whitespace and "string" (missing comma)
      fixedJson = fixedJson.replace(/("[\w\s\-'().,!?:;\/]+")(\s*\n\s*)("[\w\s\-'().,!?:;\/]+")/g, '$1,$2$3');
      
      // Fix 2: Add missing commas between array elements that are objects
      fixedJson = fixedJson.replace(/(\})(\s*\n\s*)(\{)/g, '$1,$2$3');
      
      // Fix 3: Add missing commas between object properties and arrays
      fixedJson = fixedJson.replace(/(\])(\s*\n\s*)("[\w]+":)/g, '$1,$2$3');
      
      // Fix 4: Remove trailing commas before closing brackets/braces
      fixedJson = fixedJson.replace(/,(\s*[\]}])/g, '$1');
      
      // Try to parse the fixed version
      try {
        JSON.parse(fixedJson);
        return fixedJson;
      } catch (fixError) {
        // If fixes didn't work, return original string and let caller handle error
        return jsonString;
      }
    }
  };

  // Upload and import Scene Builder Beta data from JSON file
  const uploadSceneBuilderData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      toast({
        title: "Invalid File",
        description: "Please select a valid JSON file.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        
        // Attempt to fix JSON formatting issues
        const fixedContent = fixJsonFormat(content);
        const wasFixed = content !== fixedContent;
        
        const importedData = JSON.parse(fixedContent);
        
        // Validate the structure
        if (!importedData.sceneBuilderData || typeof importedData.sceneBuilderData !== 'object') {
          throw new Error('Invalid Scene Builder data structure');
        }
        
        // Import current selections if available
        if (importedData.sceneBuilderData.currentSelections) {
          const selections = importedData.sceneBuilderData.currentSelections;
          
          // Restore user selections
          if (selections.selectedOptions) setSelectedOptions(selections.selectedOptions);
          if (selections.selectedExplicitOptions) setSelectedExplicitOptions(selections.selectedExplicitOptions);
          if (selections.selectedEyeOptions) setSelectedEyeOptions(selections.selectedEyeOptions);
          if (selections.selectedHairStyle) setSelectedHairStyle(selections.selectedHairStyle);
          if (selections.selectedGazeDirection) setSelectedGazeDirection(selections.selectedGazeDirection);
          if (selections.selectedLocationCategory) setSelectedLocationCategory(selections.selectedLocationCategory);
          if (selections.selectedLocation) setSelectedLocation(selections.selectedLocation);
          if (selections.selectedOutfitCategory) setSelectedOutfitCategory(selections.selectedOutfitCategory);
          if (selections.selectedOutfit) setSelectedOutfit(selections.selectedOutfit);
          if (selections.selectedPoseCategory) setSelectedPoseCategory(selections.selectedPoseCategory);
          if (selections.selectedPose) setSelectedPose(selections.selectedPose);
        }
        
        toast({
          title: "Scene Builder Data Imported",
          description: `Scene Builder Beta data imported successfully${importedData.version ? ` (v${importedData.version})` : ''}${wasFixed ? ' (auto-fixed formatting issues)' : ''}.`,
        });
        
      } catch (error) {
        console.error('Import error:', error);
        toast({
          title: "Import Failed",
          description: "Failed to import Scene Builder data. The file appears to have corrupted JSON format that couldn't be automatically fixed.",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsText(file);
    // Reset the input so the same file can be uploaded again
    event.target.value = '';
  };

  // Comprehensive JSON repair function based on Python script logic
  const comprehensiveJsonRepair = (jsonString: string): string => {
    try {
      // First, try to parse as-is
      JSON.parse(jsonString);
      return jsonString; // No fixes needed
    } catch (error) {
      console.log('JSON parse failed, attempting comprehensive auto-fix...');
      
      let fixedJson = jsonString;
      
      // Fix 1: Add missing commas between string literals in arrays
      // This handles cases like: "string1"\n"string2" -> "string1",\n"string2"
      fixedJson = fixedJson.replace(/("(?:[^"\\]|\\.)*")(\s*\n\s*)("(?:[^"\\]|\\.)*")/g, '$1,$2$3');
      
      // Fix 2: Add missing commas between object elements
      fixedJson = fixedJson.replace(/(\})(\s*\n\s*)(\{)/g, '$1,$2$3');
      
      // Fix 3: Add missing commas between array elements and object properties  
      fixedJson = fixedJson.replace(/(\])(\s*\n\s*)("[\w\-_]+"\s*:)/g, '$1,$2$3');
      
      // Fix 4: Add missing commas between object properties and arrays
      fixedJson = fixedJson.replace(/(\])(\s*\n\s*)("[\w\-_]+"\s*:)/g, '$1,$2$3');
      
      // Fix 5: Add missing commas after object values before new properties
      fixedJson = fixedJson.replace(/(\s*"[^"]*"\s*)(\s*\n\s*)("[\w\-_]+"\s*:)/g, '$1,$2$3');
      
      // Fix 6: Add missing commas after arrays before new properties  
      fixedJson = fixedJson.replace(/(\])(\s*\n\s*)("[\w\-_]+"\s*:)/g, '$1,$2$3');
      
      // Fix 7: Remove trailing commas before closing brackets and braces
      fixedJson = fixedJson.replace(/,(\s*[\]}])/g, '$1');
      
      // Try to parse the fixed version
      try {
        JSON.parse(fixedJson);
        return fixedJson;
      } catch (fixError) {
        // If fixes didn't work, return original string and let caller handle error
        return jsonString;
      }
    }
  };

  // Handle JSON repair upload
  const handleJsonRepair = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      toast({
        title: "Invalid File",
        description: "Please select a valid JSON file.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        
        // Apply comprehensive JSON repair
        const repairedContent = comprehensiveJsonRepair(content);
        const wasRepaired = content !== repairedContent;
        
        // Try to parse the repaired content to validate it
        const parsedJson = JSON.parse(repairedContent);
        
        // Generate filename for repaired file
        const originalName = file.name.replace('.json', '');
        const repairedFilename = `${originalName}-REPAIRED-${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.json`;
        
        // Store the repaired JSON data
        setRepairedJsonData({
          content: JSON.stringify(parsedJson, null, 2), // Pretty format
          filename: repairedFilename
        });
        
        toast({
          title: wasRepaired ? "JSON Repaired Successfully" : "JSON Validated",
          description: wasRepaired 
            ? `File repaired and ready for download as ${repairedFilename}`
            : "JSON file is already valid - no repairs needed. You can still download the formatted version.",
        });
        
      } catch (error) {
        console.error('JSON repair error:', error);
        toast({
          title: "Repair Failed",
          description: "Could not repair this JSON file. The formatting issues are too complex for automatic repair. Please check the file manually.",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsText(file);
    // Reset the input so the same file can be uploaded again
    event.target.value = '';
  };

  // Download repaired JSON file
  const downloadRepairedJson = () => {
    if (!repairedJsonData) return;
    
    const blob = new Blob([repairedJsonData.content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = repairedJsonData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download Complete",
      description: `Repaired JSON file "${repairedJsonData.filename}" has been downloaded.`,
    });
  };

  // Handle editing a scene
  const handleEditScene = (scene: SavedScene) => {
    setEditingScene(scene);
    setEditFormData({ 
      title: scene.title, 
      prompt: scene.prompt,
      description: scene.description || "",
      tags: scene.tags || [],
      imageUrl: scene.imageUrl || ""
    });
    setIsEditDialogOpen(true);
  };

  // Handle saving edited scene
  const handleSaveEditedScene = () => {
    if (!editingScene) return;
    
    editSceneMutation.mutate({
      id: editingScene.id,
      data: {
        title: editFormData.title,
        description: editFormData.description,
        prompt: editFormData.prompt,
        tags: editFormData.tags,
        imageUrl: editFormData.imageUrl,
        locationCategory: editingScene.locationCategory,
        location: editingScene.location,
        outfitCategory: editingScene.outfitCategory,
        outfit: editingScene.outfit,
        poseCategory: editingScene.poseCategory,
        pose: editingScene.pose,
        sceneData: editingScene.sceneData,
        isFavorite: editingScene.isFavorite,
      }
    });
  };

  // Handle deleting a scene
  const handleDeleteScene = (sceneId: string) => {
    if (confirm("Are you sure you want to delete this scene?")) {
      deleteSceneMutation.mutate(sceneId);
    }
  };

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      return await apiRequest("PUT", `/api/saved-scenes/${id}`, { isFavorite });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-scenes"] });
    },
    onError: (error) => {
      console.error("Toggle favorite error:", error);
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive",
      });
    },
  });

  // Toggle share mutation
  const toggleShareMutation = useMutation({
    mutationFn: async ({ id, isShared }: { id: string; isShared: boolean }) => {
      return await apiRequest("PUT", `/api/saved-scenes/${id}/share`, { isShared });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-scenes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-scenes/shared"] });
      toast({
        title: "Scene Updated",
        description: "Scene sharing status has been updated",
      });
    },
    onError: (error) => {
      console.error("Toggle share error:", error);
      toast({
        title: "Error",
        description: "Failed to update sharing status",
        variant: "destructive",
      });
    },
  });

  // AI generation mutation
  const generateAIMutation = useMutation({
    mutationFn: async ({ prompt, currentTitle, currentDescription, tags, locationCategory, location, outfit }: { 
      prompt: string;
      currentTitle?: string;
      currentDescription?: string;
      tags?: string[];
      locationCategory?: string; 
      location?: string; 
      outfit?: string; 
    }) => {
      const response = await apiRequest("POST", "/api/saved-scenes/generate-title-description", {
        prompt,
        currentTitle,
        currentDescription,
        tags,
        locationCategory,
        location,
        outfit
      });
      return await response.json();
    },
    onSuccess: (data: { titleOptions: string[]; descriptionOptions: string[] }) => {
      console.log("AI generation success, received data:", data);
      
      // Ensure data has the expected structure
      if (data && data.titleOptions && data.descriptionOptions) {
        setAiOptions({
          titleOptions: data.titleOptions,
          descriptionOptions: data.descriptionOptions
        });
        setSelectedTitleIndex(null);
        setSelectedDescriptionIndex(null);
        setShowAiSelection(true);
        toast({
          title: "Success",
          description: "AI generated multiple options for you to choose from!",
        });
      } else {
        console.error("Invalid AI response structure:", data);
        toast({
          title: "Error",
          description: "AI response was in unexpected format",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error("AI generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate title and description",
        variant: "destructive",
      });
    },
  });

  // Handle favorite toggle
  const handleToggleFavorite = (scene: SavedScene) => {
    toggleFavoriteMutation.mutate({
      id: scene.id,
      isFavorite: !scene.isFavorite
    });
  };

  // Handle share toggle
  const handleToggleShare = (scene: SavedScene) => {
    toggleShareMutation.mutate({
      id: scene.id,
      isShared: !scene.isShared
    });
  };

  // Filter and search scenes
  const filteredScenes = savedScenes.filter(scene => {
    const matchesSearch = searchQuery === "" || 
      scene.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scene.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (scene.tags && scene.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    
    const matchesCategory = filterCategory === "all" || scene.locationCategory === filterCategory;
    const matchesLocation = filterLocation === "all" || scene.location === filterLocation;
    const matchesOutfit = filterOutfit === "all" || scene.outfit === filterOutfit;
    const matchesFavorites = !showFavoritesOnly || scene.isFavorite;

    return matchesSearch && matchesCategory && matchesLocation && matchesOutfit && matchesFavorites;
  }).sort((a, b) => {
    switch (sortBy) {
      case "title":
        return a.title.localeCompare(b.title);
      case "category":
        return (a.locationCategory || "").localeCompare(b.locationCategory || "");
      case "date":
      default:
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        return dateB - dateA;
    }
  });

  // Get unique values for filter dropdowns
  const uniqueCategories = Array.from(new Set(savedScenes.map(s => s.locationCategory).filter(Boolean)));
  const uniqueLocations = Array.from(new Set(savedScenes.map(s => s.location).filter(Boolean)));
  const uniqueOutfits = Array.from(new Set(savedScenes.map(s => s.outfit).filter(Boolean)));

  // Handle tag management in edit form
  const handleAddTag = (tagText: string) => {
    if (tagText.trim() && !editFormData.tags.includes(tagText.trim())) {
      setEditFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagText.trim()]
      }));
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  // Handle AI generation
  const handleGenerateAI = () => {
    if (!editingScene || !editFormData.prompt?.trim()) return;
    
    generateAIMutation.mutate({
      prompt: editFormData.prompt.trim(),
      currentTitle: editFormData.title || undefined,
      currentDescription: editFormData.description || undefined,
      tags: editFormData.tags && editFormData.tags.length > 0 ? editFormData.tags : undefined,
      locationCategory: editingScene.locationCategory || undefined,
      location: editingScene.location || undefined,
      outfit: editingScene.outfit || undefined
    });
  };

  // Handle AI option selection
  const handleApplyAiSelections = () => {
    if (!aiOptions || !aiOptions.titleOptions || !aiOptions.descriptionOptions) return;
    
    if (selectedTitleIndex !== null && aiOptions.titleOptions[selectedTitleIndex]) {
      setEditFormData(prev => ({
        ...prev,
        title: aiOptions.titleOptions[selectedTitleIndex]
      }));
    }
    
    if (selectedDescriptionIndex !== null && aiOptions.descriptionOptions[selectedDescriptionIndex]) {
      setEditFormData(prev => ({
        ...prev,
        description: aiOptions.descriptionOptions[selectedDescriptionIndex]
      }));
    }
    
    setShowAiSelection(false);
    setAiOptions(null);
    setSelectedTitleIndex(null);
    setSelectedDescriptionIndex(null);
    
    toast({
      title: "Applied",
      description: "Selected AI options have been applied!",
    });
  };

  // Image selector functionality
  const { data: generationsData } = useQuery<{generations: any[], hasMore: boolean, total: number}>({
    queryKey: ["/api/generations"],
  });

  const generations = generationsData?.generations || [];
  const completedGenerations = generations.filter((gen: any) => 
    gen.status === "completed" && gen.imageUrl
  );

  const selectImage = (imageUrl: string) => {
    setEditFormData(prev => ({ ...prev, imageUrl }));
    setShowImageSelector(false);
  };

  const removeImage = () => {
    setEditFormData(prev => ({ ...prev, imageUrl: "" }));
  };

  // Type-to-filter combobox for the long option lists (plain Selects made
  // users scroll through hundreds of items with no search).
  function SearchablePicker({ value, onChange, options, placeholder }: {
    value: string;
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder: string;
  }) {
    const [open, setOpen] = useState(false);
    const selected = options.find((o) => o.value === value);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal min-h-[44px]"
          >
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Type to search..." />
            <CommandList className="max-h-64">
              <CommandEmpty>No match found.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="none" onSelect={() => { onChange("none"); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${!selected || value === "none" ? "opacity-100" : "opacity-0"}`} />
                  None
                </CommandItem>
                {options.map((option, index) => (
                  <CommandItem
                    key={index}
                    value={option.label}
                    onSelect={() => { onChange(option.value); setOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === option.value ? "opacity-100" : "opacity-0"}`} />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  // CategorySection component for Scene Matrix
  const CategorySection = React.memo(function CategorySection({ 
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

    // When searching, look across ALL groups in this category (previously the
    // search silently only covered the selected group).
    const query = searchTerm.toLowerCase();
    const filteredItems = query
      ? Object.entries(data).flatMap(([group, items]) =>
          items.filter((item) => item.toLowerCase().includes(query)).map((item) => item)
        )
      : (data[selectedSubcategory] || []);

    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              {icon}
              {title}
            </div>
            {isEditingMatrix && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddSubcategory(categoryKey)}
                data-testid={`button-add-subcategory-${categoryKey}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Group
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            {isEditingMatrix ? "Edit mode: Add items, groups, or click items to remove them." : "Click any item to copy it to your clipboard."}
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
                onClick={() => isEditingMatrix ? removeItem(categoryKey, selectedSubcategory, index) : onSelect(item)}
                className={`h-auto p-2 text-left justify-start break-words whitespace-normal ${
                  isEditingMatrix ? "hover:bg-destructive hover:text-destructive-foreground" : ""
                }`}
                title={isEditingMatrix ? `Click to remove: ${item}` : `Click to copy: ${item}`}
              >
                <span className="text-xs">{item}</span>
                {isEditingMatrix && (
                  <X className="h-3 w-3 ml-1 flex-shrink-0" />
                )}
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
  });

  return (
    <Card className="min-h-screen">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          Scene Builder (Beta)
        </CardTitle>
        <CardDescription>
          Create custom scene prompts with intelligent category matching and manage your CSV data files.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-16">
        <Tabs defaultValue="builder" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="builder" data-testid="tab-scene-builder" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Scene Builder</span>
              <span className="sm:hidden">Builder</span>
            </TabsTrigger>
            <TabsTrigger value="data-manager" data-testid="tab-data-manager" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Data Manager</span>
              <span className="sm:hidden">Data</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="builder" className="space-y-8 py-6">
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowSavedScenes(!showSavedScenes)} 
                  data-testid="button-show-saved-scenes"
                  className="min-w-0 flex-shrink"
                >
                  <Search className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">{showSavedScenes ? 'Hide' : 'Load'} Scenes</span>
                  <span className="sm:hidden">{showSavedScenes ? 'Hide' : 'Load'}</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowCategories(!showCategories)} 
                  data-testid="button-toggle-categories"
                  className="min-w-0 flex-shrink"
                >
                  {showCategories ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                  <span className="hidden sm:inline">{showCategories ? 'Hide' : 'Show'} Categories</span>
                  <span className="sm:hidden">{showCategories ? 'Hide' : 'Show'}</span>
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearAll} 
                  data-testid="button-clear-all"
                  className="min-w-0 flex-shrink"
                >
                  Clear All
                </Button>
                <Button 
                  size="sm" 
                  onClick={saveAndCopyPrompt} 
                  data-testid="button-save-copy-prompt"
                  className="min-w-0 flex-shrink"
                  disabled={saveSceneMutation.isPending}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">{saveSceneMutation.isPending ? "Saving..." : "Save & Copy"}</span>
                  <span className="sm:hidden">{saveSceneMutation.isPending ? "Saving..." : "Save & Copy"}</span>
                </Button>
              </div>
            </div>

            {/* Saved Scenes Panel */}
            {showSavedScenes && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Saved Scenes</CardTitle>
                      <CardDescription>
                        Manage your saved scene configurations ({filteredScenes.length} scenes)
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Scene Type Toggle */}
                  <Tabs value={sceneType} onValueChange={(value) => setSceneType(value as "user" | "shared")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="user" data-testid="tab-user-scenes">My Scenes</TabsTrigger>
                      <TabsTrigger value="shared" data-testid="tab-shared-scenes">Shared Scenes</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search scenes by title, prompt, or tags..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-scenes"
                    />
                  </div>

                  {/* Filter Controls Row */}
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger data-testid="select-filter-category">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {uniqueCategories.map(category => (
                          <SelectItem key={category!} value={category!}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterLocation} onValueChange={setFilterLocation}>
                      <SelectTrigger data-testid="select-filter-location">
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {uniqueLocations.map(location => (
                          <SelectItem key={location!} value={location!}>{location}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterOutfit} onValueChange={setFilterOutfit}>
                      <SelectTrigger data-testid="select-filter-outfit">
                        <SelectValue placeholder="Outfit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Outfits</SelectItem>
                        {uniqueOutfits.map(outfit => (
                          <SelectItem key={outfit!} value={outfit!}>{outfit}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as "date" | "title" | "category")}>
                      <SelectTrigger data-testid="select-sort-by">
                        <SortAsc className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date Created</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="category">Category</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant={showFavoritesOnly ? "default" : "outline"}
                      onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                      className="flex items-center gap-2"
                      data-testid="button-filter-favorites"
                    >
                      <Heart className={`h-4 w-4 ${showFavoritesOnly ? 'fill-red-500 text-red-500' : ''}`} />
                      Favorites
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSearchQuery("");
                        setFilterCategory("all");
                        setFilterLocation("all");
                        setFilterOutfit("all");
                        setShowFavoritesOnly(false);
                        setSortBy("date");
                      }}
                      className="flex items-center gap-2"
                      data-testid="button-clear-filters"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </Button>
                  </div>

                  {filteredScenes.length === 0 ? (
                    savedScenes.length === 0 ? (
                      <div className="py-8 text-center">
                        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No saved scenes yet. Build and save a scene above.</p>
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <Filter className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-4">No scenes match your filters.</p>
                        <Button variant="outline" onClick={() => {
                          setSearchQuery("");
                          setFilterCategory("all");
                          setFilterLocation("all");
                          setFilterOutfit("all");
                          setShowFavoritesOnly(false);
                        }}>
                          Clear Filters
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                      {filteredScenes.map((scene) => (
                        <Card key={scene.id} className="h-full overflow-hidden" data-testid={`card-saved-scene-${scene.id}`}>
                          {scene.imageUrl && (
                            <div className="relative bg-muted flex items-center justify-center p-2">
                              <img
                                src={scene.imageUrl}
                                alt={scene.title}
                                className="max-w-full max-h-32 object-contain rounded"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm truncate" title={scene.title}>{scene.title}</h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {scene.createdAt ? new Date(scene.createdAt).toLocaleDateString() : 'Unknown date'}
                                </p>
                              </div>
                              <div className="flex gap-1 ml-2">
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => handleToggleFavorite(scene)}
                                  className={`h-7 w-7 p-0 ${scene.isFavorite ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-red-500'}`}
                                  data-testid={`button-favorite-scene-${scene.id}`}
                                >
                                  <Heart className={`h-3 w-3 ${scene.isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                                </Button>
                                {sceneType === "user" && (
                                  <Button
                                    variant="ghost" size="sm"
                                    onClick={() => handleToggleShare(scene)}
                                    className={`h-7 w-7 p-0 ${scene.isShared ? 'text-blue-500 hover:text-blue-600' : 'text-muted-foreground hover:text-blue-500'}`}
                                    data-testid={`button-share-scene-${scene.id}`}
                                    title={scene.isShared ? 'Unshare scene' : 'Share scene with community'}
                                  >
                                    <Share className={`h-3 w-3 ${scene.isShared ? 'text-blue-500' : ''}`} />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => handleEditScene(scene)}
                                  className="h-7 w-7 p-0"
                                  data-testid={`button-edit-scene-${scene.id}`}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => handleDeleteScene(scene.id)}
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  data-testid={`button-delete-scene-${scene.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            <div className="mb-3">
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                {scene.prompt.length > 100 ? `${scene.prompt.substring(0, 100)}...` : scene.prompt}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-1 mb-3">
                              {scene.locationCategory && (
                                <Badge variant="secondary" className="text-xs">{scene.locationCategory}</Badge>
                              )}
                              {scene.location && (
                                <Badge variant="outline" className="text-xs">{scene.location}</Badge>
                              )}
                              {scene.tags && scene.tags.length > 0 && (
                                scene.tags.slice(0, 2).map((tag, index) => (
                                  <Badge key={index} variant="default" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    <Tag className="h-2 w-2 mr-1" />{tag}
                                  </Badge>
                                ))
                              )}
                              {scene.tags && scene.tags.length > 2 && (
                                <Badge variant="outline" className="text-xs">+{scene.tags.length - 2} more</Badge>
                              )}
                            </div>

                            <Button
                              variant="outline" size="sm"
                              onClick={() => loadSavedScene(scene)}
                              className="w-full text-xs"
                              data-testid={`button-load-scene-${scene.id}`}
                            >
                              Load Scene
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Reorganized Layout with Logical Grouping */}
            <div className="space-y-4">
              
              {/* Section 1: Scene Setting (Location) */}
              <Card className="p-3 sm:p-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Scene Setting</CardTitle>
                      <CardDescription className="text-sm">Define where the scene takes place</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBlockVisibility('locations')}
                      className="p-1 h-8 w-8"
                    >
                      {visibleBlocks.locations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {visibleBlocks.locations && (
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Location Category</Label>
                      <Select 
                        value={selectedLocationCategory} 
                        onValueChange={(value) => handleOptionChange('locationCategory', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select location category..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {Object.keys(locationsByCategory).map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Specific Location</Label>
                      <SearchablePicker
                        value={selectedLocation}
                        onChange={(value) => handleOptionChange('location', value)}
                        options={availableLocations.map((l: any) => ({ label: l.name, value: l.description }))}
                        placeholder="Select specific location..."
                      />
                    </div>
                  </div>
                  </CardContent>
                )}
              </Card>

              {/* Section 2: Character & Clothing */}
              <Card className="p-3 sm:p-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Character & Clothing</CardTitle>
                      <CardDescription className="text-sm">Define outfit and body characteristics</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBlockVisibility('outfits')}
                      className="p-1 h-8 w-8"
                    >
                      {visibleBlocks.outfits ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {visibleBlocks.outfits && (
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                      {showCategories && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Outfit Category</Label>
                        <Select 
                          value={selectedOptions['outfitCategory'] || "none"} 
                          onValueChange={(value) => handleOptionChange('outfitCategory', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select outfit category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {Object.keys(outfitsByCategory).map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Specific Outfit</Label>
                      <SearchablePicker
                        value={selectedOutfit}
                        onChange={(value) => handleOptionChange('outfit', value)}
                        options={availableOutfits.map((o: any) => ({ label: o.name, value: o.description }))}
                        placeholder="Select specific outfit..."
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Hair Style</Label>
                      <Select 
                        value={selectedHairStyle} 
                        onValueChange={(value) => setSelectedHairStyle(value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select hair style..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.hairStyles.map((style: string, index: number) => (
                            <SelectItem key={index} value={style}>
                              {style}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Clothing Details Row */}
                  <div className="grid grid-cols-1 gap-3 mt-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Panty Options</Label>
                      <SearchablePicker
                        value={selectedOptions['combinedPantyOptions'] || "none"}
                        onChange={(value) => handleOptionChange('combinedPantyOptions', value)}
                        options={sceneBuilderData.combinedPantyOptions.map((o: string) => ({ label: o, value: o }))}
                        placeholder="Select panty option..."
                      />
                    </div>
                  </div>
                  </CardContent>
                )}
              </Card>

              {/* Section 3: Pose & Expression */}
              <Card className="p-3 sm:p-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Pose & Expression</CardTitle>
                      <CardDescription className="text-sm">Define pose and facial expressions</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBlockVisibility('poseExpression')}
                      className="p-1 h-8 w-8"
                    >
                      {visibleBlocks.poseExpression ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {visibleBlocks.poseExpression && (
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                      {showCategories && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Pose Category</Label>
                        <Select 
                          value={selectedOptions['poseCategory'] || "none"} 
                          onValueChange={(value) => handleOptionChange('poseCategory', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select pose category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {Object.keys(posesByCategory).map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Specific Pose</Label>
                      <SearchablePicker
                        value={selectedPose}
                        onChange={(value) => handleOptionChange('pose', value)}
                        options={availablePoses.map((p: any) => ({ label: p.name, value: p.description }))}
                        placeholder="Select specific pose..."
                      />
                    </div>
                  </div>
                  
                  {/* Expression Details Row */}
                  <div className="grid grid-cols-1 gap-3 mt-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Face Expression Descriptions</Label>
                      <Select 
                        value={selectedOptions['faceExpressions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('faceExpressions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.faceExpressions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Gaze & Eye Contact</Label>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Direction</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {sceneBuilderData.gazeDirections.map((option: string, index: number) => (
                            <div key={index} className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id={`gaze-${index}`}
                                name="gazeDirection"
                                value={option}
                                checked={selectedGazeDirection === option}
                                onChange={(e) => setSelectedGazeDirection(e.target.value)}
                                className="h-4 w-4"
                              />
                              <Label 
                                htmlFor={`gaze-${index}`}
                                className="text-xs leading-tight cursor-pointer"
                              >
                                {option.replace(/_/g, ' ')}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Position</Label>
                      <Select 
                        value={selectedOptions['sexualPositions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('sexualPositions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.sexualPositions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  </CardContent>
                )}
              </Card>

              {/* Section 4: Body & Physical Attributes */}
              <Card className="p-3 sm:p-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Body & Physical Attributes</CardTitle>
                      <CardDescription className="text-sm">Define physical characteristics</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBlockVisibility('bodyAttributes')}
                      className="p-1 h-8 w-8"
                    >
                      {visibleBlocks.bodyAttributes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {visibleBlocks.bodyAttributes && (
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Body Size Descriptions</Label>
                      <Select 
                        value={selectedOptions['bodySizeDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('bodySizeDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.bodySizeDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Buttocks Descriptions</Label>
                      <Select 
                        value={selectedOptions['buttocksDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('buttocksDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.buttocksDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Breast Descriptions</Label>
                      <Select 
                        value={selectedOptions['breastDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('breastDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.breastDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Nipple Descriptions</Label>
                      <Select 
                        value={selectedOptions['nippleDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('nippleDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.nippleDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Pubic Hair Descriptions</Label>
                      <Select 
                        value={selectedOptions['pubicHairDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('pubicHairDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.pubicHairDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  </CardContent>
                )}
              </Card>

              {/* Custom Words Input */}
              <Card className="p-3 sm:p-4">
                <CardHeader className="pb-2">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Custom Words</CardTitle>
                    <CardDescription className="text-sm">Add custom words or phrases to be included at the end of your scene prompt</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Additional Words/Phrases</Label>
                    <Textarea 
                      value={customWords}
                      onChange={(e) => setCustomWords(e.target.value)}
                      placeholder="Enter custom words or phrases (e.g., magical atmosphere, vintage style, dramatic shadows...)"
                      className="min-h-[80px] resize-none"
                      data-testid="textarea-custom-words"
                    />
                    <p className="text-xs text-muted-foreground">
                      These words will be added to the end of your scene prompt
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Section 5: Technical & Artistic Settings */}
              <Card className="p-3 sm:p-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Technical & Artistic Settings</CardTitle>
                      <CardDescription className="text-sm">Camera angles, lighting, and artistic style</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBlockVisibility('technicalSettings')}
                      className="p-1 h-8 w-8"
                    >
                      {visibleBlocks.technicalSettings ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {visibleBlocks.technicalSettings && (
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Lighting Descriptions</Label>
                      <Select 
                        value={selectedOptions['lightingDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('lightingDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.lightingDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Camera Descriptions</Label>
                      <Select 
                        value={selectedOptions['cameraDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('cameraDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.cameraDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Perspective Descriptions</Label>
                      <Select 
                        value={selectedOptions['perspectiveDescriptions'] || "none"} 
                        onValueChange={(value) => handleOptionChange('perspectiveDescriptions', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sceneBuilderData.perspectiveDescriptions.map((option: string, index: number) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  </CardContent>
                )}
              </Card>

              {/* Explicit Options - Separate Block */}
              <Card className="p-3 sm:p-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Explicit Options</CardTitle>
                      <CardDescription className="text-sm">Select multiple explicit content options</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBlockVisibility('explicitOptions')}
                      className="p-1 h-8 w-8"
                    >
                      {visibleBlocks.explicitOptions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {visibleBlocks.explicitOptions && (
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Selected: {selectedExplicitOptions.length} option{selectedExplicitOptions.length !== 1 ? 's' : ''}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearAllExplicitOptions}
                          data-testid="button-clear-all-explicit"
                        >
                          Clear All
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                        {sceneBuilderData.explicitOptions.map((option: string, index: number) => (
                          <div key={index} className="flex items-center space-x-1.5">
                            <Checkbox
                              id={`explicit-${index}`}
                              checked={selectedExplicitOptions.includes(option)}
                              onCheckedChange={(checked) => 
                                handleExplicitOptionChange(option, checked as boolean)
                              }
                              data-testid={`checkbox-explicit-${index}`}
                              className="h-4 w-4"
                            />
                            <Label 
                              htmlFor={`explicit-${index}`}
                              className="text-xs leading-tight cursor-pointer"
                            >
                              {option}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Eye Options Selection */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        Eye Options
                      </CardTitle>
                      <CardDescription>
                        Select multiple eye attributes - shape, color, gaze, and details
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBlockVisibility('eyes')}
                      className="p-1 h-8 w-8"
                    >
                      {visibleBlocks.eyes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {visibleBlocks.eyes && (
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      Selected: {selectedEyeOptions.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearAllEyeOptions}
                      data-testid="button-clear-all-eye-options"
                    >
                      Clear All
                    </Button>
                  </div>
                  
                  {Object.entries(eyeOptions).map(([category, subcategories]) => (
                    <div key={category} className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground">{category}</h4>
                      {Object.entries(subcategories).map(([subcategory, options]) => (
                        <div key={subcategory} className="space-y-2">
                          <h5 className="text-xs font-medium text-muted-foreground pl-2">{subcategory}</h5>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
                            {options.map((option: string, index: number) => (
                              <div key={`${category}-${subcategory}-${index}`} className="flex items-center space-x-1.5">
                                <Checkbox
                                  id={`eye-${category}-${subcategory}-${index}`}
                                  checked={selectedEyeOptions.includes(option)}
                                  onCheckedChange={(checked) => 
                                    handleEyeOptionChange(option, checked as boolean)
                                  }
                                  data-testid={`checkbox-eye-${category}-${subcategory}-${index}`}
                                  className="h-4 w-4"
                                />
                                <Label 
                                  htmlFor={`eye-${category}-${subcategory}-${index}`}
                                  className="text-xs leading-tight cursor-pointer"
                                >
                                  {option.replace(/_/g, ' ')}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  </CardContent>
                )}
              </Card>
            </div>

            {builtPrompt && (
              <div className="sticky bottom-2 z-30 mt-4 p-3 bg-background/95 backdrop-blur border rounded-lg shadow-lg">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Label className="text-sm font-medium">Built Prompt</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      navigator.clipboard.writeText(builtPrompt).then(
                        () => toast({ title: 'Prompt copied' }),
                        () => toast({ title: 'Copy failed', variant: 'destructive' })
                      );
                    }}
                    data-testid="button-copy-built-prompt"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy
                  </Button>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground break-words max-h-24 overflow-y-auto">{builtPrompt}</p>
              </div>
            )}
          </TabsContent>

          

          
          <TabsContent value="data-manager" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Scene Matrix Manager */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Scene Matrix
                  </CardTitle>
                  <CardDescription>
                    Upload and download your complete Scene Matrix customizations as a single file
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={downloadMatrixData}
                      className="w-full"
                      variant="outline"
                      data-testid="button-download-matrix"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <div className="relative">
                      <Input
                        type="file"
                        accept=".json,application/json"
                        onChange={uploadMatrixData}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        data-testid="input-upload-matrix"
                      />
                      <Button className="w-full" variant="outline">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>• Download: Exports all your Scene Matrix customizations</p>
                    <p>• Upload: Imports Scene Matrix data from a JSON file</p>
                    <p>• Compatible with all categories and custom items</p>
                  </div>
                </CardContent>
              </Card>

              {/* Scene Builder Beta Manager */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5" />
                    Scene Builder Beta
                  </CardTitle>
                  <CardDescription>
                    Upload and download your complete Scene Builder Beta data including all selections and configurations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={downloadSceneBuilderData}
                      className="w-full"
                      variant="outline"
                      data-testid="button-download-scene-builder"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <div className="relative">
                      <Input
                        type="file"
                        accept=".json,application/json"
                        onChange={uploadSceneBuilderData}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        data-testid="input-upload-scene-builder"
                      />
                      <Button className="w-full" variant="outline">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>• Download: Exports all Scene Builder selections and data</p>
                    <p>• Upload: Restores Scene Builder state from JSON file</p>
                    <p>• Includes selections, eye options, hair styles, and more</p>
                  </div>
                </CardContent>
              </Card>

              {/* JSON Repair Tool */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    JSON Repair Tool
                  </CardTitle>
                  <CardDescription>
                    Fix corrupted JSON files for Scene Matrix or Scene Builder Beta data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="relative">
                      <Input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleJsonRepair}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        data-testid="input-json-repair"
                      />
                      <Button className="w-full" variant="outline">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload & Repair JSON
                      </Button>
                    </div>
                    {repairedJsonData && (
                      <Button
                        onClick={downloadRepairedJson}
                        className="w-full"
                        variant="default"
                        data-testid="button-download-repaired"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Fixed JSON
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>• Fixes missing commas in arrays and objects</p>
                    <p>• Repairs JSON structure automatically</p>
                    <p>• Compatible with Scene Matrix and Scene Builder data</p>
                    <p>• Download the repaired file after upload</p>
                  </div>
                </CardContent>
              </Card>

              <CSVFileManager
                category="outfits"
                categoryDisplayName="Outfits"
                description="Upload and download outfit data for scene building"
              />
              <CSVFileManager
                category="locations"
                categoryDisplayName="Locations"
                description="Upload and download location data for scene building"
              />
              <CSVFileManager
                category="poses"
                categoryDisplayName="Poses"
                description="Upload and download pose data for scene building"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* All Dialogs Outside of Tabs */}
        {/* Edit Scene Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Scene</DialogTitle>
                  <DialogDescription>
                    Update the scene title, description, prompt, and tags. Use AI to auto-generate title and description from the prompt.
                  </DialogDescription>
                </DialogHeader>
                {editingScene && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="scene-title" className="text-sm font-medium">
                          Scene Title
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateAI}
                          disabled={generateAIMutation.isPending || !editFormData.prompt?.trim()}
                          data-testid="button-generate-ai"
                        >
                          {generateAIMutation.isPending ? "Generating..." : "✨ AI Generate"}
                        </Button>
                      </div>
                      <Input
                        id="scene-title"
                        value={editFormData.title}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, title: e.target.value }))}
                        data-testid="input-edit-scene-title"
                        placeholder="Enter scene title..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="scene-description" className="text-sm font-medium">
                        Description
                      </Label>
                      <Textarea
                        id="scene-description"
                        value={editFormData.description}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Enter scene description..."
                        className="min-h-[80px] resize-none"
                        data-testid="textarea-edit-scene-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="scene-prompt" className="text-sm font-medium">
                        Scene Prompt
                      </Label>
                      <Textarea
                        id="scene-prompt"
                        value={editFormData.prompt}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, prompt: e.target.value }))}
                        placeholder="Enter scene prompt..."
                        className="min-h-[120px] resize-none"
                        data-testid="textarea-edit-scene-prompt"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Tags</Label>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1 min-h-[32px] p-2 border rounded-md">
                          {editFormData.tags.map((tag, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {tag}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-3 w-3 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                                onClick={() => handleRemoveTag(tag)}
                                data-testid={`button-remove-tag-${index}`}
                              >
                                <X className="h-2 w-2" />
                              </Button>
                            </Badge>
                          ))}
                          {editFormData.tags.length === 0 && (
                            <span className="text-xs text-muted-foreground">No tags added</span>
                          )}
                        </div>
                        <Input
                          placeholder="Type a tag and press Enter..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTag(e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                          data-testid="input-add-tag"
                        />
                      </div>
                    </div>

                    {/* Scene Image Selector */}
                    <div>
                      <Label className="text-sm font-medium">Scene Image</Label>
                      <div className="space-y-3">
                        {editFormData.imageUrl ? (
                          <div className="relative">
                            <img
                              src={editFormData.imageUrl}
                              alt="Scene preview"
                              className="w-full max-h-48 object-contain rounded-md border bg-muted/10"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={removeImage}
                              className="absolute top-2 right-2"
                              data-testid="button-remove-scene-image"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-muted-foreground/25 rounded-md p-8">
                            <div className="text-center">
                              <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                              <p className="mt-2 text-sm text-muted-foreground">No image selected</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowImageSelector(true)}
                                className="mt-2"
                                data-testid="button-select-scene-image"
                              >
                                Select from Generations
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {editFormData.imageUrl && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowImageSelector(true)}
                            className="w-full"
                            data-testid="button-change-scene-image"
                          >
                            Change Image
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditDialogOpen(false);
                          setEditingScene(null);
                        }}
                        data-testid="button-cancel-edit"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveEditedScene}
                        disabled={editSceneMutation.isPending || !editFormData.title?.trim() || !editFormData.prompt?.trim()}
                        data-testid="button-save-edit"
                      >
                        {editSceneMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* AI Selection Dialog */}
            <Dialog open={showAiSelection} onOpenChange={setShowAiSelection}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Choose AI Generated Options</DialogTitle>
                  <DialogDescription>
                    Select one title and one description from the AI-generated options below. Your selections will replace the current values.
                  </DialogDescription>
                </DialogHeader>
                {aiOptions && aiOptions.titleOptions && aiOptions.descriptionOptions && (
                  <div className="space-y-6">
                    {/* Title Options */}
                    <div>
                      <Label className="text-sm font-medium mb-3 block">Title Options (select one):</Label>
                      <div className="space-y-2">
                        {aiOptions.titleOptions.map((title, index) => (
                          <div
                            key={index}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedTitleIndex === index 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => setSelectedTitleIndex(index)}
                            data-testid={`ai-title-option-${index}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{title}</span>
                              {selectedTitleIndex === index && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description Options */}
                    <div>
                      <Label className="text-sm font-medium mb-3 block">Description Options (select one):</Label>
                      <div className="space-y-2">
                        {aiOptions.descriptionOptions.map((description, index) => (
                          <div
                            key={index}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedDescriptionIndex === index 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => setSelectedDescriptionIndex(index)}
                            data-testid={`ai-description-option-${index}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{description}</span>
                              {selectedDescriptionIndex === index && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-between pt-4">
                      <Button
                        variant="outline"
                        onClick={() => setShowAiSelection(false)}
                        data-testid="button-cancel-ai-selection"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleApplyAiSelections}
                        disabled={selectedTitleIndex === null && selectedDescriptionIndex === null}
                        data-testid="button-apply-ai-selections"
                      >
                        Apply Selected Options
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

        {/* Image Selector Dialog */}
        <Dialog open={showImageSelector} onOpenChange={setShowImageSelector}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Scene Image</DialogTitle>
              <DialogDescription>
                Choose an image from your completed generations to represent this scene.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {completedGenerations.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {completedGenerations.map((generation: any) => (
                    <button
                      key={generation.id}
                      type="button"
                      onClick={() => selectImage(generation.imageUrl)}
                      className="relative aspect-square overflow-hidden rounded-lg border hover:border-primary transition-colors group"
                      data-testid={`button-select-generation-${generation.id}`}
                    >
                      <img
                        src={generation.imageUrl}
                        alt={generation.prompt}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-white/90 rounded-full p-2">
                            <Check className="h-4 w-4 text-primary" />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ImageIcon className="mx-auto h-16 w-16 text-muted-foreground" />
                  <p className="mt-4 text-lg font-medium">No Generated Images</p>
                  <p className="text-muted-foreground">
                    You need to generate some images first before you can select them for your scenes.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowImageSelector(false)}
                data-testid="button-cancel-image-selection"
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog for adding new category */}
        <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
              <DialogDescription>
                Create a new category for organizing your scene elements.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="new-category-name">Category Name</Label>
                <Input
                  id="new-category-name"
                  placeholder="Enter category name (e.g., 'weather', 'mood')"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  data-testid="input-new-category-name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddCategory(false);
                    setNewCategoryName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={addNewCategory}
                  disabled={!newCategoryName.trim()}
                  data-testid="button-confirm-add-category"
                >
                  Add Category
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog for adding new subcategory */}
        <Dialog open={!!showAddSubcategory} onOpenChange={() => setShowAddSubcategory("")}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Group</DialogTitle>
              <DialogDescription>
                Add a new group to the "{showAddSubcategory}" category.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="new-subcategory-name">Group Name</Label>
                <Input
                  id="new-subcategory-name"
                  placeholder="Enter group name (e.g., 'vintage', 'modern')"
                  value={newSubcategoryName}
                  onChange={(e) => setNewSubcategoryName(e.target.value)}
                  data-testid="input-new-subcategory-name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddSubcategory("");
                    setNewSubcategoryName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => addNewSubcategory(showAddSubcategory)}
                  disabled={!newSubcategoryName.trim()}
                  data-testid="button-confirm-add-subcategory"
                >
                  Add Group
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
  
  
  export default function SceneBuilderPage() {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-start gap-4 mb-8">
            <Link href="/generate">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">Scene Builder</h1>
              <p className="text-muted-foreground">
                Create custom scene prompts with intelligent category matching. Upload your own CSV data to customize the available options.
              </p>
            </div>
          </div>

          <SceneBuilder />
        </div>
      </div>
    );
  }