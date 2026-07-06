// Diffus fixed model name - cannot be changed when Diffus provider is selected
export const DIFFUS_MODEL_NAME = "cyberrealisticPony_v127Alt.safetensors";

// Quality improvement words organized by category
export const qualityWords = {
  masterworks: [
    'masterpiece', 'best quality', 'highest quality', 'ultra high res', 'photorealistic',
    'ultra detailed', 'extremely detailed', 'highly detailed', 'intricate details',
    'sharp focus', 'professional', 'award winning', 'studio quality'
  ],
  artistic: [
    'artstation', 'concept art', 'digital painting', 'matte painting', 'illustration',
    'trending on artstation', 'featured on pixiv', 'deviantart masterpiece',
    'fine art', 'gallery worthy', 'museum quality', 'artistic masterpiece'
  ],
  technical: [
    '8k uhd', '4k uhd', 'HDR', 'ray tracing', 'global illumination', 'volumetric lighting',
    'subsurface scattering', 'physically based rendering', 'unreal engine 5',
    'octane render', 'cycles render', 'blender cycles', 'arnold render'
  ],
  photographic: [
    'photography', 'photo', 'realistic', 'lifelike', 'natural lighting',
    'professional photography', 'studio lighting', 'cinematic lighting',
    'golden hour', 'soft lighting', 'dramatic lighting', 'perfect exposure'
  ],
  enhancement: [
    'detailed', 'intricate', 'elaborate', 'ornate', 'complex', 'sophisticated',
    'refined', 'polished', 'pristine', 'flawless', 'perfect', 'immaculate',
    'crisp', 'clean', 'vivid', 'vibrant', 'rich colors', 'saturated'
  ]
};

// Quick tags state with localStorage persistence
export const defaultTags = [
  "score_9, score_8_up, score_7_up, masterpiece, ultra-HD, cinematic lighting, photorealistic, impressionism (1.5), high detail, depth of field, (blurred background), (dramatic lighting), masterpiece, best quality, very aesthetic, 8k, masterpiece, ultra-HD, cinematic lighting, high detail, depth of field, soft reflections, amazing composition, ((extreme close up)), catalog photo",
  "pink panties", "deep_cameltoe", "gushing pussy", "1boy", "2boys", "3boys", "veiny penis",
  "large veiny penis", "panties_pulled_to_side", "medium_perky_tits", "erect nipples", "hairy_pussy", "pre_cum",
  "mouth_open", "eyes_closed", "medium_breasts", "athletic", "petite", "collarbone", "small_ass", "fucking",
  "blow_job", "cow_girl_sex", "missionary_sex", "doggy_style_sex", "angry", "Magazine_cover", "low_angle",
  "looking down", "thigh_gap"
];

// Map long tags to display labels
export const tagLabels: Record<string, string> = {
  "score_9, score_8_up, score_7_up, masterpiece, ultra-HD, cinematic lighting, photorealistic, impressionism (1.5), high detail, depth of field, (blurred background), (dramatic lighting), masterpiece, best quality, very aesthetic, 8k, masterpiece, ultra-HD, cinematic lighting, high detail, depth of field, soft reflections, amazing composition, ((extreme close up)), catalog photo": "Base Prompt"
};
