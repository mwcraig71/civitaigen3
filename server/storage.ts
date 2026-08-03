import { type User, type InsertUser, type UpsertUser, type Model, type InsertModel, type Generation, type InsertGeneration, type Favorite, type InsertFavorite, type Character, type InsertCharacter, type CharacterPreset, type InsertCharacterPreset, type QualityGroup, type InsertQualityGroup, type SceneData, type InsertSceneData, type SavedScene, type InsertSavedScene, type SavedPrompt, type InsertSavedPrompt, type SharedImage, type InsertSharedImage, type ModelLike, type SignupPromotion, type InsertSignupPromotion, type UserSignupBonus, type InsertUserSignupBonus, type ContentReport, type InsertContentReport, type ModerationAction, type InsertModerationAction, type CreditPackage, type InsertCreditPackage, type CreditTransaction, type InsertCreditTransaction, type PlatformSetting, type InsertPlatformSetting, type UserFeedback, type InsertUserFeedback, type Notification, type BannedEmail, type InsertBannedEmail, type UserSharedImageLike, type InsertUserSharedImageLike, type ErrorLog, type InsertErrorLog, type Event, type InsertEvent, type EventStep, type InsertEventStep, type FavoritePromptWord, type InsertFavoritePromptWord, type UserPreferences, type InsertUserPreferences, type SystemSettings, type InsertSystemSettings, type EnhancedImage, type InsertEnhancedImage, type TrackingSession, type InsertTrackingSession, type TrackingEvent, type InsertTrackingEvent, type SanitizationRule, type InsertSanitizationRule, type ApiKey, type InsertApiKey, type SourceUpload } from "@shared/schema";
import { logger } from "./logger";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { db } from "./db";
import { eq, desc, and, ilike, sql, ne, or, gte, lt, like, count, sum, isNull, isNotNull, inArray } from "drizzle-orm";
import { users, models, generations, favorites, characters, characterPresets, qualityGroups, sceneData, savedScenes, savedPrompts, sharedImages, modelLikes, signupPromotions, userSignupBonuses, contentReports, moderationActions, creditPackages, creditTransactions, platformSettings, userFeedback, notifications, bannedEmails, userSharedImageLikes, errorLogs, events, eventSteps, favoritePromptWords, userPreferences, systemSettings, enhancedImages, trackingSessions, trackingEvents, sanitizationRules, apiKeys, sourceUploads } from "@shared/schema";
import { objectStorageClient, parseObjectPath } from "./objectStorage";
import { evaluateClaim, effectiveStreak, rewardForStreak, generateReferralCode, REFERRAL_REWARD_REFERRER, REFERRAL_REWARD_INVITEE, REFERRAL_REDEEM_WINDOW_MS } from "./rewards";
import { encryptApiKey, decryptApiKey, isLegacyCiphertext } from "./crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { id?: string; displayName?: string | null }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserCredits(userId: string, credits: number): Promise<void>;
  updateUserPlatformGenerations(userId: string, count: number): Promise<void>;
  deductUserCredits(userId: string, amount: number): Promise<void>;
  incrementUserUpscaleCount(userId: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getPaginatedUsers(limit: number, offset: number): Promise<User[]>;
  updateUser(userId: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(userId: string): Promise<void>;
  banEmail(email: string, reason: string, bannedBy: string): Promise<void>;
  checkBannedEmail(email: string): Promise<boolean>;
  addBuzzToUser(userId: string, amount: number): Promise<void>;
  claimDailyReward(userId: string): Promise<{ claimed: boolean; reward?: number; streak: number; alreadyClaimed?: boolean }>;
  getDailyRewardStatus(userId: string): Promise<{ canClaim: boolean; streak: number; nextReward: number }>;
  getOrCreateReferralCode(userId: string): Promise<{ code: string; referralCount: number }>;
  redeemReferralCode(userId: string, code: string): Promise<{ ok: boolean; error?: string; reward?: number }>;
  applyMonthlyFreeCredits(userId: string): Promise<boolean>;
  airdropBuzzToAllUsers(amount: number, reason?: string): Promise<{ usersAffected: number; totalBuzzDistributed: number }>;
  
  // Efficient counting methods for admin stats
  getUserCount(): Promise<number>;
  getGenerationCount(): Promise<number>;
  getModelCount(): Promise<number>;
  getActiveUserCount(days: number): Promise<number>;
  getTotalCreditsConsumed(): Promise<number>;
  getTotalUpscales(): Promise<number>;
  
  // Efficient admin generations pagination
  getPaginatedCompletedGenerations(limit: number, offset: number, usernameFilter?: string, userId?: string): Promise<(Generation & { user?: User })[]>;
  getCompletedGenerationCount(usernameFilter?: string, userId?: string): Promise<number>;

  // Models
  getModel(id: string): Promise<Model | undefined>;
  getModelById(id: string): Promise<Model | undefined>;
  getModelByCivitaiId(civitaiId: string): Promise<Model | undefined>;
  getAllModels(): Promise<Model[]>;
  getPopularModels(): Promise<Model[]>;
  createModel(model: InsertModel): Promise<Model>;
  updateModel(id: string, updates: Partial<InsertModel>): Promise<Model | undefined>;

  // Generations
  getGeneration(id: string): Promise<Generation | undefined>;
  getGenerationByImageUrl(imageUrl: string): Promise<Generation | undefined>;
  getUserGenerations(userId: string): Promise<Generation[]>;
  getRecentGenerations(limit?: number): Promise<Generation[]>;
  getAllGenerations(): Promise<(Generation & { user?: User })[]>;
  createGeneration(generation: InsertGeneration & { userId: string; batchId?: string | null }): Promise<Generation>;
  updateGeneration(id: string, updates: Partial<Generation>): Promise<Generation | undefined>;
  updateGenerationStatus(id: string, status: string, imageUrl?: string, blobKey?: string): Promise<void>;
  updateGenerationTiming(id: string, queueMs: number, generateMs: number): Promise<void>;
  updateGenerationFileStorage(id: string, imagePath: string, metadataPath: string, originalData: any): Promise<Generation | undefined>;
  deleteGeneration(id: string): Promise<void>;
  deleteGenerationAsAdmin(id: string, reason?: string): Promise<{ generation: Generation; user?: User }>;
  getUnsharedGenerations(userId: string): Promise<Generation[]>;
  bulkDeleteGenerations(generationIds: string[]): Promise<void>;
  
  // Optimized paginated user generations (database-level filtering and pagination)
  getPaginatedUserRecentGenerations(userId: string, limit: number, offset: number, characterFilter?: string): Promise<{ generations: Generation[]; total: number; hasMore: boolean }>;

  // Enhanced Images
  createEnhancedImage(enhancedImage: InsertEnhancedImage & { userId: string }): Promise<EnhancedImage>;
  getEnhancedImage(id: string): Promise<EnhancedImage | undefined>;
  getEnhancedImageByGenerationId(originalGenerationId: string): Promise<EnhancedImage | undefined>;
  getUserEnhancedImages(userId: string): Promise<(EnhancedImage & { generation?: Generation })[]>;
  getPaginatedUserEnhancedImages(userId: string, limit: number, offset: number): Promise<{ enhancements: (EnhancedImage & { generation?: Generation })[]; total: number }>;
  updateEnhancedImage(id: string, updates: Partial<EnhancedImage>): Promise<EnhancedImage | undefined>;
  updateEnhancedImageStatus(id: string, status: string, enhancedImageUrl?: string, storedEnhancedPath?: string): Promise<void>;
  deleteEnhancedImage(id: string): Promise<void>;

  // Favorites
  getUserFavorites(userId: string): Promise<Favorite[]>;
  addFavorite(userId: string, generationId: string): Promise<Favorite>;
  removeFavorite(userId: string, generationId: string): Promise<void>;

  // Model Favorites
  getUserModelFavorites(userId: string): Promise<ModelLike[]>;
  addModelFavorite(userId: string, modelId: string): Promise<ModelLike>;
  removeModelFavorite(userId: string, modelId: string): Promise<void>;
  setupDefaultModelFavorites(): Promise<void>;

  // Characters
  getCharacter(id: string): Promise<Character | undefined>;
  getUserCharacters(userId: string): Promise<Character[]>;
  getPublicCharacters(): Promise<Character[]>;
  createCharacter(character: InsertCharacter & { userId: string | null }): Promise<Character>;
  updateCharacter(id: string, updates: Partial<InsertCharacter>, userId?: string): Promise<Character | undefined>;
  deleteCharacter(id: string, userId: string): Promise<boolean>;
  deleteCharacterAsAdmin(id: string): Promise<boolean>;
  getImagesForCharacter(characterId: string): Promise<Generation[]>;
  updateCharacterFromGeneration(characterId: string, generationId: string, updates: Partial<Character>): Promise<Character | undefined>;
  
  // Character Presets
  createCharacterPreset(preset: InsertCharacterPreset & { createdBy: string }): Promise<CharacterPreset>;
  getCharacterPresets(characterId: string): Promise<CharacterPreset[]>;
  deleteCharacterPreset(id: string): Promise<boolean>;
  setDefaultCharacterPreset(characterId: string, presetId: string): Promise<void>;

  // Quality Groups
  getQualityGroup(id: string): Promise<QualityGroup | undefined>;
  getUserQualityGroups(userId: string): Promise<QualityGroup[]>;
  getPublicQualityGroups(): Promise<QualityGroup[]>;
  createQualityGroup(group: InsertQualityGroup & { userId: string }): Promise<QualityGroup>;
  updateQualityGroup(id: string, updates: Partial<InsertQualityGroup>): Promise<QualityGroup | undefined>;
  deleteQualityGroup(id: string, userId: string): Promise<boolean>;

  // Scene Data
  getSceneDataByCategory(category: string): Promise<SceneData[]>;
  replaceSceneDataForCategory(category: string, items: InsertSceneData[]): Promise<void>;

  // Saved Scenes
  getSavedScene(id: string): Promise<SavedScene | undefined>;
  getUserSavedScenes(userId: string, filters?: {
    locationCategory?: string;
    location?: string;
    outfit?: string;
    pose?: string;
  }): Promise<SavedScene[]>;
  getSharedScenes(): Promise<SavedScene[]>;
  createSavedScene(scene: InsertSavedScene & { userId: string }): Promise<SavedScene>;
  updateSavedScene(id: string, userId: string, updates: Partial<SavedScene>): Promise<SavedScene | null>;
  deleteSavedScene(id: string, userId: string): Promise<boolean>;
  toggleSceneShared(sceneId: string, userId: string, isShared: boolean): Promise<SavedScene | null>;

  // Saved Prompts
  getSavedPrompt(id: string): Promise<SavedPrompt | undefined>;
  getUserSavedPrompts(userId: string): Promise<SavedPrompt[]>;
  createSavedPrompt(prompt: InsertSavedPrompt & { userId: string }): Promise<SavedPrompt>;
  updateSavedPrompt(id: string, updates: Partial<InsertSavedPrompt>, userId: string): Promise<SavedPrompt | undefined>;
  deleteSavedPrompt(id: string, userId: string): Promise<boolean>;

  // Shared Images
  getSharedImages(filters?: {
    search?: string;
    tags?: string[];
    isNSFW?: boolean;
    featured?: boolean;
    character?: string;
    scene?: string;
  }): Promise<(Omit<SharedImage, 'userDisplayName'> & { userDisplayName: string | null; remixCount: number })[]>;
  getSharedImage(id: string): Promise<SharedImage | undefined>;
  createSharedImage(image: InsertSharedImage & { userId: string; id?: string; videoUrl?: string | null; videoThumbnailUrl?: string | null; thumbnailUrl?: string | null }): Promise<SharedImage>;
  updateSharedImage(id: string, updates: Partial<Pick<SharedImage, 'characterName' | 'sceneName' | 'title' | 'rating' | 'videoUrl'>>): Promise<SharedImage | undefined>;
  deleteSharedImage(id: string, userId: string): Promise<boolean>;
  likeSharedImage(imageId: string, userId: string): Promise<boolean>; // Returns true if liked, false if unliked
  incrementSharedImageViews(id: string): Promise<void>;
  incrementSharedImageDownloads(id: string): Promise<void>;
  getSharedImageByGenerationId(generationId: string): Promise<SharedImage | undefined>;
  isImageLikedByUser(imageId: string, userId: string): Promise<boolean>;
  getUserLikedImages(userId: string): Promise<string[]>;
  reportSharedImage(imageId: string, userId: string): Promise<boolean>;
  getReportedImages(): Promise<SharedImage[]>;
  getUserSharedImages(userId: string): Promise<SharedImage[]>;
  getSharedImageLikes(imageId: string): Promise<UserSharedImageLike[]>;

  // Signup promotion operations
  getActiveSignupPromotion(): Promise<SignupPromotion | undefined>;
  getActiveSignupPromotions(): Promise<SignupPromotion[]>;
  calculateNewUserCredits(): Promise<number>;
  getAllSignupPromotions(): Promise<SignupPromotion[]>;
  createSignupPromotion(data: InsertSignupPromotion): Promise<SignupPromotion>;
  updateSignupPromotion(id: string, data: Partial<InsertSignupPromotion>): Promise<SignupPromotion | undefined>;
  deleteSignupPromotion(id: string): Promise<boolean>;
  recordSignupBonus(data: InsertUserSignupBonus): Promise<UserSignupBonus>;
  getUserSignupBonus(userId: string): Promise<UserSignupBonus | undefined>;

  // Content Moderation
  getAllContentReports(): Promise<ContentReport[]>;
  getPendingModerationContent(): Promise<{ generations: Generation[], sharedImages: SharedImage[] }>;
  moderateContent(contentType: string, contentId: string, action: string, moderatorId: string, reason?: string): Promise<any>;
  createContentReport(report: InsertContentReport & { reporterId: string }): Promise<ContentReport>;
  incrementReportCount(contentType: string, contentId: string): Promise<void>;

  // User API Keys
  updateUserApiKey(userId: string, apiKey: string): Promise<User | undefined>;
  getUserApiKey(userId: string): Promise<string | null>;

  // Storage cleanup
  clearAllStoredImagePaths(): Promise<void>;

  // Credit Packages
  getCreditPackages(): Promise<CreditPackage[]>;
  getCreditPackage(id: string): Promise<CreditPackage | undefined>;
  createCreditPackage(creditPackage: InsertCreditPackage): Promise<CreditPackage>;
  updateCreditPackage(id: string, updates: Partial<InsertCreditPackage>): Promise<CreditPackage | undefined>;
  
  // Credit Transactions
  getCreditTransaction(id: string): Promise<CreditTransaction | undefined>;
  getUserCreditTransactions(userId: string): Promise<CreditTransaction[]>;
  createCreditTransaction(transaction: InsertCreditTransaction & { userId: string }): Promise<CreditTransaction>;
  updateCreditTransactionStatus(id: string, status: string): Promise<void>;

  // Platform Settings
  getPlatformSetting(key: string): Promise<PlatformSetting | undefined>;
  getAllPlatformSettings(): Promise<PlatformSetting[]>;
  updatePlatformSetting(key: string, value: string, updatedBy: string, description?: string): Promise<PlatformSetting>;
  deletePlatformSetting(key: string): Promise<boolean>;

  // User Feedback
  createUserFeedback(feedback: InsertUserFeedback & { userId: string }): Promise<UserFeedback>;
  getUserFeedback(userId: string): Promise<UserFeedback[]>;
  getAllFeedback(): Promise<UserFeedback[]>;
  updateFeedbackStatus(id: string, status: string, adminResponse?: string, respondedBy?: string): Promise<UserFeedback | undefined>;
  getFeedback(id: string): Promise<UserFeedback | undefined>;

  // Admin User Management
  lockUser(userId: string, adminId: string, reason: string): Promise<User | undefined>;
  unlockUser(userId: string): Promise<User | undefined>;
  adminDeleteUser(userId: string): Promise<void>;
  getAllUsersForAdmin(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'lastActiveAt' | 'alphabetical' | 'createdAt';
    search?: string;
  }): Promise<{
    users: User[];
    pagination: {
      page: number;
      limit: number;
      totalUsers: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>;
  recordModerationAction(action: {
    userId: string;
    generationId: string;
    action: string;
    reason: string;
    adminId: string;
    timestamp: Date;
  }): Promise<void>;
  getModerationLogs(): Promise<(ModerationAction & { userEmail?: string; moderatorEmail?: string; username?: string })[]>;
  getUserModerationLogs(userId: string): Promise<ModerationAction[]>;
  
  // Notifications
  getUserNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: {
    userId: string;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
    data?: any;
  }): Promise<Notification>;
  markNotificationRead(notificationId: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Error Logging
  logError(errorLog: InsertErrorLog): Promise<ErrorLog>;
  getErrorLogs(limit?: number): Promise<ErrorLog[]>;
  getErrorLogsByType(errorType: string, limit?: number): Promise<ErrorLog[]>;
  getErrorLogsByUser(userId: string, limit?: number): Promise<ErrorLog[]>;
  getUnresolvedErrors(limit?: number): Promise<ErrorLog[]>;
  markErrorResolved(errorId: string, resolvedBy: string, notes?: string): Promise<ErrorLog | undefined>;
  deleteOldErrorLogs(daysOld: number): Promise<number>; // Clean up old logs

  // Events
  getUserEvents(userId: string): Promise<Event[]>;
  createEvent(event: InsertEvent & { userId: string }): Promise<Event>;
  deleteEvent(id: string, userId: string): Promise<boolean>;
  
  // User preferences for analytics
  saveUserPreferences(userId: string, preferences: { breastSize: number; assSize: number }): Promise<UserPreferences>;
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  getUserPreferencesAnalytics(): Promise<{ breastSize: { size: number; count: number }[]; assSize: { size: number; count: number }[] }>;
  copyEvent(eventId: string, userId: string): Promise<Event | null>;

  // Event Steps
  getEventSteps(eventId: string, userId: string): Promise<EventStep[]>;
  createEventStep(step: InsertEventStep): Promise<EventStep>;
  updateEventStep(id: string, updates: Partial<InsertEventStep>, userId: string): Promise<EventStep | undefined>;
  deleteEventStep(id: string, userId: string): Promise<boolean>;
  reorderEventSteps(eventId: string, stepIds: string[], userId: string): Promise<boolean>;

  // Favorite Words
  getFavoriteWords(userId: string): Promise<FavoritePromptWord[]>;
  createFavoriteWord(word: InsertFavoritePromptWord & { userId: string }): Promise<FavoritePromptWord>;
  deleteFavoriteWord(id: string, userId: string): Promise<boolean>;
  saveEventWordsToFavorites(eventId: string, userId: string): Promise<{addedWords: number, skippedWords: number} | null>;
  
  // System Settings
  getSystemSetting(key: string): Promise<SystemSettings | undefined>;
  getAllSystemSettings(): Promise<SystemSettings[]>;
  updateSystemSetting(key: string, value: string, updatedBy: string, description?: string): Promise<SystemSettings>;
  getMaintenanceMode(): Promise<boolean>;
  setMaintenanceMode(enabled: boolean, updatedBy: string): Promise<SystemSettings>;

  // User Tracking
  startUserTracking(trackedUserId: string, trackerAdminId: string): Promise<TrackingSession>;
  stopUserTracking(trackedUserId: string): Promise<TrackingSession | undefined>;
  getActiveTrackingSession(trackedUserId: string): Promise<TrackingSession | undefined>;
  addTrackingEvent(sessionId: string, page: string, action: string, details?: any): Promise<TrackingEvent>;
  getTrackingSessionWithEvents(sessionId: string): Promise<{ session: TrackingSession; events: TrackingEvent[] } | undefined>;

  // Sanitization Rules
  getSanitizationRules(ruleType?: string): Promise<SanitizationRule[]>;
  getEnabledSanitizationRules(ruleType?: string): Promise<SanitizationRule[]>;
  getSanitizationRule(id: string): Promise<SanitizationRule | undefined>;
  createSanitizationRule(rule: InsertSanitizationRule): Promise<SanitizationRule>;
  updateSanitizationRule(id: string, updates: Partial<InsertSanitizationRule>): Promise<SanitizationRule | undefined>;
  deleteSanitizationRule(id: string): Promise<boolean>;
  seedDefaultSanitizationRules(): Promise<void>;

  // API Keys for external access
  createApiKey(userId: string, name: string, keyHash: string, keyPrefix: string, dailyLimit?: number): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getUserApiKeys(userId: string): Promise<ApiKey[]>;
  deactivateApiKey(id: string, userId: string): Promise<boolean>;
  incrementApiKeyUsage(id: string): Promise<void>;
  resetApiKeyDailyUsage(id: string): Promise<void>;
  checkApiKeyRateLimit(id: string): Promise<{ allowed: boolean; usage: number; limit: number }>;

  // Source Uploads — img2img / img2vid source images retained for 5 days
  createSourceUpload(data: { userId: string; objectPath: string; generationType: string }): Promise<SourceUpload>;
  linkSourceUploadToGeneration(id: string, generationId: string): Promise<void>;
  getSourceUploadsPaginated(limit: number, offset: number): Promise<{ uploads: (SourceUpload & { user?: User })[]; total: number }>;
  getExpiredSourceUploads(): Promise<SourceUpload[]>;
  deleteSourceUpload(id: string): Promise<void>;
  getSourceUpload(id: string): Promise<SourceUpload | undefined>;
}

// NOTE: The old in-memory MemStorage implementation (unused — `storage` is
// always DatabaseStorage) was removed. Recover it from git history if needed.

export class DatabaseStorage implements IStorage {
  useDatabase: boolean = true;

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser & { id?: string; displayName?: string | null }): Promise<User> {
    // Check if signups are blocked
    const signupSetting = await this.getPlatformSetting("signups_blocked");
    if (signupSetting?.value === "true") {
      throw new Error("New user signups are currently disabled");
    }
    
    // Get active signup promotion to determine credits
    const activePromotion = await this.getActiveSignupPromotion();
    const buzzCredits = activePromotion ? activePromotion.buzzAmount : 300; // Fallback to 300
    
    const userData = { ...insertUser, buzzCredits };
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    
    // Record the signup bonus if we have an active promotion
    if (activePromotion) {
      await this.recordSignupBonus({
        userId: user.id,
        promotionId: activePromotion.id,
        buzzAwarded: activePromotion.buzzAmount,
      });
    }
    
    // Add default LoRA favorites for new user
    const defaultLoRAs = [

      'bea0353c-c6e5-4a1f-a5de-c1622b1747c3', // Dramatic Lighting Slider
      '952c9c51-6a7e-4323-bab8-4fcd2cc44869', // Upshorts shot
      '021e1fe2-b257-4b83-8d03-872a9f4d24cc', // Real Beauty
    ];
    
    for (const loraId of defaultLoRAs) {
      try {
        await this.addModelFavorite(user.id, loraId);
      } catch (error) {
        // Don't fail user creation if favorites fail to be added
        logger.warn(`Failed to add default favorite ${loraId} for new user ${user.id}:`, error);
      }
    }
    
    return user;
  }

  async updateUserCredits(userId: string, credits: number): Promise<void> {
    await db
      .update(users)
      .set({ buzzCredits: credits })
      .where(eq(users.id, userId));
  }

  async updateUserPlatformGenerations(userId: string, count: number): Promise<void> {
    await db
      .update(users)
      .set({ platformGenerations: count })
      .where(eq(users.id, userId));
  }

  async deductUserCredits(userId: string, amount: number): Promise<void> {
    // Ensure credits don't go negative
    await db
      .update(users)
      .set({ buzzCredits: sql`GREATEST(0, ${users.buzzCredits} - ${amount})` })
      .where(eq(users.id, userId));
  }

  async incrementUserUpscaleCount(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ upscaleCount: sql`${users.upscaleCount} + 1` })
      .where(eq(users.id, userId));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getPaginatedUsers(limit: number, offset: number): Promise<User[]> {
    // Always put mwcraig71 first, then order by admin status, then by creation date
    return await db
      .select()
      .from(users)
      .orderBy(
        sql`CASE WHEN ${users.username} = 'mwcraig71' THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${users.isAdmin} = true THEN 0 ELSE 1 END`,
        desc(users.createdAt)
      )
      .limit(limit)
      .offset(offset);
  }

  // Efficient counting methods for admin stats - DatabaseStorage Implementation
  async getUserCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users);
    return result.count;
  }

  async getGenerationCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(generations);
    return result.count;
  }

  async getModelCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(models);
    return result.count;
  }

  async getActiveUserCount(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const [result] = await db
      .select({ count: count() })
      .from(users)
      .where(
        or(
          gte(users.lastActiveAt, cutoffDate),
          and(isNull(users.lastActiveAt), gte(users.createdAt, cutoffDate))
        )
      );
    return result.count;
  }

  async getTotalCreditsConsumed(): Promise<number> {
    const [result] = await db
      .select({ total: sum(generations.cost) })
      .from(generations);
    return Number(result.total) || 0;
  }

  async getTotalUpscales(): Promise<number> {
    const [result] = await db
      .select({ total: sum(users.upscaleCount) })
      .from(users);
    return Number(result.total) || 0;
  }

  // Efficient admin generations pagination - DatabaseStorage Implementation
  async getPaginatedCompletedGenerations(limit: number, offset: number, usernameFilter?: string, userId?: string): Promise<(Generation & { user?: User })[]> {
    const baseConditions = and(
      eq(generations.status, 'completed'),
      sql`${generations.imageUrl} IS NOT NULL`
    );

    let query = db
      .select({
        generation: generations,
        user: users
      })
      .from(generations)
      .leftJoin(users, eq(generations.userId, users.id))
      .$dynamic();

    // Add userId filter if provided (takes precedence)
    if (userId && userId.trim().length > 0) {
      query = query.where(and(
        baseConditions,
        eq(generations.userId, userId)
      ));
    } else if (usernameFilter && usernameFilter.trim().length > 0) {
      // Add username filter if provided and not empty
      query = query.where(and(
        baseConditions,
        or(
          sql`LOWER(${users.username}) LIKE ${`%${usernameFilter.toLowerCase()}%`}`,
          sql`LOWER(${users.displayName}) LIKE ${`%${usernameFilter.toLowerCase()}%`}`,
          sql`LOWER(${users.email}) LIKE ${`%${usernameFilter.toLowerCase()}%`}`
        )
      ));
    } else {
      // No filter - just use base conditions
      query = query.where(baseConditions);
    }

    const results = await query
      .orderBy(desc(generations.createdAt))
      .limit(limit)
      .offset(offset);
    
    return results.map(row => ({
      ...row.generation,
      user: row.user || undefined
    }));
  }

  async getCompletedGenerationCount(usernameFilter?: string, userId?: string): Promise<number> {
    const baseConditions = and(
      eq(generations.status, 'completed'),
      sql`${generations.imageUrl} IS NOT NULL`
    );

    let query = db
      .select({ count: count() })
      .from(generations)
      .leftJoin(users, eq(generations.userId, users.id))
      .$dynamic();

    // Add userId filter if provided (takes precedence)
    if (userId && userId.trim().length > 0) {
      query = query.where(and(
        baseConditions,
        eq(generations.userId, userId)
      ));
    } else if (usernameFilter && usernameFilter.trim().length > 0) {
      // Add username filter if provided and not empty
      query = query.where(and(
        baseConditions,
        or(
          sql`LOWER(${users.username}) LIKE ${`%${usernameFilter.toLowerCase()}%`}`,
          sql`LOWER(${users.displayName}) LIKE ${`%${usernameFilter.toLowerCase()}%`}`,
          sql`LOWER(${users.email}) LIKE ${`%${usernameFilter.toLowerCase()}%`}`
        )
      ));
    } else {
      // No filter - just use base conditions
      query = query.where(baseConditions);
    }

    const [result] = await query;
    return result.count;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return updatedUser || undefined;
  }

  async deleteUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Get user email before deletion for banned list
      const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
      
      if (!user?.email) {
        throw new Error('User email not found - cannot proceed with deletion');
      }
      
      // Delete all user-related data in correct order (foreign key constraints)
      
      // Delete user's notifications first (referenced by foreign key)
      await tx.delete(notifications).where(eq(notifications.userId, userId));
      
      // Delete user feedback that references this user
      await tx.delete(userFeedback).where(eq(userFeedback.userId, userId));
      
      // Delete user's favorites
      await tx.delete(favorites).where(eq(favorites.userId, userId));
      
      // Delete user's model favorites
      await tx.delete(modelLikes).where(eq(modelLikes.userId, userId));
      
      // Get all shared images from this user
      const userSharedImages = await tx.select({ id: sharedImages.id }).from(sharedImages).where(eq(sharedImages.userId, userId));
      
      // Delete all likes on those shared images first
      if (userSharedImages.length > 0) {
        const sharedImageIds = userSharedImages.map(si => si.id);
        await tx.delete(userSharedImageLikes).where(inArray(userSharedImageLikes.sharedImageId, sharedImageIds));
      }
      
      // Also delete any likes this user made on other images
      await tx.delete(userSharedImageLikes).where(eq(userSharedImageLikes.userId, userId));
      
      // Delete user's shared images (they reference generations)
      await tx.delete(sharedImages).where(eq(sharedImages.userId, userId));
      
      // Get user's generations to delete favorites on them
      const userGenerations = await tx.select({ id: generations.id }).from(generations).where(eq(generations.userId, userId));
      
      // Delete favorites on user's generations (other users may have favorited them)
      if (userGenerations.length > 0) {
        const generationIds = userGenerations.map(g => g.id);
        await tx.delete(favorites).where(inArray(favorites.generationId, generationIds));
      }
      
      // Delete ALL generations that reference the user's characters (not just user's own generations)
      const userCharacters = await tx.select({ id: characters.id }).from(characters).where(eq(characters.userId, userId));
      for (const char of userCharacters) {
        // First delete favorites on those generations
        const charGenerations = await tx.select({ id: generations.id }).from(generations).where(eq(generations.characterId, char.id));
        if (charGenerations.length > 0) {
          const charGenIds = charGenerations.map(g => g.id);
          await tx.delete(favorites).where(inArray(favorites.generationId, charGenIds));
        }
        await tx.delete(generations).where(eq(generations.characterId, char.id));
      }
      
      // Now delete user's own generations 
      await tx.delete(generations).where(eq(generations.userId, userId));
      
      // Finally delete user's characters (after all generations referencing them are gone)
      await tx.delete(characters).where(eq(characters.userId, userId));
      
      // Delete user's quality groups
      await tx.delete(qualityGroups).where(eq(qualityGroups.userId, userId));
      
      // Delete user's saved scenes
      await tx.delete(savedScenes).where(eq(savedScenes.userId, userId));
      
      // Delete user's saved prompts
      await tx.delete(savedPrompts).where(eq(savedPrompts.userId, userId));
      
      // Delete user's credit transactions
      await tx.delete(creditTransactions).where(eq(creditTransactions.userId, userId));
      
      // Delete user's signup bonuses
      await tx.delete(userSignupBonuses).where(eq(userSignupBonuses.userId, userId));
      
      // Delete moderation actions that reference this user (as subject or moderator)
      await tx.delete(moderationActions).where(eq(moderationActions.userId, userId));
      await tx.delete(moderationActions).where(eq(moderationActions.moderatorId, userId));
      
      // Delete content reports where user is the reporter
      await tx.delete(contentReports).where(eq(contentReports.reporterId, userId));
      
      // Finally delete the user
      await tx.delete(users).where(eq(users.id, userId));
      
      // Add email to banned list to prevent re-signup
      await tx.insert(bannedEmails).values({
        email: user.email,
        reason: 'User account deleted by admin',
        bannedBy: null, // Will be set by the admin endpoint
        bannedAt: new Date()
      }).onConflictDoNothing(); // Don't fail if email already banned
    });
  }
  
  async banEmail(email: string, reason: string, bannedBy: string): Promise<void> {
    await db.insert(bannedEmails).values({
      email,
      reason,
      bannedBy,
      bannedAt: new Date()
    }).onConflictDoUpdate({
      target: bannedEmails.email,
      set: {
        reason,
        bannedBy,
        bannedAt: new Date()
      }
    });
  }
  
  async checkBannedEmail(email: string): Promise<boolean> {
    const banned = await db.select().from(bannedEmails).where(eq(bannedEmails.email, email)).limit(1);
    return banned.length > 0;
  }

  async addBuzzToUser(userId: string, amount: number): Promise<void> {
    await db
      .update(users)
      .set({ 
        buzzCredits: sql`${users.buzzCredits} + ${amount}` 
      })
      .where(eq(users.id, userId));
  }

  // ---- Daily reward / streak system ----

  async claimDailyReward(userId: string): Promise<{ claimed: boolean; reward?: number; streak: number; alreadyClaimed?: boolean }> {
    const [user] = await db
      .select({ lastDailyClaimAt: users.lastDailyClaimAt, dailyStreak: users.dailyStreak })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) return { claimed: false, streak: 0 };

    const evaluation = evaluateClaim(user.lastDailyClaimAt, user.dailyStreak || 0);
    if (!evaluation.canClaim) {
      return { claimed: false, alreadyClaimed: true, streak: evaluation.nextStreak };
    }

    const now = new Date();
    // Guarded update: only claims if lastDailyClaimAt hasn't moved to today's
    // UTC day since we read it (prevents double-claim from parallel requests).
    const todayStart = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000);
    const result = await db
      .update(users)
      .set({
        buzzCredits: sql`${users.buzzCredits} + ${evaluation.reward}`,
        lastDailyClaimAt: now,
        dailyStreak: evaluation.nextStreak,
      })
      .where(
        and(
          eq(users.id, userId),
          or(isNull(users.lastDailyClaimAt), lt(users.lastDailyClaimAt, todayStart))
        )
      )
      .returning({ id: users.id });
    if (result.length === 0) {
      return { claimed: false, alreadyClaimed: true, streak: evaluation.nextStreak };
    }

    await this.createCreditTransaction({
      userId,
      type: 'bonus',
      amount: evaluation.reward,
      status: 'completed',
      description: `Daily reward (day ${evaluation.nextStreak} streak)`,
    } as any);

    return { claimed: true, reward: evaluation.reward, streak: evaluation.nextStreak };
  }

  async getDailyRewardStatus(userId: string): Promise<{ canClaim: boolean; streak: number; nextReward: number }> {
    const [user] = await db
      .select({ lastDailyClaimAt: users.lastDailyClaimAt, dailyStreak: users.dailyStreak })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) return { canClaim: false, streak: 0, nextReward: rewardForStreak(1) };
    const evaluation = evaluateClaim(user.lastDailyClaimAt, user.dailyStreak || 0);
    return {
      canClaim: evaluation.canClaim,
      streak: effectiveStreak(user.lastDailyClaimAt, user.dailyStreak || 0),
      nextReward: evaluation.canClaim ? evaluation.reward : rewardForStreak((user.dailyStreak || 0) + 1),
    };
  }

  // ---- Referral program ----

  async getOrCreateReferralCode(userId: string): Promise<{ code: string; referralCount: number }> {
    const [user] = await db
      .select({ referralCode: users.referralCode, referralCount: users.referralCount })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.referralCode) {
      return { code: user.referralCode, referralCount: user.referralCount || 0 };
    }
    // Retry on the (unlikely) unique-collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode();
      try {
        await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
        return { code, referralCount: user?.referralCount || 0 };
      } catch {
        continue;
      }
    }
    throw new Error('Failed to generate referral code');
  }

  async redeemReferralCode(userId: string, code: string): Promise<{ ok: boolean; error?: string; reward?: number }> {
    const [me] = await db
      .select({ id: users.id, referredBy: users.referredBy, createdAt: users.createdAt, referralCode: users.referralCode })
      .from(users)
      .where(eq(users.id, userId));
    if (!me) return { ok: false, error: 'User not found' };
    if (me.referredBy) return { ok: false, error: 'You have already used a referral code' };
    if (me.createdAt && Date.now() - new Date(me.createdAt).getTime() > REFERRAL_REDEEM_WINDOW_MS) {
      return { ok: false, error: 'Referral codes can only be redeemed within 7 days of signing up' };
    }

    const normalized = code.trim().toUpperCase();
    if (me.referralCode === normalized) return { ok: false, error: "You can't use your own code" };

    const [referrer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.referralCode, normalized));
    if (!referrer) return { ok: false, error: 'Invalid referral code' };
    if (referrer.id === userId) return { ok: false, error: "You can't use your own code" };

    // Guarded: only set referredBy if still null (prevents double-redeem races).
    const updated = await db
      .update(users)
      .set({
        referredBy: referrer.id,
        buzzCredits: sql`${users.buzzCredits} + ${REFERRAL_REWARD_INVITEE}`,
      })
      .where(and(eq(users.id, userId), isNull(users.referredBy)))
      .returning({ id: users.id });
    if (updated.length === 0) return { ok: false, error: 'You have already used a referral code' };

    await db
      .update(users)
      .set({
        buzzCredits: sql`${users.buzzCredits} + ${REFERRAL_REWARD_REFERRER}`,
        referralCount: sql`${users.referralCount} + 1`,
      })
      .where(eq(users.id, referrer.id));

    await this.createCreditTransaction({
      userId,
      type: 'bonus',
      amount: REFERRAL_REWARD_INVITEE,
      status: 'completed',
      description: 'Referral bonus (invited)',
    } as any);
    await this.createCreditTransaction({
      userId: referrer.id,
      type: 'bonus',
      amount: REFERRAL_REWARD_REFERRER,
      status: 'completed',
      description: 'Referral bonus (referrer)',
    } as any);

    return { ok: true, reward: REFERRAL_REWARD_INVITEE };
  }

  async applyMonthlyFreeCredits(userId: string): Promise<boolean> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .update(users)
      .set({
        buzzCredits: 500,
        freeCreditsLastGivenAt: new Date(),
      })
      .where(
        and(
          eq(users.id, userId),
          sql`${users.buzzCredits} < 500`,
          or(
            isNull(users.freeCreditsLastGivenAt),
            sql`${users.freeCreditsLastGivenAt} < ${thirtyDaysAgo}`
          )
        )
      )
      .returning({ id: users.id });
    return result.length > 0;
  }

  async airdropBuzzToAllUsers(amount: number, reason?: string): Promise<{ usersAffected: number; totalBuzzDistributed: number }> {
    // Get count of users before update
    const userCountResult = await db.select({ count: sql`count(*)`.as('count') }).from(users);
    const usersAffected = Number(userCountResult[0]?.count || 0);

    // Update all users' buzz credits in a single query
    await db
      .update(users)
      .set({ 
        buzzCredits: sql`${users.buzzCredits} + ${amount}` 
      });

    const totalBuzzDistributed = usersAffected * amount;

    logger.info(`🎁 Airdrop complete: ${amount} buzz to ${usersAffected} users (${totalBuzzDistributed} total buzz)${reason ? ` - Reason: ${reason}` : ''}`);
    
    return { usersAffected, totalBuzzDistributed };
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if email is banned before allowing signup
    if (userData.email && await this.checkBannedEmail(userData.email)) {
      throw new Error('This email address is not allowed to register');
    }

    if (!userData.id) {
      throw new Error('User id is required for upsert');
    }

    // Check if user already exists
    const existingUser = await this.getUser(userData.id);
    const isNewUser = !existingUser;
    
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email || '',
        username: userData.email?.split('@')[0] || 'user',
        displayName: userData.firstName && userData.lastName ? `${userData.firstName} ${userData.lastName}` : null,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        buzzCredits: 300, // Default signup bonus
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email || sql`excluded.email`,
          firstName: userData.firstName || sql`excluded.first_name`,
          lastName: userData.lastName || sql`excluded.last_name`,
          profileImageUrl: userData.profileImageUrl || sql`excluded.profile_image_url`,
          lastActiveAt: new Date(),
        },
      })
      .returning();
      
    // Add default favorite model for new users
    if (isNewUser) {
      const cyberRealisticPonyModelId = '3c4e0676-03d8-41d0-9eb8-953d8662b098';
      try {
        await db.insert(modelLikes).values({
          userId: user.id,
          modelId: cyberRealisticPonyModelId,
        });
        logger.info(`🎉 New user onboarded: ${user.username || user.email} with CyberRealistic Pony as default favorite`);
      } catch (error) {
        // Ignore if already exists (shouldn't happen for new users, but safety check)
        logger.info(`Default favorite model already exists for user ${user.id}`);
      }

      // Create default college dorm scenes for new users
      try {
        await this.createDefaultDataForUser(user.id);
        logger.info(`✨ Created default college dorm scenes for new user: ${user.username || user.email}`);
      } catch (error) {
        logger.error(`Failed to create default data for user ${user.id}:`, error);
      }
    }
    
    return user;
  }

  // Models - Database Implementation
  async getModel(id: string): Promise<Model | undefined> {
    const [model] = await db.select().from(models).where(eq(models.id, id));
    return model || undefined;
  }

  async getModelById(id: string): Promise<Model | undefined> {
    const [model] = await db.select().from(models).where(eq(models.id, id));
    return model || undefined;
  }

  async getModelByCivitaiId(civitaiId: string): Promise<Model | undefined> {
    const [model] = await db.select().from(models).where(eq(models.civitaiId, civitaiId));
    return model || undefined;
  }

  async getAllModels(): Promise<Model[]> {
    return await db.select().from(models);
  }

  async getPopularModels(): Promise<Model[]> {
    return await db.select().from(models).limit(10);
  }

  async createModel(model: InsertModel): Promise<Model> {
    const [newModel] = await db
      .insert(models)
      .values({
        ...model,
        id: randomUUID(),
        createdAt: new Date(),
      })
      .returning();
    return newModel;
  }

  async updateModel(id: string, updates: Partial<InsertModel>): Promise<Model | undefined> {
    const [updated] = await db
      .update(models)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(models.id, id))
      .returning();
    return updated || undefined;
  }

  // Generations - Database Implementation
  async getGeneration(id: string): Promise<Generation | undefined> {
    const [generation] = await db.select().from(generations).where(eq(generations.id, id));
    return generation || undefined;
  }

  async getGenerationByImageUrl(imageUrl: string): Promise<Generation | undefined> {
    const [generation] = await db.select().from(generations).where(eq(generations.imageUrl, imageUrl));
    return generation || undefined;
  }

  async getUserGenerations(userId: string): Promise<Generation[]> {
    return await db
      .select()
      .from(generations)
      .where(eq(generations.userId, userId))
      .orderBy(desc(generations.createdAt));
  }

  async getRecentGenerations(limit = 10): Promise<Generation[]> {
    return await db
      .select()
      .from(generations)
      .limit(limit)
      .orderBy(desc(generations.createdAt));
  }

  async getAllGenerations(): Promise<(Generation & { user?: User })[]> {
    const allGenerations = await db.select().from(generations).orderBy(desc(generations.createdAt));
    
    // Fetch user data for each generation
    const generationsWithUsers = await Promise.all(
      allGenerations.map(async (gen) => {
        let user = undefined;
        if (gen.userId) {
          try {
            user = await this.getUser(gen.userId);
          } catch (error) {
            logger.error(`Failed to fetch user ${gen.userId}:`, error);
          }
        }
        return { ...gen, user };
      })
    );
    
    return generationsWithUsers;
  }

  async createGeneration(generation: InsertGeneration & { userId: string; batchId?: string | null }): Promise<Generation> {
    const [newGeneration] = await db
      .insert(generations)
      .values({
        ...generation,
        id: randomUUID(),
        createdAt: new Date(),
        imageUrl: null,
        status: "pending",
        jobId: null,
        blobKey: null,
        metadata: null,
        storedImagePath: null,
        storedMetadataPath: null,
        originalGenerationData: null,
        completedAt: null,
        cost: 5,
      })
      .returning();
    return newGeneration;
  }

  async updateGeneration(id: string, updates: Partial<Generation>): Promise<Generation | undefined> {
    const [updated] = await db
      .update(generations)
      .set(updates)
      .where(eq(generations.id, id))
      .returning();
    return updated || undefined;
  }

  async updateGenerationStatus(id: string, status: string, imageUrl?: string, blobKey?: string): Promise<void> {
    const updateData: any = { status };
    if (imageUrl) updateData.imageUrl = imageUrl;
    if (blobKey) updateData.blobKey = blobKey;
    if (status === "completed") updateData.completedAt = new Date();
    
    await db
      .update(generations)
      .set(updateData)
      .where(eq(generations.id, id));
  }

  async updateGenerationTiming(id: string, queueMs: number, generateMs: number): Promise<void> {
    await db
      .update(generations)
      .set({ queueMs, generateMs })
      .where(eq(generations.id, id));
  }

  async updateGenerationFileStorage(id: string, imagePath: string, metadataPath: string, originalData: any): Promise<Generation | undefined> {
    const [updated] = await db
      .update(generations)
      .set({
        storedImagePath: imagePath,
        storedMetadataPath: metadataPath,
        originalGenerationData: originalData
      })
      .where(eq(generations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteGeneration(id: string): Promise<void> {
    // First delete any favorites for this generation
    await db.delete(favorites).where(eq(favorites.generationId, id));
    
    // Get all shared images for this generation
    const relatedSharedImages = await db.select({ id: sharedImages.id })
      .from(sharedImages)
      .where(eq(sharedImages.generationId, id));
    
    // Delete likes on those shared images first (to avoid FK constraint violation)
    if (relatedSharedImages.length > 0) {
      const sharedImageIds = relatedSharedImages.map(si => si.id);
      await db.delete(userSharedImageLikes).where(inArray(userSharedImageLikes.sharedImageId, sharedImageIds));
    }
    
    // Then delete the shared images
    await db.delete(sharedImages).where(eq(sharedImages.generationId, id));
    
    // Then delete the generation itself
    await db.delete(generations).where(eq(generations.id, id));
  }

  async getUnsharedGenerations(userId: string): Promise<Generation[]> {
    // LEFT JOIN to find generations that are NOT in the sharedImages table
    const result = await db
      .select({ gen: generations })
      .from(generations)
      .leftJoin(sharedImages, eq(generations.id, sharedImages.generationId))
      .where(
        and(
          eq(generations.userId, userId),
          eq(generations.status, 'completed'), // Only completed generations
          isNull(sharedImages.id) // No matching shared image record
        )
      )
      .orderBy(desc(generations.createdAt));

    return result.map((row) => row.gen);
  }

  async bulkDeleteGenerations(generationIds: string[]): Promise<void> {
    if (generationIds.length === 0) return;
    
    logger.info(`🗑️ Starting bulk deletion of ${generationIds.length} generations`);
    
    // Use smaller batch size for very large operations to prevent timeouts
    const batchSize = generationIds.length > 1000 ? 10 : 25;
    let deletedCount = 0;
    
    try {
      for (let i = 0; i < generationIds.length; i += batchSize) {
        const batch = generationIds.slice(i, i + batchSize);
        
        logger.info(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(generationIds.length/batchSize)} (${batch.length} items)`);
        
        // First delete any favorites that reference these generations
        await db.delete(favorites).where(
          inArray(favorites.generationId, batch)
        );
        
        // Get shared images for this batch to delete their likes first
        const relatedSharedImages = await db.select({ id: sharedImages.id })
          .from(sharedImages)
          .where(inArray(sharedImages.generationId, batch));
        
        // Delete likes on those shared images (to avoid FK constraint violation)
        if (relatedSharedImages.length > 0) {
          const sharedImageIds = relatedSharedImages.map(si => si.id);
          await db.delete(userSharedImageLikes).where(inArray(userSharedImageLikes.sharedImageId, sharedImageIds));
        }
        
        // Then delete any shared images that reference these generations
        await db.delete(sharedImages).where(
          inArray(sharedImages.generationId, batch)
        );
        
        // Finally delete the generations themselves
        await db.delete(generations).where(
          inArray(generations.id, batch)
        );
        
        deletedCount += batch.length;
        logger.info(`✅ Batch complete. Total deleted: ${deletedCount}/${generationIds.length}`);
        
        // Add a small delay between batches for very large operations to prevent overwhelming the database
        if (generationIds.length > 500 && i + batchSize < generationIds.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      logger.info(`🎉 Bulk deletion completed successfully. Deleted ${deletedCount} generations.`);
    } catch (error) {
      logger.error(`❌ Bulk deletion failed at batch starting at index ${Math.floor(deletedCount/batchSize) * batchSize}:`, error);
      throw error;
    }
  }

  async getPaginatedUserRecentGenerations(userId: string, limit: number, offset: number, characterFilter?: string): Promise<{ generations: Generation[]; total: number; hasMore: boolean }> {
    const startTime = Date.now();
    
    // Build base conditions
    const baseConditions = and(
      eq(generations.userId, userId),
      eq(generations.status, 'completed'),
      sql`${generations.imageUrl} IS NOT NULL`
    );
    
    // Add character filter if provided
    const whereClause = characterFilter
      ? and(baseConditions, eq(generations.characterName, characterFilter))
      : baseConditions;
    
    // Use COALESCE to fall back to createdAt if completedAt is null
    // This is an optimized database-level query with filtering, ordering, and pagination
    const result = await db
      .select()
      .from(generations)
      .where(whereClause)
      .orderBy(sql`COALESCE(${generations.completedAt}, ${generations.createdAt}) DESC`)
      .limit(limit)
      .offset(offset);
    
    // Get total count for pagination info
    const countResult = await db
      .select({ count: count() })
      .from(generations)
      .where(whereClause);
    
    const total = countResult[0]?.count ?? 0;
    const hasMore = offset + limit < total;
    
    logger.info(`⚡ getPaginatedUserRecentGenerations completed in ${Date.now() - startTime}ms (${result.length} results, ${total} total, character: ${characterFilter || 'none'})`);
    
    return { generations: result, total, hasMore };
  }

  async deleteGenerationAsAdmin(id: string, adminId: string, reason?: string): Promise<{ generation: Generation; user?: User }> {
    // Get the generation and user data first
    const [generation] = await db.select().from(generations).where(eq(generations.id, id));
    if (!generation) {
      throw new Error('Generation not found');
    }
    
    let user = undefined;
    if (generation.userId) {
      try {
        user = await this.getUser(generation.userId);
      } catch (error) {
        logger.error(`Failed to fetch user ${generation.userId}:`, error);
      }
    }
    
    // First delete any favorites that reference this generation
    await db.delete(favorites).where(eq(favorites.generationId, id));
    
    // Delete any shared images that reference this generation
    await db.delete(sharedImages).where(eq(sharedImages.generationId, id));
    
    // Delete any enhanced images that reference this generation
    await db.delete(enhancedImages).where(eq(enhancedImages.originalGenerationId, id));
    
    // Delete the generation
    await db.delete(generations).where(eq(generations.id, id));
    
    // Record the deletion reason if provided
    if (reason && generation.userId) {
      await this.recordModerationAction({
        userId: generation.userId,
        generationId: id,
        action: 'deleted',
        reason,
        adminId: adminId, // Use the authenticated admin's user ID
        timestamp: new Date()
      });
      
      // Create notification for user about content removal
      await this.createNotification({
        userId: generation.userId,
        type: 'moderation',
        title: 'Content Removed',
        message: `Your generated image has been removed for Terms of Service violation: ${reason}`,
        data: {
          generationId: id,
          reason: reason,
          action: 'deleted',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    return { generation, user };
  }

  // Enhanced Images - Database Implementation
  async createEnhancedImage(enhancedImage: InsertEnhancedImage & { userId: string }): Promise<EnhancedImage> {
    const [newEnhancedImage] = await db
      .insert(enhancedImages)
      .values({
        ...enhancedImage,
        id: randomUUID(),
        status: "pending",
        createdAt: new Date(),
        completedAt: null,
        enhancedImageUrl: null,
        storedEnhancedPath: null,
        replicateJobId: null,
        errorMessage: null,
        processingTime: null,
        cost: 0,
      })
      .returning();
    return newEnhancedImage;
  }

  async getEnhancedImage(id: string): Promise<EnhancedImage | undefined> {
    const [result] = await db.select().from(enhancedImages)
      .where(eq(enhancedImages.id, id))
      .limit(1);
    return result || undefined;
  }

  async getEnhancedImageByGenerationId(originalGenerationId: string): Promise<EnhancedImage | undefined> {
    const [result] = await db.select().from(enhancedImages)
      .where(eq(enhancedImages.originalGenerationId, originalGenerationId))
      .orderBy(desc(enhancedImages.createdAt))
      .limit(1);
    return result || undefined;
  }

  async getUserEnhancedImages(userId: string): Promise<(EnhancedImage & { generation?: Generation })[]> {
    const result = await db.select({
      enhanced: enhancedImages,
      generation: generations,
    })
      .from(enhancedImages)
      .leftJoin(generations, eq(enhancedImages.originalGenerationId, generations.id))
      .where(eq(enhancedImages.userId, userId))
      .orderBy(desc(enhancedImages.createdAt));
    
    return result.map(row => ({
      ...row.enhanced,
      generation: row.generation || undefined,
    }));
  }

  async getPaginatedUserEnhancedImages(userId: string, limit: number, offset: number): Promise<{ enhancements: (EnhancedImage & { generation?: Generation })[]; total: number }> {
    // Get total count
    const countResult = await db.select({ count: sql<number>`cast(count(*) as integer)` })
      .from(enhancedImages)
      .where(eq(enhancedImages.userId, userId));
    const total = countResult[0]?.count || 0;

    // Get paginated results
    const result = await db.select({
      enhanced: enhancedImages,
      generation: generations,
    })
      .from(enhancedImages)
      .leftJoin(generations, eq(enhancedImages.originalGenerationId, generations.id))
      .where(eq(enhancedImages.userId, userId))
      .orderBy(desc(enhancedImages.createdAt))
      .limit(limit)
      .offset(offset);
    
    const enhancements = result.map(row => ({
      ...row.enhanced,
      generation: row.generation || undefined,
    }));

    return { enhancements, total };
  }

  async updateEnhancedImage(id: string, updates: Partial<EnhancedImage>): Promise<EnhancedImage | undefined> {
    const [result] = await db.update(enhancedImages)
      .set(updates)
      .where(eq(enhancedImages.id, id))
      .returning();
    return result || undefined;
  }

  async updateEnhancedImageStatus(id: string, status: string, enhancedImageUrl?: string, storedEnhancedPath?: string): Promise<void> {
    const updates: any = { status };
    if (enhancedImageUrl) updates.enhancedImageUrl = enhancedImageUrl;
    if (storedEnhancedPath) updates.storedEnhancedPath = storedEnhancedPath;
    if (status === 'completed') updates.completedAt = new Date();

    await db.update(enhancedImages)
      .set(updates)
      .where(eq(enhancedImages.id, id));
  }

  async deleteEnhancedImage(id: string): Promise<void> {
    try {
      // Get the enhanced image to find its storage path
      const enhanced = await this.getEnhancedImage(id);
      
      if (enhanced?.storedEnhancedPath) {
        // Delete the file from object storage
        try {
          const { bucketName, objectName } = parseObjectPath(enhanced.storedEnhancedPath);
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          
          const [exists] = await file.exists();
          if (exists) {
            await file.delete();
            logger.info(`🗑️ Deleted enhanced image from storage: ${enhanced.storedEnhancedPath}`);
          }
        } catch (storageError) {
          logger.error('Error deleting enhanced image from storage:', storageError);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Delete from database
      await db.delete(enhancedImages)
        .where(eq(enhancedImages.id, id));
      
      logger.info(`✅ Enhanced image deleted from database: ${id}`);
    } catch (error) {
      logger.error('Error deleting enhanced image:', error);
      throw error;
    }
  }

  // Favorites (using database storage)
  async getUserFavorites(userId: string): Promise<Favorite[]> {
    const result = await db.select().from(favorites)
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));
    return result;
  }

  async addFavorite(userId: string, generationId: string): Promise<Favorite> {
    const id = randomUUID();
    const favorite: Favorite = {
      id,
      userId,
      generationId,
      createdAt: new Date(),
    };
    
    await db.insert(favorites).values(favorite);
    return favorite;
  }

  async removeFavorite(userId: string, generationId: string): Promise<void> {
    await db.delete(favorites)
      .where(and(
        eq(favorites.userId, userId),
        eq(favorites.generationId, generationId)
      ));
  }

  // Model Favorites (using database storage)
  async getUserModelFavorites(userId: string): Promise<ModelLike[]> {
    const result = await db.select().from(modelLikes)
      .where(eq(modelLikes.userId, userId))
      .orderBy(desc(modelLikes.createdAt));
    return result;
  }

  async addModelFavorite(userId: string, modelId: string): Promise<ModelLike> {
    const id = randomUUID();
    const modelLike: ModelLike = {
      id,
      userId,
      modelId,
      createdAt: new Date(),
    };
    
    await db.insert(modelLikes).values(modelLike);
    return modelLike;
  }

  async removeModelFavorite(userId: string, modelId: string): Promise<void> {
    await db.delete(modelLikes)
      .where(and(
        eq(modelLikes.userId, userId),
        eq(modelLikes.modelId, modelId)
      ));
  }

  async setupDefaultModelFavorites(): Promise<void> {
    // Default LoRAs to be favorited for all users
    const defaultLoRAs = [

      'bea0353c-c6e5-4a1f-a5de-c1622b1747c3', // Dramatic Lighting Slider
      '952c9c51-6a7e-4323-bab8-4fcd2cc44869', // Upshorts shot
      '021e1fe2-b257-4b83-8d03-872a9f4d24cc', // Real Beauty
    ];

    // Get all users
    const allUsers = await this.getAllUsers();
    
    for (const user of allUsers) {
      for (const loraId of defaultLoRAs) {
        // Check if user already has this LoRA favorited
        const existing = await db.select().from(modelLikes)
          .where(and(
            eq(modelLikes.userId, user.id),
            eq(modelLikes.modelId, loraId)
          ));
        
        // Only add if not already favorited
        if (existing.length === 0) {
          await this.addModelFavorite(user.id, loraId);
        }
      }
    }
  }

  // NOTE: duplicate character CRUD block removed — the canonical
  // implementations live further down in this class (last definition wins).

  // Quality Groups - Database Implementation
  async getQualityGroup(id: string): Promise<QualityGroup | undefined> {
    const [group] = await db.select().from(qualityGroups).where(eq(qualityGroups.id, id));
    return group || undefined;
  }

  async getUserQualityGroups(userId: string): Promise<QualityGroup[]> {
    return await db
      .select()
      .from(qualityGroups)
      .where(eq(qualityGroups.userId, userId))
      .orderBy(qualityGroups.createdAt);
  }

  async getPublicQualityGroups(): Promise<QualityGroup[]> {
    return await db
      .select()
      .from(qualityGroups)
      .where(eq(qualityGroups.isPublic, true))
      .orderBy(qualityGroups.createdAt);
  }

  async createQualityGroup(data: InsertQualityGroup & { userId: string }): Promise<QualityGroup> {
    const insertData = {
      id: randomUUID(),
      userId: data.userId,
      name: data.name,
      description: data.description || null,
      words: data.words,
      isPublic: data.isPublic || false,
      createdAt: new Date(),
    };
    
    const [group] = await db
      .insert(qualityGroups)
      .values(insertData)
      .returning();
    return group;
  }

  async updateQualityGroup(id: string, updates: Partial<InsertQualityGroup>): Promise<QualityGroup | undefined> {
    const [group] = await db
      .update(qualityGroups)
      .set(updates)
      .where(eq(qualityGroups.id, id))
      .returning();
    return group || undefined;
  }

  async deleteQualityGroup(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(qualityGroups)
      .where(eq(qualityGroups.id, id))
      .returning();
    return result.length > 0;
  }

  // Scene Data - Database Implementation
  async getSceneDataByCategory(category: string): Promise<SceneData[]> {
    return await db
      .select()
      .from(sceneData)
      .where(eq(sceneData.category, category))
      .orderBy(sceneData.subcategory, sceneData.name);
  }

  async replaceSceneDataForCategory(category: string, items: InsertSceneData[]): Promise<void> {
    // Use transaction to ensure atomic operation
    await db.transaction(async (tx) => {
      // Delete existing items for this category
      await tx.delete(sceneData).where(eq(sceneData.category, category));
      
      // Insert new items
      if (items.length > 0) {
        const dataToInsert = items.map(item => ({
          ...item,
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        await tx.insert(sceneData).values(dataToInsert);
      }
    });
  }

  // Saved Scenes - Database Implementation
  async getSavedScene(id: string): Promise<SavedScene | undefined> {
    const [scene] = await db.select().from(savedScenes).where(eq(savedScenes.id, id));
    return scene || undefined;
  }

  async getUserSavedScenes(userId: string, filters?: {
    locationCategory?: string;
    location?: string;
    outfit?: string;
    pose?: string;
  }): Promise<SavedScene[]> {
    let query = db.select().from(savedScenes).where(eq(savedScenes.userId, userId));

    if (filters) {
      const conditions = [eq(savedScenes.userId, userId)];
      
      if (filters.locationCategory) {
        conditions.push(eq(savedScenes.locationCategory, filters.locationCategory));
      }
      if (filters.location) {
        conditions.push(ilike(savedScenes.location, `%${filters.location}%`));
      }
      if (filters.outfit) {
        conditions.push(ilike(savedScenes.outfit, `%${filters.outfit}%`));
      }
      if (filters.pose) {
        conditions.push(ilike(savedScenes.pose, `%${filters.pose}%`));
      }

      query = db.select().from(savedScenes).where(and(...conditions));
    }

    return await query.orderBy(desc(savedScenes.createdAt));
  }

  async createSavedScene(data: InsertSavedScene & { userId: string }): Promise<SavedScene> {
    const insertData = {
      id: randomUUID(),
      userId: data.userId,
      title: data.title,
      prompt: data.prompt,
      description: data.description || null,
      locationCategory: data.locationCategory || null,
      location: data.location || null,
      outfitCategory: data.outfitCategory || null,
      outfit: data.outfit || null,
      poseCategory: data.poseCategory || null,
      pose: data.pose || null,
      imageUrl: data.imageUrl || null,
      tags: data.tags || null,
      isFavorite: data.isFavorite || false,
      isShared: data.isShared || false,
      sceneData: data.sceneData || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const [scene] = await db
      .insert(savedScenes)
      .values(insertData)
      .returning();
    return scene;
  }

  async updateSavedScene(id: string, userId: string, updates: Partial<SavedScene>): Promise<SavedScene | null> {
    const [scene] = await db
      .update(savedScenes)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(savedScenes.id, id), eq(savedScenes.userId, userId)))
      .returning();
    return scene || null;
  }

  async deleteSavedScene(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(savedScenes)
      .where(and(eq(savedScenes.id, id), eq(savedScenes.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getSharedScenes(): Promise<SavedScene[]> {
    return await db
      .select()
      .from(savedScenes)
      .where(eq(savedScenes.isShared, true))
      .orderBy(desc(savedScenes.createdAt));
  }

  async toggleSceneShared(sceneId: string, userId: string, isShared: boolean): Promise<SavedScene | null> {
    const [scene] = await db
      .update(savedScenes)
      .set({ isShared, updatedAt: new Date() })
      .where(and(eq(savedScenes.id, sceneId), eq(savedScenes.userId, userId)))
      .returning();
    return scene || null;
  }

  // Saved Prompts (DatabaseStorage)
  async getSavedPrompt(id: string): Promise<SavedPrompt | undefined> {
    const [prompt] = await db.select().from(savedPrompts).where(eq(savedPrompts.id, id));
    return prompt || undefined;
  }

  async getUserSavedPrompts(userId: string): Promise<SavedPrompt[]> {
    return await db
      .select()
      .from(savedPrompts)
      .where(eq(savedPrompts.userId, userId))
      .orderBy(desc(savedPrompts.createdAt));
  }

  async createSavedPrompt(promptData: InsertSavedPrompt & { userId: string }): Promise<SavedPrompt> {
    const [prompt] = await db.insert(savedPrompts).values(promptData).returning();
    return prompt;
  }

  async updateSavedPrompt(id: string, updates: Partial<InsertSavedPrompt>, userId: string): Promise<SavedPrompt | undefined> {
    const [prompt] = await db
      .update(savedPrompts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(savedPrompts.id, id), eq(savedPrompts.userId, userId)))
      .returning();
    return prompt || undefined;
  }

  async deleteSavedPrompt(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(savedPrompts)
      .where(and(eq(savedPrompts.id, id), eq(savedPrompts.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // Shared Images (DatabaseStorage)
  async getSharedImages(filters?: {
    search?: string;
    tags?: string[];
    isNSFW?: boolean;
    featured?: boolean;
    character?: string;
    scene?: string;
  }): Promise<(Omit<SharedImage, 'userDisplayName'> & { userDisplayName: string | null; remixCount: number })[]> {
    // Build conditions array
    const conditions = [ne(sharedImages.moderationStatus, "flagged")];
    
    if (filters?.search) {
      conditions.push(ilike(sharedImages.prompt, `%${filters.search}%`));
    }
    
    if (filters?.isNSFW !== undefined) {
      conditions.push(eq(sharedImages.isNSFW, filters.isNSFW));
    }
    
    if (filters?.featured) {
      conditions.push(eq(sharedImages.featured, filters.featured));
    }

    if (filters?.character) {
      conditions.push(eq(sharedImages.characterName, filters.character));
    }

    if (filters?.scene) {
      conditions.push(eq(sharedImages.sceneName, filters.scene));
    }
    
    // Join with users table to get display name
    const results = await db
      .select({
        id: sharedImages.id,
        userId: sharedImages.userId,
        userDisplayName: users.displayName,
        generationId: sharedImages.generationId,
        title: sharedImages.title,
        prompt: sharedImages.prompt,
        negativePrompt: sharedImages.negativePrompt,
        modelUsed: sharedImages.modelUsed,
        modelId: sharedImages.modelId,
        imageUrl: sharedImages.imageUrl,
        tags: sharedImages.tags,
        isNSFW: sharedImages.isNSFW,
        likes: sharedImages.likes,
        downloads: sharedImages.downloads,
        views: sharedImages.views,
        featured: sharedImages.featured,
        rating: sharedImages.rating,
        characterName: sharedImages.characterName,
        sceneName: sharedImages.sceneName,
        width: sharedImages.width,
        height: sharedImages.height,
        steps: sharedImages.steps,
        cfgScale: sharedImages.cfgScale,
        scheduler: sharedImages.scheduler,
        clipSkip: sharedImages.clipSkip,
        loras: sharedImages.loras,
        seed: sharedImages.seed,
        moderationStatus: sharedImages.moderationStatus,
        moderatedBy: sharedImages.moderatedBy,
        moderatedAt: sharedImages.moderatedAt,
        moderationReason: sharedImages.moderationReason,
        reportCount: sharedImages.reportCount,
        storedImagePath: sharedImages.storedImagePath,
        thumbnailUrl: sharedImages.thumbnailUrl,
        videoUrl: sharedImages.videoUrl,
        videoThumbnailUrl: sharedImages.videoThumbnailUrl,
        createdAt: sharedImages.createdAt,
        remixCount: sql<number>`(select count(*)::int from ${generations} where ${generations.sourceSharedImageId} = ${sharedImages.id})`.as('remix_count'),
      })
      .from(sharedImages)
      .leftJoin(users, eq(sharedImages.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(sharedImages.createdAt));
    
    return results;
  }

  async getSharedImage(id: string): Promise<SharedImage | undefined> {
    const [image] = await db.select().from(sharedImages).where(eq(sharedImages.id, id));
    return image || undefined;
  }

  async createSharedImage(imageData: InsertSharedImage & { userId: string; id?: string; videoUrl?: string | null; videoThumbnailUrl?: string | null; thumbnailUrl?: string | null }): Promise<SharedImage> {
    // Check for existing shared image with same generationId to prevent duplicates
    if (imageData.generationId) {
      const existing = await db
        .select()
        .from(sharedImages)
        .where(eq(sharedImages.generationId, imageData.generationId))
        .limit(1);
      
      if (existing.length > 0) {
        logger.info(`⚠️ Shared image already exists for generation ${imageData.generationId}, returning existing`);
        return existing[0];
      }
    }
    
    const [image] = await db.insert(sharedImages).values(imageData).returning();
    return image;
  }

  async updateSharedImage(id: string, updates: Partial<Pick<SharedImage, 'characterName' | 'sceneName' | 'title' | 'rating' | 'videoUrl'>>): Promise<SharedImage | undefined> {
    const [updatedImage] = await db
      .update(sharedImages)
      .set(updates)
      .where(eq(sharedImages.id, id))
      .returning();
    return updatedImage || undefined;
  }

  async deleteSharedImage(id: string, userId: string): Promise<boolean> {
    // First get the image to find file paths
    const [image] = await db
      .select()
      .from(sharedImages)
      .where(and(eq(sharedImages.id, id), eq(sharedImages.userId, userId)))
      .limit(1);
    
    if (!image) return false;
    
    // Delete from database
    const result = await db
      .delete(sharedImages)
      .where(and(eq(sharedImages.id, id), eq(sharedImages.userId, userId)))
      .returning();
    
    if (result.length > 0) {
      // Delete files from object storage (both main image and thumbnail)
      const pathsToDelete: string[] = [];
      
      // Check if imageUrl is a local storage path
      if (image.imageUrl?.startsWith('/api/storage/')) {
        const storagePath = image.imageUrl.replace('/api/storage/', '/');
        pathsToDelete.push(storagePath);
      }
      
      // Add thumbnail path if exists
      if (image.thumbnailUrl?.startsWith('/api/storage/')) {
        const thumbPath = image.thumbnailUrl.replace('/api/storage/', '/');
        pathsToDelete.push(thumbPath);
      }
      
      // Delete files asynchronously (don't block the response)
      for (const path of pathsToDelete) {
        try {
          const parsed = parseObjectPath(path);
          if (parsed) {
            const bucket = objectStorageClient.bucket(parsed.bucketName);
            const file = bucket.file(parsed.objectName);
            const [exists] = await file.exists();
            if (exists) {
              await file.delete();
              logger.info(`🗑️ Deleted storage file: ${path}`);
            }
          }
        } catch (error) {
          logger.error(`⚠️ Failed to delete storage file ${path}:`, error);
        }
      }
    }
    
    return result.length > 0;
  }

  async reportSharedImage(imageId: string, userId: string): Promise<boolean> {
    // Mark image as flagged for admin review instead of deleting
    const result = await db
      .update(sharedImages)
      .set({
        moderationStatus: "flagged",
        reportCount: sql`${sharedImages.reportCount} + 1`,
        moderatedAt: new Date(),
        moderationReason: "User reported inappropriate content"
      })
      .where(eq(sharedImages.id, imageId))
      .returning();
    return result.length > 0;
  }

  async getReportedImages(): Promise<SharedImage[]> {
    return await db
      .select()
      .from(sharedImages)
      .where(eq(sharedImages.moderationStatus, "flagged"))
      .orderBy(desc(sharedImages.moderatedAt));
  }

  async getUserSharedImages(userId: string): Promise<SharedImage[]> {
    return await db
      .select()
      .from(sharedImages)
      .where(eq(sharedImages.userId, userId));
  }

  async getSharedImageLikes(imageId: string): Promise<UserSharedImageLike[]> {
    return await db
      .select()
      .from(userSharedImageLikes)
      .where(eq(userSharedImageLikes.sharedImageId, imageId));
  }

  async approveReportedImage(imageId: string): Promise<void> {
    await db
      .update(sharedImages)
      .set({ 
        moderationStatus: "approved",
        reportCount: 0,
        moderationReason: null,
        moderatedAt: new Date()
      })
      .where(eq(sharedImages.id, imageId));
  }

  async deleteReportedImage(imageId: string): Promise<void> {
    // First delete all likes associated with this image to avoid foreign key constraint violation
    await db
      .delete(userSharedImageLikes)
      .where(eq(userSharedImageLikes.sharedImageId, imageId));
    
    // Then delete the shared image
    await db
      .delete(sharedImages)
      .where(eq(sharedImages.id, imageId));
  }

  async likeSharedImage(imageId: string, userId: string): Promise<boolean> {
    // Check if user already liked this image
    const [existingLike] = await db
      .select()
      .from(userSharedImageLikes)
      .where(and(eq(userSharedImageLikes.sharedImageId, imageId), eq(userSharedImageLikes.userId, userId)));
    
    if (existingLike) {
      // Unlike: remove the like record and decrement count
      await db.delete(userSharedImageLikes).where(eq(userSharedImageLikes.id, existingLike.id));
      await db
        .update(sharedImages)
        .set({ likes: sql`GREATEST(${sharedImages.likes} - 1, 0)` })
        .where(eq(sharedImages.id, imageId));
      return false; // Image is now unliked
    } else {
      // Like: add the like record and increment count
      await db.insert(userSharedImageLikes).values({
        userId,
        sharedImageId: imageId,
      });
      await db
        .update(sharedImages)
        .set({ likes: sql`${sharedImages.likes} + 1` })
        .where(eq(sharedImages.id, imageId));
      return true; // Image is now liked
    }
  }

  async isImageLikedByUser(imageId: string, userId: string): Promise<boolean> {
    const [like] = await db
      .select()
      .from(userSharedImageLikes)
      .where(and(eq(userSharedImageLikes.sharedImageId, imageId), eq(userSharedImageLikes.userId, userId)));
    return !!like;
  }

  async getUserLikedImages(userId: string): Promise<string[]> {
    const likes = await db
      .select({ sharedImageId: userSharedImageLikes.sharedImageId })
      .from(userSharedImageLikes)
      .where(eq(userSharedImageLikes.userId, userId));
    return likes.map(like => like.sharedImageId);
  }

  async incrementSharedImageViews(id: string): Promise<void> {
    await db
      .update(sharedImages)
      .set({ views: sql`${sharedImages.views} + 1` })
      .where(eq(sharedImages.id, id));
  }

  async incrementSharedImageDownloads(id: string): Promise<void> {
    await db
      .update(sharedImages)
      .set({ downloads: sql`${sharedImages.downloads} + 1` })
      .where(eq(sharedImages.id, id));
  }

  async getSharedImageByGenerationId(generationId: string): Promise<SharedImage | undefined> {
    const [image] = await db.select().from(sharedImages).where(eq(sharedImages.generationId, generationId));
    return image || undefined;
  }

  // Signup Promotions - DatabaseStorage Implementation
  async getActiveSignupPromotion(): Promise<SignupPromotion | undefined> {
    const promotions = await this.getActiveSignupPromotions();
    return promotions.length > 0 ? promotions[0] : undefined;
  }

  async getActiveSignupPromotions(): Promise<SignupPromotion[]> {
    const now = new Date();
    return await db.select()
      .from(signupPromotions)
      .where(
        and(
          eq(signupPromotions.isActive, true),
          sql`${signupPromotions.startDate} <= ${now}`,
          sql`(${signupPromotions.endDate} IS NULL OR ${signupPromotions.endDate} >= ${now})`,
          sql`(${signupPromotions.maxUses} IS NULL OR ${signupPromotions.currentUses} < ${signupPromotions.maxUses})`
        )
      )
      .orderBy(signupPromotions.createdAt);
  }

  async calculateNewUserCredits(): Promise<number> {
    const activePromotions = await this.getActiveSignupPromotions();
    const totalPromotionCredits = activePromotions.reduce((total, promo) => total + promo.buzzAmount, 0);
    return totalPromotionCredits > 0 ? totalPromotionCredits : 300; // Fallback to 300
  }

  async getAllSignupPromotions(): Promise<SignupPromotion[]> {
    return await db.select().from(signupPromotions).orderBy(desc(signupPromotions.createdAt));
  }

  async createSignupPromotion(data: InsertSignupPromotion): Promise<SignupPromotion> {
    const [promo] = await db.insert(signupPromotions).values(data).returning();
    return promo;
  }

  async updateSignupPromotion(id: string, data: Partial<InsertSignupPromotion>): Promise<SignupPromotion | undefined> {
    const [updated] = await db
      .update(signupPromotions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(signupPromotions.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSignupPromotion(id: string): Promise<boolean> {
    const result = await db.delete(signupPromotions).where(eq(signupPromotions.id, id)).returning();
    return result.length > 0;
  }

  async recordSignupBonus(data: InsertUserSignupBonus): Promise<UserSignupBonus> {
    const [bonus] = await db.insert(userSignupBonuses).values(data).returning();
    
    // Increment the promotion usage count
    await db
      .update(signupPromotions)
      .set({ 
        currentUses: sql`${signupPromotions.currentUses} + 1`,
        updatedAt: new Date()
      })
      .where(eq(signupPromotions.id, data.promotionId));
    
    return bonus;
  }

  async getUserSignupBonus(userId: string): Promise<UserSignupBonus | undefined> {
    const [bonus] = await db.select().from(userSignupBonuses).where(eq(userSignupBonuses.userId, userId));
    return bonus || undefined;
  }

  constructor() {
    this.seedData();
  }

  private async seedData() {
    // Note: Demo user has been removed
    // Seed public characters only if none exist
    const existingCharacters = await this.getPublicCharacters();
    if (existingCharacters.length === 0) {
      await this.createCharacter({
        userId: null,
        name: "Mystical Elf",
        description: "An elegant elven warrior with magical abilities",
        basePrompt: "beautiful elf woman, long silver hair, pointed ears, elegant dress, magical aura, fantasy art style, detailed, high quality",
        negativePrompt: "bad anatomy, ugly, blurry, low quality",
        imageUrl: null,
        tags: ["fantasy", "elf", "magic"],
        isPublic: true,
        baseModel: "4ceadebe-04c3-4ea6-8209-2d456eef0326", // CyberRealistic Pony
        steps: 28,
        cfgScale: 45, // 4.5 * 10
        seed: 123456789,
        age: 25,
        breastSize: 2,
        assSize: 2,
        loras: [
          { id: "af185259-724c-40a7-9a0f-7c94b97ef24f", strength: 0.8 }
        ],
      });

      await this.createCharacter({
        userId: null,
        name: "Cyberpunk Hacker",
        description: "A skilled hacker in a neon-lit cyberpunk world",
        basePrompt: "cyberpunk hacker, neon lights, futuristic cityscape, leather jacket, glowing computer screens, detailed, high quality",
        negativePrompt: "bad anatomy, ugly, blurry, low quality",
        imageUrl: null,
        tags: ["cyberpunk", "futuristic", "hacker"],
        age: 25,
        breastSize: 2,
        assSize: 2,
        isPublic: false,
        baseModel: "85a37bdb-40be-4c72-931f-811a573f8322", // Mistoon_Anime
        steps: 32,
        cfgScale: 70, // 7.0 * 10
        seed: 987654321,
        loras: [
          { id: "295cc7f4-107a-4b63-92e9-1301da467485", strength: 0.6 }
        ],
      });
    }
  }

  // Content Moderation - DatabaseStorage Implementation
  async getAllContentReports(): Promise<ContentReport[]> {
    return await db.select().from(contentReports).orderBy(desc(contentReports.createdAt));
  }

  async getPendingModerationContent(): Promise<{ generations: Generation[], sharedImages: SharedImage[] }> {
    const [pendingGenerations, pendingSharedImages] = await Promise.all([
      db.select().from(generations).where(eq(generations.moderationStatus, "pending")).orderBy(desc(generations.createdAt)),
      db.select().from(sharedImages).where(eq(sharedImages.moderationStatus, "pending")).orderBy(desc(sharedImages.createdAt))
    ]);

    return {
      generations: pendingGenerations,
      sharedImages: pendingSharedImages
    };
  }

  async moderateContent(contentType: string, contentId: string, action: string, moderatorId: string, reason?: string): Promise<any> {
    const now = new Date();
    let result: any;
    let previousStatus: string | null = null;
    
    // Update the content based on type
    if (contentType === "generation") {
      const [existing] = await db.select().from(generations).where(eq(generations.id, contentId));
      previousStatus = existing?.moderationStatus || "pending";
      
      const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "flagged";
      const isHidden = action === "reject" || action === "flag";
      
      [result] = await db
        .update(generations)
        .set({
          moderationStatus: status,
          moderatedBy: moderatorId,
          moderatedAt: now,
          moderationReason: reason,
          isHidden
        })
        .where(eq(generations.id, contentId))
        .returning();
    } else if (contentType === "shared_image") {
      const [existing] = await db.select().from(sharedImages).where(eq(sharedImages.id, contentId));
      previousStatus = existing?.moderationStatus || "pending";
      
      const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "flagged";
      
      [result] = await db
        .update(sharedImages)
        .set({
          moderationStatus: status,
          moderatedBy: moderatorId,
          moderatedAt: now,
          moderationReason: reason
        })
        .where(eq(sharedImages.id, contentId))
        .returning();
    }

    // Log the moderation action
    await db.insert(moderationActions).values({
      id: randomUUID(),
      moderatorId,
      action,
      contentType,
      contentId,
      reason,
      previousStatus,
      newStatus: action === "approve" ? "approved" : action === "reject" ? "rejected" : "flagged",
      createdAt: now
    });

    return result;
  }

  async createContentReport(report: InsertContentReport & { reporterId: string }): Promise<ContentReport> {
    const [newReport] = await db
      .insert(contentReports)
      .values({
        ...report,
        id: randomUUID(),
        createdAt: new Date()
      })
      .returning();
    return newReport;
  }

  async incrementReportCount(contentType: string, contentId: string): Promise<void> {
    if (contentType === "generation") {
      await db
        .update(generations)
        .set({
          reportCount: sql`${generations.reportCount} + 1`
        })
        .where(eq(generations.id, contentId));
    } else if (contentType === "shared_image") {
      await db
        .update(sharedImages)
        .set({
          reportCount: sql`${sharedImages.reportCount} + 1`
        })
        .where(eq(sharedImages.id, contentId));
    }
  }

  // Notifications - DatabaseStorage Implementation
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(notificationData: {
    userId: string;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
    data?: any;
  }): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values({
        ...notificationData,
        id: randomUUID(),
        createdAt: new Date(),
        read: false,
      })
      .returning();
    return newNotification;
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      ));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      ));
    return Number(result[0]?.count || 0);
  }

  async recordModerationAction(action: {
    userId: string;
    generationId: string;
    action: string;
    reason: string;
    adminId: string;
    timestamp: Date;
  }): Promise<void> {
    await db.insert(moderationActions).values({
      id: randomUUID(),
      moderatorId: action.adminId,
      userId: action.userId, // Store the user ID directly
      action: action.action,
      contentType: action.generationId ? 'generation' : 'user',
      contentId: action.generationId || action.userId,
      reason: action.reason,
      previousStatus: action.generationId ? 'completed' : 'active',
      newStatus: action.action === 'user_deleted' ? 'deleted' : (action.action === 'deleted' ? 'deleted' : 'moderated'),
      createdAt: action.timestamp
    });
  }

  async getModerationLogs(): Promise<(ModerationAction & { userEmail?: string; moderatorEmail?: string; username?: string })[]> {
    const logs = await db
      .select({
        id: moderationActions.id,
        moderatorId: moderationActions.moderatorId,
        userId: moderationActions.userId,
        action: moderationActions.action,
        contentType: moderationActions.contentType,
        contentId: moderationActions.contentId,
        reason: moderationActions.reason,
        previousStatus: moderationActions.previousStatus,
        newStatus: moderationActions.newStatus,
        metadata: moderationActions.metadata,
        createdAt: moderationActions.createdAt
      })
      .from(moderationActions)
      .orderBy(desc(moderationActions.createdAt))
      .limit(100); // Limit to most recent 100 for performance

    // Enrich logs with user and moderator information
    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        let userEmail: string | undefined;
        let username: string | undefined;
        let moderatorEmail: string | undefined;

        // Get moderator information
        if (log.moderatorId) {
          const [moderator] = await db.select({ email: users.email }).from(users).where(eq(users.id, log.moderatorId));
          moderatorEmail = moderator?.email;
        }

        // Get user (offender) information directly from userId field
        if (log.userId) {
          const [user] = await db.select({ email: users.email, username: users.username }).from(users).where(eq(users.id, log.userId));
          userEmail = user?.email;
          username = user?.username;
        }

        return {
          ...log,
          userEmail,
          username,
          moderatorEmail,
        };
      })
    );

    return enrichedLogs;
  }

  async getUserModerationLogs(userId: string): Promise<ModerationAction[]> {
    const logs = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.contentId, userId))
      .orderBy(desc(moderationActions.createdAt));
    return logs;
  }

  // User API Keys - DatabaseStorage Implementation with Encryption
  async updateUserApiKey(userId: string, apiKey: string): Promise<User | undefined> {
    // If setting an empty API key, set it to null in the database instead of encrypting empty string
    const valueToStore = apiKey && apiKey.trim() !== '' ? encryptApiKey(apiKey) : null;
    
    const [updatedUser] = await db
      .update(users)
      .set({
        civitaiApiKey: valueToStore
      })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async getUserApiKey(userId: string): Promise<string | null> {
    const [user] = await db
      .select({ civitaiApiKey: users.civitaiApiKey })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.civitaiApiKey) {
      return null;
    }

    const stored = user.civitaiApiKey;
    const decryptedKey = decryptApiKey(stored);

    // Lazily migrate legacy (createCipher/CBC) ciphertexts to AES-256-GCM.
    if (decryptedKey && isLegacyCiphertext(stored)) {
      try {
        await db
          .update(users)
          .set({ civitaiApiKey: encryptApiKey(decryptedKey) })
          .where(eq(users.id, userId));
      } catch {
        // Migration is best-effort; the decrypted key is still returned.
      }
    }

    return decryptedKey && decryptedKey.trim() !== '' ? decryptedKey : null;
  }

  // Clear all stored image paths from generations (for storage cleanup)
  async clearAllStoredImagePaths(): Promise<void> {
    await db
      .update(generations)
      .set({ storedImagePath: null })
      .where(isNotNull(generations.storedImagePath));
    logger.info("🧹 Cleared all stored image paths from database");
  }

  // Credit Package methods - DatabaseStorage Implementation
  async getCreditPackages(): Promise<CreditPackage[]> {
    return await db.select().from(creditPackages).orderBy(creditPackages.sortOrder);
  }

  async getCreditPackage(id: string): Promise<CreditPackage | undefined> {
    const [creditPackage] = await db.select().from(creditPackages).where(eq(creditPackages.id, id));
    return creditPackage || undefined;
  }

  async createCreditPackage(creditPackageData: InsertCreditPackage): Promise<CreditPackage> {
    const [newPackage] = await db
      .insert(creditPackages)
      .values({
        ...creditPackageData,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newPackage;
  }

  async updateCreditPackage(id: string, updates: Partial<InsertCreditPackage>): Promise<CreditPackage | undefined> {
    const [updatedPackage] = await db
      .update(creditPackages)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(creditPackages.id, id))
      .returning();
    return updatedPackage || undefined;
  }

  // Credit Transaction methods - DatabaseStorage Implementation
  async getCreditTransaction(id: string): Promise<CreditTransaction | undefined> {
    const [transaction] = await db.select().from(creditTransactions).where(eq(creditTransactions.id, id));
    return transaction || undefined;
  }

  async getUserCreditTransactions(userId: string): Promise<CreditTransaction[]> {
    return await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt));
  }

  async createCreditTransaction(transaction: InsertCreditTransaction & { userId: string }): Promise<CreditTransaction> {
    const [newTransaction] = await db
      .insert(creditTransactions)
      .values({
        ...transaction,
        id: randomUUID(),
        createdAt: new Date(),
        completedAt: transaction.status === 'completed' ? new Date() : null,
      })
      .returning();
    return newTransaction;
  }

  async updateCreditTransactionStatus(id: string, status: string): Promise<void> {
    await db
      .update(creditTransactions)
      .set({
        status,
        completedAt: status === 'completed' ? new Date() : null,
      })
      .where(eq(creditTransactions.id, id));
  }

  // Platform Settings - DatabaseStorage Implementation
  async getPlatformSetting(key: string): Promise<PlatformSetting | undefined> {
    const [setting] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    return setting || undefined;
  }

  async getAllPlatformSettings(): Promise<PlatformSetting[]> {
    return await db.select().from(platformSettings).orderBy(platformSettings.key);
  }

  async updatePlatformSetting(key: string, value: string, updatedBy: string, description?: string): Promise<PlatformSetting> {
    const existing = await this.getPlatformSetting(key);
    
    if (existing) {
      const [updated] = await db
        .update(platformSettings)
        .set({
          value,
          description: description || existing.description,
          updatedBy,
          updatedAt: new Date()
        })
        .where(eq(platformSettings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(platformSettings)
        .values({
          key,
          value,
          description: description || null,
          updatedBy,
        })
        .returning();
      return created;
    }
  }

  async deletePlatformSetting(key: string): Promise<boolean> {
    const result = await db.delete(platformSettings).where(eq(platformSettings.key, key)).returning();
    return result.length > 0;
  }

  // Admin User Management - DatabaseStorage Implementation
  async lockUser(userId: string, adminId: string, reason: string): Promise<User | undefined> {
    const [lockedUser] = await db
      .update(users)
      .set({
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: adminId,
        lockReason: reason,
      })
      .where(eq(users.id, userId))
      .returning();
    return lockedUser || undefined;
  }

  async unlockUser(userId: string): Promise<User | undefined> {
    const [unlockedUser] = await db
      .update(users)
      .set({
        isLocked: false,
        lockedAt: null,
        lockedBy: null,
        lockReason: null,
      })
      .where(eq(users.id, userId))
      .returning();
    return unlockedUser || undefined;
  }

  async adminDeleteUser(userId: string): Promise<void> {
    // Same as regular deleteUser
    await this.deleteUser(userId);
  }

  async getAllUsersForAdmin(options: {
    page?: number;
    limit?: number;
    sortBy?: 'lastActiveAt' | 'alphabetical' | 'createdAt';
    search?: string;
  } = {}): Promise<{
    users: User[];
    pagination: {
      page: number;
      limit: number;
      totalUsers: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    const { page = 1, limit = 10000, sortBy = 'lastActiveAt', search = '' } = options;
    
    // Build search condition if search term provided
    const searchCondition = search.trim() 
      ? or(
          ilike(users.displayName, `%${search}%`),
          ilike(users.username, `%${search}%`),
          ilike(users.email, `%${search}%`)
        )
      : undefined;
    
    // Get total count (with search filter if applicable)
    const countQuery = searchCondition 
      ? db.select({ count: count() }).from(users).where(searchCondition)
      : db.select({ count: count() }).from(users);
    const [{ count: totalCount }] = await countQuery;
    const totalUsers = totalCount;
    const totalPages = Math.ceil(totalUsers / limit);
    const offset = (page - 1) * limit;
    
    // Build query with appropriate sorting
    let query = db.select().from(users).$dynamic();
    
    // Apply search filter if provided
    if (searchCondition) {
      query = query.where(searchCondition);
    }
    
    if (sortBy === 'alphabetical') {
      // Sort alphabetically by displayName, fallback to username
      query = query.orderBy(
        sql`COALESCE(${users.displayName}, ${users.username})`
      );
    } else if (sortBy === 'createdAt') {
      // Sort by createdAt (newest first)
      query = query.orderBy(desc(users.createdAt));
    } else {
      // Sort by lastActiveAt (most recent first)
      query = query.orderBy(desc(users.lastActiveAt));
    }
    
    // Apply pagination
    const userResults = await query.limit(limit).offset(offset);
    
    return {
      users: userResults,
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages,
        hasMore: page < totalPages
      }
    };
  }

  // User Feedback - DatabaseStorage Implementation
  async createUserFeedback(feedback: InsertUserFeedback & { userId: string }): Promise<UserFeedback> {
    const [newFeedback] = await db
      .insert(userFeedback)
      .values({
        ...feedback,
        id: randomUUID(),
        status: 'open',
        priority: feedback.priority || 'medium',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newFeedback;
  }

  async getUserFeedback(userId: string): Promise<UserFeedback[]> {
    return await db
      .select()
      .from(userFeedback)
      .where(eq(userFeedback.userId, userId))
      .orderBy(desc(userFeedback.createdAt));
  }

  async getAllFeedback(): Promise<UserFeedback[]> {
    return await db
      .select()
      .from(userFeedback)
      .orderBy(desc(userFeedback.createdAt));
  }

  async updateFeedbackStatus(id: string, status: string, adminResponse?: string, respondedBy?: string): Promise<UserFeedback | undefined> {
    const [updatedFeedback] = await db
      .update(userFeedback)
      .set({
        status,
        adminResponse: adminResponse || undefined,
        respondedBy: respondedBy || undefined,
        respondedAt: adminResponse ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(userFeedback.id, id))
      .returning();
    return updatedFeedback || undefined;
  }

  async getFeedback(id: string): Promise<UserFeedback | undefined> {
    const [feedback] = await db
      .select()
      .from(userFeedback)
      .where(eq(userFeedback.id, id));
    return feedback || undefined;
  }

  // Default Data Creation - Create preloaded content for users
  async createDefaultDataForUser(userId: string): Promise<void> {
    // Check if user already has default college dorm scenes (avoid duplicates)
    const existingScenes = await this.getUserSavedScenes(userId);
    
    const hasCollegeDorms = existingScenes.some(scene => 
      scene.title?.includes("College Dorm") || scene.location?.includes("college dormitory")
    );

    if (hasCollegeDorms) {
      return; // User already has default scenes
    }

    // Create college dorm scenes
    if (!hasCollegeDorms) {
      // College Dorm 1
      await this.createSavedScene({
        userId,
        title: "College Dorm 1",
        description: "Classic college dormitory room with twin beds and study area",
        prompt: "college dormitory room, twin beds, study desk, college posters on walls, casual dormitory atmosphere",
        locationCategory: "School & Campus",
        location: "college dormitory room",
        outfitCategory: null,
        outfit: null,
        poseCategory: null,
        pose: null,
        imageUrl: null,
        tags: ["college", "dorm", "study"],
        isFavorite: false,
        sceneData: {
          locationCategory: "School & Campus",
          location: "college dormitory room",
          additionalPrompt: "twin beds, study desk, college posters on walls, casual dormitory atmosphere"
        }
      });

      // College Dorm 2
      await this.createSavedScene({
        userId,
        title: "College Dorm 2", 
        description: "Modern college dormitory room with spiral staircase",
        prompt: "college dormitory room, climbing spiral staircase, elegant interior, modern dormitory design",
        locationCategory: "School & Campus",
        location: "college dormitory room",
        outfitCategory: null,
        outfit: null,
        poseCategory: null,
        pose: "climbing spiral staircase",
        imageUrl: null,
        tags: ["college", "dorm", "modern", "staircase"],
        isFavorite: false,
        sceneData: {
          locationCategory: "School & Campus", 
          location: "college dormitory room",
          pose: "climbing spiral staircase",
          additionalPrompt: "elegant interior, modern dormitory design"
        }
      });
    }
  }

  // Error Logging implementation
  async logError(errorLog: InsertErrorLog): Promise<ErrorLog> {
    const [newError] = await db.insert(errorLogs).values(errorLog).returning();
    return newError;
  }

  async getErrorLogs(limit: number = 100): Promise<ErrorLog[]> {
    return await db.select()
      .from(errorLogs)
      .orderBy(desc(errorLogs.createdAt))
      .limit(limit);
  }

  async getErrorLogsByType(errorType: string, limit: number = 100): Promise<ErrorLog[]> {
    return await db.select()
      .from(errorLogs)
      .where(eq(errorLogs.errorType, errorType))
      .orderBy(desc(errorLogs.createdAt))
      .limit(limit);
  }

  async getErrorLogsByUser(userId: string, limit: number = 100): Promise<ErrorLog[]> {
    return await db.select()
      .from(errorLogs)
      .where(eq(errorLogs.userId, userId))
      .orderBy(desc(errorLogs.createdAt))
      .limit(limit);
  }

  async getUnresolvedErrors(limit: number = 100): Promise<ErrorLog[]> {
    return await db.select()
      .from(errorLogs)
      .where(eq(errorLogs.resolved, false))
      .orderBy(desc(errorLogs.createdAt))
      .limit(limit);
  }

  async markErrorResolved(errorId: string, resolvedBy: string, notes?: string): Promise<ErrorLog | undefined> {
    const [updated] = await db.update(errorLogs)
      .set({ 
        resolved: true, 
        resolvedAt: new Date(),
        resolvedBy,
        notes
      })
      .where(eq(errorLogs.id, errorId))
      .returning();
    return updated;
  }

  async deleteOldErrorLogs(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db.delete(errorLogs)
      .where(sql`${errorLogs.createdAt} < ${cutoffDate}`);
    
    return result.rowCount || 0;
  }

  // Events implementation
  async getUserEvents(userId: string): Promise<Event[]> {
    return await db.select()
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.createdAt));
  }

  async createEvent(event: InsertEvent & { userId: string }): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async deleteEvent(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async copyEvent(eventId: string, userId: string): Promise<Event | null> {
    try {
      // Get the original event and verify it belongs to the user
      const originalEvent = await db.select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.userId, userId)))
        .limit(1);

      if (originalEvent.length === 0) {
        return null;
      }

      const original = originalEvent[0];

      // Create a copy of the event with updated title
      const [copiedEvent] = await db.insert(events).values({
        userId: userId,
        title: `Copy of ${original.title}`,
        description: original.description,
        isActive: original.isActive,
      }).returning();

      // Get all steps from the original event
      const originalSteps = await db.select()
        .from(eventSteps)
        .where(eq(eventSteps.eventId, eventId))
        .orderBy(eventSteps.stepNumber);

      // Copy all steps to the new event
      for (const step of originalSteps) {
        await db.insert(eventSteps).values({
          eventId: copiedEvent.id,
          stepNumber: step.stepNumber,
          title: step.title,
          description: step.description,
          wordsToAdd: step.wordsToAdd,
          wordsToRemove: step.wordsToRemove,
        });
      }

      return copiedEvent;
    } catch (error) {
      logger.error('Failed to copy event:', error);
      return null;
    }
  }

  // Event Steps implementation
  async getEventSteps(eventId: string, userId: string): Promise<EventStep[]> {
    // Verify the event belongs to the user
    const event = await db.select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .limit(1);
    
    if (event.length === 0) {
      return [];
    }

    return await db.select()
      .from(eventSteps)
      .where(eq(eventSteps.eventId, eventId))
      .orderBy(eventSteps.stepNumber);
  }

  async createEventStep(step: InsertEventStep): Promise<EventStep> {
    const [newStep] = await db.insert(eventSteps).values(step).returning();
    return newStep;
  }

  async updateEventStep(id: string, updates: Partial<InsertEventStep>, userId: string): Promise<EventStep | undefined> {
    // Verify the step belongs to an event owned by the user
    const stepWithEvent = await db.select({
      step: eventSteps,
      event: events
    })
    .from(eventSteps)
    .innerJoin(events, eq(eventSteps.eventId, events.id))
    .where(and(eq(eventSteps.id, id), eq(events.userId, userId)))
    .limit(1);

    if (stepWithEvent.length === 0) {
      return undefined;
    }

    const [updated] = await db.update(eventSteps)
      .set(updates)
      .where(eq(eventSteps.id, id))
      .returning();
    
    return updated;
  }

  async deleteEventStep(id: string, userId: string): Promise<boolean> {
    // Verify the step belongs to an event owned by the user
    const stepWithEvent = await db.select()
      .from(eventSteps)
      .innerJoin(events, eq(eventSteps.eventId, events.id))
      .where(and(eq(eventSteps.id, id), eq(events.userId, userId)))
      .limit(1);

    if (stepWithEvent.length === 0) {
      return false;
    }

    const result = await db.delete(eventSteps)
      .where(eq(eventSteps.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // Favorite Words implementation
  async getFavoriteWords(userId: string): Promise<FavoritePromptWord[]> {
    return await db.select()
      .from(favoritePromptWords)
      .where(eq(favoritePromptWords.userId, userId))
      .orderBy(favoritePromptWords.category, favoritePromptWords.word);
  }

  async createFavoriteWord(word: InsertFavoritePromptWord & { userId: string }): Promise<FavoritePromptWord> {
    const [newWord] = await db.insert(favoritePromptWords).values(word).returning();
    return newWord;
  }

  async deleteFavoriteWord(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(favoritePromptWords)
      .where(and(eq(favoritePromptWords.id, id), eq(favoritePromptWords.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async saveEventWordsToFavorites(eventId: string, userId: string): Promise<{addedWords: number, skippedWords: number} | null> {
    try {
      // Verify the event belongs to the user
      const event = await db.select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.userId, userId)))
        .limit(1);

      if (event.length === 0) {
        return null;
      }

      // Get all steps from the event
      const steps = await db.select()
        .from(eventSteps)
        .where(eq(eventSteps.eventId, eventId))
        .orderBy(eventSteps.stepNumber);

      // Extract all unique words from wordsToAdd arrays
      const allWords = new Set<string>();
      steps.forEach(step => {
        step.wordsToAdd?.forEach(word => {
          if (word.trim()) {
            allWords.add(word.trim());
          }
        });
      });

      if (allWords.size === 0) {
        return { addedWords: 0, skippedWords: 0 };
      }

      // Get existing favorite words for this user to check for duplicates
      const existingWords = await db.select({ word: favoritePromptWords.word })
        .from(favoritePromptWords)
        .where(eq(favoritePromptWords.userId, userId));

      const existingWordSet = new Set(existingWords.map(w => w.word.toLowerCase()));

      // Filter out words that already exist
      const wordsToAdd = Array.from(allWords).filter(word => 
        !existingWordSet.has(word.toLowerCase())
      );

      // Add new words to favorites
      let addedCount = 0;
      for (const word of wordsToAdd) {
        try {
          await db.insert(favoritePromptWords).values({
            userId: userId,
            word: word,
            category: `From Event: ${event[0].title}`,
            usage_count: 0,
          });
          addedCount++;
        } catch (error) {
          // Skip if there's a duplicate error
          logger.warn(`Failed to add word "${word}" to favorites:`, error);
        }
      }

      const skippedCount = allWords.size - addedCount;

      return {
        addedWords: addedCount,
        skippedWords: skippedCount
      };
    } catch (error) {
      logger.error('Failed to save event words to favorites:', error);
      return null;
    }
  }

  async reorderEventSteps(eventId: string, stepIds: string[], userId: string): Promise<boolean> {
    try {
      // Verify the event belongs to the user
      const event = await db.select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.userId, userId)))
        .limit(1);

      if (event.length === 0) {
        return false;
      }

      // Get existing steps to verify they all belong to this event
      const existingSteps = await db.select()
        .from(eventSteps)
        .where(eq(eventSteps.eventId, eventId));

      const existingStepIds = new Set(existingSteps.map(step => step.id));
      
      // Verify all provided stepIds exist and lengths match
      if (stepIds.length !== existingSteps.length) {
        return false;
      }
      
      for (const stepId of stepIds) {
        if (!existingStepIds.has(stepId)) {
          return false;
        }
      }

      // Update each step's stepNumber based on the new order
      for (let i = 0; i < stepIds.length; i++) {
        await db.update(eventSteps)
          .set({ stepNumber: i + 1 })
          .where(eq(eventSteps.id, stepIds[i]));
      }
      return true;
    } catch (error) {
      logger.error('Failed to reorder event steps:', error);
      return false;
    }
  }

  // Characters - DatabaseStorage Implementation
  async getCharacter(id: string): Promise<Character | undefined> {
    const [character] = await db.select().from(characters).where(eq(characters.id, id));
    return character || undefined;
  }

  async getUserCharacters(userId: string): Promise<Character[]> {
    return await db
      .select()
      .from(characters)
      .where(eq(characters.userId, userId))
      .orderBy(desc(characters.createdAt));
  }

  async getPublicCharacters(): Promise<Character[]> {
    return await db
      .select()
      .from(characters)
      .where(eq(characters.isPublic, true))
      .orderBy(desc(characters.createdAt));
  }

  async getSharedCharacters(): Promise<Character[]> {
    return await db
      .select()
      .from(characters)
      .where(eq(characters.isShared, true))
      .orderBy(desc(characters.createdAt));
  }

  async createCharacter(data: InsertCharacter & { userId: string | null }): Promise<Character> {
    const [character] = await db
      .insert(characters)
      .values({
        ...data,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return character;
  }

  async updateCharacter(id: string, updates: Partial<InsertCharacter>, userId?: string): Promise<Character | undefined> {
    // If userId is provided, check ownership
    if (userId) {
      const [existing] = await db.select().from(characters).where(
        and(eq(characters.id, id), eq(characters.userId, userId))
      );
      if (!existing) {
        return undefined;
      }
    }

    const [updatedCharacter] = await db
      .update(characters)
      .set({ 
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();
    return updatedCharacter || undefined;
  }

  async toggleCharacterShared(id: string, userId: string, isShared: boolean): Promise<Character | undefined> {
    // Check ownership first
    const [existing] = await db.select().from(characters).where(
      and(eq(characters.id, id), eq(characters.userId, userId))
    );
    if (!existing) {
      return undefined;
    }

    const [updatedCharacter] = await db
      .update(characters)
      .set({ 
        isShared,
        updatedAt: new Date(),
      })
      .where(and(eq(characters.id, id), eq(characters.userId, userId)))
      .returning();
    return updatedCharacter || undefined;
  }

  async deleteCharacter(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(characters)
      .where(and(eq(characters.id, id), eq(characters.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async deleteCharacterAsAdmin(id: string): Promise<boolean> {
    try {
      // First, update all generations that reference this character to have null character_id
      // This preserves the generation history but removes the character association
      await db
        .update(generations)
        .set({ characterId: null })
        .where(eq(generations.characterId, id));

      // Now we can safely delete the character
      const result = await db
        .delete(characters)
        .where(eq(characters.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      logger.error("Error in deleteCharacterAsAdmin:", error);
      return false;
    }
  }

  async getImagesForCharacter(characterId: string): Promise<Generation[]> {
    return db
      .select()
      .from(generations)
      .where(eq(generations.characterId, characterId))
      .orderBy(desc(generations.createdAt));
  }

  async updateCharacterFromGeneration(characterId: string, generationId: string, updates: Partial<Character>): Promise<Character | undefined> {
    const [updated] = await db
      .update(characters)
      .set({ 
        ...updates, 
        updatedAt: new Date(),
        referenceGenerationId: generationId 
      })
      .where(eq(characters.id, characterId))
      .returning();
    return updated;
  }

  // Character Presets - Database Implementation
  async createCharacterPreset(preset: InsertCharacterPreset & { createdBy: string }): Promise<CharacterPreset> {
    const [newPreset] = await db
      .insert(characterPresets)
      .values({
        characterId: preset.characterId,
        generationId: preset.generationId,
        name: preset.name || null,
        imageUrl: preset.imageUrl || null,
        prompt: preset.prompt || null,
        negativePrompt: preset.negativePrompt || null,
        modelId: preset.modelId || null,
        steps: preset.steps || null,
        cfgScale: preset.cfgScale || null,
        seed: preset.seed || null,
        width: preset.width || null,
        height: preset.height || null,
        scheduler: preset.scheduler || null,
        clipSkip: preset.clipSkip || null,
        loras: preset.loras || [],
        isDefault: preset.isDefault || false,
        createdBy: preset.createdBy,
      })
      .returning();
    return newPreset;
  }

  async getCharacterPresets(characterId: string): Promise<CharacterPreset[]> {
    return db
      .select()
      .from(characterPresets)
      .where(eq(characterPresets.characterId, characterId))
      .orderBy(desc(characterPresets.createdAt));
  }

  async deleteCharacterPreset(id: string): Promise<boolean> {
    const result = await db
      .delete(characterPresets)
      .where(eq(characterPresets.id, id))
      .returning();
    return result.length > 0;
  }

  async setDefaultCharacterPreset(characterId: string, presetId: string): Promise<void> {
    // First, unset all defaults for this character
    await db
      .update(characterPresets)
      .set({ isDefault: false })
      .where(eq(characterPresets.characterId, characterId));
    
    // Then set the specified preset as default
    await db
      .update(characterPresets)
      .set({ isDefault: true })
      .where(eq(characterPresets.id, presetId));
  }

  // User preferences for analytics
  async saveUserPreferences(userId: string, preferences: { breastSize: number; assSize: number }): Promise<UserPreferences> {
    // Check if user preferences already exist
    const existing = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    
    if (existing.length > 0) {
      // Update existing preferences
      const [updated] = await db.update(userPreferences)
        .set({
          breastSize: preferences.breastSize,
          assSize: preferences.assSize,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      // Create new preferences
      const [created] = await db.insert(userPreferences).values({
        userId,
        breastSize: preferences.breastSize,
        assSize: preferences.assSize,
      }).returning();
      return created;
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    return result[0] || undefined;
  }

  async getUserPreferencesAnalytics(): Promise<{ breastSize: { size: number; count: number }[]; assSize: { size: number; count: number }[] }> {
    // Get breast size distribution
    const breastSizeData = await db
      .select({
        size: userPreferences.breastSize,
        count: sql<number>`count(*)::int`
      })
      .from(userPreferences)
      .groupBy(userPreferences.breastSize)
      .orderBy(userPreferences.breastSize);

    // Get ass size distribution  
    const assSizeData = await db
      .select({
        size: userPreferences.assSize,
        count: sql<number>`count(*)::int`
      })
      .from(userPreferences)
      .groupBy(userPreferences.assSize)
      .orderBy(userPreferences.assSize);

    return {
      breastSize: breastSizeData,
      assSize: assSizeData
    };
  }
  
  // System Settings - DatabaseStorage Implementation
  async getSystemSetting(key: string): Promise<SystemSettings | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting || undefined;
  }
  
  async getAllSystemSettings(): Promise<SystemSettings[]> {
    const settings = await db.select().from(systemSettings).orderBy(systemSettings.key);
    return settings;
  }
  
  async updateSystemSetting(key: string, value: string, updatedBy: string, description?: string): Promise<SystemSettings> {
    // Check if setting exists
    const existing = await this.getSystemSetting(key);
    
    if (existing) {
      // Update existing setting
      const [updated] = await db
        .update(systemSettings)
        .set({
          value,
          description: description || existing.description,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    } else {
      // Create new setting
      const [created] = await db
        .insert(systemSettings)
        .values({
          key,
          value,
          description,
          updatedBy,
        })
        .returning();
      return created;
    }
  }
  
  async getMaintenanceMode(): Promise<boolean> {
    const setting = await this.getSystemSetting('maintenance_mode');
    return setting?.value === 'true';
  }
  
  async setMaintenanceMode(enabled: boolean, updatedBy: string): Promise<SystemSettings> {
    return await this.updateSystemSetting(
      'maintenance_mode',
      enabled.toString(),
      updatedBy,
      'Global maintenance mode - blocks all non-admin activity'
    );
  }
  
  // User Tracking Methods
  async startUserTracking(trackedUserId: string, trackerAdminId: string): Promise<TrackingSession> {
    const [session] = await db
      .insert(trackingSessions)
      .values({
        trackedUserId,
        trackerAdminId,
        isActive: true,
      })
      .returning();
    return session;
  }
  
  async stopUserTracking(trackedUserId: string): Promise<TrackingSession | undefined> {
    const activeSession = await this.getActiveTrackingSession(trackedUserId);
    if (!activeSession) {
      return undefined;
    }
    
    const [updatedSession] = await db
      .update(trackingSessions)
      .set({
        stoppedAt: new Date(),
        isActive: false,
      })
      .where(eq(trackingSessions.id, activeSession.id))
      .returning();
    
    return updatedSession;
  }
  
  async getActiveTrackingSession(trackedUserId: string): Promise<TrackingSession | undefined> {
    const [session] = await db
      .select()
      .from(trackingSessions)
      .where(
        and(
          eq(trackingSessions.trackedUserId, trackedUserId),
          eq(trackingSessions.isActive, true)
        )
      )
      .limit(1);
    
    return session || undefined;
  }
  
  async addTrackingEvent(sessionId: string, page: string, action: string, details?: any): Promise<TrackingEvent> {
    const [event] = await db
      .insert(trackingEvents)
      .values({
        sessionId,
        page,
        action,
        details: details || null,
      })
      .returning();
    return event;
  }
  
  async getTrackingSessionWithEvents(sessionId: string): Promise<{ session: TrackingSession; events: TrackingEvent[] } | undefined> {
    const [session] = await db
      .select()
      .from(trackingSessions)
      .where(eq(trackingSessions.id, sessionId));
    
    if (!session) {
      return undefined;
    }
    
    const events = await db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.sessionId, sessionId))
      .orderBy(trackingEvents.timestamp);
    
    return { session, events };
  }

  // Seed credit packages if they don't exist (ensures production has packages)
  async seedCreditPackages(): Promise<void> {
    try {
      const existingPackages = await db.select().from(creditPackages).limit(1);
      
      if (existingPackages.length === 0) {
        logger.info('💰 No credit packages found, seeding default packages...');
        
        const defaultPackages = [
          {
            id: randomUUID(),
            name: 'Power Pack',
            description: '~125 images',
            credits: 1500,
            price: 500, // $5.00 in cents
            bonusCredits: 0,
            isActive: true,
            isPopular: false,
            sortOrder: 1,
          },
          {
            id: randomUUID(),
            name: 'Creator Pack',
            description: '~333 images',
            credits: 4000,
            price: 1000, // $10.00 in cents
            bonusCredits: 0,
            isActive: true,
            isPopular: true,
            sortOrder: 2,
          },
          {
            id: randomUUID(),
            name: 'Mega Pack',
            description: '~833 images',
            credits: 10000,
            price: 2000, // $20.00 in cents
            bonusCredits: 0,
            isActive: true,
            isPopular: false,
            sortOrder: 3,
          },
        ];

        await db.insert(creditPackages).values(defaultPackages);
        logger.info('✅ Credit packages seeded successfully');
      } else {
        logger.info('✅ Credit packages already exist');
      }
    } catch (error) {
      logger.error('❌ Failed to seed credit packages:', error);
    }
  }

  // Sanitization Rules
  async getSanitizationRules(ruleType?: string): Promise<SanitizationRule[]> {
    if (ruleType) {
      return await db.select().from(sanitizationRules).where(eq(sanitizationRules.ruleType, ruleType)).orderBy(sanitizationRules.createdAt);
    }
    return await db.select().from(sanitizationRules).orderBy(sanitizationRules.createdAt);
  }

  async getEnabledSanitizationRules(ruleType?: string): Promise<SanitizationRule[]> {
    if (ruleType) {
      return await db.select().from(sanitizationRules)
        .where(and(eq(sanitizationRules.ruleType, ruleType), eq(sanitizationRules.isEnabled, true)))
        .orderBy(sanitizationRules.createdAt);
    }
    return await db.select().from(sanitizationRules)
      .where(eq(sanitizationRules.isEnabled, true))
      .orderBy(sanitizationRules.createdAt);
  }

  async getSanitizationRule(id: string): Promise<SanitizationRule | undefined> {
    const [rule] = await db.select().from(sanitizationRules).where(eq(sanitizationRules.id, id));
    return rule;
  }

  async createSanitizationRule(rule: InsertSanitizationRule): Promise<SanitizationRule> {
    const [newRule] = await db.insert(sanitizationRules).values(rule).returning();
    return newRule;
  }

  async updateSanitizationRule(id: string, updates: Partial<InsertSanitizationRule>): Promise<SanitizationRule | undefined> {
    const [updated] = await db.update(sanitizationRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sanitizationRules.id, id))
      .returning();
    return updated;
  }

  async deleteSanitizationRule(id: string): Promise<boolean> {
    const result = await db.delete(sanitizationRules).where(eq(sanitizationRules.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async seedDefaultSanitizationRules(): Promise<void> {
    try {
      const defaultRules: InsertSanitizationRule[] = [
        // Negative prompt - words to always add
        { ruleType: 'negative_add', pattern: 'child', isSystemRule: true, description: 'Safety: always exclude child-related content' },
        { ruleType: 'negative_add', pattern: 'CSAM', isSystemRule: true, description: 'Safety: always exclude CSAM' },
        { ruleType: 'negative_add', pattern: 'underage', isSystemRule: true, description: 'Safety: always exclude underage content' },
        { ruleType: 'negative_add', pattern: 'minor', isSystemRule: true, description: 'Safety: always exclude minors' },
        { ruleType: 'negative_add', pattern: 'kid', isSystemRule: true, description: 'Safety: always exclude kid content' },
        { ruleType: 'negative_add', pattern: 'young child', isSystemRule: true, description: 'Safety: always exclude young child content' },
        // Positive prompt - replacements for safety
        { ruleType: 'positive_replace', pattern: 'flat chested', replacement: 'small breasts', isSystemRule: true, description: 'Safety: replace flat chested with small breasts' },
        { ruleType: 'positive_replace', pattern: 'flat chest', replacement: 'small breasts', isSystemRule: true, description: 'Safety: replace flat chest with small breasts' },
        { ruleType: 'positive_replace', pattern: 'flat-chested', replacement: 'small breasts', isSystemRule: true, description: 'Safety: replace flat-chested with small breasts' },
        { ruleType: 'positive_replace', pattern: 'flat-chest', replacement: 'small breasts', isSystemRule: true, description: 'Safety: replace flat-chest with small breasts' },
      ];

      // Get existing patterns to avoid duplicates
      const existing = await db.select().from(sanitizationRules);
      const existingPatterns = new Set(existing.map(r => `${r.ruleType}:${r.pattern.toLowerCase()}`));
      
      // Filter to only rules that don't exist yet
      const missingRules = defaultRules.filter(r => 
        !existingPatterns.has(`${r.ruleType}:${r.pattern.toLowerCase()}`)
      );
      
      if (missingRules.length > 0) {
        logger.info(`🌱 Seeding ${missingRules.length} missing sanitization rules...`);
        await db.insert(sanitizationRules).values(missingRules);
        logger.info('✅ Missing sanitization rules seeded successfully');
      } else {
        logger.info('✅ All sanitization rules already exist');
      }
    } catch (error) {
      logger.error('❌ Failed to seed sanitization rules:', error);
    }
  }

  // API Keys for external access
  async createApiKey(userId: string, name: string, keyHash: string, keyPrefix: string, dailyLimit: number = 1200): Promise<ApiKey> {
    const today = new Date().toISOString().split('T')[0];
    const [result] = await db.insert(apiKeys).values({
      userId,
      name,
      keyHash,
      keyPrefix,
      dailyLimit,
      dailyUsage: 0,
      lastResetDate: today,
      isActive: true,
    }).returning();
    return result;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [result] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)));
    return result;
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }

  async deactivateApiKey(id: string, userId: string): Promise<boolean> {
    const result = await db.update(apiKeys).set({ isActive: false }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).returning();
    return result.length > 0;
  }

  async incrementApiKeyUsage(id: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    if (!key) return;

    if (key.lastResetDate !== today) {
      await db.update(apiKeys).set({ dailyUsage: 1, lastResetDate: today, lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
    } else {
      await db.update(apiKeys).set({ dailyUsage: (key.dailyUsage || 0) + 1, lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
    }
  }

  async resetApiKeyDailyUsage(id: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await db.update(apiKeys).set({ dailyUsage: 0, lastResetDate: today }).where(eq(apiKeys.id, id));
  }

  async checkApiKeyRateLimit(id: string): Promise<{ allowed: boolean; usage: number; limit: number }> {
    const today = new Date().toISOString().split('T')[0];
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    if (!key) return { allowed: false, usage: 0, limit: 0 };

    let currentUsage = key.dailyUsage || 0;
    if (key.lastResetDate !== today) {
      currentUsage = 0;
      await db.update(apiKeys).set({ dailyUsage: 0, lastResetDate: today }).where(eq(apiKeys.id, id));
    }

    return {
      allowed: currentUsage < (key.dailyLimit || 1200),
      usage: currentUsage,
      limit: key.dailyLimit || 1200,
    };
  }
  // Source Uploads
  async createSourceUpload(data: { userId: string; objectPath: string; generationType: string }): Promise<SourceUpload> {
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const [row] = await db.insert(sourceUploads).values({
      userId: data.userId,
      objectPath: data.objectPath,
      generationType: data.generationType,
      expiresAt,
    }).returning();
    return row;
  }

  async linkSourceUploadToGeneration(id: string, generationId: string): Promise<void> {
    await db.update(sourceUploads).set({ generationId }).where(eq(sourceUploads.id, id));
  }

  async getSourceUploadsPaginated(limit: number, offset: number): Promise<{ uploads: (SourceUpload & { user?: User })[]; total: number }> {
    const [rows, [{ count: totalCount }]] = await Promise.all([
      db.select({ upload: sourceUploads, user: users })
        .from(sourceUploads)
        .leftJoin(users, eq(sourceUploads.userId, users.id))
        .orderBy(desc(sourceUploads.uploadedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(sourceUploads),
    ]);
    return {
      uploads: rows.map(r => ({ ...r.upload, user: r.user ?? undefined })),
      total: totalCount,
    };
  }

  async getExpiredSourceUploads(): Promise<SourceUpload[]> {
    return db.select().from(sourceUploads).where(lt(sourceUploads.expiresAt, new Date()));
  }

  async deleteSourceUpload(id: string): Promise<void> {
    await db.delete(sourceUploads).where(eq(sourceUploads.id, id));
  }

  async getSourceUpload(id: string): Promise<SourceUpload | undefined> {
    const [row] = await db.select().from(sourceUploads).where(eq(sourceUploads.id, id));
    return row ?? undefined;
  }
}

// Use DatabaseStorage for production, MemStorage for development if needed
export const storage = new DatabaseStorage();

// Seed credit packages and sanitization rules on startup
storage.seedCreditPackages();
storage.seedDefaultSanitizationRules();

// Seed platform characters, scenes, and events
import("./seed-content").then(m => m.seedPlatformContent());
