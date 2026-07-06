import { GoogleGenAI } from "@google/genai";

import { logger } from "./logger";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateSceneTitleAndDescription(
  prompt: string, 
  currentTitle?: string,
  currentDescription?: string,
  tags?: string[],
  locationCategory?: string, 
  location?: string, 
  outfit?: string
): Promise<{ titleOptions: string[]; descriptionOptions: string[] }> {
  try {
    const systemPrompt = `You are a creative writing assistant. Based on the scene information provided, generate 3 different title options and 3 different description options for this scene.

Guidelines:
- Titles: Should be 3-6 words each, catchy and descriptive, varied in style (creative, descriptive, atmospheric)
- Descriptions: Should be 1-2 sentences each describing different aspects (mood, setting, visual elements)
- Keep all content appropriate and professional
- Make each option distinct and offer different creative approaches
- Consider all provided context including existing title, description, tags, and scene details

Respond with JSON in this format:
{
  "titleOptions": ["Title Option 1", "Title Option 2", "Title Option 3"],
  "descriptionOptions": ["Description option 1 with atmosphere and mood.", "Description option 2 focusing on setting.", "Description option 3 with visual elements."]
}`;

    const contextInfo = [];
    if (currentTitle) contextInfo.push(`Current Title: ${currentTitle}`);
    if (currentDescription) contextInfo.push(`Current Description: ${currentDescription}`);
    if (tags && tags.length > 0) contextInfo.push(`Tags: ${tags.join(', ')}`);
    if (locationCategory) contextInfo.push(`Location Category: ${locationCategory}`);
    if (location) contextInfo.push(`Location: ${location}`);
    if (outfit) contextInfo.push(`Outfit: ${outfit}`);
    
    const fullPrompt = `${contextInfo.length > 0 ? contextInfo.join('\n') + '\n\n' : ''}Scene Prompt: ${prompt}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `${systemPrompt}\n\n${fullPrompt}`
        }]
      }],
    });

    const rawJson = response.text;
    logger.info("Raw Gemini response:", rawJson);
    
    if (rawJson) {
      try {
        // Try to extract JSON from response if it's wrapped in text
        const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : rawJson;
        const data = JSON.parse(jsonText);
        
        return {
          titleOptions: data.titleOptions || ["Generated Scene 1", "Generated Scene 2", "Generated Scene 3"],
          descriptionOptions: data.descriptionOptions || [
            "AI-generated scene description 1", 
            "AI-generated scene description 2", 
            "AI-generated scene description 3"
          ]
        };
      } catch (parseError) {
        logger.error("Failed to parse Gemini response:", parseError);
        logger.info("Raw response was:", rawJson);
        
        // Fallback: try to generate basic options
        return {
          titleOptions: [
            `${location || "Scene"} Moment`,
            `${locationCategory || "Creative"} Setting`, 
            "Generated Scene"
          ],
          descriptionOptions: [
            "A beautifully crafted scene with atmospheric lighting and detailed composition.",
            "An engaging visual narrative capturing the essence of the moment.",
            "A stunning representation with carefully balanced elements and mood."
          ]
        };
      }
    } else {
      throw new Error("Empty response from Gemini");
    }
  } catch (error) {
    logger.error("Failed to generate scene title and description options:", error);
    return {
      titleOptions: ["Generated Scene 1", "Generated Scene 2", "Generated Scene 3"],
      descriptionOptions: [
        "Failed to generate description 1", 
        "Failed to generate description 2", 
        "Failed to generate description 3"
      ]
    };
  }
}