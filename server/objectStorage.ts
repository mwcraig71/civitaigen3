import { Storage, File } from "@google-cloud/storage";
import { logger } from "./logger";
import { Response } from "express";
import { randomUUID } from "crypto";
import sharp from 'sharp';

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_QUALITY = 80;

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Generate structured file name for generated images
  generateStructuredFileName(
    characterName?: string, 
    sceneName?: string,
    generationId?: string
  ): string {
    const safeCharacterName = this.sanitizeFileName(characterName || "unknown character");
    const safeSceneName = this.sanitizeFileName(sceneName || "unknown scene");
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Use generation ID for uniqueness instead of a counter
    const uniqueId = generationId ? generationId.slice(-8) : Date.now().toString().slice(-8);
    
    return `${safeCharacterName} - ${safeSceneName} ${dateStr} ${uniqueId}`;
  }

  // Sanitize file names to remove invalid characters
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid file system characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 50); // Limit length to prevent overly long file names
  }

  // Add CiviVerse.com watermark to image buffer (only if enabled)
  private async addWatermark(imageBuffer: Buffer, addWatermark: boolean = true): Promise<Buffer> {
    logger.info(`🏷️ Watermark requested: ${addWatermark}`);
    // If watermark is disabled, return original image
    if (!addWatermark) {
      logger.info(`⏭️ Skipping watermark (disabled by user)`);
      return imageBuffer;
    }
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      
      // Use fallback dimensions if metadata is incomplete
      const width = metadata.width ?? 512;
      const height = metadata.height ?? 512;
      
      // Calculate position for bottom right watermark
      const fontSize = Math.max(20, Math.floor(width / 28)); // Slightly larger font
      const padding = Math.floor(fontSize * 1.2); // More padding from edges
      
      // Create watermark text SVG with proper baseline
      const watermarkSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <text 
            x="${width - padding}" 
            y="${height - padding}" 
            font-family="Arial, Helvetica, sans-serif" 
            font-size="${fontSize}" 
            font-weight="bold" 
            fill="white" 
            fill-opacity="0.85"
            stroke="black" 
            stroke-width="2" 
            stroke-opacity="0.6"
            text-anchor="end">CiviVerse.com</text>
        </svg>
      `;
      
      // Apply watermark to image
      const watermarkedImage = await image
        .composite([
          {
            input: Buffer.from(watermarkSvg),
            top: 0,
            left: 0,
          }
        ])
        .jpeg({ quality: 95 }) // High quality JPEG
        .toBuffer();
      
      logger.info(`✨ Added CiviVerse.com watermark to image (${width}x${height}, font: ${fontSize}px)`);
      return watermarkedImage;
    } catch (error) {
      logger.error('❌ Error adding watermark:', error);
      logger.error('❌ Falling back to original image without watermark');
      // Return original image if watermarking fails
      return imageBuffer;
    }
  }

  // Generate a thumbnail from image buffer
  private async generateThumbnail(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const thumbnail = await sharp(imageBuffer)
        .resize(THUMBNAIL_WIDTH, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toBuffer();
      
      return thumbnail;
    } catch (error) {
      logger.error('❌ Error generating thumbnail:', error);
      throw error;
    }
  }

  // Store a thumbnail for an image path
  private async storeThumbnail(imageBuffer: Buffer, imagePath: string): Promise<string> {
    try {
      const thumbnailBuffer = await this.generateThumbnail(imageBuffer);
      const thumbnailPath = this.getThumbnailPath(imagePath);
      
      const { bucketName, objectName } = parseObjectPath(thumbnailPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(thumbnailBuffer, {
        metadata: {
          contentType: 'image/jpeg',
        },
      });
      
      logger.info(`🖼️ Stored thumbnail at ${thumbnailPath}`);
      return thumbnailPath;
    } catch (error) {
      logger.error('❌ Error storing thumbnail:', error);
      throw error;
    }
  }

  // Get thumbnail path from image path
  getThumbnailPath(imagePath: string): string {
    const lastDotIndex = imagePath.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return `${imagePath}-thumb.jpg`;
    }
    return `${imagePath.substring(0, lastDotIndex)}-thumb.jpg`;
  }

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
    if (!dir) {
      logger.error('❌ PRIVATE_OBJECT_DIR environment variable not set');
      logger.error('❌ Available env vars:', Object.keys(process.env).filter(k => k.includes('OBJECT')));
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    logger.info('✅ Using PRIVATE_OBJECT_DIR:', dir);
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "text/plain",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        logger.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      logger.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Issue both PUT (upload) + GET (read, long-lived) signed URLs for the same
  // object in one round-trip. Used by Transform Studio so we can pass a
  // CivitAI-readable signed GET URL to the orchestration API.
  // Also returns the durable `objectPath` so callers can store it and mint
  // fresh signed URLs later (e.g. for regeneration after the signed URL expires).
  async getObjectEntityUploadAndReadURLs(readTtlSec: number = 24 * 3600): Promise<{ uploadURL: string; readURL: string; objectPath: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error("PRIVATE_OBJECT_DIR not set.");
    }
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const [uploadURL, readURL] = await Promise.all([
      signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 }),
      signObjectURL({ bucketName, objectName, method: "GET", ttlSec: readTtlSec }),
    ]);
    return { uploadURL, readURL, objectPath: fullPath };
  }

  // Mint a fresh signed read URL from a durable object path.
  // Use this when a previously-issued signed URL may have expired
  // (e.g. regenerating a transform job created more than 24 h ago).
  async getSignedReadUrl(objectPath: string, ttlSec: number = 24 * 3600): Promise<string> {
    const { bucketName, objectName } = parseObjectPath(objectPath);
    return signObjectURL({ bucketName, objectName, method: "GET", ttlSec });
  }

  // Upload text content directly to storage
  async uploadTextFile(filename: string, content: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/scene-matrix/${filename}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(content, {
      metadata: {
        contentType: 'text/plain',
      },
    });
    
    return fullPath;
  }

  // Download text content from storage
  async downloadTextFile(filename: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/scene-matrix/${filename}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    const [contents] = await file.download();
    return contents.toString();
  }

  // Store image with structured naming based on character and scene
  async storeGeneratedImageWithStructure(
    imageUrl: string,
    generationId: string,
    characterName?: string,
    sceneName?: string,
    metadata?: any,
    showWatermark: boolean = true  // Default to true to show watermark
  ): Promise<{ imagePath: string; metadataPath: string; thumbnailPath: string }> {
    try {
      logger.info(`🖼️ storeGeneratedImageWithStructure called with showWatermark=${showWatermark}`);
      const fileName = this.generateStructuredFileName(characterName, sceneName, generationId);
      const privateObjectDir = this.getPrivateObjectDir();
      
      // Store image with structured name
      const imagePath = `${privateObjectDir}/images/${fileName}.jpg`;
      const { bucketName: imageBucket, objectName: imageObjectName } = parseObjectPath(imagePath);
      const imageBucketRef = objectStorageClient.bucket(imageBucket);
      const imageFile = imageBucketRef.file(imageObjectName);
      
      // Download image from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const imageBuffer = await response.arrayBuffer();
      
      // Apply CiviVerse.com watermark to the image (only if user enabled it)
      const watermarkedBuffer = await this.addWatermark(Buffer.from(imageBuffer), showWatermark);
      
      // Upload watermarked image to object storage
      await imageFile.save(watermarkedBuffer, {
        metadata: {
          contentType: 'image/jpeg'
        }
      });
      
      // Generate and store thumbnail for gallery views
      const thumbnailPath = await this.storeThumbnail(watermarkedBuffer, imagePath);
      
      // Store metadata as JSON with same structured name
      const metadataPath = `${privateObjectDir}/metadata/${fileName}.json`;
      const { bucketName: metaBucket, objectName: metaObjectName } = parseObjectPath(metadataPath);
      const metaBucketRef = objectStorageClient.bucket(metaBucket);
      const metadataFile = metaBucketRef.file(metaObjectName);
      
      // Add CiviVerse.com attribution to metadata
      const enhancedMetadata = {
        ...(metadata ?? {}),
        platform: "CiviVerse.com",
        watermark: "CiviVerse.com",
        attribution: "Generated on CiviVerse.com - AI Image Generation Platform",
        processedAt: new Date().toISOString(),
        thumbnailPath,
        // Preserve character and scene information in JSON metadata
        ...(characterName && { characterName }),
        ...(sceneName && { sceneName })
      };
      
      await metadataFile.save(JSON.stringify(enhancedMetadata, null, 2), {
        metadata: {
          contentType: 'application/json'
        }
      });
      
      logger.info(`📁 Stored structured image with thumbnail: ${fileName}`);
      return { imagePath, metadataPath, thumbnailPath };
    } catch (error) {
      logger.error('Error storing structured image:', error);
      throw error;
    }
  }

  // Store profile image directly from buffer (no watermark for profile pictures)
  async storeProfileImage(imageBuffer: Buffer, filePath: string): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/${filePath}`;
      
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Store image without watermark (profile pictures shouldn't have watermarks)
      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/jpeg',
        },
      });

      logger.info(`📸 Stored profile image at ${fullPath}`);
      return fullPath;
    } catch (error) {
      logger.error('Error storing profile image:', error);
      throw error;
    }
  }

  // Store an image file from a URL to object storage (legacy method)
  async storeImageFromUrl(imageUrl: string, generationId: string, showWatermark: boolean = true): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const imagePath = `${privateObjectDir}/generations/${generationId}/image.jpg`;
      
      const { bucketName, objectName } = parseObjectPath(imagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Download image from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const imageBuffer = await response.arrayBuffer();
      
      // Apply CiviVerse.com watermark to the legacy storage as well (only if user enabled it)
      const watermarkedBuffer = await this.addWatermark(Buffer.from(imageBuffer), showWatermark);
      
      // Upload watermarked image to object storage
      await file.save(watermarkedBuffer, {
        metadata: {
          contentType: 'image/jpeg',
        },
      });

      logger.info(`📁 Stored image for generation ${generationId} at ${imagePath}`);
      return imagePath;
    } catch (error) {
      logger.error('Error storing image:', error);
      throw error;
    }
  }

  // Store enhanced image from URL
  async storeEnhancedImage(enhancementId: string, imageUrl: string): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const imagePath = `${privateObjectDir}/enhanced/${enhancementId}/image.jpg`;
      
      const { bucketName, objectName } = parseObjectPath(imagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Download enhanced image from Replicate URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download enhanced image: ${response.statusText}`);
      }

      const imageBuffer = await response.arrayBuffer();
      
      // Store enhanced image without watermark (already processed by Replicate)
      await file.save(Buffer.from(imageBuffer), {
        metadata: {
          contentType: 'image/jpeg',
        },
      });

      logger.info(`✨ Stored enhanced image for ${enhancementId} at ${imagePath}`);
      return imagePath;
    } catch (error) {
      logger.error('Error storing enhanced image:', error);
      throw error;
    }
  }

  // Delete all images from object storage
  async deleteAllImages(): Promise<{ deletedCount: number; errors: string[] }> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const imagesPath = `${privateObjectDir}/images/`;
      const { bucketName } = parseObjectPath(imagesPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const [files] = await bucket.getFiles({
        prefix: 'images/',
      });
      
      const deletionResults = await Promise.allSettled(
        files.map(file => file.delete())
      );
      
      const errors: string[] = [];
      let deletedCount = 0;
      
      deletionResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          deletedCount++;
          logger.info(`🗑️ Deleted: ${files[index].name}`);
        } else {
          errors.push(`Failed to delete ${files[index].name}: ${result.reason}`);
          logger.error(`❌ Failed to delete ${files[index].name}:`, result.reason);
        }
      });
      
      logger.info(`🧹 Cleanup complete: ${deletedCount} images deleted, ${errors.length} errors`);
      return { deletedCount, errors };
    } catch (error) {
      logger.error('Error during bulk image deletion:', error);
      throw error;
    }
  }

  // Store a video file from a URL to object storage and return the /api/storage/... serving URL.
  // Enforces a 60-second download timeout and a 500 MB content size cap to prevent runaway memory use.
  async storeVideoFromUrl(videoUrl: string, sharedImageId: string): Promise<string> {
    const TIMEOUT_MS = 60_000;          // 60 s fetch timeout
    const MAX_BYTES = 500 * 1024 * 1024; // 500 MB hard cap

    const privateObjectDir = this.getPrivateObjectDir();
    const videoPath = `${privateObjectDir}/videos/${sharedImageId}.mp4`;

    const { bucketName, objectName } = parseObjectPath(videoPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    // Fetch with explicit timeout via AbortController
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let fetchResponse: globalThis.Response;
    try {
      fetchResponse = await fetch(videoUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!fetchResponse.ok) {
      throw new Error(`Failed to download video: ${fetchResponse.status} ${fetchResponse.statusText}`);
    }

    // Validate content-length before buffering
    const contentLength = Number(fetchResponse.headers.get('content-length') ?? '0');
    if (contentLength > MAX_BYTES) {
      throw new Error(`Video too large to archive: ${contentLength} bytes exceeds ${MAX_BYTES} byte cap`);
    }

    // Buffer the response, enforcing the size cap while streaming
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const reader = fetchResponse.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BYTES) {
        await reader.cancel();
        throw new Error(`Video stream exceeded ${MAX_BYTES} byte cap after ${totalBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }

    const videoBuffer = Buffer.concat(chunks);

    await file.save(videoBuffer, {
      metadata: {
        contentType: 'video/mp4',
      },
    });

    const servingUrl = `/api/storage${videoPath}`;
    logger.info(`🎬 Archived video for shared image ${sharedImageId} (${totalBytes} bytes) at ${videoPath}`);
    return servingUrl;
  }

  // Delete all generation metadata files
  async deleteAllMetadata(): Promise<{ deletedCount: number; errors: string[] }> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const generationsPath = `${privateObjectDir}/generations/`;
      const { bucketName } = parseObjectPath(generationsPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const [files] = await bucket.getFiles({
        prefix: 'generations/',
      });
      
      const deletionResults = await Promise.allSettled(
        files.map(file => file.delete())
      );
      
      const errors: string[] = [];
      let deletedCount = 0;
      
      deletionResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          deletedCount++;
          logger.info(`🗑️ Deleted metadata: ${files[index].name}`);
        } else {
          errors.push(`Failed to delete ${files[index].name}: ${result.reason}`);
          logger.error(`❌ Failed to delete metadata ${files[index].name}:`, result.reason);
        }
      });
      
      logger.info(`🧹 Metadata cleanup complete: ${deletedCount} files deleted, ${errors.length} errors`);
      return { deletedCount, errors };
    } catch (error) {
      logger.error('Error during bulk metadata deletion:', error);
      throw error;
    }
  }

  // Delete a protected image file (e.g., for saved prompts)
  async deleteProtectedImage(imagePath: string): Promise<boolean> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      
      // Handle both full paths and relative paths
      let fullPath = imagePath;
      if (!imagePath.startsWith('/')) {
        fullPath = `${privateObjectDir}/${imagePath}`;
      }
      
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Check if file exists before attempting to delete
      const [exists] = await file.exists();
      if (!exists) {
        logger.info(`⚠️ File does not exist, skipping deletion: ${fullPath}`);
        return true; // Not an error if file doesn't exist
      }
      
      // Delete the file
      await file.delete();
      logger.info(`🗑️ Successfully deleted protected image: ${fullPath}`);
      return true;
    } catch (error) {
      logger.error(`❌ Error deleting protected image ${imagePath}:`, error);
      return false;
    }
  }

  // Copy an image from object storage to a protected location
  async copyImageToProtectedPath(sourceImagePath: string, targetPath: string): Promise<boolean> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      
      // Parse source path
      const { bucketName: sourceBucket, objectName: sourceObjectName } = parseObjectPath(sourceImagePath);
      const sourceBucketRef = objectStorageClient.bucket(sourceBucket);
      const sourceFile = sourceBucketRef.file(sourceObjectName);
      
      // Check if source exists
      const [sourceExists] = await sourceFile.exists();
      if (!sourceExists) {
        logger.error(`❌ Source image does not exist: ${sourceImagePath}`);
        return false;
      }
      
      // Parse target path (add private dir if not absolute path)
      let fullTargetPath = targetPath;
      if (!targetPath.startsWith('/')) {
        fullTargetPath = `${privateObjectDir}/${targetPath}`;
      }
      
      const { bucketName: targetBucket, objectName: targetObjectName } = parseObjectPath(fullTargetPath);
      const targetBucketRef = objectStorageClient.bucket(targetBucket);
      const targetFile = targetBucketRef.file(targetObjectName);
      
      // Download source file
      const [sourceBuffer] = await sourceFile.download();
      
      // Upload to target location
      await targetFile.save(sourceBuffer, {
        metadata: {
          contentType: 'image/jpeg'
        }
      });
      
      logger.info(`💾 Successfully copied image from ${sourceImagePath} to ${fullTargetPath}`);
      return true;
    } catch (error) {
      logger.error(`❌ Error copying image from ${sourceImagePath} to ${targetPath}:`, error);
      return false;
    }
  }

  // Store generation metadata as JSON file
  async storeGenerationMetadata(generationData: any, generationId: string): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const metadataPath = `${privateObjectDir}/generations/${generationId}/metadata.json`;
      
      const { bucketName, objectName } = parseObjectPath(metadataPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Create comprehensive metadata object
      const metadata = {
        generationId,
        timestamp: new Date().toISOString(),
        civitaiData: generationData,
        regenerationInstructions: {
          // Exact parameters to resend to CivitAI for identical results
          prompt: generationData.prompt,
          negativePrompt: generationData.negativePrompt,
          model: generationData.model,
          seed: generationData.seed,
          steps: generationData.steps,
          cfgScale: generationData.cfgScale,
          width: generationData.width,
          height: generationData.height,
          scheduler: generationData.scheduler,
          clipSkip: generationData.clipSkip,
          quantity: generationData.quantity,
          loras: generationData.loras,
        },
      };

      // Upload JSON to object storage
      await file.save(JSON.stringify(metadata, null, 2), {
        metadata: {
          contentType: 'application/json',
        },
      });

      logger.info(`📋 Stored metadata for generation ${generationId} at ${metadataPath}`);
      return metadataPath;
    } catch (error) {
      logger.error('Error storing metadata:', error);
      throw error;
    }
  }

  // Get stored generation metadata
  async getGenerationMetadata(generationId: string): Promise<any> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const metadataPath = `${privateObjectDir}/generations/${generationId}/metadata.json`;
      
      const { bucketName, objectName } = parseObjectPath(metadataPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (!exists) {
        throw new ObjectNotFoundError();
      }

      const [content] = await file.download();
      return JSON.parse(content.toString());
    } catch (error) {
      logger.error('Error retrieving metadata:', error);
      throw error;
    }
  }
}

export function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1].trim(); // Trim whitespace from bucket name
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}