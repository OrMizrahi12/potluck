import { readFileSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Words GLOSSARY.md lists under _Avoid_, read from the glossary so it stays the
// single source. Only one-word entries; a qualified entry like "Split (as a
// noun)" is left to review, since a name can't show which sense it means.
const avoidWords = readFileSync(
  new URL("./GLOSSARY.md", import.meta.url),
  "utf8"
)
  .split("\n")
  .filter((line) => line.startsWith("_Avoid_:"))
  .flatMap((line) => line.slice("_Avoid_:".length).split(","))
  .map((entry) => entry.trim().toLowerCase())
  .filter((word) => /^[a-z]+$/.test(word));

const cap = (word) => word[0].toUpperCase() + word.slice(1);
// A word as one part of a camelCase or SCREAMING_CASE name, plural allowed:
// `net`, `netBalance` and `NET_TOTAL` match; `network` and `planet` don't.
const inName =
  `(?<![A-Za-z])(?:${avoidWords.join("|")})s?(?![a-z])` +
  `|(?:${avoidWords.map(cap).join("|")})s?(?![a-z])` +
  `|(?<![A-Z])(?:${avoidWords.join("|").toUpperCase()})S?(?![A-Z])`;
const inProse = `\\b(?:${avoidWords.join("|")})s?\\b`;

const declaredName = [
  "VariableDeclarator > Identifier.id",
  "FunctionDeclaration > Identifier.id",
  ":function > Identifier.params",
  "ClassDeclaration > Identifier.id",
  "TSTypeAliasDeclaration > Identifier.id",
  "TSInterfaceDeclaration > Identifier.id",
  "TSPropertySignature > Identifier.key",
  "PropertyDefinition > Identifier.key",
  "MethodDefinition > Identifier.key",
].join(", ");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `:matches(${declaredName})[name=/${inName}/]`,
          message:
            "This name uses a word GLOSSARY.md lists under _Avoid_. Use the glossary's term.",
        },
        {
          selector: `CallExpression[callee.name=/^(describe|it|test)$/] > Literal[value=/${inProse}/i]`,
          message:
            "This test name uses a word GLOSSARY.md lists under _Avoid_. Use the glossary's term.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
