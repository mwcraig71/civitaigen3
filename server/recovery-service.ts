import { readdir, stat, readFile } from 'fs/promises';
import { logger } from "./logger";
import { join } from 'path';
import { storage } from './storage';

export interface RecoveredGeneration {
  imageFile: string;
  timestamp: number;
  size: number;
}

/**
 * Recovery service to restore previously generated images that were lost
 * due to in-memory storage being cleared during server restarts
 */
export class RecoveryService {
  
  /**
   * Scans the attached_assets folder for generated images
   */
  async scanForRecoverableImages(): Promise<RecoveredGeneration[]> {
    try {
      const assetsPath = join(process.cwd(), 'attached_assets');
      const files = await readdir(assetsPath);
      
      // Filter for image files that match generation pattern
      const imageFiles = files.filter(file => 
        /^image_\d+\.(png|jpg|jpeg)$/i.test(file)
      );
      
      const recoveredImages: RecoveredGeneration[] = [];
      
      for (const file of imageFiles) {
        try {
          const filePath = join(assetsPath, file);
          const stats = await stat(filePath);
          
          // Extract timestamp from filename (image_1755147487121.png)
          const timestampMatch = file.match(/image_(\d+)\./);
          const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : stats.mtime.getTime();
          
          recoveredImages.push({
            imageFile: file,
            timestamp,
            size: stats.size
          });
        } catch (error) {
          logger.error(`Error processing file ${file}:`, error);
        }
      }
      
      // Sort by timestamp (newest first)
      return recoveredImages.sort((a, b) => b.timestamp - a.timestamp);
      
    } catch (error) {
      logger.error('Error scanning for recoverable images:', error);
      return [];
    }
  }
  
  /**
   * Restores found images as generation records in the database
   */
  async restoreGenerations(images: RecoveredGeneration[]): Promise<number> {
    const restored = 0;
    
    for (const image of images) {
      try {
        // Get a valid model ID from available models
        const models = await storage.getAllModels();
        const defaultModel = models.find(m => m.name.toLowerCase().includes('pony')) || models[0];
        
        if (!defaultModel) {
          logger.info(`❌ No models available, skipping ${image.imageFile}`);
          continue;
        }
        
        // Skip recovery without a valid user ID
        // Recovery functionality disabled after demo user removal
        logger.info(`⚠️ Skipping recovery of ${image.imageFile} - no user context available`);
        continue;
        
        // Original code commented out:
        /*
        const generation = await storage.createGeneration({
          userId: 'user-id-required',
          modelId: defaultModel.id,
          prompt: 'Recovered image from previous session',
          negativePrompt: 'low quality, blurry',
          seed: -1,
          steps: 28,
          cfgScale: 70, // 7.0 as integer * 10
          width: 768,
          height: 1024,
          scheduler: 'EulerA',
          clipSkip: 2,
          quantity: 1,
          loras: [],
        });
        
        // Update the generation with the recovered image info
        await storage.updateGenerationStatus(
          generation.id,
          'completed',
          `/attached_assets/${image.imageFile}`,
          undefined
        );
        
        // Update storage paths
        await storage.updateGenerationFileStorage(
          generation.id,
          `/attached_assets/${image.imageFile}`,
          '', // No metadata file available
          {
            prompt: 'Recovered image from previous session',
            modelId: defaultModel.id,
            recoveredAt: new Date(image.timestamp),
            originalFile: image.imageFile
          }
        );
        
        restored++;
        logger.info(`✅ Restored generation: ${image.imageFile}`);
        */
        
      } catch (error) {
        logger.error(`❌ Failed to restore ${image.imageFile}:`, error);
      }
    }
    
    return restored;
  }
}

export const recoveryService = new RecoveryService();