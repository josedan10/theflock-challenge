import js from "@eslint/js";
import importX from "eslint-plugin-import-x";
import jsdoc from "eslint-plugin-jsdoc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const sourceFiles = ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"];
const typescriptFiles = ["**/*.{ts,tsx,mts,cts}"];
const testFiles = [
  "**/*.{spec,test}.{js,jsx,ts,tsx}",
  "**/tests/**/*.{js,jsx,ts,tsx}",
  "e2e/**/*.{js,jsx,ts,tsx}",
];

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      ".turbo/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: sourceFiles,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "import-x": importX,
      jsdoc,
    },
    rules: {
      ...js.configs.recommended.rules,
      curly: ["error", "all"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/order": [
        "error",
        {
          alphabetize: { caseInsensitive: true, order: "asc" },
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          "newlines-between": "always",
        },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-throw-literal": "error",
      "object-shorthand": ["error", "always"],
      "prefer-const": "error",
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
  },
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    files: typescriptFiles,
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-throw-literal": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["apps/api/src/**/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "fastify",
                "fastify/**",
                "drizzle-orm",
                "drizzle-orm/**",
                "postgres",
                "next",
                "next/**",
                "react",
                "react/**",
                "**/application/**",
                "**/infrastructure/**",
                "**/http/**",
              ],
              message:
                "Domain code must remain independent from application, frameworks, transports, and infrastructure.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/**/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infrastructure/**", "**/http/**"],
              message:
                "Application code may depend on domain ports, not HTTP or infrastructure adapters.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/{config,contracts}/src/**/*.{ts,tsx,mts,cts}"],
    ignores: testFiles,
    rules: {
      "jsdoc/check-tag-names": "error",
      "jsdoc/check-types": "error",
      "jsdoc/require-jsdoc": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > ClassDeclaration",
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
          ],
          enableFixer: false,
          publicOnly: true,
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{jsx,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      ...jsxA11y.flatConfigs.recommended.plugins,
      "react-hooks": reactHooks,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs.flat["recommended-latest"].rules,
    },
  },
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
