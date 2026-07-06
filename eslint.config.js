import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "attached_assets/**", "migrations/**", "public/**"],
  },
  {
    rules: {
      // Codebase predates lint; start pragmatic, ratchet later.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "error", // use server/logger.ts instead
    },
  },
  {
    // vite.ts's log() helper writes dev-server output; namespaces are used in
    // pre-existing Express type augmentation.
    files: ["server/vite.ts", "server/replitAuth.ts", "server/api-v1.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off", // client console usage is a separate cleanup
    },
  }
);
