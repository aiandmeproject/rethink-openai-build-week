import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseEnvironmentFile } from "../server.js";

test("local .env configuration is restart-durable, git-ignored, and keeps Live credentials server-side", () => {
  const parsed = parseEnvironmentFile(`
    # local developer configuration
    OPENAI_API_KEY="sk-local-placeholder"
    OPENAI_MODEL=gpt-5.6-sol
    PORT=3000
  `);
  assert.equal(parsed.OPENAI_API_KEY, "sk-local-placeholder");
  assert.equal(parsed.OPENAI_MODEL, "gpt-5.6-sol");
  assert.equal(parsed.PORT, "3000");
  assert.match(readFileSync(new URL("../.gitignore", import.meta.url), "utf8"), /^\.env$/m);
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(example, /^OPENAI_API_KEY=$/m);
  assert.match(example, /^OPENAI_LONG_REASONING_MAX_OUTPUT_TOKENS=12000$/m);
  assert.doesNotMatch(example, /\bsk-[A-Za-z0-9_-]{8,}\b/);
});
