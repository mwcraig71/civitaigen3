// Safe Production Migration Script using parameterized queries
// Run this IN THE PRODUCTION ENVIRONMENT
// This avoids SQL injection and escaping issues by using parameterized queries

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { generations as generationsTable } from './shared/schema';
import fs from 'fs';

// Load the image data for migration
const imageData = JSON.parse(fs.readFileSync('image_urls_for_migration.json', 'utf-8'));

// Import generation data from development 
const developmentGenerations = [
  // This will be populated with the actual data
];

async function safeProductionMigration() {
  console.log('🚀 Starting safe production migration...');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);
  
  console.log('📊 Loading generation data from development...');
  
  // Load generation data from the JSON file instead of parsing SQL
  const generationData = JSON.parse(fs.readFileSync('generations_export.json', 'utf-8'));
  
  console.log(`📝 Found ${generationData.length} generations to migrate`);
  
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < generationData.length; i++) {
    const gen = generationData[i];
    
    try {
      console.log(`\\n📷 Processing ${i + 1}/${generationData.length}: ${gen.id}`);
      
      // Check if generation already exists
      const existing = await db.select()
        .from(generationsTable)
        .where(eq(generationsTable.id, gen.id))
        .limit(1);
      
      if (existing.length > 0) {
        console.log(`✅ Already exists: ${gen.id}`);
        skipped++;
        continue;
      }
      
      // Insert using parameterized query - this handles all escaping automatically
      await db.insert(generationsTable).values({
        id: gen.id,
        userId: gen.user_id,
        modelId: gen.model_id,
        prompt: gen.prompt,
        negativePrompt: gen.negative_prompt,
        seed: gen.seed,
        steps: gen.steps,
        cfgScale: gen.cfg_scale,
        width: gen.width,
        height: gen.height,
        scheduler: gen.scheduler,
        clipSkip: gen.clip_skip,
        quantity: gen.quantity,
        loras: gen.loras,
        status: gen.status,
        jobId: gen.job_id,
        imageUrl: gen.image_url,
        blobKey: gen.blob_key,
        cost: gen.cost,
        metadata: gen.metadata,
        createdAt: new Date(gen.created_at),
        completedAt: gen.completed_at ? new Date(gen.completed_at) : null,
        storedImagePath: gen.stored_image_path,
        storedMetadataPath: gen.stored_metadata_path,
        originalGenerationData: gen.original_generation_data,
        characterId: gen.character_id,
        characterName: gen.character_name,
        sceneName: gen.scene_name
      });
      
      console.log(`✅ Inserted: ${gen.id}`);
      inserted++;
      
      // Progress indicator every 100 records
      if ((i + 1) % 100 === 0) {
        console.log(`📊 Progress: ${i + 1}/${generationData.length} (${Math.round((i + 1) / generationData.length * 100)}%)`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to insert ${gen.id}:`, error);
      errors++;
    }
  }
  
  console.log('\\n🎉 Database migration completed!');
  console.log(`📊 Summary:`);
  console.log(`   ✅ Inserted: ${inserted}`);
  console.log(`   ⏭️ Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  
  console.log('\\n🔄 Now starting image migration...');
  
  // Now migrate the images using the existing object storage approach
  const { ObjectStorageService } = await import('./server/objectStorage');
  const objectStorage = new ObjectStorageService();
  
  let imageCopied = 0;
  let imageSkipped = 0;
  let imageErrors = 0;
  
  for (let i = 0; i < imageData.length; i++) {
    const image = imageData[i];
    
    try {
      console.log(`\\n🖼️ Processing image ${i + 1}/${imageData.length}: ${image.id}`);
      
      if (image.storedImagePath && image.storedImagePath.includes('replit-objstore-')) {
        console.log(`✅ Already stored: ${image.id}`);
        imageSkipped++;
        continue;
      }
      
      if (!image.imageUrl) {
        console.log(`⚠️ No image URL: ${image.id}`);
        continue;
      }
      
      // Store image in production object storage
      const { imagePath } = await objectStorage.storeGeneratedImageWithStructure(
        image.imageUrl,
        image.id,
        image.characterName,
        image.sceneName
      );
      
      // Update the generation record in database directly
      await db.update(generationsTable)
        .set({ storedImagePath: imagePath })
        .where(eq(generationsTable.id, image.id));
      
      console.log(`✅ Image migrated: ${image.id}`);
      imageCopied++;
      
      // Progress indicator every 50 images
      if ((i + 1) % 50 === 0) {
        console.log(`📊 Image Progress: ${i + 1}/${imageData.length} (${Math.round((i + 1) / imageData.length * 100)}%)`);
      }
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Failed to migrate image ${image.id}:`, error);
      imageErrors++;
    }
  }
  
  console.log('\\n🎉 Complete migration finished!');
  console.log(`📊 Final Summary:`);
  console.log(`   Database records - ✅ Inserted: ${inserted}, ⏭️ Skipped: ${skipped}, ❌ Errors: ${errors}`);
  console.log(`   Images - ✅ Copied: ${imageCopied}, ⏭️ Skipped: ${imageSkipped}, ❌ Errors: ${imageErrors}`);
  
  process.exit(0);
}

safeProductionMigration().catch(console.error);