#!/usr/bin/env node
// Adds one new Deep Sky category written by an OpenAI model, then schedules
// the next few nights. Nothing is saved unless the result passes validation.
//
//   OPENAI_API_KEY=... node scripts/generate-sky.mjs            add a category and save
//   OPENAI_API_KEY=... node scripts/generate-sky.mjs --dry-run  print it, change nothing
//   SKY_MOCK=file.json node scripts/generate-sky.mjs --dry-run  use a saved model reply (for testing)
//
// Settings (environment variables):
//   OPENAI_MODEL      model to use (default gpt-6-luna)
//   SKY_PLAN_DAYS     how many days ahead to schedule (default 3)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load, save, validate, plan, norm, ymd } from "./skies.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const PLAN_DAYS = Number(process.env.SKY_PLAN_DAYS || 3);
const DRY_RUN = process.argv.includes("--dry-run");
const MAX_ATTEMPTS = 3;
const TIER_KEYS = ["naked_eye", "binoculars", "telescope", "deep_field"];

const answerList = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "aliases"],
    properties: { name: { type: "string" }, aliases: { type: "array", items: { type: "string" } } },
  },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "prompt", "tiers"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    prompt: { type: "string" },
    tiers: {
      type: "object",
      additionalProperties: false,
      required: TIER_KEYS,
      properties: Object.fromEntries(TIER_KEYS.map((k) => [k, answerList])),
    },
  },
};

async function askModel(instructions, input) {
  if (process.env.SKY_MOCK) return JSON.parse(readFileSync(process.env.SKY_MOCK, "utf8"));
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input,
      text: { format: { type: "json_schema", name: "deep_sky_category", schema: SCHEMA, strict: true } },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.error?.message || JSON.stringify(body).slice(0, 300)}`);
  const text = (body.output || [])
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("");
  const refusal = (body.output || []).flatMap((o) => o.content || []).find((c) => c.type === "refusal");
  if (!text) throw new Error(refusal ? `Model refused: ${refusal.refusal}` : "Model returned no text");
  return JSON.parse(text);
}

// Turn the model's JSON into the game's compact format, quietly dropping
// duplicates and stray separator characters instead of failing on them.
function toCategory(reply, today) {
  const clean = (s) => String(s || "").replace(/[|=]/g, " ").replace(/\s+/g, " ").trim();
  const used = new Set();
  const dropped = [];
  const tiers = TIER_KEYS.map((k) => {
    const entries = [];
    for (const a of reply.tiers?.[k] || []) {
      const names = [clean(a.name), ...(a.aliases || []).map(clean)].filter(Boolean);
      const keep = [];
      for (const n of names) {
        const key = norm(n);
        if (!key || used.has(key)) { if (n === names[0]) dropped.push(n); continue; }
        used.add(key);
        keep.push(n);
      }
      // the display name must survive, otherwise skip the whole answer
      if (keep.length && keep[0] === names[0]) entries.push(keep.join("="));
    }
    return entries.join("|");
  });
  const id = clean(reply.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { category: { id, name: clean(reply.name), prompt: clean(reply.prompt), added: today, tiers }, dropped };
}

function describe(data) {
  const recent = data.categories.slice(-8).map((c) => c.name).join(", ");
  return [
    "Existing categories (do not overlap these):",
    ...data.categories.map((c) => `- ${c.id}: ${c.name}`),
    "",
    `Most recently added: ${recent}.`,
  ].join("\n");
}

async function main() {
  const instructions = readFileSync(join(HERE, "sky-prompt.md"), "utf8");
  const original = load();
  const today = ymd(new Date());
  let feedback = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Attempt ${attempt}: asking ${MODEL} for a new category...`);
    const reply = await askModel(instructions, describe(original) + feedback);
    const { category, dropped } = toCategory(reply, today);
    if (dropped.length) console.log(`  dropped ${dropped.length} duplicate answer(s): ${dropped.slice(0, 8).join(", ")}`);

    const data = structuredClone(original);
    if (data.categories.some((c) => c.id === category.id || norm(c.name) === norm(category.name))) {
      feedback = `\n\nYour last suggestion "${category.name}" already exists. Pick a different category.`;
      console.log(`  "${category.name}" already exists, retrying`);
      continue;
    }
    data.categories.push(category);
    const scheduled = plan(data, PLAN_DAYS);
    const { errors } = validate(data);
    const counts = category.tiers.map((t) => (t ? t.split("|").length : 0));
    console.log(`  ${category.name} (${category.id}): ${counts.reduce((a, b) => a + b, 0)} answers [${counts.join("/")}]`);

    if (errors.length) {
      errors.forEach((e) => console.log("  error:", e));
      feedback = `\n\nYour last attempt ("${category.name}") failed these checks:\n${errors.map((e) => "- " + e).join("\n")}\nFix them, or pick a category with a larger answer set.`;
      continue;
    }

    scheduled.forEach((s) => console.log("  scheduled", s));
    if (DRY_RUN) {
      console.log("\n(dry run) Not saved. Sample answers per tier:");
      category.tiers.forEach((t, i) => console.log(`  ${TIER_KEYS[i]}: ${t.split("|").slice(0, 8).map((e) => e.split("=")[0]).join(", ")}`));
      return;
    }
    save(data);
    console.log(`Saved. ${data.categories.length} categories in the bank.`);
    // Lets the workflow use the category name in its commit message.
    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(process.env.GITHUB_OUTPUT, `name=${category.name}\n`);
    }
    return;
  }
  throw new Error(`No valid category after ${MAX_ATTEMPTS} attempts. Nothing was saved.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
