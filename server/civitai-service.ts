import { Model, InsertModel, SanitizationRule } from "@shared/schema";
import { logger } from "./logger";
import { storage } from "./storage";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Civitai } = require("civitai");

// Scheduler mapping: UI-friendly names -> CivitAI API values (PascalCase)
// Based on official CivitAI API documentation
const SCHEDULER_MAPPING: { [key: string]: string } = {
  // Euler family
  'Euler': 'Euler',
  'Euler a': 'EulerA',
  
  // DPM++ family - note: these map to DPM2 variants in API
  'DPM++ 2M': 'DPM2M',
  'DPM++ 2M Karras': 'DPM2MKarras',
  'DPM++ 2M SDE': 'DPMSDE',
  'DPM++ 2M SDE Karras': 'DPMSDEKarras',
  'DPM++ 2S a': 'DPM2SA',
  'DPM++ 2S a Karras': 'DPM2SAKarras',
  'DPM++ 3M SDE': 'DPMSDE', // Map to DPMSDE
  'DPM++ SDE': 'DPMSDE',
  'DPM++ SDE Karras': 'DPMSDEKarras',
  
  // DPM2 family
  'DPM2': 'DPM2',
  'DPM2 a': 'DPM2A',
  'DPM2 Karras': 'DPM2Karras',
  'DPM2 a Karras': 'DPM2AKarras',
  'DPM Fast': 'DPMFast',
  'DPM Adaptive': 'DPMAdaptive',
  
  // Other samplers
  'Heun': 'Heun',
  'DDIM': 'DDIM',
  'UniPC': 'UniPC',
  'UniPC BH2': 'UniPC', // Map to UniPC
  'LCM': 'LCM',
  'DEIS': 'DEIS',
  'IPNDM_V': 'DDIM', // Map to DDIM as fallback
  
  // Legacy mappings for backwards compatibility
  'LMS': 'LMS',
  'PLMS': 'PLMS',
  'Momentum': 'DPM2M',
};

// Helper function to convert UI scheduler to CivitAI scheduler
function convertSchedulerToCivitAI(uiScheduler: string): string {
  const mapped = SCHEDULER_MAPPING[uiScheduler];
  if (mapped) {
    logger.info(`🔄 Scheduler mapping: "${uiScheduler}" -> "${mapped}"`);
    return mapped;
  }
  logger.info(`⚠️ Unknown scheduler "${uiScheduler}", using default "EulerA"`);
  return 'EulerA'; // Default fallback (PascalCase)
}

export interface CivitAIModel {
  id: number;
  name: string;
  description?: string;
  type: string;
  stats: {
    downloadCount: number;
    rating: number;
    ratingCount: number;
  };
  modelVersions: Array<{
    id: number;
    name: string;
    baseModel?: string;
    files: Array<{
      name: string;
      type: string;
      metadata?: {
        fp?: string;
        size?: string;
        format?: string;
      };
    }>;
    images: Array<{
      url: string;
      type: string;
      nsfw: boolean;
      width: number;
      height: number;
    }>;
  }>;
  tags: string[];
  creator: {
    username: string;
  };
}

export interface CivitAIGenerationRequest {
  model: string;
  baseModel?: string;
  params: {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    scheduler?: string;
    clipSkip?: number;
    seed?: number;
    loras?: Array<{id: string; strength: number}>;
    // Image-to-image specific parameters
    image?: string; // Base64 encoded image or URL
    denoiseStrength?: number; // For img2img - how much to change from original image
  };
  generationType?: "txt2img" | "img2img";
  batchSize?: number;
  callbackUrl?: string;
}

function mapBaseModelToApiValue(baseModel: string | null | undefined): string {
  if (!baseModel) return "SD_1_5";
  const b = baseModel.toLowerCase();
  if (b.includes("pony")) return "Pony";
  if (b.includes("sdxl")) return "SDXL_1_0";
  if (b.includes("flux")) return "Flux1";
  return "SD_1_5";
}

export interface CivitAIGenerationResponse {
  token: string;
  cost: number;
  jobs: Array<{
    jobId: string;
    cost: number;
  }>;
}

export interface CivitAIJobStatus {
  jobs: Array<{
    jobId: string;
    cost: number;
    result?: {
      available: boolean;
      blobKey?: string;
      url?: string;
    };
    scheduled: boolean;
    processing: boolean;
    complete: boolean;
    succeeded: boolean;
    failed: boolean;
    progress?: number;
  }>;
}

export class CivitAIService {
  private baseUrl = 'https://civitai.com/api/v1';
  private defaultApiKey: string;
  private client: any;

  constructor(apiKey?: string) {
    this.defaultApiKey = apiKey || process.env.CIVITAI_API_KEY || '';
    if (this.defaultApiKey) {
      this.client = new Civitai({ auth: this.defaultApiKey });
    }
  }

  // Create a client instance with user's API key
  private getClientForUser(userApiKey?: string): any {
    const apiKey = userApiKey || this.defaultApiKey;
    if (apiKey) {
      return userApiKey ? new Civitai({ auth: userApiKey }) : this.client;
    }
    return null;
  }

  // Get the appropriate API key for requests (user's key or default)
  private getApiKeyForUser(userApiKey?: string): string {
    return userApiKey || this.defaultApiKey || '';
  }

  async fetchModels(page = 1, limit = 50, types = ['Checkpoint', 'LORA', 'TextualInversion'], sort = 'Highest Rated', period = 'AllTime'): Promise<{
    items: CivitAIModel[];
    metadata: { totalItems: number; currentPage: number; pageSize: number; totalPages: number };
  }> {
    try {
      const typeParams = types.map(type => `types=${type}`).join('&');
      const url = `${this.baseUrl}/models?limit=${limit}&page=${page}&${typeParams}&sort=${sort}&period=${period}&nsfw=false`;
      
      logger.info(`Fetching models from CivitAI: ${url}`);
      
      const response = await fetch(url, {
        headers: this.defaultApiKey ? { 'Authorization': `Bearer ${this.defaultApiKey}` } : {},
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info(`Fetched ${data.items?.length || 0} models from CivitAI`);
      return data;
    } catch (error) {
      logger.error('Error fetching models from CivitAI:', error);
      // Return empty result on error
      return {
        items: [],
        metadata: { totalItems: 0, currentPage: 1, pageSize: limit, totalPages: 0 }
      };
    }
  }

  convertToModel(civitaiModel: CivitAIModel): Model {
    const latestVersion = civitaiModel.modelVersions?.[0];
    const modelType = civitaiModel.type.toLowerCase();
    
    // Generate ARN for the latest version using correct AIR base identifier
    const arnBase = (() => {
      const bm = (latestVersion?.baseModel || '').toLowerCase();
      if (bm.includes('pony')) return 'pony';
      if (bm.includes('sdxl')) return 'sdxl';
      if (bm.includes('flux')) return 'flux1';
      return 'sd1';
    })();
    const arn = latestVersion 
      ? `urn:air:${arnBase}:${modelType}:civitai:${civitaiModel.id}@${latestVersion.id}`
      : null;

    // Get cover image from the latest version (first non-NSFW image)
    const coverImage = latestVersion?.images?.find(img => !img.nsfw && img.type === 'image')?.url || null;

    // Extract activation words from trainedWords (preferred) or tags for LoRAs
    let activationWords: string[] = [];
    if (modelType === 'lora') {
      // First try trainedWords from the latest version (most accurate)
      const trainedWords = (latestVersion as any)?.trainedWords || [];
      if (trainedWords.length > 0) {
        activationWords = trainedWords;
      } else {
        // Fallback to filtered tags if no trainedWords
        activationWords = civitaiModel.tags.filter(tag => 
          !tag.startsWith('character:') && 
          !tag.startsWith('style:') && 
          !tag.startsWith('concept:') &&
          !tag.startsWith('clothing:') &&
          tag.length < 50 && // Allow longer activation phrases
          tag.length > 2     // Filter out very short tags
        );
      }
    }
    
    // Log only if we found activation words for debugging
    if (activationWords.length > 0) {
      logger.info(`🎯 Found ${activationWords.length} activation words for ${civitaiModel.name}:`, activationWords);
    }

    // LoRA strength range — allow the full -10 to +10 band; some LoRAs are
    // designed for extreme weights (sliders/detail LoRAs especially).
    const strengthMin = -1000; // -10.0 as int * 100
    const strengthMax = 1000;  // 10.0 as int * 100

    return {
      id: `civitai-${civitaiModel.id}`,
      name: civitaiModel.name,
      description: civitaiModel.description || null,
      status: "active",
      type: modelType,
      baseModel: latestVersion?.baseModel || null,
      rating: civitaiModel.stats.rating ? Math.round(civitaiModel.stats.rating * 10) : null,
      downloads: civitaiModel.stats.downloadCount || null,
      likes: null,
      views: null,
      creatorId: null,
      tags: civitaiModel.tags || null,
      civitaiId: civitaiModel.id.toString(),
      modelVersion: latestVersion?.name || 'v1',
      arn: arn,
      imageUrl: coverImage,
      strengthMin,
      strengthMax,
      activationWords: activationWords.length > 0 ? activationWords : null,
      isNSFW: false,
      featured: false,
      allowCommercialUse: null,
      allowDerivatives: null,
      allowDifferentLicense: null,
      loraCategory: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async fetchAndConvertModels(maxPages = 3, startPage = 1, sort = 'Highest Rated', period = 'AllTime'): Promise<Model[]> {
    const allModels: Model[] = [];
    
    try {
      // Fetch multiple pages to get a good variety of models
      for (let page = startPage; page <= startPage + maxPages - 1; page++) {
        const result = await this.fetchModels(page, 50, ['Checkpoint', 'LORA', 'TextualInversion'], sort, period);
        
        if (result.items.length === 0) {
          break; // No more models
        }

        const convertedModels = result.items.map(civitaiModel => this.convertToModel(civitaiModel));
        allModels.push(...convertedModels);

        // If we've reached the last page, break
        if (page >= result.metadata.totalPages) {
          break;
        }
      }

      logger.info(`Successfully converted ${allModels.length} models from CivitAI`);
      return allModels;
    } catch (error) {
      logger.error('Error fetching and converting models:', error);
      return [];
    }
  }

  // Content moderation helper functions
  public checkForUnderageContent(prompt: string): { hasViolation: boolean; details: string[] } {
    const violations: string[] = [];
    const lowerPrompt = prompt.toLowerCase();
    
    // SIMPLE AND DIRECT: Look for any number under 18 followed by age indicators
    // This will catch ALL variations including "16.6 yo", "petite,16.6 yo", etc.
    
    // First, find ALL occurrences of numbers followed by age indicators
    const simpleAgeRegex = /(\d+(?:\.\d+)?)\s*(?:yo|y\.?o\.?|year|yr)s?(?:\s*old)?/gi;
    const allAgeMatches = prompt.match(simpleAgeRegex) || [];
    
    // Check each match to see if the number is under 18
    const underageMatches = allAgeMatches.filter(match => {
      const numberMatch = match.match(/^(\d+(?:\.\d+)?)/); 
      if (numberMatch) {
        const age = parseFloat(numberMatch[1]);
        return age > 0 && age < 18;
      }
      return false;
    });
    
    if (underageMatches.length > 0) {
      violations.push(`Underage references detected: ${underageMatches.join(', ')}`);
    }
    
    // Check for spelled-out age references under 18
    const spelledAgeRegex = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\s+(?:year|yr)s?(?:\s*old)?\b/gi;
    const spelledMatches = prompt.match(spelledAgeRegex);
    if (spelledMatches) {
      violations.push(`Spelled-out age references under 18 detected: ${spelledMatches.join(', ')}`);
    }
    
    // Check for numbers that could be ages - but be smart about context
    // Only flag numbers that are clearly meant to be ages, not weight modifiers
    const potentialAgeRegex = /(\b(?:1[0-7](?:\.[0-9]+)?|[1-9](?:\.[0-9]+)?)\b)/gi;
    let match;
    const suspiciousNumbers = [];
    
    while ((match = potentialAgeRegex.exec(prompt)) !== null) {
      const number = match[1];
      const num = parseFloat(number);
      const startIndex = match.index;
      const endIndex = startIndex + number.length;
      
      // Get context around the number
      const beforeContext = prompt.substring(Math.max(0, startIndex - 10), startIndex).toLowerCase();
      const afterContext = prompt.substring(endIndex, Math.min(prompt.length, endIndex + 10)).toLowerCase();
      const fullContext = prompt.substring(Math.max(0, startIndex - 20), Math.min(prompt.length, endIndex + 20));
      
      // Skip if it's clearly a weight modifier
      if (fullContext.includes('(' + number + ')') || 
          fullContext.includes(': ' + number + ')') ||
          fullContext.includes('(' + beforeContext.slice(-10) + number) ||
          /\([^)]*?\d+\.\d+[^)]*?\)/i.test(fullContext)) {
        continue; // This is a weight modifier, skip it
      }
      
      // Only flag if followed by age indicators
      if (afterContext.match(/^\s*(?:yo|y\.?o\.?|years?\s*old|age)/i) && num >= 1 && num < 18) {
        suspiciousNumbers.push(number);
      }
    }
    
    if (suspiciousNumbers.length > 0) {
      violations.push(`Potential age numbers under 18 detected: ${suspiciousNumbers.join(', ')}`);
    }
    
    // Check for underage-related variations
    const underagePhraseRegex = /\b(?:young|younger|little|small|tiny|minor|underage|teen|teenage)\s+(?:girl|girls|female|females|woman|women)\b/gi;
    const underagePhraseMatches = prompt.match(underagePhraseRegex);
    if (underagePhraseMatches) {
      violations.push(`Underage references detected: ${underagePhraseMatches.join(', ')}`);
    }
    
    return {
      hasViolation: violations.length > 0,
      details: violations
    };
  }
  
  public sanitizeNegativePrompt(negativePrompt: string = ''): string {
    // Check if 'salt' is in the negative prompt (bypass keyword)
    if (negativePrompt.toLowerCase().includes('salt')) {
      return negativePrompt;
    }
    
    // Check if safety terms are already present
    const lowerNegative = negativePrompt.toLowerCase();
    const hasChild = lowerNegative.includes('child');
    const hasCSAM = lowerNegative.includes('csam');
    
    let sanitized = negativePrompt.trim();
    
    // Add missing safety terms
    if (!hasChild || !hasCSAM) {
      const safetyTerms = [];
      if (!hasChild) safetyTerms.push('child');
      if (!hasCSAM) safetyTerms.push('CSAM');
      
      if (sanitized) {
        // Split by commas to insert safety terms discretely
        const parts = sanitized.split(',').map(part => part.trim()).filter(part => part.length > 0);
        
        // Insert safety terms around the 8th comma position (or earlier if prompt is shorter)
        const insertPosition = Math.min(8, Math.max(2, parts.length));
        
        // Insert each safety term separately to blend in naturally
        safetyTerms.forEach((term, index) => {
          parts.splice(insertPosition + index, 0, term);
        });
        
        sanitized = parts.join(', ');
      } else {
        // If no existing negative prompt, just add the safety terms
        sanitized = safetyTerms.join(', ');
      }
    }
    
    return sanitized;
  }
  
  public sanitizePromptAges(prompt: string): string {
    let sanitized = prompt;
    
    // EXCLUDE FRACTIONS: First, protect fractions like "3/4", "1/2" by temporarily replacing them
    const fractionMap = new Map();
    let fractionCounter = 0;
    
    // Protect common photography fractions
    sanitized = sanitized.replace(/\b(\d+\/\d+)\s+(body|shot|pose|portrait|frame)/gi, (match, fraction, term) => {
      const placeholder = `__FRACTION_${fractionCounter}__`;
      fractionMap.set(placeholder, match);
      fractionCounter++;
      return placeholder;
    });
    
    // NOW FIND AGE INDICATORS: More precise pattern for legitimate age references only
    // This pattern requires proper word boundaries and specific age format
    sanitized = sanitized.replace(/\b(\d+(?:\.\d+)?)\s*(?:yo\b|y\.?o\.?\b|years?\s+old\b|yrs?\s+old\b|\byear\b|\byr\b)/gi, (match, numberStr) => {
      const age = parseFloat(numberStr);
      if (age > 0 && age < 18) {
        return '18 years old';
      }
      return match; // Keep original if 18 or over
    });
    
    // RESTORE FRACTIONS: Put back the protected fractions
    fractionMap.forEach((original, placeholder) => {
      sanitized = sanitized.replace(placeholder, original);
    });
    
    // NEW: Handle indirect age references like "looks 13", "appears 15", "seems like she is 16"
    sanitized = sanitized.replace(/\b(?:looks?|appears?|seems?)\s+(?:like\s+(?:she\s+is\s+|he\s+is\s+|they\s+are\s+)?)?(\d+(?:\.\d+)?)\b/gi, (match, numberStr) => {
      const age = parseFloat(numberStr);
      if (age > 0 && age < 18) {
        return 'looks 18+';
      }
      return match;
    });
    
    // NEW: Handle "looks like she is X" or "appears to be X" variations
    sanitized = sanitized.replace(/\b(?:looks?|appears?|seems?)\s+(?:like\s+(?:she|he|they)\s+(?:is|are)\s+|to\s+be\s+)(\d+(?:\.\d+)?)/gi, (match, numberStr) => {
      const age = parseFloat(numberStr);
      if (age > 0 && age < 18) {
        return 'looks like an 18+ adult';
      }
      return match;
    });
    
    // Replace spelled-out ages under 18 with "eighteen"
    const ageReplacements: Record<string, string> = {
      'one': 'eighteen',
      'two': 'eighteen',
      'three': 'eighteen', 
      'four': 'eighteen',
      'five': 'eighteen',
      'six': 'eighteen',
      'seven': 'eighteen',
      'eight': 'eighteen',
      'nine': 'eighteen',
      'ten': 'eighteen',
      'eleven': 'eighteen',
      'twelve': 'eighteen',
      'thirteen': 'eighteen',
      'fourteen': 'eighteen',
      'fifteen': 'eighteen',
      'sixteen': 'eighteen',
      'seventeen': 'eighteen'
    };
    
    Object.entries(ageReplacements).forEach(([young, adult]) => {
      const regex = new RegExp(`\\b${young}\\s+(?:year|yr)s?(?:\\s*old)?\\b`, 'gi');
      sanitized = sanitized.replace(regex, `${adult} years old`);
      
      // NEW: Handle spelled-out indirect references like "looks thirteen" or "appears fifteen"
      const indirectRegex = new RegExp(`\\b(?:looks?|appears?|seems?)\\s+(?:like\\s+(?:she|he|they)\\s+(?:is|are)\\s+)?${young}\\b`, 'gi');
      sanitized = sanitized.replace(indirectRegex, 'looks 18+');
    });
    
    // Replace standalone numbers under 18 that could be ages
    sanitized = sanitized.replace(/(\b(?:1[0-7](?:\.[0-9]+)?|[1-9](?:\.[0-9]+)?)\b)(?=\s*(?:yo|y\.?o\.?|and|,|\s|$))/gi, (match) => {
      const num = parseFloat(match);
      if (num >= 1 && num < 18) {
        return '18';
      }
      return match;
    });
    
    // Remove banned words completely from prompt: young, younger, moe, cute, innocent, baby
    sanitized = sanitized.replace(/\b(?:young|younger|moe|cute|innocent|baby)\b,?\s*/gi, '');
    
    // Replace "child" or "children" with "18yo"
    sanitized = sanitized.replace(/\bchildren\b/gi, '18yo');
    sanitized = sanitized.replace(/\bchild\b/gi, '18yo');
    
    // Replace youthful and teen with 18yo
    sanitized = sanitized.replace(/\b(?:youthful|youthfull|teen)\b/gi, '18yo');
    
    // Replace flat breasts/tits/chested variations with Small_Breasts
    sanitized = sanitized.replace(/\bflat[_\s-]?breasts?\b/gi, 'Small_Breasts');
    sanitized = sanitized.replace(/\bflat[_\s-]?tits?\b/gi, 'Small_Breasts');
    sanitized = sanitized.replace(/\bflat[_\s-]?chested?\b/gi, 'Small_Breasts');
    
    // Clean up any double commas or leading/trailing commas from removed words
    sanitized = sanitized.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '');
    
    // Replace underage-related variations with "18+ adult"
    sanitized = sanitized.replace(/\b(?:little|small|tiny|minor|underage|teen|teenage)\s+(?:girl|girls)\b/gi, '18+ adult women');
    sanitized = sanitized.replace(/\b(?:little|small|tiny|minor|underage|teen|teenage)\s+(?:female|females)\b/gi, '18+ adult women');
    sanitized = sanitized.replace(/\b(?:little|small|tiny|minor|underage|teen|teenage)\s+(?:woman|women)\b/gi, '18+ adult women');
    
    // NEW RULE: If no age is specified at all, add "18yo" to the prompt
    const hasAgeIndicator = /\b(?:\d+(?:\.\d+)?)\s*(?:yo|y\.?o\.?|y\s+old|year|yr)s?(?:\s*old)?|(?:looks?|appears?|seems?)\s+(?:\d+|eighteen|nineteen|twenty|thirty|forty|fifty)|eighteen|nineteen|twenty|thirty|forty|fifty\b/gi.test(sanitized);
    
    logger.info(`🔍 AGE DEBUG: hasAgeIndicator = ${hasAgeIndicator} for prompt: "${sanitized.substring(0, 100)}..."`);
    
    if (!hasAgeIndicator) {
      logger.info('🎯 AGE DEBUG: No age found, adding 18yo');
      // Add "18yo" after the first comma if there are commas, otherwise at the end
      const parts = sanitized.split(',').map(part => part.trim()).filter(part => part.length > 0);
      if (parts.length > 1) {
        // Insert after first element to maintain natural flow
        parts.splice(1, 0, '18yo');
        sanitized = parts.join(', ');
      } else {
        // No commas, just append at the end
        sanitized = sanitized.trim() + ', 18yo';
      }
      logger.info(`✅ AGE DEBUG: Added 18yo, result: "${sanitized.substring(0, 100)}..."`);
    } else {
      logger.info('🚫 AGE DEBUG: Age indicator found, not adding 18yo');
    }
    
    return sanitized;
  }

  // Apply database-driven sanitization rules to positive prompt
  public async applyPositivePromptRules(prompt: string): Promise<string> {
    try {
      const rules = await storage.getEnabledSanitizationRules();
      let sanitized = prompt;
      
      // Apply removal rules (positive_remove)
      const removeRules = rules.filter(r => r.ruleType === 'positive_remove');
      for (const rule of removeRules) {
        const regex = new RegExp(`\\b${this.escapeRegex(rule.pattern)}\\b`, 'gi');
        const before = sanitized;
        sanitized = sanitized.replace(regex, '').replace(/,\s*,/g, ',').replace(/^\s*,|,\s*$/g, '').trim();
        if (before !== sanitized) {
          logger.info(`🧹 Removed "${rule.pattern}" from prompt`);
        }
      }
      
      // Apply replacement rules (positive_replace)
      const replaceRules = rules.filter(r => r.ruleType === 'positive_replace');
      logger.info(`🔄 DB Rules: Found ${replaceRules.length} positive_replace rules`);
      for (const rule of replaceRules) {
        if (rule.replacement) {
          // Normalize pattern to match spaces, hyphens, and underscores interchangeably
          const normalizedPattern = this.escapeRegex(rule.pattern).replace(/[ _-]/g, '[ _-]');
          const regex = new RegExp(`\\b${normalizedPattern}\\b`, 'gi');
          logger.info(`🔍 Testing pattern "${rule.pattern}" -> regex: ${regex} against prompt`);
          const before = sanitized;
          sanitized = sanitized.replace(regex, rule.replacement);
          if (before !== sanitized) {
            logger.info(`🔄 Replaced "${rule.pattern}" with "${rule.replacement}" in prompt`);
          }
        }
      }
      
      return sanitized;
    } catch (error) {
      logger.error('Error applying positive prompt rules:', error);
      return prompt; // Return original on error
    }
  }

  // Apply database-driven sanitization rules to negative prompt
  public async applyNegativePromptRules(negativePrompt: string): Promise<string> {
    try {
      const rules = await storage.getEnabledSanitizationRules();
      logger.info(`🔍 DB Rules: Found ${rules.length} total rules, ${rules.filter(r => r.ruleType === 'negative_add').length} negative_add rules`);
      let sanitized = negativePrompt.trim();
      
      // Add required terms (negative_add)
      const addRules = rules.filter(r => r.ruleType === 'negative_add');
      const lowerNegative = sanitized.toLowerCase();
      const termsToAdd: string[] = [];
      
      for (const rule of addRules) {
        if (!lowerNegative.includes(rule.pattern.toLowerCase())) {
          termsToAdd.push(rule.pattern);
        }
      }
      
      if (termsToAdd.length > 0) {
        if (sanitized) {
          const parts = sanitized.split(',').map(p => p.trim()).filter(p => p.length > 0);
          const insertPosition = Math.min(8, Math.max(2, parts.length));
          termsToAdd.forEach((term, index) => {
            parts.splice(insertPosition + index, 0, term);
          });
          sanitized = parts.join(', ');
        } else {
          sanitized = termsToAdd.join(', ');
        }
        logger.info(`🛡️ Added safety terms to negative prompt: ${termsToAdd.join(', ')}`);
      }
      
      return sanitized;
    } catch (error) {
      logger.error('Error applying negative prompt rules:', error);
      return negativePrompt; // Return original on error
    }
  }

  // Helper to escape regex special characters
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async generateImage(request: CivitAIGenerationRequest, userApiKey?: string): Promise<any> {
    const client = this.getClientForUser(userApiKey);
    if (!client) {
      throw new Error('CivitAI client not initialized - API key required');
    }

    // CRITICAL SAFETY CHECK: Validate prompt content
    const contentCheck = this.checkForUnderageContent(request.params.prompt);
    if (contentCheck.hasViolation) {
      const errorMessage = `Content policy violation detected. Generation blocked. Details: ${contentCheck.details.join('; ')}`;
      logger.error('🚫 Content Policy Violation:', errorMessage);
      throw new Error(errorMessage);
    }
    
    // SAFETY MEASURE: Sanitize ages in prompt (replace under 18 with 18)
    const originalPrompt = request.params.prompt;
    request.params.prompt = this.sanitizePromptAges(request.params.prompt);
    if (originalPrompt !== request.params.prompt) {
      logger.info('⚠️ Ages in prompt sanitized for safety compliance');
    }
    
    // Apply database-driven sanitization rules to positive prompt
    request.params.prompt = await this.applyPositivePromptRules(request.params.prompt);
    
    // SAFETY MEASURE: Inject safety terms into negative prompt (hardcoded fallback)
    const originalNegativePrompt = request.params.negativePrompt || '';
    request.params.negativePrompt = this.sanitizeNegativePrompt(request.params.negativePrompt);
    
    // Apply database-driven sanitization rules to negative prompt
    request.params.negativePrompt = await this.applyNegativePromptRules(request.params.negativePrompt || '');
    
    if (originalNegativePrompt !== request.params.negativePrompt) {
      logger.info('🛡️ Safety terms added to negative prompt for content protection');
    }

    logger.info(`🎨 Submitting ${request.generationType || 'txt2img'} generation request to CivitAI SDK: ${JSON.stringify(request, null, 2)}`);
    
    try {
      // Build additionalNetworks for LoRAs if present
      const additionalNetworks: any = {};
      if (request.params.loras && request.params.loras.length > 0) {
        request.params.loras.forEach((lora) => {
          // The lora.id should be the ARN from the database (e.g., urn:air:sd1:lora:civitai:123@456)
          additionalNetworks[lora.id] = {
            strength: lora.strength
          };
        });
        logger.info(`🔍 Built additionalNetworks for ${request.params.loras.length} LoRAs:`, additionalNetworks);
      }

      // Validate and fix parameters before sending to CivitAI
      // cfgScale range: 1-20 (typical range for Stable Diffusion)
      // dimensions: allow up to 1536 for portrait/landscape images
      const safeCfgScale = Math.max(1, Math.min(20, request.params.cfgScale || 7));
      const safeSteps = Math.max(1, Math.min(150, request.params.steps || 30));
      const safeWidth = Math.max(512, Math.min(1536, request.params.width || 832));
      const safeHeight = Math.max(512, Math.min(1536, request.params.height || 1216));
      
      logger.info(`🔍 Parameter validation - cfgScale: ${request.params.cfgScale} → ${safeCfgScale}, steps: ${request.params.steps} → ${safeSteps}`);
      logger.info(`🔍 Parameter validation - dimensions: ${request.params.width}x${request.params.height} → ${safeWidth}x${safeHeight}`);

      // Create the generation request using CivitAI SDK
      // Include baseModel explicitly so the SDK's Object.assign uses our value
      // instead of its hardcoded heuristic (which only knows SD_1_5 and SDXL).
      const resolvedBaseModel = mapBaseModelToApiValue(request.baseModel);
      logger.info(`🔍 baseModel: "${request.baseModel}" → API value: "${resolvedBaseModel}"`);
      const input = {
        model: request.model,
        baseModel: resolvedBaseModel,
        params: {
          prompt: request.params.prompt,
          negativePrompt: request.params.negativePrompt,
          width: safeWidth,
          height: safeHeight,
          steps: safeSteps,
          cfgScale: safeCfgScale,
          scheduler: convertSchedulerToCivitAI(request.params.scheduler || "Euler"),
          clipSkip: Math.max(1, Math.min(12, request.params.clipSkip || 2)),
          seed: request.params.seed && request.params.seed > 0 ? request.params.seed : undefined,
          // Image-to-image specific parameters
          ...(request.params.image && { image: request.params.image }),
          ...(request.generationType === 'img2img' && request.params.denoiseStrength && { denoiseStrength: request.params.denoiseStrength }),
        },
        batchSize: Math.max(1, Math.min(12, request.batchSize || 1)), // Limit to 12 for multiple generations
        // Add additionalNetworks at the top level, NOT inside params
        ...(Object.keys(additionalNetworks).length > 0 && { additionalNetworks })
      };

      // CivitAI API currently only supports text-to-image generation
      let response;
      if (request.generationType === 'img2img') {
        logger.info('❌ Image-to-image not supported by CivitAI API');
        throw new Error('Image-to-Image generation is not currently supported by CivitAI API. Please use Text-to-Image instead.');
      } else {
        logger.info('📝 Using text-to-image generation');
        response = await client.image.fromText(input, false);
      }
      
      logger.info(`✅ CivitAI generation submitted successfully:`, response);
      
      return response;
    } catch (error) {
      logger.error('🚨 Error submitting generation to CivitAI SDK:', error);
      logger.error('🔍 Full error details:', JSON.stringify(error, null, 2));
      logger.error('🔍 Request that failed: Error occurred during generation submission');
      
      // Enhanced error handling for API key issues
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid api key') || errorMessage.includes('403')) {
          throw new Error('Invalid CivitAI API key. Please check your API key in Settings or use the platform API key (12 credits per image).');
        } else if (errorMessage.includes('insufficient balance') || errorMessage.includes('quota')) {
          throw new Error('Insufficient CivitAI credits or quota exceeded. Please check your CivitAI account or use the platform API key.');
        } else if (errorMessage.includes('rate limit')) {
          throw new Error('CivitAI API rate limit exceeded. Please wait a moment before trying again or use the platform API key.');
        } else if (errorMessage.includes('bad request') || errorMessage.includes('400')) {
          // Try to extract more specific error details
          logger.error('🚨 Bad Request error - checking parameters:');
          logger.error('  Model ARN:', request.model);
          logger.error('  Prompt length:', request.params.prompt.length);
          logger.error('  Parameters: Error occurred during parameter processing');
          throw new Error('Invalid request parameters. Please check your model selection and generation settings.');
        } else if (errorMessage.includes('internal server error') || errorMessage.includes('500')) {
          throw new Error('CivitAI service is experiencing technical difficulties. Please try again in a few moments or try with a different model/LoRA combination.');
        }
      }
      
      throw error;
    }
  }

  async getJobStatus(token: string, userApiKey?: string): Promise<any> {
    const apiKey = userApiKey || this.defaultApiKey;
    if (!apiKey) {
      throw new Error('CivitAI API key required for job status check');
    }

    try {
      const url = `https://orchestration.civitai.com/v1/consumer/jobs?token=${encodeURIComponent(token)}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const err: any = new Error(response.statusText || 'Bad Request');
        err.status = response.status;
        err.statusText = response.statusText;
        err.body = body;
        err.url = url;
        err.request = { method: 'GET', url: '/v1/consumer/jobs', query: { token } };
        err.errors = { [String(response.status)]: response.statusText };
        throw err;
      }

      const data = await response.json();
      logger.info(`📊 Job status check for ${token}:`, data);
      return data;
    } catch (error) {
      logger.error('Error getting job status from CivitAI SDK:', error);
      throw error;
    }
  }

  /**
   * Fetch a specific model version by its CivitAI version ID and assemble a
   * Model record using the caller-supplied AIR URN verbatim. This lets admins
   * add any historic version of a model, not just the latest.
   *
   * CivitAI version endpoint: GET /v1/model-versions/{versionId}
   * Returns: { id, modelId, name, baseModel, trainedWords, images, … }
   */
  async fetchModelVersion(versionId: number, sourceArn: string): Promise<Model | null> {
    try {
      logger.info(`Fetching model version ${versionId} from CivitAI`);

      // Step 1 — fetch the version record directly
      const versionUrl = `${this.baseUrl}/model-versions/${versionId}`;
      const versionRes = await fetch(versionUrl, {
        headers: {
          'User-Agent': 'CiviVerse-App/1.0',
          ...(this.defaultApiKey ? { 'Authorization': `Bearer ${this.defaultApiKey}` } : {}),
        },
      });
      if (!versionRes.ok) {
        if (versionRes.status === 404) return null;
        throw new Error(`model-versions endpoint HTTP ${versionRes.status}`);
      }
      const version = await versionRes.json();

      // Parse the modelId that the caller declared in the ARN and cross-check it
      // against what CivitAI actually returned for this versionId.  A mismatch means
      // the ARN is semantically invalid (e.g. a real versionId but for a different model).
      const arnModelIdMatch = sourceArn.match(/civitai:(\d+)@/);
      const declaredModelId = arnModelIdMatch ? arnModelIdMatch[1] : null;
      if (!declaredModelId || String(version.modelId) !== declaredModelId) {
        logger.warn(
          `ARN model ID mismatch: ARN says ${declaredModelId} but version ${versionId} belongs to model ${version.modelId}`
        );
        return null; // caller will receive 404 — "not found at this ARN"
      }

      // Step 2 — fetch the parent model record (for name, type, stats, tags)
      const modelUrl = `${this.baseUrl}/models/${version.modelId}`;
      const modelRes = await fetch(modelUrl, {
        headers: {
          'User-Agent': 'CiviVerse-App/1.0',
          ...(this.defaultApiKey ? { 'Authorization': `Bearer ${this.defaultApiKey}` } : {}),
        },
      });
      if (!modelRes.ok) {
        if (modelRes.status === 404) return null;
        throw new Error(`models endpoint HTTP ${modelRes.status}`);
      }
      const parentModel = await modelRes.json();

      const modelType = (parentModel.type || 'checkpoint').toLowerCase();

      // The ARN's TYPE segment drives generation routing — a `diffusionmodel` AIR
      // goes down the comfy path with the weights attached, a `checkpoint` AIR does
      // not. Admins routinely paste the wrong segment, and the old code stored
      // whatever was supplied verbatim, so the mistake only surfaced at generation
      // time (or worse, silently rendered a different model). Derive it from the
      // version's actual file types instead of trusting the input.
      const versionFiles: any[] = Array.isArray(version.files) ? version.files : [];
      const hasDiffusionModelFile = versionFiles.some(
        (f: any) => String(f?.type || '').toLowerCase().replace(/\s+/g, '') === 'diffusionmodel'
      );
      const derivedTypeSegment = hasDiffusionModelFile
        ? 'diffusionmodel'
        : modelType === 'lora' || modelType === 'locon' || modelType === 'lycoris'
        ? 'lora'
        : 'checkpoint';
      const suppliedTypeSegment = sourceArn.match(/^urn:air:[^:]+:([^:]+):/)?.[1] ?? null;
      const correctedArn = sourceArn.replace(
        /^(urn:air:[^:]+:)[^:]+(:)/,
        `$1${derivedTypeSegment}$2`
      );
      if (suppliedTypeSegment && suppliedTypeSegment !== derivedTypeSegment) {
        logger.warn(
          `🔧 ARN type segment corrected: "${suppliedTypeSegment}" → "${derivedTypeSegment}" ` +
          `for version ${versionId} (files: ${versionFiles.map((f: any) => f?.type).join(', ') || 'none'})`
        );
      }

      const coverImage =
        (version.images as any[])?.find((img: any) => !img.nsfw && img.type === 'image')?.url ??
        null;
      const activationWords: string[] =
        (version.trainedWords as string[]) ?? [];

      logger.info(
        `✅ Fetched version ${versionId}: "${parentModel.name} (${version.name})" [${modelType}]`
      );

      return {
        id: `civitai-${parentModel.id}`, // transient — replaced by UUID in createModel
        name: `${parentModel.name} (${version.name})`,
        description: parentModel.description || null,
        status: 'active',
        type: modelType,
        baseModel: version.baseModel || null,
        rating: parentModel.stats?.rating
          ? Math.round(parentModel.stats.rating * 10)
          : null,
        downloads: parentModel.stats?.downloadCount || null,
        likes: null,
        views: null,
        creatorId: null,
        tags: parentModel.tags || null,
        civitaiId: parentModel.id.toString(),
        modelVersion: version.name || 'v1',
        arn: correctedArn, // type segment derived from the version's file types
        imageUrl: coverImage,
        strengthMin: -1000,
        strengthMax: 1000,
        activationWords: activationWords.length > 0 ? activationWords : null,
        isNSFW: false,
        featured: false,
        allowCommercialUse: null,
        allowDerivatives: null,
        allowDifferentLicense: null,
        loraCategory: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Model;
    } catch (error) {
      logger.error('Error fetching model version from CivitAI:', error);
      throw error;
    }
  }

  // Fetch a specific model by ID
  async fetchSpecificModel(modelId: number): Promise<Model | null> {
    try {
      logger.info(`Fetching specific model from CivitAI: ${modelId}`);
      const url = `${this.baseUrl}/models/${modelId}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CiviVerse-App/1.0',
          ...(this.defaultApiKey ? { 'Authorization': `Bearer ${this.defaultApiKey}` } : {})
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          return null; // Model not found
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const modelData = await response.json();
      logger.info(`Found model: ${modelData.name} (${modelData.type})`);
      
      // Convert to our format
      const convertedModel = this.convertToModel(modelData);
      
      return convertedModel;
    } catch (error) {
      logger.error('Error fetching specific model from CivitAI:', error);
      throw error;
    }
  }
}

export const civitaiService = new CivitAIService();