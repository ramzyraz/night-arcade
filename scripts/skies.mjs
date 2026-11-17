#!/usr/bin/env node
// Deep Sky data tools.
//
//   node scripts/skies.mjs validate        check deep-sky/skies.json, exit 1 on any error
//   node scripts/skies.mjs plan [days]     schedule any missing nights from today to today+days (default 3)
//   node scripts/skies.mjs stats           list categories with answer counts and last use
//
// A night is 5 category ids. The planner always puts a category that has never
// been played into the next free night, then fills the rest with whatever was
// played least recently, so no category repeats within a few nights.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

export const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "deep-sky", "skies.json");
const ROUNDS = 5;
const MIN_TIER1 = 8;
const MIN_TOTAL = 50;
const MIN_DEEP = 8; // tier 4 needs enough deep cuts to be worth chasing

// Must match norm() in deep-sky/index.html.
export const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, "and").replace(/['’]/g, "").replace(/[^a-z0-9+#]/g, "");

export const load = () => JSON.parse(readFileSync(FILE, "utf8"));
export const save = (d) => writeFileSync(FILE, JSON.stringify(d, null, 2) + "\n");
export const ymd = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

export function validate(data) {
  const errors = [], warnings = [];
  if (!Array.isArray(data.categories)) errors.push("categories must be an array");
  const ids = new Set();
  for (const c of data.categories || []) {
    const where = `category "${c.id}"`;
    if (!/^[a-z0-9-]+$/.test(c.id || "")) errors.push(`${where}: id must be lowercase letters, digits, hyphens`);
    if (ids.has(c.id)) errors.push(`${where}: duplicate id`);
    ids.add(c.id);
    if (!c.name || !c.prompt) errors.push(`${where}: needs name and prompt`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.added || "")) errors.push(`${where}: needs added date YYYY-MM-DD`);
    if (!Array.isArray(c.tiers) || c.tiers.length !== 4) { errors.push(`${where}: needs exactly 4 tier strings`); continue; }
    const seen = new Map();
    const counts = c.tiers.map((line, t) => {
      if (typeof line !== "string" || !line.trim()) { errors.push(`${where}: tier ${t + 1} is empty`); return 0; }
      const entries = line.split("|");
      for (const e of entries) {
        const names = e.split("=");
        if (names.some((n) => !n.trim())) errors.push(`${where}: empty name in "${e}"`);
        for (const n of names) {
          const k = norm(n);
          if (!k) { errors.push(`${where}: "${n}" has no letters or digits`); continue; }
          if (seen.has(k) && seen.get(k) !== e) errors.push(`${where}: "${n}" appears twice ("${seen.get(k)}" and "${e}")`);
          seen.set(k, e);
        }
      }
      return entries.length;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    if (counts[0] < MIN_TIER1) errors.push(`${where}: tier 1 has ${counts[0]} answers, needs ${MIN_TIER1}+`);
    if (counts[3] < MIN_DEEP) errors.push(`${where}: tier 4 has ${counts[3]} answers, needs ${MIN_DEEP}+`);
    if (total < MIN_TOTAL) errors.push(`${where}: ${total} answers in total, needs ${MIN_TOTAL}+`);
  }
  if (data.categories?.length < ROUNDS) errors.push(`need at least ${ROUNDS} categories`);

  const nights = data.nights || {};
  const dates = Object.keys(nights).sort();
  for (const date of dates) {
    const ids_ = nights[date];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`night "${date}": key must be YYYY-MM-DD`);
    if (!Array.isArray(ids_) || ids_.length !== ROUNDS) { errors.push(`night ${date}: needs exactly ${ROUNDS} ids`); continue; }
    if (new Set(ids_).size !== ROUNDS) errors.push(`night ${date}: repeats a category`);
    for (const id of ids_) if (!ids.has(id)) errors.push(`night ${date}: unknown category "${id}"`);
  }
  for (let i = 1; i < dates.length; i++) {
    const overlap = nights[dates[i]].filter((id) => nights[dates[i - 1]].includes(id));
    if (overlap.length) warnings.push(`night ${dates[i]} repeats ${overlap.join(", ")} from the night before`);
  }
  return { errors, warnings };
}

export function lastUsed(data) {
  const last = new Map();
  for (const date of Object.keys(data.nights || {}).sort()) for (const id of data.nights[date]) last.set(id, date);
  return last;
}

export function plan(data, days) {
  data.nights ||= {};
  const today = ymd(new Date());
  const added = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    if (data.nights[date]) continue;
    const last = lastUsed(data);
    const fresh = data.categories.filter((c) => !last.has(c.id)).sort((a, b) => a.added.localeCompare(b.added));
    const prev = data.nights[addDays(date, -1)] || [];
    const pool = data.categories
      .filter((c) => !prev.includes(c.id))
      .sort((a, b) => (last.get(a.id) || "").localeCompare(last.get(b.id) || "") || Math.random() - 0.5);
    const pick = [];
    if (fresh[0]) pick.push(fresh[0].id); // debut one new category per night
    for (const c of pool) { if (pick.length >= ROUNDS) break; if (!pick.includes(c.id)) pick.push(c.id); }
    for (const c of data.categories) { if (pick.length >= ROUNDS) break; if (!pick.includes(c.id)) pick.push(c.id); }
    // shuffle so the new category isn't always first
    for (let j = pick.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [pick[j], pick[k]] = [pick[k], pick[j]]; }
    data.nights[date] = pick;
    added.push(`${date}: ${pick.join(", ")}`);
  }
  return added;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const [cmd = "validate", arg] = isCli ? process.argv.slice(2) : ["none"];
const data = isCli ? load() : null;
if (!isCli) {
  // imported as a module
} else if (cmd === "validate") {
  const { errors, warnings } = validate(data);
  warnings.forEach((w) => console.log("warning:", w));
  errors.forEach((e) => console.log("error:", e));
  const unplayed = data.categories.filter((c) => !lastUsed(data).has(c.id)).length;
  console.log(errors.length ? `\n${errors.length} error(s).` : `OK: ${data.categories.length} categories, ${Object.keys(data.nights || {}).length} nights scheduled, ${unplayed} not yet played.`);
  process.exit(errors.length ? 1 : 0);
} else if (cmd === "plan") {
  const added = plan(data, Number(arg ?? 3));
  const { errors } = validate(data);
  if (errors.length) { errors.forEach((e) => console.log("error:", e)); process.exit(1); }
  save(data);
  console.log(added.length ? "Scheduled:\n  " + added.join("\n  ") : "All nights already scheduled.");
} else if (cmd === "stats") {
  const last = lastUsed(data);
  for (const c of data.categories) {
    const n = c.tiers.map((t) => t.split("|").length);
    console.log(`${c.id.padEnd(22)} ${String(n.reduce((a, b) => a + b)).padStart(4)} answers  [${n.join("/")}]  added ${c.added}  last ${last.get(c.id) || "never"}`);
  }
} else {
  console.log("usage: node scripts/skies.mjs validate | plan [days] | stats");
  process.exit(1);
}
