---
name: AI Enhance prompt rules
description: Non-obvious constraints for the Grok-powered "AI Enhance" prompt feature.
---

# AI Enhance prompt rules

Rules that the AI Enhance meta-prompt and its safety layer must keep obeying.

- **Never re-add `score_9 / score_8_up / …` scoring tokens in the enhancer output.**
  **Why:** the generation pipeline injects those Pony scoring tokens automatically at
  generate-time; adding them again in the enhancer duplicates them. The meta-prompt
  forbids them AND `applyAgeSafetyGuards` strips them server-side as a floor.
  **How to apply:** when giving the model "Pony prompt info," teach booru tag style /
  ordering / quality tags, but explicitly say the score_* tokens are added by the system.

- **Age safety is a hard server-side floor, not model-trusted.**
  `applyAgeSafetyGuards` always injects `18yo` into the positive prompt and a
  minor/CSAM negative floor, regardless of model output. Keep it in every return path.

- **Self-learning style profile** lives on `users.learnedStyleProfile` (jsonb).
  Every Enhance press, `geminiService.updateLearnedProfile` asks Grok to merge the
  current prompt into the profile (styles / physicalAttributes / themes / avoid).
  **Why order matters:** the enhancement uses the profile as it was BEFORE the press;
  the freshly learned profile is persisted for the NEXT press. Learning is
  error-isolated (never throws) so it can't block enhancement, and only persists when
  a signed-in userId resolves.
