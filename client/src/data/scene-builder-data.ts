// Scene Builder Data - Organized by category for intelligent matching

// Eye options organized by category and subcategory
export const eyeOptions = {
  "Eye Shape & Size": {
    "General Shape": ["round_eyes", "narrow_eyes", "almond-shaped_eyes", "upturned_eyes", "downturned_eyes"],
    "Size": ["large_eyes", "huge_eyes", "small_eyes", "tiny_eyes"],
    "Stylized": ["anime_eyes", "chibi_eyes", "doe_eyes", "button_eyes", "bishoujo_eyes", "bishounen_eyes"]
  },
  "Pupils & Sclera": {
    "Pupil Shape": ["slit_pupils", "heart-shaped_pupils", "star-shaped_pupils", "no_pupils", "dilated_pupils", "constricted_pupils", "symbol-shaped_pupils"],
    "Sclera": ["white_sclera", "black_sclera", "red_sclera", "yellow_sclera", "colored_sclera"]
  },
  "Eye Details & States": {
    "Highlights & Details": ["sparkling_eyes", "detailed_eyes", "glowing_eyes", "empty_eyes", "hollow_eyes", "lifeless_eyes"],
    "Eye States": ["eyes_closed", "half-closed_eyes", "wide-eyed", "squinting", "one_eye_closed", "winking"],
    "Emotional States": ["crying", "tears", "sad_eyes", "happy_eyes", "angry_eyes", "surprised_eyes"]
  },
  "Gaze & Eye Contact": {
    "Direction": ["looking_at_viewer", "looking_away", "looking_to_the_side", "looking_up", "looking_down", "looking_back"],
    "Intensity": ["eye_contact", "direct_gaze", "seductive_gaze", "intense_gaze", "gentle_gaze", "soft_gaze"],
    "Expressions": ["stare", "glare", "jii", "puppy_dog_eyes", "bedroom_eyes"]
  },
  "Eyebrows & Eyelashes": {
    "Eyebrows": ["thick_eyebrows", "thin_eyebrows", "no_eyebrows", "furrowed_brow", "raised_eyebrows"],
    "Eyelashes": ["long_eyelashes", "bottom_eyelashes", "no_eyelashes"]
  }
};

export const sceneBuilderData = {
  // Basic arrays for dropdown categories
  pantyDescriptions: [
    "lace panties", "cotton panties", "silk panties", "thong", "boyshorts"
  ],
  pantyColorDescriptions: [
    "white", "black", "red", "pink", "blue", "purple"
  ],
  // Combined panty options: color + style + "panties"
  combinedPantyOptions: (() => {
    const colors = ["white", "black", "red", "pink", "blue", "purple"];
    const styles = ["lace", "cotton", "silk", "thong", "boyshorts"];
    const combinations = [];
    
    for (const color of colors) {
      for (const style of styles) {
        combinations.push(`${color} ${style} panties`);
      }
    }
    
    return combinations;
  })(),
  bodySizeDescriptions: [
    "petite", "slim", "athletic", "curvy", "plus size"
  ],
  buttocksDescriptions: [
    "tight_ass", "small_ass", "medium_ass", "big_ass", "huge_ass", "round_ass"
  ],
  breastDescriptions: [
    "perky_breasts", "small_breasts", "medium_breasts", "large_breasts", "huge_breasts", "natural_breasts"
  ],
  nippleDescriptions: [
    "Protruding nipple",
    "Flat nipple", 
    "Inverted nipple",
    "Large nipple",
    "Small nipple",
    "Round nipple",
    "Pointed nipple",
    "Erectile nipple"
  ],
  pubicHairDescriptions: [
    "tiny blond pubic hairs", "pubic hair shaved", "pubic hair trimmed", "pubic hair natural", "pubic hair landing strip"
  ],
  faceExpressions: [
    "smiling", "serious", "playful", "seductive", "innocent", "surprised", "smirking", "crying", "laughing", "angry", "sad", "happy", "confused", "excited", "worried", "calm", "flirty", "shy", "confident", "mischievous", "sultry", "pouty", "winking", "blushing", "anxious", "content", "dreamy", "focused", "intense", "relaxed"
  ],
  gazeDirections: [
    "looking_at_viewer", "looking_away", "looking_to_the_side", "looking_up", "looking_down", "looking_back"
  ],
  sexualPositions: [
    "standing", "sitting", "lying down", "kneeling", "bent over"
  ],
  lightingDescriptions: [
    "natural light", "soft lighting", "dramatic lighting", "golden hour", "glowing monitor light", "neon lighting", "candlelight", "moonlight", "harsh fluorescent"
  ],
  cameraDescriptions: [
    "close-up", "medium shot", "full body", "portrait", "low angle view", "worms eye view", "nadir shot", "extreme closeup"
  ],
  perspectiveDescriptions: [
    "front view", "side view", "back view", "three-quarter view", "between leg view", "overhead view", "from below", "first person view", "voyeur perspective"
  ],

  // Category-based structured data for locations
  theMallRetailLocations: [
    { name: "Shopping Mall", description: "busy shopping mall with storefronts" },
    { name: "Boutique Store", description: "upscale boutique clothing store" },
    { name: "Department Store", description: "large department store" },
    { name: "Fitting Room", description: "private fitting room" },
    { name: "Store Window", description: "storefront window display" }
  ],
  homeIndoorSpacesLocations: [
    { name: "Living Room", description: "cozy living room with sofa" },
    { name: "Bedroom", description: "comfortable bedroom" },
    { name: "Kitchen", description: "modern kitchen" },
    { name: "Bathroom", description: "luxury bathroom" },
    { name: "Home Office", description: "stylish home office" }
  ],
  natureParksLocations: [
    { name: "Forest Trail", description: "secluded forest trail" },
    { name: "Park Bench", description: "peaceful park bench" },
    { name: "Garden Path", description: "beautiful garden pathway" },
    { name: "Mountain View", description: "scenic mountain overlook" },
    { name: "Hiking Trail", description: "mountain hiking trail" }
  ],
  schoolCampusLocations: [
    { name: "Classroom", description: "university classroom" },
    { name: "Library", description: "quiet campus library" },
    { name: "Dormitory", description: "college dormitory room" },
    { name: "Campus Quad", description: "open campus quadrangle" },
    { name: "Study Hall", description: "student study hall" }
  ],
  sportsRecreationLocations: [
    { name: "Gym", description: "modern fitness gym" },
    { name: "Tennis Court", description: "outdoor tennis court" },
    { name: "Swimming Pool", description: "Olympic swimming pool" },
    { name: "Yoga Studio", description: "peaceful yoga studio" },
    { name: "Sports Field", description: "outdoor sports field" }
  ],
  urbanCityLifeLocations: [
    { name: "City Street", description: "busy city street" },
    { name: "Rooftop", description: "urban rooftop terrace" },
    { name: "Coffee Shop", description: "trendy urban coffee shop" },
    { name: "Subway Station", description: "underground subway platform" },
    { name: "High-rise Building", description: "modern high-rise building" }
  ],
  waterActivitiesBeachesLocations: [
    { name: "Sandy Beach", description: "sandy beach with crystal clear water" },
    { name: "Ocean Waves", description: "ocean waves crashing on shore" },
    { name: "Pool Deck", description: "luxury pool deck with lounge chairs" },
    { name: "Beach Resort", description: "tropical beach resort" },
    { name: "Boat Deck", description: "luxury yacht deck" }
  ],
  workCareerLocations: [
    { name: "Corporate Office", description: "modern corporate office" },
    { name: "Conference Room", description: "executive conference room" },
    { name: "Reception Area", description: "professional reception area" },
    { name: "Business Meeting", description: "formal business meeting room" },
    { name: "Executive Suite", description: "luxury executive office" }
  ],
  fantasyCreativeLocations: [
    { name: "Mystical Forest", description: "enchanted mystical forest" },
    { name: "Castle Chamber", description: "medieval castle chamber" },
    { name: "Fairy Garden", description: "magical fairy garden" },
    { name: "Fantasy Realm", description: "otherworldly fantasy realm" },
    { name: "Magical Studio", description: "artistic magical studio" }
  ],

  // Category-based structured data for outfits
  theMallRetailOutfits: [
    { name: "Mall Chic (Shorts)", description: "tight light gray crop top, high-waisted baggy gray cargo shorts" },
    { name: "Shopping Spree (Dress)", description: "short floral-print sundress, tie-front detail, light blue base, white and yellow flowers, large canvas tote bag" },
    { name: "Cosmetics Cruise (Shorts)", description: "fitted off-the-shoulder black shirt, tight black spandex biker shorts" },
    { name: "Boba Run (Dress)", description: "short white linen mini-dress" },
    { name: "Shopping Haul (Shorts)", description: "solid light gray ribbed crop top, high-waisted baggy khaki shorts" },
    { name: "Grocery Grab (Leggings)", description: "tight light gray shirt, high-waisted tight black leggings" },
    { name: "Checkout Chill (Shorts)", description: "loose-fitting oversized heather gray t-shirt tied at the waist, baggy black cotton athletic shorts" },
    { name: "Market Midi (Dress)", description: "short sage green sundress, tie-front detail" },
    { name: "Aisle Stroll (Shorts)", description: "fitted off-the-shoulder navy blue shirt, tight navy blue athletic shorts" },
    { name: "Label Look (Dress)", description: "short yellow-and-white striped linen mini-dress" },
    { name: "Perfume Prep (Shorts)", description: "light pink crop top, delicate lace trim, high-waisted tight white shorts" },
    { name: "Hat Head (Dress)", description: "short white-and-red polka dot sundress, tie-front detail" },
    { name: "Shoe Shop (Shorts)", description: "loose-fitting oversized light blue t-shirt tied at the waist, soft baggy khaki athletic shorts" },
    { name: "Waiting Game (Dress)", description: "short black-and-white checkered mini-dress" }
  ],
  homeIndoorSpacesOutfits: [
    { name: "Cozy Gamer (Shorts)", description: "loose-fitting oversized heather gray t-shirt tied at the waist, soft baggy black cotton athletic shorts" },
    { name: "Movie Marathon (Dress)", description: "short burgundy jersey-knit dress, side cutouts, cozy cream-colored knit blanket" },
    { name: "Gaming Gear (Shorts)", description: "loose-fitting oversized black t-shirt tied at the waist, soft baggy green athletic shorts" },
    { name: "Bookworm Best (Dress)", description: "short royal blue jersey-knit dress, side cutouts, cream-colored blanket" },
    { name: "Pet Pal (Shorts)", description: "loose-fitting oversized pastel yellow t-shirt tied at the waist, soft baggy gray cotton shorts" },
    { name: "Morning Stretch (Shorts)", description: "tight athletic navy blue crop top, high-waisted tight navy blue spandex shorts" },
    { name: "Journal Jumper (Dress)", description: "short light purple jersey-knit dress, cozy white cardigan" },
    { name: "Work Wear (Leggings)", description: "casual button-down light gray shirt tied at the front, tight high-waisted black leggings" },
    { name: "Puzzle Player (Dress)", description: "short light pink jersey-knit dress, side cutouts, white sweatshirt tied around waist" },
    { name: "Mani Moment (Shorts)", description: "loose-fitting oversized light green t-shirt tied at the waist, soft baggy white athletic shorts" },
    { name: "Outfit Tester (Shorts)", description: "tight athletic black crop top, high-waisted tight black spandex shorts" },
    { name: "TikTok Tunic (Dress)", description: "short hot pink jersey-knit dress" },
    { name: "Window Wonder (Shorts)", description: "loose-fitting oversized oatmeal-colored t-shirt tied at the waist, soft baggy gray athletic shorts" },
    { name: "Kitchen Kween (Leggings)", description: "tight light gray shirt, high-waisted tight black leggings" },
    { name: "Laundry Lounger (Dress)", description: "short olive green jersey-knit dress, white scrunchie" },
    { name: "Plant Parent (Shorts)", description: "loose-fitting oversized brown t-shirt tied at the waist, soft baggy beige cotton shorts" },
    { name: "Closet Cleanse (Shorts)", description: "tight light gray crop top, high-waisted tight black spandex shorts" }
  ],
  natureParksOutfits: [
    { name: "Garden Glam (Shorts)", description: "loose-fitting oversized green t-shirt tied at the waist, soft baggy khaki athletic shorts, gardening gloves" },
    { name: "Hiking Trail Blazer (Shorts)", description: "moisture-wicking forest green crop top, cargo-style baggy khaki shorts" },
    { name: "Rock Climber (Shorts)", description: "tight-fitting black ribbed crop top, high-waisted baggy camouflage cargo shorts" },
    { name: "Dune Duster (Bikini)", description: "sporty royal blue bikini, high-neck crop top, matching high-cut bottoms, large straw sun hat" },
    { name: "Picnic Perfect (Dress)", description: "short flowy white dress, smocked bodice, wide-brimmed straw hat" },
    { name: "Hillside Hues (Shorts)", description: "tight light gray crop top, high-waisted tight black spandex shorts" },
    { name: "Bench Beauty (Dress)", description: "short flowy light purple dress, smocked bodice, white cardigan" },
    { name: "Park Pal (Shorts)", description: "loose-fitting oversized light yellow t-shirt tied at the waist, soft baggy khaki athletic shorts" },
    { name: "Phone Flow (Dress)", description: "short flowy light blue dress, smocked bodice, brown leather crossbody bag" },
    { name: "Flower Child (Shorts)", description: "tight light gray crop top, delicate floral print, high-waisted tight green spandex shorts" },
    { name: "Campfire Cozy (Shorts)", description: "loose-fitting oversized dark green t-shirt tied at the waist, soft baggy brown cotton athletic shorts" },
    { name: "Park Stroll (Skirt)", description: "short black denim mini-skirt, small cutout mid-section, simple white t-shirt" },
    { name: "Leaf Leaper (Dress)", description: "short flowy orange dress, smocked bodice" },
    { name: "Swing Style (Dress)", description: "short flowy light green dress, smocked bodice" },
    { name: "Bend Back (Shorts)", description: "tight-fitting hot pink crop top, high-waisted tight black spandex shorts" },
    { name: "Bench Strut (Shorts)", description: "loose-fitting oversized brown t-shirt tied at the waist, soft baggy white cotton shorts" },
    { name: "Laundry Day (Dress)", description: "short flowy sky blue dress, smocked bodice" },
    { name: "Mountain Muse (Shorts)", description: "tight light gray crop top, high-waisted tight black spandex shorts" },
    { name: "Lean In (Shorts)", description: "loose-fitting oversized black t-shirt tied at the waist, baggy khaki cargo shorts" },
    { name: "Windy Wanderer (Dress)", description: "short flowy navy blue dress, smocked bodice" }
  ],
  schoolCampusOutfits: [
    { name: "Locker Look (Shorts)", description: "tight-fitting ribbed light gray crop top, high-waisted baggy distressed denim shorts" },
    { name: "Campus Cutie (Dress)", description: "short red and black plaid tennis dress, small cutout mid-section" },
    { name: "Cafeteria Casual (Shorts)", description: "loose-fitting oversized light gray t-shirt tied at the waist, soft baggy khaki shorts" },
    { name: "Stair Style (Dress)", description: "short burgundy plaid tennis dress, small cutout mid-sections" },
    { name: "Locker Lounger (Bikini)", description: "sporty bright pink bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Hallway Hottie (Shorts)", description: "tight light gray crop top, high-waisted tight khaki shorts" },
    { name: "Vending Vibes (Shorts)", description: "loose-fitting oversized light green t-shirt tied at the waist, soft baggy navy blue athletic shorts" },
    { name: "Common Room Cozy (Dress)", description: "short light blue plaid tennis dress, small cutout mid-section" },
    { name: "Lab Ready (Leggings)", description: "simple black crop top, long light gray lab coat, tight black leggings" },
    { name: "Library Lean (Shorts)", description: "loose-fitting oversized brown t-shirt tied at the waist, soft baggy black cotton shorts" },
    { name: "Lecture Leggings (Dress)", description: "short dark purple plaid tennis dress, small cutout mid-section" },
    { name: "Quad Quiet (Leggings)", description: "tight light gray crop top, high-waisted tight black leggings" },
    { name: "Bulletin Babe (Shorts)", description: "tight light gray shirt, soft baggy gray cotton shorts" },
    { name: "Bleacher Babe (Dress)", description: "short red plaid tennis dress, small cutout mid-section" }
  ],
  sportsRecreationOutfits: [
    { name: "Gym Glam (Shorts)", description: "tight athletic hot pink crop top, high-waisted tight black yoga shorts" },
    { name: "Stretch Star (Shorts)", description: "tight athletic black crop top, high-waisted tight gray yoga shorts" },
    { name: "Dance Moves (Shorts)", description: "tight light gray crop top, high-waisted tight black yoga shorts" },
    { name: "Yoga Yogi (Shorts)", description: "tight athletic light blue crop top, high-waisted tight white yoga shorts" },
    { name: "High Kicker (Shorts)", description: "tight athletic red crop top, high-waisted tight black athletic shorts" },
    { name: "Baseball Babe (Shorts)", description: "loose-fitting oversized light gray t-shirt tied at the waist, soft baggy gray athletic shorts" },
    { name: "Baller Babe (Shorts)", description: "tight athletic purple crop top, high-waisted tight black athletic shorts" },
    { name: "Tennis Star (Dress)", description: "short pleated white tennis dress, built-in sports bra, lime green trim" },
    { name: "Skate Park Vibe (Shorts)", description: "oversized band t-shirt cropped at the mid-section, baggy khaki shorts" },
    { name: "Skate Fail (Shorts)", description: "oversized black t-shirt cropped at the mid-section, baggy camouflage cargo shorts" },
    { name: "Bike Babe (Dress)", description: "short black athletic dress, cut-out mid-section" },
    { name: "Ice Skater (Leggings)", description: "tight athletic burgundy crop top, high-waisted tight black spandex leggings" },
    { name: "Grass Stretch (Shorts)", description: "tight athletic yellow crop top, high-waisted tight black spandex shorts" },
    { name: "Quad Stretch (Shorts)", description: "tight athletic black crop top, high-waisted tight purple spandex shorts" },
    { name: "Hamstring Stretch (Shorts)", description: "tight athletic navy blue crop top, high-waisted tight black spandex shorts" },
    { name: "Starting Line (Shorts)", description: "tight athletic red crop top, high-waisted tight black athletic shorts" },
    { name: "Baton Beauty (Shorts)", description: "tight athletic light gray crop top, high-waisted tight black athletic shorts" },
    { name: "Finish First (Shorts)", description: "tight light gray crop top, high-waisted tight black athletic shorts" },
    { name: "Hurdle Hottie (Dress)", description: "short pleated white tennis dress, built-in sports bra" },
    { name: "High Jump Star (Shorts)", description: "tight athletic black crop top, high-waisted tight black spandex shorts" },
    { name: "Long Jumper (Shorts)", description: "tight athletic red crop top, high-waisted tight black athletic shortss" },
    { name: "Pole Vaulter (Dress)", description: "short black athletic dress, cut-out mid-section" },
    { name: "Trail Runner (Leggings)", description: "tight athletic red crop top, high-waisted tight black leggings" },
    { name: "Hill Climber (Leggings)", description: "tight athletic black crop top, high-waisted tight black leggingss" },
    { name: "Creek Crossing (Shorts)", description: "loose-fitting oversized light gray t-shirt tied at the waist, baggy green cargo shorts" },
    { name: "Focused Runner (Leggings)", description: "tight athletic light gray crop top, high-waisted tight black leggings" },
    { name: "Water Break (Leggings)", description: "tight athletic blue crop top, high-waisted tight black leggings" },
    { name: "Cool Down (Leggings)", description: "tight light gray crop top, sports bra underneath, high-waisted tight black leggings" },
    { name: "Discus Doll (Dress)", description: "short pleated black tennis dress, built-in sports bra" },
    { name: "Shot Put Star (Shorts)", description: "tight athletic red crop top, high-waisted tight black athletic shorts" }
  ],
  urbanCityLifeOutfits: [
    { name: "Airport Attire (Leggings)", description: "tight black crop top, high-waisted tight black leggings" },
    { name: "Gas Station Glam (Shorts)", description: "oversized black band t-shirt cropped at the mid-section, baggy green cargo shorts" },
    { name: "Airport Attire (Dress)", description: "short black-and-white checkered mini-dress, cut-out mid-section, rolling suitcase" },
    { name: "Bus Stop Babe (Leggings)", description: "tight light gray crop top, high-waisted tight black leggings" },
    { name: "Laundromat Lounger (Dress)", description: "short light blue linen mini-dress, cut-out mid-section" },
    { name: "Laundromat Load (Shorts)", description: "loose-fitting oversized light gray t-shirt tied at the waist, baggy gray cotton shorts" },
    { name: "Laundry Wait (Leggings)", description: "tight-fitting pink crop top, high-waisted tight black leggings" },
    { name: "Dryer Daze (Dress)", description: "short white linen mini-dress, cut-out mid-section" },
    { name: "Balcony Babe (Dress)", description: "short silky light blue slip dress, cut-out mid-section, delicate silver jewelry" },
    { name: "Bus Stop Style (Leggings)", description: "tight-fitting red crop top, high-waisted tight black leggings" },
    { name: "Cafe Cutie (Dress)", description: "short silky dark green slip dress, cut-out mid-section, gold necklace" },
    { name: "Concert Queen (Leggings)", description: "tight light gray shirt, high-waisted tight black leggings" },
    { name: "Festival Babe (Dress)", description: "short silky purple slip dress, cut-out mid-section, colorful costume headpiece" },
    { name: "Park Stroll (Skirt)", description: "short black denim mini-skirt, small cutout mid-section, simple light gray t-shirt" },
    { name: "Street Style (Dress)", description: "short silky silver slip dress, cut-out mid-section" },
    { name: "Subway Style (Leggings)", description: "tight light gray crop top, high-waisted tight black leggings" },
    { name: "Waiting Wanderer (Dress)", description: "short silky gold slip dress, cut-out mid-section" },
    { name: "Wall Sitter (Shorts)", description: "tight-fitting black crop top, high-waisted tight khaki shorts" },
    { name: "Windy Wanderer (Dress)", description: "short silky red slip dress, cut-out mid-section, white sandals" }
  ],
  waterActivitiesBeachesOutfits: [
    { name: "Lounging at Pool Sunbathing (Bikini)", description: "vibrant floral high-waisted bikini, sheer light gray cotton cover-up shirt tied at the front" },
    { name: "Sunscreen Sundress (Dress)", description: "sporty orange bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Waterpark Splash (Bikini)", description: "sporty bright pink bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Pool Splash (Bikini)", description: "sporty solid light gray bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Waterslide Warrior (Bikini)", description: "sporty black bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Lazy River Lounger (Bikini)", description: "sporty solid yellow bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Rope Net (Bikini)", description: "sporty solid red bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Water Bucket (Bikini)", description: "sporty solid purple bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Tube Time (Bikini)", description: "sporty light green bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Waterslide Wait (Bikini)", description: "sporty light blue bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Wet Run (Bikini)", description: "sporty solid yellow bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Towel Tangle (Bikini)", description: "sporty bright pink bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Towel Dry (Bikini)", description: "sporty solid light gray bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Dive Prep (Bikini)", description: "sporty black bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Pool Selfie (Bikini)", description: "sporty solid red bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Poolside Snack (Bikini)", description: "sporty solid purple bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Concession Stand (Bikini)", description: "sporty light green bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "River Crossing (Bikini)", description: "sporty light blue bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Canoe Paddler (Shorts)", description: "tight light gray shirt, high-waisted tight navy blue shorts" },
    { name: "Pier Pro (Shorts)", description: "loose-fitting oversized light gray t-shirt tied at the waist, soft baggy khaki shorts" },
    { name: "Beach Baller (Bikini)", description: "sporty bright pink bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Sandcastle Queen (Bikini)", description: "sporty solid light gray bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Shoreline Sitter (Bikini)", description: "sporty black bikini, high-neck crop top, matching high-cut bottoms" },
    { name: "Wave Jumper (Bikini)", description: "sporty solid red bikini, high-neck crop top, matching high-cut bottoms" }
  ],
  workCareerOutfits: [
    { name: "Professional Pro (Trousers)", description: "sleek black crop top, tailored tan linen blazer, tight high-waisted black trousers" },
    { name: "Office Casual (Trousers)", description: "tight light gray crop top, high-waisted baggy black trousers" },
    { name: "Meeting Maven (Dress)", description: "short emerald green form-fitting dress, thin beige cardigan" },
    { name: "Site Style (Pants)", description: "tight light gray shirt, high-waisted baggy khaki cargo pants" },
    { name: "Coding at Desk (Pants)", description: "tight graphic navy blue crop top, baggy off-white linen pants" },
    { name: "Site Structural (Pants)", description: "tight light gray shirt, high-waisted baggy khaki cargo pants" },
    { name: "Design Diva (Trousers)", description: "tight graphic light gray crop top, baggy black trousers" },
    { name: "Brainstorm Beauty (Dress)", description: "short burgundy form-fitting dress, thin black cardigan" },
    { name: "Coffee Break (Pants)", description: "tight light gray crop top, baggy tan linen pants" },
    { name: "Working Late (Trousers)", description: "tight-fitting light gray ribbed crop top, high-waisted baggy black trousers" }
  ],
  fantasyCreativeOutfits: [
    { name: "Fantasy Costume", description: "fantasy costume" },
    { name: "Period Dress", description: "historical period dress" },
    { name: "Futuristic Outfit", description: "sci-fi inspired clothing" },
    { name: "Creative Wear", description: "artistic creative outfit" },
    { name: "Character Costume", description: "character-based costume" }
  ],

  // Category-based structured data for poses
  theMallRetailPoses: [
    { name: "At the Mall", description: "shopping bags, polished tile floor, mannequins, display windows, riding escalator, modern shopping mall" },
    { name: "Browse Clothes Rack", description: "pulling hangers, clothes rack, fitting room, modern clothing store" },
    { name: "Browse in Store", description: "shelves, skincare bottles, nail polish, tote bag, cosmetics shop, sleek white shelves" },
    { name: "Carrying Bubble Tea", description: "plastic cup, pastel boba drink, thick straw, condensation, bright mall food court" },
    { name: "Carrying Large Item", description: "struggling, large awkward-shaped box, navigating aisle, home goods store" },
    { name: "Grocery Shopping", description: "shopping cart, produce aisle, bananas, cereal, overhead fluorescent lighting" },
    { name: "Paying at Checkout", description: "supermarket checkout lane, pulling wallet, conveyor belt, cashier" },
    { name: "Picking Produce", description: "bending, fresh vegetables, hand reaching, bunch of broccoli, mist, grocery store" },
    { name: "Pushing a Cart", description: "pushing metal shopping cart, supermarket aisle, tall shelves, products" },
    { name: "Reading Label", description: "holding small bottle of lotion, squinting to read label, colorful cosmetics aisle" },
    { name: "Testing Perfume", description: "perfume, fancy bottle, wrist, eyes closed, perfume counter, department store" },
    { name: "Trying on Hat", description: "three-way mirror, hat tilted on head, rows of hats, display stands" },
    { name: "Trying on Shoe", description: "low bench, shoe store, new shoe, shoe boxes" },
    { name: "Waiting in Line", description: "long line, department store, shopping basket" }
  ],
  homeIndoorSpacesPoses: [
    { name: "Relaxing in Bath", description: "bubble bath, candles, bath products, clean modern tub" },
    { name: "Laying in Bed on Cell Phone", description: "messy bed, soft blankets, dim light from phone screen, dark room" },
    { name: "Watching a Series", description: "cozy blanket, couch, tablet playing show, snack bowl,modern living room" },
    { name: "Gaming on Couch", description: "sitting on sofa, leaning forward, holding video game controller, large TV screen" },
    { name: "Reading in Chair", description: "curled up, comfy armchair, book open, floor lamp, bookshelf, home library" },
    { name: "Cuddling with Pet", description: "lying on rug, arm wrapped around cat or dog, fireplace, cozy living room" },
    { name: "Stretching in the Morning", description: "arms overhead, stretching, front of large window, tidy bedroom" },
    { name: "Journaling", description: "lined notebook, open on desk, pen, polaroids, washi tape, tidy wooden desk" },
    { name: "Working on Laptop", description: "sitting at wooden desk, typing on laptop, messy papers, coffee mug nearby" },
    { name: "Doing a Puzzle", description: "leaning over dining room table, placing puzzle piece, half-finished jigsaw puzzle" },
    { name: "Painting Nails", description: "small nail polish bottles, vanity, one hand held still, wet polish, clean wooden table" },
    { name: "Trying on Outfits", description: "open closet, colorful panties scattered on bed, mirror, bedroom" },
    { name: "Making TikTok Video", description: "ring light, tripod, open phone camera, colorful bedroom wall, blue dildo, LED strip lights" },
    { name: "Looking Out Window", description: "open window, sheer curtains blowing, partly cloudy sky, peaceful indoor setting" },
    { name: "Cooking in Kitchen", description: "standing at kitchen counter, chopping vegetables, stainless steel appliances, hanging pots, modern kitchen" },
    { name: "Folding Laundry", description: "laundry on floor, dirty colorful panties on the floor, folded shirts, laundry basket, clean living space" },
    { name: "Watering Plants", description: "holding small watering can, potted plants, windowsill" },
    { name: "Closet Organization", description: "kneeling on floor, open closet, sorting pile of folded sweaters, shelves, shoe racks" }
  ],
  natureParksPoses: [
    { name: "Gardening Work", description: "flowers, garden plants" },
    { name: "Hiking Trail", description: "hiking trail, dense trees, foliage" },
    { name: "Rock Scramble", description: "moss-covered rocks,stream, trees, forest" },
    { name: "Sand Dune Climb", description: "sand dune, desert landscape" },
    { name: "Sitting with Friends on Grass", description: "picnic blanket, grassy field, drinks, snacks, city park" },
    { name: "Hillside Sit", description: "grassy hill, wildflowers, distant mountains" },
    { name: "Park Bench Sit", description: "bench, lawn, trees" },
    { name: "Hanging Out with Friends", description: "park bench, tree shade, soda cans, headphones, backpacks" },
    { name: "Texting on Phone", description: "smartphone, both hands, thumbs typing, park bench, backpack" },
    { name: "Bending to Pick Up", description: "garden, colorful blossoms, green leaves" },
    { name: "Campfire Sit", description: "campfire, roasting marshmallows, stick, forest, night" },
    { name: "Strolling in Park", description: "stone path, park, statues, fountains" },
    { name: "Playful Jump", description: "autumn leaves pile, forest, tall trees, colorful leaves" },
    { name: "Tree Swing", description: "rope swing, green field" },
    { name: "Bench Backbend", description: "wooden bench, garden, walking path" },
    { name: "Bench Straddle", description: "bench, train station" },
    { name: "Drying Laundry", description: "hanging laundry, clothesline, backyard" },
    { name: "Mountain View", description: "cliff edge, mountain range, cloudy sky" },
    { name: "Dramatic Lean", description: "wooden railing, coastline, crashing waves" },
    { name: "Windy Skirt Moment", description: "windy, prairie, tall grasses" }
  ],
  schoolCampusPoses: [
    { name: "Getting Books from Locker", description: "open locker, textbooks, notebooks, hallway, backpacks, college building" },
    { name: "Walking Through College", description: "lockers, bag strap, university hallway, doors open" },
    { name: "Eating at Cafeteria with Friends", description: "lunch trays, cafeteria table, drinks, snacks, university cafeteria" },
    { name: "Staircase Climb", description: "climbing spiral staircase, elegant interior" },
    { name: "Lockers and Changing Area", description: "lockers, changing stalls, flip-flops, swim bag, rec center" },
    { name: "Hallway Chat", description: "hallway, lockers, university" },
    { name: "Vending Machine Snack", description: "vending machine, scanning snacks, colorful chips, candy, college hallway" },
    { name: "Common Room Game", description: "low sofa, student common room, board game" },
    { name: "Lab Work", description: "safety glasses, lab coat, beaker, bubbling liquid, scientific equipment, university lab" },
    { name: "Library Study", description: "wooden table, quiet library, book stacks, desk lamp, textbook, campus library" },
    { name: "Lecture Hall Notes", description: "flip-up desk, lecture hall, writing notebook, empty seats, projector screen" },
    { name: "Quad Sit", description: "oak tree, college quad, backpack, brick building" },
    { name: "Bulletin Board", description: "hallway, reading flyers, posters, bulletin board" },
    { name: "Bleacher Sit", description: "metal bleachers, football field" }
  ],
  sportsRecreationPoses: [
    { name: "Acrobatic Split", description: "gymnastics mat, gym, blue walls" },
    { name: "Gym Stretch", description: "ballet studio, cream walls, large mirror" },
    { name: "Practicing Dance Moves", description: "mirror wall, empty studio, phone speaker, water bottle" },
    { name: "Yoga Pose", description: "yoga mat, studio, large windows, wood floor" },
    { name: "High Kick", description: "stage, red curtain" },
    { name: "Baseball Catch", description: "baseball glove, nbaseball field, green fence" },
    { name: "Basketball Hoop", description: "basketball court, gym, wood floors" },
    { name: "Tennis Serve", description: "tennis court, ball in air, chain-link fence" },
    { name: "Skateboarding at Park", description: "skateboard, concrete ramp" },
    { name: "Skateboard Fall", description: "concrete ramp, graffiti walls" },
    { name: "Bike Adjustment", description: "bicycle, pedals, suburban street, houses, mailbox" },
    { name: "Ice Skating Wobble", description: "skating rink, city skyline" },
    { name: "Grass Stretching 1", description: "grass, athletic field" },
    { name: "Grass Stretching 2", description: "grassy field, bleachers" },
    { name: "Grass Stretching 3", description: "field, stadium" },
    { name: "Starting Block Pose", description: "starting block, race, red track, lane markers" },
    { name: "Baton Pass", description: "running relay, baton, teammate, athletic track" },
    { name: "Finish Line Sprint", description: "finish line, athletic field, spectators, stadium" },
    { name: "Hurdle Clear", description: "blue track, stadium" },
    { name: "High Jump Arch", description: "high jump bar, landing mat" },
    { name: "Long Jump Takeoff", description: "long jump pit, sandy pit, stadium" },
    { name: "Pole Vault Ascent", description: "pole vault,  high bar, landing mat, stadium" },
    { name: "Distance Running", description: "cross-country trail, forested path" },
    { name: "Hill Climb", description: "uphill, steep grassy hill, cross country running" },
    { name: "Creek Crossing", description: "shallow creek, rocky, splashing water, wooded trail, cross country" },
    { name: "Mid-Race Focus", description: "cross country running, dirt path, pine forest, focused expression" },
    { name: "Water Stop", description: "water station, cups, paper cups scattered, cross country course" },
    { name: "Post-Race Cool Down", description: "hands on hips, shoulders slumped, cross country running, race banner, stadium" },
    { name: "Discus Release", description: "grass field, cage background" },
    { name: "Shot Put Throw", description: "shot put ball, neck, concrete throwing circle, stadium" }
  ],
  urbanCityLifePoses: [
    { name: "Airport Stretch", description: "line of seats, empty gate area, modern airport terminal" },
    { name: "At a Dirty Gas Station", description: "old fuel pump, cracked paint, convenience store, flickering neon sign, litter on asphalt" },
    { name: "At Airport", description: "rolling suitcase, terminal window, departure screens glowing, line of seats, charging stations" },
    { name: "At Bus Stop", description: "metal bench, suburban bus stop, backpack, overhead shelter, faded route map" },
    { name: "Folding Laundry Mat", description: "folding table, neatly folding clothes, rows of washing machines, laundromat" },
    { name: "Loading Washer", description: "washing machine, laundry basket, detergent bottle, laundromat" },
    { name: "Waiting for Laundry", description: "sitting on plastic chair, scrolling on phone, large laundry bag, machines humming" },
    { name: "Watching Dryer", description: "peering intently, transparent dryer door, clothes tumbling, reflection" },
    { name: "Balcony Pose", description: "balcony railing, high-rise balcony, cityscape below" },
    { name: "Bus Stop Lean", description: "metal bus stop pole, busy city street" },
    { name: "Cafe Window", description: "sitting at small cafe table, by window, looking out, rainy street, quaint cafe" },
    { name: "Concert Crowd", description: "dense crowd, hands raised in air" },
    { name: "Festival Parade", description: "vibrant parade, colorful costume, onlookers on sidewalk" },
    { name: "Street Performer", description: "accordion, bustling street corner, crowd of people" },
    { name: "Subway Pole Grip", description: "subway pole, commuters, subway car" },
    { name: "Waiting Stand", description: "airport terminal, rolling luggage, people walking by" },
    { name: "Wall Sit", description: "textured brick wall, city street scene" },
    { name: "Windy Walk", description: "breezy pier,  boats docked, skyline" }
  ],
  waterActivitiesBeachesPoses: [
    { name: "Lounging at Pool Sunbathing", description: "towel, lounge chair, resort pool, sunglasses, water reflecting strong sunlight" },
    { name: "Sunscreen Application", description: "sunscreen, beach towel, beach umbrella" },
    { name: "Splashing in Shallow Pool", description: "shallow wave pool, plastic chairs, pool bags, water park" },
    { name: "Wading Pool Splash", description: "shallow wading pool, colorful fountains, resort pool" },
    { name: "Riding Down a Waterslide", description: "waterslide, splashing, water park" },
    { name: "Floating in Lazy River", description: "inflatable inner tubes, lazy river, palm trees, bridge above, resort" },
    { name: "Climbing Up Rope Net", description: "roped cargo net, splash pad, water jets, water park" },
    { name: "Standing Under Giant Water Bucket", description: "tipping water bucket, mid-pour, play tower" },
    { name: "Getting into Tube", description: "large inner tube, lazy river entrance" },
    { name: "Waiting in Line for Waterslide", description: "colorful stairway, people waiting in line, tubes stacked nearby, water park" },
    { name: "Running Across Wet Concrete", description: "wet footprints, concrete walkway, towels, water mist, water park" },
    { name: "Towel Tangle", description: "towel, deck of resort, lounge chairs" },
    { name: "Drying Off with Towel", description: "towel, pool chair, swimming gear" },
    { name: "Mid-Dive Prep", description: "diving board edge, arms outstretched, tense, shimmering blue water, diving lanes" },
    { name: "Selfie by Pool", description: "selfie, smiling, crowded pool deck, resort" },
    { name: "Eating Snack by Pool", description: "plastic tray, fries and drink, table, wet towels on chairs, resort pool" },
    { name: "Concession Stand Order", description: "standing at concession stand, crumpled bill, menu boards, plastic food trays" },
    { name: "River Crossing", description: "wading through shallow rocky river, forested trail" },
    { name: "Canoe Paddle", description: "sitting in canoe, calm lake, paddle, wooded shoreline" },
    { name: "Fishing Pier", description: "fishing pier edge, legs over water, holding fishing rod, scenic lake" },
    { name: "Beach Ball Catch", description: "beach ball, sand volleyball court, sandy beach, palm trees" },
    { name: "Sandcastle Build", description: "sand, scooping with bucket, sandcastle, wide sandy beach" },
    { name: "Shoreline Sit", description: "wet shoreline, gentle waves, calm ocean" },
    { name: "Wave Jump", description: "crashing ocean wave, sandy beach, clear horizon" }
  ],
  workCareerPoses: [
    { name: "First Job/Career", description: "modern office, large windows" },
    { name: "Office Environment", description: "cubicle, computer, open-plan office" },
    { name: "Professional Meeting", description: "conference room, large table, whiteboard covered in notes" },
    { name: "Project Site", description: "hard hat, safety vest, looking at blueprints, construction site" },
    { name: "Coding at Desk", description: "two large computer monitors, lines of code, modern office" },
    { name: "Site Visit", description: "hard hat, bright vest, half-finished steel building frame, blueprint" },
    { name: "Design Software", description: "computer screen, complex 3D model, building's structure, mouse and keyboard" },
    { name: "Whiteboard Brainstorm", description: "whiteboard, flowcharts, code snippets, markers, conference room" },
    { name: "Coffee Break", description: "coffee machine, office breakroom, iphone" },
    { name: "Working Late", description: "office at night, desk lamp, computer screen, half-eaten takeout food" }
  ],
  fantasyCreativePoses: [
    { name: "Dramatic Pose", description: "dramatic artistic pose" },
    { name: "Character Role", description: "in character pose" },
    { name: "Creative Expression", description: "artistic expression pose" },
    { name: "Fantasy Character", description: "fantasy character pose" },
    { name: "Imaginative", description: "imaginative creative pose" }
  ],

  // Universal body / physical poses — view-angle + position descriptors
  bodyPhysicalPoses: [
    // ── Standing ──────────────────────────────────────────────────────────────
    { name: "Front Standing", description: "front view, standing" },
    { name: "Front Standing Feet Apart", description: "front view, standing, feet apart" },
    { name: "Front Standing Weight on One Leg", description: "front view, standing, weight on one leg" },
    { name: "Front Standing Legs Crossed", description: "front view, standing, legs crossed" },
    { name: "Profile Bent Over Toe Touch", description: "profile view, standing, bent over toe touch" },
    { name: "Rear Standing", description: "rear view, standing" },
    { name: "Rear Standing Feet Apart", description: "rear view, standing, feet apart" },
    { name: "Rear Standing Weight on One Leg", description: "rear view, standing, weight on one leg" },
    { name: "Rear Standing Legs Crossed", description: "rear view, standing, legs crossed" },
    { name: "Rear Standing on Toes", description: "rear view, standing, on toes" },
    { name: "Rear Standing Knee Bent", description: "rear view, standing, knee bent" },
    { name: "Rear Standing Toe Stretch", description: "rear view, standing, toe stretch" },
    // ── Seated on Floor ───────────────────────────────────────────────────────
    { name: "Front Seated on Floor", description: "front view, seated on floor" },
    { name: "Front Seated Legs Open", description: "front view, seated on floor, legs open" },
    { name: "Front Seated One Knee Up One Down", description: "front view, seated on floor, one knee up, one knee down" },
    { name: "Front Seated Knees Bent", description: "front view, seated on floor, knees bent" },
    { name: "Front Seated Leg Stretched", description: "front view, seated on floor, leg stretched" },
    { name: "Front Seated Knees Up", description: "front view, seated on floor, knees up" },
    { name: "Front Seated Legs Akimbo Feet Together", description: "front view, seated on floor, legs akimbo, feet together" },
    { name: "Front Seated Leaned Back on Hands", description: "front view, seated on floor, leaned back on hands" },
    { name: "Rear Seated One Knee Up", description: "rear view, seated on floor, one knee up" },
    // ── Prone (Stomach) ───────────────────────────────────────────────────────
    { name: "Front Prone Legs Apart", description: "front view, prone, legs apart" },
    { name: "Front Prone on Stomach", description: "front view, prone, on stomach" },
    { name: "Front Prone Feet Raised", description: "front view, prone, on stomach, feet raised" },
    { name: "Profile Prone", description: "profile view, prone" },
    { name: "Profile Prone Head Back", description: "profile view, prone, on stomach, head back" },
    { name: "Rear Prone", description: "rear view, prone" },
    { name: "Rear Prone One Knee Up", description: "rear view, prone, one knee up" },
    { name: "Profile Prone One Knee Up One Down", description: "profile view, prone, one knee up, one knee down" },
    // ── Lying on Back (Supine) ────────────────────────────────────────────────
    { name: "Front Lying on Back", description: "front view, lying on back" },
    { name: "Front Lying Legs Apart", description: "front view, lying on back, legs apart" },
    { name: "Front Lying Knees Bent", description: "front view, lying on back, knees bent" },
    { name: "Front Lying One Knee Up One Down", description: "front view, lying on back, one knee up, one knee down" },
    { name: "Front Lying Legs Akimbo Feet Together", description: "front view, lying on back, legs akimbo, feet together" },
    { name: "Elevated Lying High Kick", description: "elevated view, lying on back, high kick" },
    { name: "Elevated Lying Knees Bent", description: "elevated view, lying on back, knees bent" },
    { name: "Overhead Lying on Back", description: "overhead view, lying on back" },
    { name: "Overhead Lying Knees Bent", description: "overhead view, lying on back, knees bent" },
    { name: "Overhead Lying Legs Apart", description: "overhead view, lying on back, legs apart" },
    { name: "Overhead Lying Legs Akimbo Feet Together", description: "overhead view, lying on back, legs akimbo, feet together" },
    { name: "Overhead Lying Legs Akimbo Feet Apart", description: "overhead view, lying on back, legs akimbo, feet apart" },
    { name: "Rear Lying on Back", description: "rear view, lying on back" },
    { name: "Rear Lying One Knee Up", description: "rear view, lying on back, one knee up" },
    // ── Squatting ─────────────────────────────────────────────────────────────
    { name: "Front Squatting One Leg Extended", description: "front view, squatting, one leg extended" },
    { name: "Front Squatting Forward on Hands", description: "front view, squatting, forward on hands" },
    { name: "Overhead Squatting", description: "overhead view, squatting" },
    { name: "Profile Squatting", description: "profile view, squatting" },
    { name: "Profile Squatting One Leg Extended", description: "profile view, squatting, one leg extended" },
    { name: "Profile Squatting One Knee Bent", description: "profile view, squatting, one knee bent" },
    { name: "Profile Squatting Leaning Back High Kick", description: "profile view, squatting, leaning back, high kick" },
    { name: "Profile Squatting Forward on Hands", description: "profile view, squatting, forward on hands" },
    { name: "Profile Squatting Head Back", description: "profile view, squatting, head back" },
    { name: "Rear Squatting", description: "rear view, squatting" },
    { name: "Rear Squatting Knees Together", description: "rear view, squatting, knees together" },
    { name: "Rear Squatting One Leg Extended", description: "rear view, squatting, one leg extended" },
    { name: "Rear Squatting Forward on Hands", description: "rear view, squatting, forward on hands" },
    // ── Kneeling ──────────────────────────────────────────────────────────────
    { name: "Front Kneeling", description: "front view, kneeling" },
    { name: "Front Kneeling Legs Apart", description: "front view, kneeling, legs apart" },
    { name: "Front Kneeling Legs Wide Apart", description: "front view, kneeling, legs wide apart" },
    { name: "Front Kneeling Leaning Back Legs Wide", description: "front view, kneeling, leaning back, legs wide apart" },
    { name: "Front Kneeling Forward on Hands", description: "front view, kneeling, forward on hands" },
    { name: "Front Kneeling Legs Wide Forward on Hands", description: "front view, kneeling, legs wide, forward on hands" },
    { name: "Profile Kneeling", description: "profile view, kneeling" },
    { name: "Profile Kneeling One Knee Raised", description: "profile view, kneeling, one knee raised" },
    { name: "Profile Kneeling on Toes", description: "profile view, kneeling, on toes" },
    { name: "Profile Kneeling One Knee Up Legs Straight", description: "profile view, kneeling, one knee up, legs straight" },
    { name: "Profile Kneeling Forward on Hands Standup", description: "profile view, kneeling, forward on hands, standup" },
    { name: "Profile Kneeling High Kick", description: "profile view, kneeling, high kick" },
    { name: "Profile Kneeling Forward Leg Extended", description: "profile view, kneeling, forward on hands, leg extended" },
    { name: "Rear Kneeling", description: "rear view, kneeling" },
    { name: "Rear Kneeling Forward on Hands", description: "rear view, kneeling, forward on hands" },
    { name: "Rear Kneeling Standup", description: "rear view, kneeling, standup" },
    { name: "Rear Kneeling Standup Legs Apart", description: "rear view, kneeling, standup, legs apart" },
    // ── Crawling ──────────────────────────────────────────────────────────────
    { name: "Front Crawling", description: "front view, crawling" },
    { name: "Front Crawling Legs Apart", description: "front view, crawling, legs apart" },
    { name: "Front Crawling Legs Wide Apart", description: "front view, crawling, legs wide apart" },
    { name: "Profile Crawling", description: "profile view, crawling" },
    { name: "Profile Crawling Legs Apart", description: "profile view, crawling, legs apart" },
    { name: "Rear Crawling", description: "rear view, crawling" },
    { name: "Rear Crawling Legs Apart", description: "rear view, crawling, legs apart" },
    { name: "Rear Crawling Low Legs Wide", description: "rear view, crawling, low, legs wide apart" },
    { name: "Rear Crawling Legs Split", description: "rear view, crawling, legs split" },
  ],

  // Hair styles for Body & Physical Attributes
  hairStyles: [
    "Hair in a high ponytail",
    "Hair in a low ponytail",
    "Hair in a side ponytail",
    "Hair in a bubble ponytail",
    "Hair in a French braid",
    "Hair in a Dutch braid",
    "Hair in a fishtail braid",
    "Hair in boxer braids",
    "Hair in milkmaid braids",
    "Hair in a waterfall braid",
    "Hair in a rope braid",
    "Hair in a messy bun",
    "Hair in a top knot",
    "Hair in a low bun (chignon)",
    "Hair in a sock bun",
    "Hair in space buns",
    "Hair in a braided bun",
    "Hair in a half-up style",
    "Hair in a half-up top knot",
    "Hair in a half-up ponytail",
    "Hair in loose waves",
    "Hair in defined curls",
    "Hair in a claw clip updo",
    "Hair in a scrunchie",
    "Hair in a scarf or ribbon",
    "Hair in a headband"
  ],

  // Explicit options for adult content - organized logically
  explicitOptions: [
    // Anatomical Features
    "gaping asshole",
    "dripping pussy", 
    "massive cock",
    "huge breasts",
    
    // Sexual Positions
    "doggystyle",
    "missionary position",
    "cowgirl position", 
    "reverse cowgirl",
    "standing sex",
    "face down ass up",
    "bent over",
    "on knees",
    "hands and knees",
    "squatting",
    "against wall",
    
    // Body Positioning
    "legs spread wide",
    "legs up",
    "spread eagle", 
    "arched back",
    
    // Clothing States
    "completely naked",
    "partially clothed",
    "no panties",
    "no bra",
    "see-through fabric",
    "torn clothing",
    
    // Camera Angles & Views
    "POV",
    "upskirt view",
    "extreme close-up",
    "close-up genitals",
    "wide shot", 
    "full body view",
    
    // Focus Areas
    "cleavage focus",
    "ass focus",
    "pussy focus",
    "breast focus",
    "nipple focus"
  ]
};