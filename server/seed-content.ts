/**
 * Platform content seed — 5 female characters, 5 scenes, 5 events.
 * Runs at startup (idempotent: checks by name before inserting).
 */
import { db } from "./db";
import { characters, savedScenes, events, eventSteps, models } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "./logger";

// ─── helpers ────────────────────────────────────────────────────────────────

async function findOrNull<T extends { name: string }>(
  table: any,
  nameCol: any,
  name: string,
): Promise<boolean> {
  const [row] = await db.select({ name: nameCol }).from(table).where(eq(nameCol, name)).limit(1);
  return !!row;
}

async function getDefaultModelId(): Promise<string | null> {
  // Prefer CyberRealistic Pony; fall back to first available model.
  const [pony] = await db
    .select({ id: models.id })
    .from(models)
    .where(eq(models.name, "CyberRealistic Pony"))
    .limit(1);
  if (pony) return pony.id;
  const [first] = await db.select({ id: models.id }).from(models).limit(1);
  return first?.id ?? null;
}

// ─── characters ─────────────────────────────────────────────────────────────

const FEMALE_CHARACTERS = [
  {
    name: "Luna Blackwood",
    description: "A mysterious gothic beauty with an alluring dark aesthetic and magnetic presence.",
    basePrompt:
      "beautiful gothic woman, long flowing black hair, pale porcelain skin, smoky eye makeup, black lace corset dress, dramatic lighting, ultra detailed, photorealistic, 8k",
    negativePrompt:
      "bad anatomy, ugly, blurry, low quality, deformed, extra limbs, watermark, text",
    tags: ["gothic", "dark", "mysterious", "elegant"],
    age: 24,
    breastSize: 3,
    assSize: 2,
  },
  {
    name: "Sakura Hana",
    description: "A graceful Japanese beauty with delicate features and timeless elegance.",
    basePrompt:
      "beautiful Japanese woman, long silky black hair, soft delicate features, warm almond eyes, flawless skin, graceful posture, soft natural lighting, ultra detailed, photorealistic, 8k",
    negativePrompt:
      "bad anatomy, ugly, blurry, low quality, deformed, extra limbs, watermark, text",
    tags: ["japanese", "elegant", "graceful", "classic"],
    age: 22,
    breastSize: 2,
    assSize: 2,
  },
  {
    name: "Aria Sterling",
    description: "A confident and sophisticated professional woman with striking looks and commanding presence.",
    basePrompt:
      "beautiful confident woman, long blonde hair, sharp cheekbones, piercing blue eyes, sophisticated expression, polished and elegant, studio lighting, ultra detailed, photorealistic, 8k",
    negativePrompt:
      "bad anatomy, ugly, blurry, low quality, deformed, extra limbs, watermark, text",
    tags: ["professional", "blonde", "confident", "sophisticated"],
    age: 28,
    breastSize: 3,
    assSize: 2,
  },
  {
    name: "Zara Voss",
    description: "A fierce cyberpunk rebel with neon-streaked hair and an edgy futuristic style.",
    basePrompt:
      "beautiful cyberpunk woman, platinum hair with neon pink streaks, bold futuristic makeup, cyberpunk bodysuit, urban neon city background, fierce expression, cinematic lighting, ultra detailed, photorealistic, 8k",
    negativePrompt:
      "bad anatomy, ugly, blurry, low quality, deformed, extra limbs, watermark, text",
    tags: ["cyberpunk", "futuristic", "edgy", "neon"],
    age: 25,
    breastSize: 2,
    assSize: 3,
  },
  {
    name: "Sofia Del Rio",
    description: "A passionate Mediterranean beauty with sun-kissed skin, fiery charm, and an infectious smile.",
    basePrompt:
      "beautiful Mediterranean woman, long dark wavy hair, olive sun-kissed skin, warm brown eyes, bright warm smile, vibrant and sensual, natural outdoor lighting, ultra detailed, photorealistic, 8k",
    negativePrompt:
      "bad anatomy, ugly, blurry, low quality, deformed, extra limbs, watermark, text",
    tags: ["mediterranean", "latina", "warm", "vibrant", "sensual"],
    age: 26,
    breastSize: 3,
    assSize: 3,
  },
];

// ─── scenes ─────────────────────────────────────────────────────────────────

const PLATFORM_SCENES = [
  {
    title: "Luxury Hotel Suite",
    description: "A lavish five-star hotel suite with floor-to-ceiling windows, king bed, and stunning city views.",
    prompt:
      "luxurious hotel suite, king-size bed with silk sheets, floor-to-ceiling windows, city skyline at night, ambient lighting, champagne on the nightstand, elegant and sensual atmosphere",
    locationCategory: "Indoor",
    location: "Hotel Suite",
    outfitCategory: "Lingerie",
    outfit: "Silk Lingerie",
    poseCategory: "Relaxed",
    pose: "Lounging on Bed",
    tags: ["luxury", "hotel", "indoor", "elegant", "nighttime"],
  },
  {
    title: "Tropical Beach at Sunset",
    description: "A secluded tropical beach with golden sand, crystal-clear water, and a breathtaking sunset.",
    prompt:
      "secluded tropical beach, golden sand, crystal-clear turquoise water, palm trees, breathtaking golden sunset, warm amber light, gentle waves, paradise atmosphere",
    locationCategory: "Outdoor",
    location: "Beach",
    outfitCategory: "Swimwear",
    outfit: "Bikini",
    poseCategory: "Standing",
    pose: "Beach Pose",
    tags: ["beach", "tropical", "sunset", "outdoor", "paradise"],
  },
  {
    title: "Neon Rooftop Bar",
    description: "A sleek urban rooftop bar with neon signs, city panorama, and a vibrant nightlife atmosphere.",
    prompt:
      "urban rooftop bar, neon signs, city panorama at night, sleek modern furniture, glowing cocktails, vibrant nightlife atmosphere, bokeh city lights, cool and stylish",
    locationCategory: "Outdoor",
    location: "Rooftop",
    outfitCategory: "Party",
    outfit: "Mini Dress",
    poseCategory: "Standing",
    pose: "Leaning on Railing",
    tags: ["rooftop", "neon", "nightlife", "urban", "stylish"],
  },
  {
    title: "Japanese Onsen",
    description: "A serene traditional Japanese hot spring surrounded by bamboo, lanterns, and misty mountain air.",
    prompt:
      "traditional Japanese onsen, steaming mineral water, bamboo and stone surroundings, paper lanterns, cherry blossoms, misty mountain atmosphere, tranquil and serene, soft warm light",
    locationCategory: "Outdoor",
    location: "Onsen",
    outfitCategory: "Minimal",
    outfit: "Traditional Towel",
    poseCategory: "Relaxed",
    pose: "In Hot Spring",
    tags: ["japanese", "onsen", "serene", "traditional", "relaxing"],
  },
  {
    title: "Private Art Studio",
    description: "A sunlit artist's loft with exposed brick, canvases, paint-splattered floors, and creative energy.",
    prompt:
      "sunlit artist loft, exposed brick walls, large canvases, paint-splattered wooden floor, natural window light, creative and intimate atmosphere, artistic and bohemian",
    locationCategory: "Indoor",
    location: "Art Studio",
    outfitCategory: "Casual",
    outfit: "Artist Smock",
    poseCategory: "Creative",
    pose: "Painting",
    tags: ["art", "studio", "creative", "sunlit", "bohemian"],
  },
];

// ─── events ─────────────────────────────────────────────────────────────────

const PLATFORM_EVENTS = [
  {
    title: "Summer Heatwave",
    description: "Turn up the temperature with a sizzling summer theme — sun, heat, and barely-there outfits.",
    steps: [
      {
        stepNumber: 1,
        title: "Warm Glow",
        description: "Add a warm sunny atmosphere to the scene.",
        wordsToAdd: ["sunny day", "warm golden light", "summer", "outdoors"],
        wordsToRemove: ["winter", "cold", "snow", "dark"],
      },
      {
        stepNumber: 2,
        title: "Beach Ready",
        description: "Dress for the heat with minimal summer attire.",
        wordsToAdd: ["bikini", "sun-kissed skin", "beach", "tropical"],
        wordsToRemove: ["fully clothed", "winter coat", "covered"],
      },
      {
        stepNumber: 3,
        title: "Peak Heat",
        description: "Maximum summer energy — glistening skin, perfect tan, carefree.",
        wordsToAdd: ["glistening skin", "perfect tan lines", "carefree", "sensual", "summer vibes"],
        wordsToRemove: [],
      },
    ],
  },
  {
    title: "Midnight Fantasy",
    description: "An enchanting journey into a moonlit fantasy world — mysterious, magical, and alluring.",
    steps: [
      {
        stepNumber: 1,
        title: "Into the Night",
        description: "Set the scene with a mysterious nocturnal atmosphere.",
        wordsToAdd: ["moonlight", "night", "stars", "mysterious atmosphere", "dark and enchanting"],
        wordsToRemove: ["daytime", "bright sunlight"],
      },
      {
        stepNumber: 2,
        title: "Fantasy Attire",
        description: "Dress in ethereal fantasy clothing.",
        wordsToAdd: ["flowing sheer gown", "fantasy", "ethereal", "magical", "glowing"],
        wordsToRemove: ["casual clothes", "jeans", "modern outfit"],
      },
      {
        stepNumber: 3,
        title: "Enchanted",
        description: "Full immersion in the fantasy — magic particles, otherworldly beauty.",
        wordsToAdd: ["magic particles", "otherworldly beauty", "enchanted", "luminous", "fantasy art"],
        wordsToRemove: [],
      },
    ],
  },
  {
    title: "Glamour Makeover",
    description: "A progressive glamour transformation from natural beauty to full red-carpet elegance.",
    steps: [
      {
        stepNumber: 1,
        title: "Natural Beauty",
        description: "Start fresh — clean, natural, and effortlessly beautiful.",
        wordsToAdd: ["natural makeup", "fresh face", "effortless beauty", "soft lighting"],
        wordsToRemove: ["heavy makeup", "dramatic"],
      },
      {
        stepNumber: 2,
        title: "Glam It Up",
        description: "Add bold makeup and a show-stopping outfit.",
        wordsToAdd: ["bold red lips", "dramatic eye makeup", "glamorous", "elegant gown", "red carpet"],
        wordsToRemove: ["natural makeup", "casual"],
      },
      {
        stepNumber: 3,
        title: "Icon",
        description: "Full icon mode — diamonds, fur, and absolute confidence.",
        wordsToAdd: ["diamond jewelry", "fur stole", "fashion icon", "ultra glamorous", "editorial fashion"],
        wordsToRemove: [],
      },
    ],
  },
  {
    title: "Urban Explorer",
    description: "Hit the city streets for a stylish urban adventure through different city vibes.",
    steps: [
      {
        stepNumber: 1,
        title: "City Casual",
        description: "Cool and casual street style for daytime exploring.",
        wordsToAdd: ["city street", "casual chic", "daytime", "urban fashion", "sunglasses"],
        wordsToRemove: ["formal", "night"],
      },
      {
        stepNumber: 2,
        title: "Street Chic",
        description: "Elevated street fashion as the city comes alive at dusk.",
        wordsToAdd: ["dusk", "street lights", "elevated street style", "trendy", "city fashion"],
        wordsToRemove: ["daytime", "casual"],
      },
      {
        stepNumber: 3,
        title: "Nightlife",
        description: "The city at night — club-ready and impossibly stylish.",
        wordsToAdd: ["neon lights", "nightclub", "night out outfit", "dance floor", "city nightlife"],
        wordsToRemove: ["casual", "daytime"],
      },
    ],
  },
  {
    title: "Secret Garden",
    description: "An intimate escape into a hidden garden of blooms, dappled light, and natural beauty.",
    steps: [
      {
        stepNumber: 1,
        title: "Garden Discovery",
        description: "Step into a lush secret garden filled with flowers and soft light.",
        wordsToAdd: ["secret garden", "wildflowers", "dappled sunlight", "lush green", "butterflies"],
        wordsToRemove: ["urban", "indoor", "city"],
      },
      {
        stepNumber: 2,
        title: "Floral Embrace",
        description: "Surround yourself with blooms — flowy dress, flower crown.",
        wordsToAdd: ["flowy floral dress", "flower crown", "surrounded by roses", "romantic", "bloom"],
        wordsToRemove: ["modern clothing", "urban outfit"],
      },
      {
        stepNumber: 3,
        title: "Nature's Muse",
        description: "Fully at one with nature — ethereal, free, and radiant.",
        wordsToAdd: ["ethereal", "nature goddess", "sunlight streaming", "radiant", "barefoot in grass"],
        wordsToRemove: [],
      },
    ],
  },
];

// ─── main seed ───────────────────────────────────────────────────────────────

export async function seedPlatformContent() {
  try {
    logger.info("🌱 Seeding platform content (characters, scenes, events)…");

    const modelId = await getDefaultModelId();

    // ── Characters ──────────────────────────────────────────────────────────
    let charsCreated = 0;
    for (const char of FEMALE_CHARACTERS) {
      const [existing] = await db
        .select({ id: characters.id })
        .from(characters)
        .where(and(eq(characters.name, char.name), isNull(characters.userId)))
        .limit(1);
      if (!existing) {
        await db.insert(characters).values({
          id: randomUUID(),
          userId: null,
          name: char.name,
          description: char.description,
          basePrompt: char.basePrompt,
          negativePrompt: char.negativePrompt,
          imageUrl: null,
          tags: char.tags as any,
          isPublic: true,
          isShared: true,
          category: "Female Characters",
          source: "Admin",
          age: char.age,
          breastSize: char.breastSize,
          assSize: char.assSize,
          baseModel: modelId,
          steps: 28,
          cfgScale: 45,
          loras: [] as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        charsCreated++;
      }
    }
    logger.info(`✅ Characters: ${charsCreated} created (${FEMALE_CHARACTERS.length - charsCreated} already existed)`);

    // ── Scenes ───────────────────────────────────────────────────────────────
    let scenesCreated = 0;
    for (const scene of PLATFORM_SCENES) {
      const [existing] = await db
        .select({ id: savedScenes.id })
        .from(savedScenes)
        .where(and(eq(savedScenes.title, scene.title), isNull(savedScenes.userId)))
        .limit(1);
      if (!existing) {
        await db.insert(savedScenes).values({
          id: randomUUID(),
          userId: null,
          title: scene.title,
          description: scene.description,
          prompt: scene.prompt,
          locationCategory: scene.locationCategory,
          location: scene.location,
          outfitCategory: scene.outfitCategory,
          outfit: scene.outfit,
          poseCategory: scene.poseCategory,
          pose: scene.pose,
          imageUrl: null,
          tags: scene.tags as any,
          isFavorite: false,
          isShared: true,
          sceneData: {} as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        scenesCreated++;
      }
    }
    logger.info(`✅ Scenes: ${scenesCreated} created (${PLATFORM_SCENES.length - scenesCreated} already existed)`);

    // ── Events ───────────────────────────────────────────────────────────────
    let eventsCreated = 0;
    for (const ev of PLATFORM_EVENTS) {
      const [existing] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.title, ev.title), isNull(events.userId)))
        .limit(1);
      if (!existing) {
        const eventId = randomUUID();
        await db.insert(events).values({
          id: eventId,
          userId: null,
          title: ev.title,
          description: ev.description,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        for (const step of ev.steps) {
          await db.insert(eventSteps).values({
            id: randomUUID(),
            eventId,
            stepNumber: step.stepNumber,
            title: step.title,
            description: step.description,
            wordsToAdd: step.wordsToAdd as any,
            wordsToRemove: step.wordsToRemove as any,
            createdAt: new Date(),
          });
        }
        eventsCreated++;
      }
    }
    logger.info(`✅ Events: ${eventsCreated} created (${PLATFORM_EVENTS.length - eventsCreated} already existed)`);

  } catch (err) {
    logger.error("❌ seedPlatformContent failed:", err);
  }
}
