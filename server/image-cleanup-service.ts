import { db } from "./db";
import { logger } from "./logger";
import { sharedImages, userSharedImageLikes, users, generations } from "@shared/schema";
import { eq, and, lt, inArray, isNull, sql, notInArray } from "drizzle-orm";
import { ObjectStorageService, parseObjectPath, objectStorageClient } from "./objectStorage";

const objectStorageService = new ObjectStorageService();

const RETENTION_DAYS = {
  SHARED_IMAGES: 365,
  PRIVATE_GENERATIONS: 60,
};

export interface CleanupResult {
  sharedImagesDeleted: number;
  privateGenerationsDeleted: number;
  storageFilesDeleted: number;
  externalUrlsSkipped: number;
  errors: string[];
  protectedByAdmin: number;
  dryRun: boolean;
  note: string;
}

export interface CleanupStats {
  sharedImagesEligible: number;
  privateGenerationsEligible: number;
  protectedByAdminLikes: number;
  totalStorageEstimate: string;
}

export async function getCleanupStats(): Promise<CleanupStats> {
  const now = new Date();
  const sharedCutoff = new Date(now.getTime() - RETENTION_DAYS.SHARED_IMAGES * 24 * 60 * 60 * 1000);
  const privateCutoff = new Date(now.getTime() - RETENTION_DAYS.PRIVATE_GENERATIONS * 24 * 60 * 60 * 1000);

  const adminUsers = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
  const adminUserIds = adminUsers.map(u => u.id);

  const eligibleSharedImages = await db
    .select({ id: sharedImages.id })
    .from(sharedImages)
    .where(lt(sharedImages.createdAt, sharedCutoff));

  let protectedByAdminLikes = 0;
  if (adminUserIds.length > 0 && eligibleSharedImages.length > 0) {
    const eligibleIds = eligibleSharedImages.map(img => img.id);
    const adminLikedImages = await db
      .select({ sharedImageId: userSharedImageLikes.sharedImageId })
      .from(userSharedImageLikes)
      .where(
        and(
          inArray(userSharedImageLikes.sharedImageId, eligibleIds),
          inArray(userSharedImageLikes.userId, adminUserIds)
        )
      );
    const adminLikedIds = new Set(adminLikedImages.map(l => l.sharedImageId));
    protectedByAdminLikes = adminLikedIds.size;
  }

  const eligiblePrivateGenerations = await db
    .select({ id: generations.id })
    .from(generations)
    .leftJoin(sharedImages, eq(generations.id, sharedImages.generationId))
    .where(
      and(
        lt(generations.createdAt, privateCutoff),
        isNull(sharedImages.id)
      )
    );

  const sharedImagesEligible = Math.max(0, eligibleSharedImages.length - protectedByAdminLikes);
  
  return {
    sharedImagesEligible,
    privateGenerationsEligible: eligiblePrivateGenerations.length,
    protectedByAdminLikes,
    totalStorageEstimate: `~${Math.round((sharedImagesEligible + eligiblePrivateGenerations.length) * 0.5)}MB`,
  };
}

export async function runImageCleanup(dryRun: boolean = true): Promise<CleanupResult> {
  const result: CleanupResult = {
    sharedImagesDeleted: 0,
    privateGenerationsDeleted: 0,
    storageFilesDeleted: 0,
    externalUrlsSkipped: 0,
    errors: [],
    protectedByAdmin: 0,
    dryRun,
    note: "External URLs (CivitAI/Diffus CDN) are temporary and expire automatically. Only Replit Object Storage files are actively deleted.",
  };

  const now = new Date();
  const sharedCutoff = new Date(now.getTime() - RETENTION_DAYS.SHARED_IMAGES * 24 * 60 * 60 * 1000);
  const privateCutoff = new Date(now.getTime() - RETENTION_DAYS.PRIVATE_GENERATIONS * 24 * 60 * 60 * 1000);

  logger.info(`🧹 Starting image cleanup (dryRun: ${dryRun})`);
  logger.info(`📅 Shared images cutoff: ${sharedCutoff.toISOString()} (${RETENTION_DAYS.SHARED_IMAGES} days)`);
  logger.info(`📅 Private generations cutoff: ${privateCutoff.toISOString()} (${RETENTION_DAYS.PRIVATE_GENERATIONS} days)`);

  try {
    const adminUsers = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
    const adminUserIds = adminUsers.map(u => u.id);
    logger.info(`👑 Found ${adminUserIds.length} admin users`);

    const eligibleSharedImages = await db
      .select({
        id: sharedImages.id,
        imageUrl: sharedImages.imageUrl,
        createdAt: sharedImages.createdAt,
      })
      .from(sharedImages)
      .where(lt(sharedImages.createdAt, sharedCutoff));

    logger.info(`📸 Found ${eligibleSharedImages.length} shared images older than ${RETENTION_DAYS.SHARED_IMAGES} days`);

    let sharedImagesToDelete = eligibleSharedImages;
    if (adminUserIds.length > 0 && eligibleSharedImages.length > 0) {
      const eligibleIds = eligibleSharedImages.map(img => img.id);
      const adminLikedImages = await db
        .select({ sharedImageId: userSharedImageLikes.sharedImageId })
        .from(userSharedImageLikes)
        .where(
          and(
            inArray(userSharedImageLikes.sharedImageId, eligibleIds),
            inArray(userSharedImageLikes.userId, adminUserIds)
          )
        );

      const adminLikedIds = new Set(adminLikedImages.map(l => l.sharedImageId));
      result.protectedByAdmin = adminLikedIds.size;
      logger.info(`🛡️ ${adminLikedIds.size} images protected by admin likes`);

      sharedImagesToDelete = eligibleSharedImages.filter(img => !adminLikedIds.has(img.id));
    }

    logger.info(`🗑️ ${sharedImagesToDelete.length} shared images eligible for deletion`);

    for (const image of sharedImagesToDelete) {
      try {
        if (!dryRun) {
          await db.delete(userSharedImageLikes).where(eq(userSharedImageLikes.sharedImageId, image.id));
          await db.delete(sharedImages).where(eq(sharedImages.id, image.id));

          if (image.imageUrl) {
            const deleteResult = await deleteStorageFile(image.imageUrl);
            if (deleteResult.deleted) result.storageFilesDeleted++;
            if (deleteResult.skipped) result.externalUrlsSkipped++;
          }
        }
        result.sharedImagesDeleted++;
      } catch (error) {
        result.errors.push(`Failed to delete shared image ${image.id}: ${(error as Error).message}`);
      }
    }

    const eligiblePrivateGenerations = await db
      .select({
        id: generations.id,
        imageUrl: generations.imageUrl,
        blobKey: generations.blobKey,
        createdAt: generations.createdAt,
      })
      .from(generations)
      .leftJoin(sharedImages, eq(generations.id, sharedImages.generationId))
      .where(
        and(
          lt(generations.createdAt, privateCutoff),
          isNull(sharedImages.id)
        )
      );

    logger.info(`🖼️ Found ${eligiblePrivateGenerations.length} private generations older than ${RETENTION_DAYS.PRIVATE_GENERATIONS} days`);

    for (const gen of eligiblePrivateGenerations) {
      try {
        if (!dryRun) {
          await db.delete(generations).where(eq(generations.id, gen.id));

          if (gen.imageUrl) {
            const deleteResult = await deleteStorageFile(gen.imageUrl);
            if (deleteResult.deleted) result.storageFilesDeleted++;
            if (deleteResult.skipped) result.externalUrlsSkipped++;
          }
          if (gen.blobKey && gen.blobKey !== gen.imageUrl) {
            const deleteResult = await deleteStorageFile(gen.blobKey);
            if (deleteResult.deleted) result.storageFilesDeleted++;
            if (deleteResult.skipped) result.externalUrlsSkipped++;
          }
        }
        result.privateGenerationsDeleted++;
      } catch (error) {
        result.errors.push(`Failed to delete generation ${gen.id}: ${(error as Error).message}`);
      }
    }

    logger.info(`✅ Cleanup complete: ${result.sharedImagesDeleted} shared images, ${result.privateGenerationsDeleted} private generations`);
    if (result.errors.length > 0) {
      logger.info(`⚠️ ${result.errors.length} errors occurred during cleanup`);
    }

  } catch (error) {
    result.errors.push(`Cleanup failed: ${(error as Error).message}`);
    logger.error('❌ Cleanup failed:', error);
  }

  return result;
}

interface DeleteResult {
  deleted: boolean;
  skipped: boolean;
}

async function deleteStorageFile(fileUrl: string): Promise<DeleteResult> {
  try {
    if (fileUrl.startsWith('/')) {
      const { bucketName, objectName } = parseObjectPath(fileUrl);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        logger.info(`🗑️ Deleted Replit Object Storage file: ${fileUrl}`);
        return { deleted: true, skipped: false };
      }
      return { deleted: false, skipped: false };
    }
    
    if (fileUrl.startsWith('https://')) {
      return { deleted: false, skipped: true };
    }
    
    return { deleted: false, skipped: false };
  } catch (error) {
    logger.error(`❌ Failed to delete storage file ${fileUrl}:`, error);
    return { deleted: false, skipped: false };
  }
}

export const RETENTION_POLICY = {
  sharedImagesDays: RETENTION_DAYS.SHARED_IMAGES,
  privateGenerationsDays: RETENTION_DAYS.PRIVATE_GENERATIONS,
  description: `Images shared to the community are retained for ${RETENTION_DAYS.SHARED_IMAGES} days (1 year). Private generations not shared to the community are retained for ${RETENTION_DAYS.PRIVATE_GENERATIONS} days.`,
};
