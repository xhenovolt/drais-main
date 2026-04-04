import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // JS-flexible: allow any types — TypeScript is used for tooling, not strict enforcement
      "@typescript-eslint/no-explicit-any": "off",

      // Allow require() imports — many Node.js packages lack ESM/type support
      "@typescript-eslint/no-require-imports": "off",

      // Unused vars — off to allow JS-style development flow
      "@typescript-eslint/no-unused-vars": "off",

      // Allow let where const could be used — developer preference
      "prefer-const": "off",

      // Allow raw fetch() anywhere — apiFetch is preferred but not enforced
      "no-restricted-globals": "off",

      // React hooks deps — off to allow flexible effect patterns
      "react-hooks/exhaustive-deps": "off",

      // Allow <img> tags — next/image is preferred but not required
      "@next/next/no-img-element": "off",

      // Allow unescaped entities in JSX
      "react/no-unescaped-entities": "off",

      // Allow custom fonts in components (e.g. print/PDF templates embed fonts directly)
      "@next/next/no-page-custom-font": "off",
    },
  },
];

export default eslintConfig;
