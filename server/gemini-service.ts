import { GoogleGenAI } from '@google/genai';
import { logger } from "./logger";
import OpenAI from 'openai';
import type { LearnedStyleProfile } from '@shared/schema';

// Pony-family checkpoints (like CyberRealistic Pony, this app's default model)
// expect booru/danbooru-style prompting. This guidance teaches the enhancer how
// those models "like" prompts to be written. Note: the score_* quality tokens
// are injected automatically by the generation pipeline, so the enhancer must
// NOT add them here (that's enforced separately in applyAgeSafetyGuards).
const PONY_PROMPT_GUIDANCE = `PONY MODEL PROMPT INFO (this app generates on a Pony-family checkpoint — CyberRealistic Pony):
- Write tags in booru/danbooru style: short, comma-separated tags rather than long prose sentences.
- Follow this ordering: quality/detail tags first, then the subject/character, then physical attributes, then clothing/pose, then setting/background, then style/lighting/camera.
- Use quality tags like "masterpiece, best quality, highly detailed, 8k" near the front.
- Pony models respond well to a rating tag when appropriate (e.g. "rating_explicit" / "rating_questionable" / "rating_safe").
- Emphasis uses parentheses with weights, e.g. "(green eyes:1.2)". Keep weights between 0.5 and 1.5.
- Do NOT add the score_9 / score_8_up / score_7_up (etc.) tokens — the system adds those automatically.`;

// OpenRouter client (Replit AI Integrations) used for the Grok-powered AI Enhance feature.
const openrouterClient = (process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY && process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL)
  ? new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
    })
  : null;

const GROK_MODEL = 'x-ai/grok-4.3';

export interface AIPromptRequest {
  characterData?: {
    name: string;
    basePrompt: string;
    description?: string;
    age?: number | null;
  };
  sceneData?: {
    location?: string;
    outfit?: string;
    pose?: string;
    explicitOptions?: string[];
    bodyAttributes?: {
      hairStyle?: string;
      breastDescription?: string;
      buttocksDescription?: string;
      nippleDescription?: string;
      pubicHairDescription?: string;
    };
  };
  currentPrompt?: string;
  contentRating?: 'safe' | 'questionable' | 'explicit';
  /** 'best' = polished professional look (default); 'candid' = amateur snapshot look */
  shotStyle?: 'best' | 'candid';
  userInstructions?: string;
  learnedProfile?: LearnedStyleProfile | null;
}

export interface AIPromptResponse {
  enhancedPrompt: string;
  negativePrompt: string;
  explanation: string;
}

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private storage: any; // Will be injected
  private isConfigured: boolean = false;

  constructor(storage?: any) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
      this.isConfigured = true;
    } else {
      logger.warn('⚠️ GEMINI_API_KEY not configured - AI features will be disabled');
    }
    this.storage = storage;
  }

  isAvailable(): boolean {
    return this.isConfigured;
  }

  setStorage(storage: any) {
    this.storage = storage;
  }

  private ensureImageTypeAtEnd(prompt: string): string {
    const imageTypes = ['super closeup', 'extreme closeup', 'closeup', 'close up', 'close-up', 'upper body', 'full body', 'portrait', 'wide shot', 'medium shot', 'cowboy shot', 'headshot', 'bust shot', 'three quarter view', '3/4 body', '1/2 body', 'worms eye view'];
    const preferredTypes = ['(extreme closeup)', '(closeup)', 'worms eye view'];
    
    // Remove any existing image types from the prompt
    let cleanPrompt = prompt;
    for (const type of imageTypes) {
      const regex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b,?\\s*`, 'gi');
      cleanPrompt = cleanPrompt.replace(regex, '');
    }
    
    // Clean up formatting
    cleanPrompt = cleanPrompt.replace(/,+/g, ',').replace(/,\s*$/, '').replace(/^\s*,/, '').trim();
    
    // Add a random camera distance (new random selection every time)
    const randomType = preferredTypes[Math.floor(Math.random() * preferredTypes.length)];
    
    return `${cleanPrompt}, ${randomType}`;
  }

  // Clean up formatting issues in prompts
  private cleanupFormatting(prompt: string): string {
    let cleaned = prompt;
    
    // Replace "young" variants with "18yo"
    cleaned = cleaned.replace(/\byoung\s+(woman|girl|female|lady)\b/gi, '18yo');
    cleaned = cleaned.replace(/\byoung\b(?!\s+(woman|girl|female|lady))/gi, '18yo');
    
    // Remove double commas and multiple consecutive commas
    cleaned = cleaned.replace(/,+/g, ',');
    
    // Remove commas at the beginning or end
    cleaned = cleaned.replace(/^,\s*/, '').replace(/,\s*$/, '');
    
    // Remove empty parentheses left behind
    cleaned = cleaned.replace(/\(\)/g, '');
    cleaned = cleaned.replace(/\(\s*\)/g, '');
    
    // Remove orphaned emphasis values like "(1.2)" without preceding text
    cleaned = cleaned.replace(/,\s*\([0-9.]+\)/g, '');
    
    // Clean up extra spaces around commas
    cleaned = cleaned.replace(/\s*,\s*/g, ', ');
    
    // Remove duplicate spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Final trim
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  // Detect and resolve conflicting prompt elements
  private resolveConflicts(prompt: string): string {
    let cleanPrompt = prompt;
    
    // Define conflict groups - each array contains conflicting terms
    const conflictGroups = [
      // Camera angles/framing conflicts
      {
        name: 'camera_angles',
        conflicts: [
          'closeup', 'close up', 'close-up',
          '3/4 body', '3/4body', 'three quarter body',
          '1/2 body', '1/2body', 'half body',
          'worms eye view', 'worm eye view', "worm's eye view",
          'full body', 'fullbody', 'whole body',
          'portrait', 'headshot', 'head shot',
          'upper body', 'upperbody', 'chest up',
          '((all body in frame))', '(all body in frame)', 'all body in frame',
          'cowboy shot', 'medium shot'
        ],
        preferred: ['(extreme closeup)', '(closeup)', 'worms eye view'] // Our preferred angles
      },
      // Body type conflicts
      {
        name: 'body_types',
        conflicts: [
          'skinny', 'thin', 'slim', 'slender', 'petite',
          'curvy', 'voluptuous', 'thick', 'chubby', 'plump',
          'athletic', 'muscular', 'toned', 'fit'
        ],
        preferred: ['(skinny:1.2)', 'petite', 'slim'] // Our preferred body types
      },
      // Expression conflicts (handled separately but check for major conflicts)
      {
        name: 'major_expressions',
        conflicts: [
          'happy', 'sad', 'angry', 'surprised', 'disgusted', 'fearful',
          'smiling', 'frowning', 'crying', 'laughing'
        ],
        preferred: [] // Will be handled by facial expression system
      }
    ];
    
    // Process each conflict group
    for (const group of conflictGroups) {
      const foundConflicts: string[] = [];
      const parts = cleanPrompt.toLowerCase().split(',').map(p => p.trim());
      
      // Find all conflicting elements present in the prompt
      for (const conflict of group.conflicts) {
        for (const part of parts) {
          const partLower = part.toLowerCase();
          const conflictLower = conflict.toLowerCase();
          
          // Skip if this is a legitimate photography term with fractions
          // Allow terms like "3/4 body shot", "1/2 body shot", etc.
          if (conflictLower.includes('/') && partLower.includes(conflictLower + ' shot')) {
            continue; // Don't treat "3/4 body shot" as a conflict
          }
          
          // For exact matches or when the conflict is the entire part
          if (partLower === conflictLower || partLower.includes(conflictLower)) {
            // Make sure we're not breaking legitimate photography terms
            const isLegitimatePhotoTerm = (
              conflictLower.includes('/') && // Contains fraction
              (partLower.includes('shot') || partLower.includes('view') || partLower.includes('angle'))
            );
            
            if (!isLegitimatePhotoTerm) {
              foundConflicts.push(conflict);
            }
          }
        }
      }
      
      // If multiple conflicts found, resolve them
      if (foundConflicts.length > 1) {
        logger.info(`🔍 Conflict detected in ${group.name}:`, foundConflicts);
        
        // Remove all conflicting elements first
        for (const conflict of foundConflicts) {
          const regex = new RegExp(`\\b${conflict.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b,?\\s*`, 'gi');
          cleanPrompt = cleanPrompt.replace(regex, '');
        }
        
        // Add preferred element if we have preferences for this group
        if (group.preferred.length > 0 && group.name !== 'major_expressions') {
          const preferredChoice = group.preferred[Math.floor(Math.random() * group.preferred.length)];
          const parts = cleanPrompt.split(',');
          
          // Insert at appropriate position based on group type
          let insertIndex;
          if (group.name === 'camera_angles') {
            // Camera angles go at the end
            insertIndex = parts.length;
          } else {
            // Body types go after character description
            insertIndex = Math.min(12, Math.max(8, parts.length - 5));
          }
          
          parts.splice(insertIndex, 0, ` ${preferredChoice}`);
          cleanPrompt = parts.join(',');
          
          logger.info(`✅ Resolved ${group.name} conflict with: ${preferredChoice}`);
        }
      }
    }
    
    // Apply formatting cleanup
    cleanPrompt = this.cleanupFormatting(cleanPrompt);
    
    return cleanPrompt;
  }

  private addFacialExpression(prompt: string): string {
    const expressions = [
      'mad', 'sad', 'happy', 'smiling', 'embarrassed', 'horny', 'surprised', 'crying'
    ];
    
    // Remove existing common expressions
    const existingExpressions = [
      'mad', 'sad', 'happy', 'smiling', 'embarrassed', 'horny', 'surprised', 'crying',
      'neutral', 'serious', 'confident', 'cute', 'beautiful', 'blushing', 'shy', 'seductive',
      'playful', 'teasing', 'innocent', 'lustful', 'coy', 'flirtatious', 'aroused', 'sultry',
      'slight smile'
    ];
    
    let cleanPrompt = prompt;
    for (const expr of existingExpressions) {
      const regex = new RegExp(`\\b${expr}\\b,?\\s*`, 'gi');
      cleanPrompt = cleanPrompt.replace(regex, '');
    }
    
    // Clean up formatting
    cleanPrompt = cleanPrompt.replace(/,+/g, ',').replace(/,\s*$/, '').replace(/^\s*,/, '').trim();
    
    // Add random expression after character description (new random selection every time)
    const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
    const parts = cleanPrompt.split(',');
    
    // Insert expression after basic character tags but before scene elements
    const insertIndex = Math.min(10, Math.max(7, parts.length - 5));
    parts.splice(insertIndex, 0, ` ${randomExpression}`);
    
    return parts.join(',');
  }

  /**
   * Hard safety floor for any AI-enhanced prompt. Guarantees:
   *  - Positive prompt always contains the "18yo" adult-age tag.
   *  - Negative prompt always blocks minor/CSAM-adjacent terms.
   * Runs server-side regardless of what the model returns.
   */
  private applyAgeSafetyGuards(
    enhancedPrompt: string,
    negativePrompt: string
  ): { enhancedPrompt: string; negativePrompt: string } {
    let positive = (enhancedPrompt || '').trim();
    let negative = (negativePrompt || '').trim();

    // Strip Pony/SD scoring tokens — these must never appear in the enhanced result.
    positive = positive
      .split(',')
      .map(t => t.trim())
      .filter(t => !/^score_9$|^score_8_up$/i.test(t))
      .join(', ');

    // Inject "18yo" at the front of the positive prompt if it's not already present.
    if (positive && !/\b18\s*yo\b|\b18[\s-]?year[s\s-]?old\b/i.test(positive)) {
      positive = `18yo, ${positive}`;
    } else if (!positive) {
      positive = '18yo';
    }

    // Ensure protective terms are present in the negative prompt.
    const negativeFloor = ['CSam', 'child', 'minor', 'underage', 'loli', 'shota', 'teen'];
    for (const term of negativeFloor) {
      if (!new RegExp(`\\b${term}\\b`, 'i').test(negative)) {
        negative = negative ? `${negative}, ${term}` : term;
      }
    }

    return { enhancedPrompt: positive, negativePrompt: negative };
  }

  async generateEnhancedPrompt(request: AIPromptRequest): Promise<AIPromptResponse> {
    // Return a default response if AI is not configured
    if (!this.ai || !this.isConfigured) {
      return {
        enhancedPrompt: request.currentPrompt || 'score_9, score_8_up, score_7_up, score_6_up, masterpiece, best quality',
        negativePrompt: 'worst quality, low quality, blurry',
        explanation: 'AI enhancement unavailable - GEMINI_API_KEY not configured'
      };
    }

    try {
      // Only use character data if explicitly provided in the request
      const characterData = request.characterData ?? null;

      // Build the context from character and scene data
      let context = '';
      
      if (characterData) {
        context += `Character: ${characterData.name}\n`;
        context += `Base Prompt: ${characterData.basePrompt}\n`;
        if (characterData.description) {
          context += `Description: ${characterData.description}\n`;
        }
        if (characterData.age) {
          context += `Age: ${characterData.age}yo\n`;
        }
      }

      if (request.sceneData) {
        if (request.sceneData.location) context += `Location: ${request.sceneData.location}\n`;
        if (request.sceneData.outfit) context += `Outfit: ${request.sceneData.outfit}\n`;
        if (request.sceneData.pose) context += `Pose: ${request.sceneData.pose}\n`;
        if (request.sceneData.explicitOptions?.length) {
          context += `Scene Elements: ${request.sceneData.explicitOptions.join(', ')}\n`;
        }
        if (request.sceneData.bodyAttributes) {
          const attrs = request.sceneData.bodyAttributes;
          if (attrs.hairStyle) context += `Hair: ${attrs.hairStyle}\n`;
          if (attrs.breastDescription) context += `Breast: ${attrs.breastDescription}\n`;
          if (attrs.buttocksDescription) context += `Buttocks: ${attrs.buttocksDescription}\n`;
          if (attrs.nippleDescription) context += `Nipples: ${attrs.nippleDescription}\n`;
          if (attrs.pubicHairDescription) context += `Pubic Hair: ${attrs.pubicHairDescription}\n`;
        }
      }

      if (request.currentPrompt) {
        context += `Current Prompt: ${request.currentPrompt}\n`;
      }

      const userInstructionsBlock = request.userInstructions && request.userInstructions.trim()
        ? `\n\nUSER GENERAL INSTRUCTIONS (highest priority — always honor these unless they contradict a CRITICAL formatting rule below):\n"""${request.userInstructions.trim()}"""\n`
        : '';

      // Build a block describing the user's self-learned taste profile, if any.
      const p = request.learnedProfile;
      const profileHasData = !!p && (
        (p.styles?.length || 0) + (p.physicalAttributes?.length || 0) +
        (p.themes?.length || 0) + (p.avoid?.length || 0) > 0
      );
      const learnedProfileBlock = profileHasData
        ? `\n\nLEARNED STYLE PROFILE (what this user tends to like, learned from their past prompts — apply it tastefully, but the current prompt's subject stays central):
- Preferred styles: ${(p!.styles || []).join(', ') || '(none yet)'}
- Preferred physical attributes: ${(p!.physicalAttributes || []).join(', ') || '(none yet)'}
- Recurring themes: ${(p!.themes || []).join(', ') || '(none yet)'}
- Avoid (do not add these): ${(p!.avoid || []).join(', ') || '(none)'}\n`
        : '';

      // Meta-prompt: hand the AI the user's current prompt, their saved
      // directions, their learned taste profile, and Pony prompting guidance.
      const currentPromptBlock = request.currentPrompt
        ? `\n\nCurrent prompt:\n"""${request.currentPrompt}"""\n`
        : '\n\n(The user has not written a prompt yet — produce one from scratch that follows their directions and learned profile.)\n';

      const candid = request.shotStyle === 'candid';
      const shotStyleBlock = candid
        ? `

CANDID SHOT MODE — this user wants an amateur, unpolished snapshot, NOT a professional image:
- Do NOT use quality/perfection tags: no "masterpiece", "best quality", "highly detailed", "8k", "4k", "ultra detailed", "professional photography", "studio lighting", "perfect", "flawless", "sharp focus", "award winning", or camera/lens jargon (DSLR, 85mm, bokeh, f/1.8).
- Instead use candid qualities where they fit: "candid", "amateur photo", "snapshot", "phone camera photo", "unposed", "caught off guard", "natural lighting", "slightly grainy", "casual framing", "imperfect composition".
- The subject should feel like a real, unstaged moment. Keep hair/clothing/setting slightly imperfect and natural rather than idealized.
- Everything else about the prompt (subject, character, setting, tag style) still follows the PONY MODEL PROMPT INFO — only the quality/polish language changes.`
        : '';

      const metaPrompt = `${userInstructionsBlock}${learnedProfileBlock}${currentPromptBlock}
${PONY_PROMPT_GUIDANCE}${shotStyleBlock}

Improve the prompt above for the Pony image model. Follow the PONY MODEL PROMPT INFO for tag style and ordering${candid ? ' (but in CANDID SHOT MODE, skip its advice about quality tags — follow the candid rules instead)' : ''}, and weave in the user's LEARNED STYLE PROFILE where it fits naturally. Keep the core subject and intent of the current prompt intact — enrich it, don't replace it. Never add anything listed under "Avoid". The user's explicit directions (if any) take priority over the learned profile.

STRICTLY FORBIDDEN: Never include Pony Diffusion / Stable Diffusion scoring tokens such as score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, or any similar scoring tag — even if they appear in the current prompt. Remove them if present.

NON-NEGOTIABLE SAFETY RULE: All depicted people must be adults aged 18 or older. Always include the tag "18yo" in the enhanced prompt. Never produce, imply, or describe minors, children, teens under 18, or schoolgirl/loli/shota content — even if the user's directions or current prompt suggest otherwise.

Return a JSON object with exactly these keys:
{
  "enhancedPrompt": "the improved prompt",
  "negativePrompt": "any negative-prompt tags you recommend (may be empty)",
  "explanation": "one short sentence explaining what you changed"
}
`;

      logger.info(`🤖 Generating enhanced prompt with Grok (${GROK_MODEL})...`);

      let responseText = '';
      if (openrouterClient) {
        const completion = await openrouterClient.chat.completions.create({
          model: GROK_MODEL,
          messages: [
            { role: 'system', content: 'You are an expert prompt engineer for AI image generation. Always reply with a single JSON object — no prose before or after.' },
            { role: 'user', content: metaPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.85,
          max_tokens: 2048,
        });
        responseText = completion.choices[0]?.message?.content || '';
      } else if (this.ai) {
        // Fallback to Gemini if OpenRouter isn't configured
        logger.warn('⚠️ OpenRouter not configured; falling back to Gemini for AI Enhance');
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: metaPrompt,
        });
        responseText = response.text || '';
      } else {
        throw new Error('No AI provider configured for prompt enhancement');
      }
      
      // Try to parse as JSON, fallback to structured text if needed
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          let enhancedPrompt = (parsed.enhancedPrompt || parsed.positive_prompt || parsed.prompt || '').trim();
          let negativePrompt = (parsed.negativePrompt || parsed.negative_prompt || '').trim();

          ({ enhancedPrompt, negativePrompt } = this.applyAgeSafetyGuards(enhancedPrompt, negativePrompt));

          return {
            enhancedPrompt,
            negativePrompt,
            explanation: parsed.explanation || 'Enhanced with AI suggestions'
          };
        }
      } catch (e) {
        logger.info('Could not parse JSON, extracting from text...');
      }

      // Fallback: extract from structured text
      const lines = responseText.split('\n');
      let enhancedPrompt = '';
      let negativePrompt = '';
      let explanation = 'Enhanced with AI suggestions';

      let currentSection = '';
      for (const line of lines) {
        const clean = line.trim();
        if (clean.toLowerCase().includes('enhanced') || clean.toLowerCase().includes('positive')) {
          currentSection = 'positive';
        } else if (clean.toLowerCase().includes('negative')) {
          currentSection = 'negative';
        } else if (clean.toLowerCase().includes('explanation')) {
          currentSection = 'explanation';
        } else if (clean && !clean.startsWith('#') && !clean.startsWith('-')) {
          if (currentSection === 'positive') enhancedPrompt += clean + ' ';
          else if (currentSection === 'negative') negativePrompt += clean + ' ';
          else if (currentSection === 'explanation') explanation = clean;
        }
      }

      let finalPrompt = enhancedPrompt.trim() || (request.currentPrompt || '').trim();
      let finalNegativePrompt = negativePrompt.trim();

      ({ enhancedPrompt: finalPrompt, negativePrompt: finalNegativePrompt } =
        this.applyAgeSafetyGuards(finalPrompt, finalNegativePrompt));

      return {
        enhancedPrompt: finalPrompt,
        negativePrompt: finalNegativePrompt.trim(),
        explanation
      };

    } catch (error) {
      logger.error('Error generating enhanced prompt:', error);
      throw new Error('Failed to generate enhanced prompt. Please try again.');
    }
  }

  /**
   * Self-learning step. Given the prompt the user just enhanced and their
   * existing taste profile, ask Grok to produce an updated profile that captures
   * the durable styles and physical attributes this user tends to like. Called
   * every time the user presses Enhance. Never throws — on any failure it
   * returns the existing profile (with the enhance counter bumped) so the enhance
   * flow is never blocked by a learning error.
   */
  async updateLearnedProfile(
    currentPrompt: string,
    existing: LearnedStyleProfile | null | undefined,
  ): Promise<LearnedStyleProfile | null> {
    const base: LearnedStyleProfile = {
      styles: existing?.styles ?? [],
      physicalAttributes: existing?.physicalAttributes ?? [],
      themes: existing?.themes ?? [],
      avoid: existing?.avoid ?? [],
      enhanceCount: existing?.enhanceCount ?? 0,
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
    };

    // Learning needs Grok and a non-empty prompt to extract new signal. If
    // either is missing there's nothing to learn from, but we still record that
    // an enhance happened so the profile reflects every press.
    if (!openrouterClient || !currentPrompt || !currentPrompt.trim()) {
      return { ...base, enhanceCount: base.enhanceCount + 1, updatedAt: new Date().toISOString() };
    }

    const norm = (arr: unknown): string[] =>
      Array.from(new Set(
        (Array.isArray(arr) ? arr : [])
          .map((s) => String(s).trim().toLowerCase())
          .filter(Boolean),
      )).slice(0, 15);

    try {
      const learnPrompt = `Existing taste profile (may be empty):
${JSON.stringify({ styles: base.styles, physicalAttributes: base.physicalAttributes, themes: base.themes, avoid: base.avoid })}

The user just clicked "Enhance" on this image prompt:
"""${currentPrompt.trim()}"""

Update the taste profile to reflect what this user appears to like, combining the new prompt with the existing profile. Capture durable preferences, not one-off subjects.
- styles: art styles, lighting, mood, rendering, composition, camera framing the user favors
- physicalAttributes: recurring hair/body/face/feature preferences of the depicted person
- themes: recurring settings, outfits, scenarios
- avoid: things the user clearly dislikes (keep short; strong signals only)

Rules:
- Merge with the existing profile; keep prior entries unless they clearly no longer apply.
- Each list: concise, max 15 short lowercase tags, most important first, deduplicated.
- Do not include the one-off literal subject of a single prompt unless it's clearly recurring.
- Never include minors/underage terms in any list.

Return a single JSON object: {"styles":[],"physicalAttributes":[],"themes":[],"avoid":[]}`;

      const completion = await openrouterClient.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: 'system', content: 'You analyze image prompts and maintain a compact JSON taste profile for one user. Reply with a single JSON object only — no prose.' },
          { role: 'user', content: learnPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      });

      const text = completion.choices[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return { ...base, enhanceCount: base.enhanceCount + 1, updatedAt: new Date().toISOString() };
      }
      const parsed = JSON.parse(match[0]);
      return {
        styles: norm(parsed.styles),
        physicalAttributes: norm(parsed.physicalAttributes),
        themes: norm(parsed.themes),
        avoid: norm(parsed.avoid),
        enhanceCount: base.enhanceCount + 1,
        updatedAt: new Date().toISOString(),
      };
    } catch (e) {
      logger.error('⚠️ Failed to update learned style profile:', e);
      return { ...base, enhanceCount: base.enhanceCount + 1, updatedAt: new Date().toISOString() };
    }
  }
}

export const geminiService = new GeminiService();