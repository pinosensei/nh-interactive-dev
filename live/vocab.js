// NH Learn Live - vocabulary pool for races (Phase B; English -> Japanese added in Phase E1; Spelling in Phase E2).
import { EXCLUDE } from "./spelling-exceptions.js";
// Pure functions: no DOM, no Firebase, no localStorage. Reads PORTAL_DATA only; never modifies it.
// Primary source: the portal-data.js that sits next to the live/ folder (same site, same version as NH Interactive).
// Fallback: the published copy at its full URL. Both are only ever READ.
export const PORTAL_URL_LOCAL = "../portal-data.js";
export const PORTAL_URL = "https://pinosensei.github.io/nh-interactive-dev/portal-data.js";
// Phase F2: the shared Smart Sentences file (example sentences + the NH2 Unit 5-7 word-list corrections), same file the main page uses.
export const SENTENCES_URL_LOCAL = "../smart-sentences.js";
export const SENTENCES_URL = "https://pinosensei.github.io/nh-interactive-dev/smart-sentences.js";
export const TOTAL = 40;        // questions per race
export const MAX_UNITS = 4;     // units a host may combine
export const SCHEMA_VERSION = 1;

// Game modes (Phase F2 adds Fill in the Blank).
export const MODES = [
  { id: "jp2en-choice4", label: "Japanese → English (4 choices)", available: true },
  { id: "en2jp-choice4", label: "English → Japanese (4 choices)", available: true },
  { id: "spelling", label: "Spelling (typing)", available: true },
  { id: "fillblank-choice4", label: "Fill in the Blank (4 choices)", available: true }
];
export const FILL = "fillblank-choice4";
export const isFill = modeId => modeId === FILL;   // an English sentence with a blank; the student picks the missing word
export const isTyping = modeId => modeId === "spelling";   // the student types the English instead of picking a choice
export const modeLabel = id => (MODES.find(m => m.id === id) || { label: id }).label;

/* ------------------------------------------------------------ loading */
export function parsePortalData(text) {
  const data = new Function(text + "\n;return PORTAL_DATA;")();   // the file is `const PORTAL_DATA = {...};`
  if (!data || typeof data !== "object") throw new Error("PORTAL_DATA missing");
  for (const g of ["nh1", "nh2", "nh3"]) if (!data[g] || !data[g].units) throw new Error("PORTAL_DATA has no " + g);
  return data;
}
async function loadOne(url, fetchImpl) {
  const res = await fetchImpl(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("portal-data.js: HTTP " + res.status);
  return parsePortalData(await res.text());
}
// Tries each url in order; the first one that loads AND parses wins. Default order: ../portal-data.js, then the full URL.
export async function loadPortalData(urls = [PORTAL_URL_LOCAL, PORTAL_URL], fetchImpl = globalThis.fetch) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr = null;
  for (const u of list) {
    try { return await loadOne(u, fetchImpl); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("portal-data.js: no source");
}
// Runs smart-sentences.js on a COPY of PORTAL_DATA, exactly as the main page runs it on its own copy:
// adds exampleEN / exampleJP / fillBlankEN / answer fields and rebuilds the NH2 Unit 5-7 word lists.
export function applySentences(data, text) {
  const copy = structuredClone(data);
  new Function("PORTAL_DATA", text)(copy);
  return copy;
}
// Returns { data, sentences }: the vocabulary with the sentences applied, or the plain vocabulary if the file could not be loaded.
export async function withSentences(data, urls = [SENTENCES_URL_LOCAL, SENTENCES_URL], fetchImpl = globalThis.fetch) {
  for (const u of urls) {
    try {
      const res = await fetchImpl(u, { cache: "no-cache" }); if (!res.ok) continue;
      return { data: applySentences(data, await res.text()), sentences: true };
    } catch (e) { console.warn("smart-sentences.js", u, e); }
  }
  return { data, sentences: false };
}

/* ------------------------------------------------------------ word rules */
const JP = /[぀-ヿ㐀-鿿]/;             // hiragana, katakana, kanji
const ARROW = /^\s*[⇐←→⇒]/;
const normEn = s => String(s || "").normalize("NFKC").trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
const normJa = s => String(s || "").normalize("NFKC").trim();
export const sameEnglish = (a, b) => normEn(a.english) === normEn(b.english);
export const sameJapanese = (a, b) => normJa(a.japanese) === normJa(b.japanese);
const dupKey = w => normEn(w.english) + "|" + normJa(w.japanese);

// Which words a mode can use. jp2en needs a real Japanese meaning (not a note like "⇐ do not").
// en2jp uses the same rule, minus entries whose whole Japanese is only a bracketed grammar note
// (e.g. "was = ［am、isの過去形］"): fine as a hint in jp2en, but not a meaning to pick in a Japanese choice list.
const GRAMMAR_NOTE = /^\s*[\[［][^\]］]*[\]］]\s*$/;
// Spelling (Japanese question, the student types the English): same rule, minus fill-in-the-blank patterns that nobody can fairly type
// ("Call me …", "enjoy …ing", "… kind(s) of ~", "(Riko)’s", "(1970)s") and anything on the EXCLUDE list in spelling-exceptions.js.
const PLACEHOLDER = /[…~～〜]|\.\.\./;
const excluded = new Set(EXCLUDE.map(normEn));
const spellable = w => !PLACEHOLDER.test(w.english || "") && !/^\s*\(/.test(w.english || "") && !excluded.has(normEn(w.english));
// Fill in the Blank: needs a real blank sentence (not a generic "We use 'x' in this lesson." one), a Japanese sentence as the hint,
// and a plain answer form. The answer form is read from the full sentence: "These ______ are delicious." + "These sweets are delicious." -> "sweets".
const GENERIC = /use '.*' in this lesson/i;
const BLANKS = /_{3,}(?:\s+_{3,})*/g;          // one blank, or several blanks in a row ("______ ______" = a two-word answer)
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const apos = s => String(s || "").replace(/[’‘`]/g, "'");
function formFromSentence(w) {
  const fb = apos(w.fillBlankEN), ex = apos(w.exampleEN || w.example);
  if (!fb || !ex) return "";
  const parts = fb.split(BLANKS); if (parts.length !== 2) return "";   // exactly one gap
  const m = ex.match(new RegExp("^" + esc(parts[0]) + "(.+?)" + esc(parts[1]) + "$", "i"));
  return m ? m[1].trim() : "";
}
export const fillForm = w => String(formFromSentence(w) || w.answer || (Array.isArray(w.acceptedAnswers) && w.acceptedAnswers[0]) || w.english || "").trim();
const fillable = w => /_{3,}/.test(w.fillBlankEN || "") && !GENERIC.test(w.exampleEN || "") && JP.test(w.exampleJP || "")
  && !!formFromSentence(w) && !/[()~～〜…⇐]/.test(fillForm(w)) && fillForm(w).length <= 30;   // the answer must rebuild the full sentence exactly
const USABLE = {
  "jp2en-choice4": w => !!normEn(w.english) && JP.test(w.japanese || "") && !ARROW.test(w.japanese || ""),
  "spelling": w => !!normEn(w.english) && JP.test(w.japanese || "") && !ARROW.test(w.japanese || "") && spellable(w),
  "en2jp-choice4": w => !!normEn(w.english) && JP.test(w.japanese || "") && !ARROW.test(w.japanese || "") && !GRAMMAR_NOTE.test(w.japanese || ""),
  "fillblank-choice4": w => !!normEn(w.english) && fillable(w)
};
export const isUsable = (w, modeId) => (USABLE[modeId] || USABLE["jp2en-choice4"])(w);

/* ------------------------------------------------------------ question direction & choices */
export const direction = modeId => (modeId === "en2jp-choice4" ? "en2jp" : "jp2en");
export const promptOf = (w, modeId) => (isFill(modeId) ? w.fillBlankEN : direction(modeId) === "en2jp" ? w.english : w.japanese);   // what the student reads
export const answerOf = (w, modeId) => (isFill(modeId) ? fillForm(w) : direction(modeId) === "en2jp" ? w.japanese : w.english);   // what the student picks
const looseJa = s => normJa(s).replace(/\s+/g, "").replace(/[。．.]+$/, "");                          // "ありがとう。" == "ありがとう"
function shuffleWith(a, rand) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// The 4 choices for one question: the right answer + 3 wrong ones from the same pool. Returns [{ text, ok }] in random order.
// A wrong choice never has the same English or Japanese as the target, and no two choices are the same text.
// jp2en: random wrong choices (unchanged since Phase C). en2jp: wrong Japanese choices of similar length, so a short answer is not a giveaway.
export function makeChoices(target, pool, modeId, rand = Math.random) {
  if (isFill(modeId)) return fillChoices(target, pool, rand);
  const dir = direction(modeId), opts = [];
  if (dir === "jp2en") {
    const seen = new Set([normEn(target.english)]);
    for (const w of shuffleWith(pool, rand)) {
      if (opts.length >= 3) break;
      if (sameEnglish(w, target) || sameJapanese(w, target) || seen.has(normEn(w.english))) continue;
      seen.add(normEn(w.english)); opts.push({ text: w.english, ok: false });
    }
    return shuffleWith([{ text: target.english, ok: true }, ...opts], rand);
  }
  const want = looseJa(target.japanese), len = want.length, seen = new Set([want]);
  const cands = shuffleWith(pool, rand).filter(w => !sameEnglish(w, target) && !sameJapanese(w, target) && looseJa(w.japanese) !== want);
  const near = cands.map((w, i) => ({ w, i, d: Math.abs(looseJa(w.japanese).length - len) })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, 14).map(x => x.w);
  for (const w of shuffleWith(near, rand)) {
    if (opts.length >= 3) break;
    const k = looseJa(w.japanese); if (seen.has(k)) continue;
    seen.add(k); opts.push({ text: w.japanese, ok: false });
  }
  for (const w of cands) { if (opts.length >= 3) break; const k = looseJa(w.japanese); if (seen.has(k)) continue; seen.add(k); opts.push({ text: w.japanese, ok: false }); }   // (only if the 14 nearest were not enough)
  return shuffleWith([{ text: target.japanese, ok: true }, ...opts], rand);
}

// Fill in the Blank: the right answer form + 3 other answer forms, the same kind of word first (verb with verbs, noun with nouns).
// A wrong choice is never the target's word, nor one of its accepted answers, and no two choices are the same.
function fillChoices(target, pool, rand) {
  const right = fillForm(target), used = new Set([normEn(right), normEn(target.english), ...(target.acceptedAnswers || []).map(normEn)]);
  const same = [], other = [];
  for (const w of shuffleWith(pool, rand)) {
    if (sameEnglish(w, target)) continue;
    (target.category && w.category === target.category ? same : other).push(fillForm(w));
  }
  const opts = [];
  for (const f of [...same, ...other]) {
    if (opts.length >= 3) break;
    const k = normEn(f); if (!k || used.has(k)) continue;
    used.add(k); opts.push({ text: f, ok: false });
  }
  // same capital-letter style as the right answer, so the first letter is never a giveaway
  const starts = /^_{3,}/.test(String(target.fillBlankEN || "").trim());
  const style = t => (starts ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  return shuffleWith([{ text: right, ok: true }, ...opts.map(o => ({ ...o, text: style(o.text) }))], rand);
}

/* ------------------------------------------------------------ pools */
// The fields a race uses. (The fingerprint still uses only id / English / Japanese, as before.)
function slim(w, n) {
  const o = { id: w.id, english: w.english, japanese: w.japanese, unit: Number(n) };
  if (w.fillBlankEN) { o.fillBlankEN = w.fillBlankEN; o.exampleEN = w.exampleEN || ""; o.exampleJP = w.exampleJP || ""; o.answer = fillForm(w); o.acceptedAnswers = Array.isArray(w.acceptedAnswers) ? w.acceptedAnswers.slice() : []; o.category = w.category || ""; }
  return o;
}
export function gradeList(data) {
  return ["nh1", "nh2", "nh3"].map(id => ({ id, title: data[id].title, label: data[id].label }));
}
export function unitList(data, gradeId, modeId) {
  return Object.keys(data[gradeId].units).sort((a, b) => a - b).map(n => {
    const U = data[gradeId].units[n];
    return { number: Number(n), title: U.title, subtitle: U.subtitle || "", count: buildPool(data, gradeId, [Number(n)], modeId).words.length };
  });
}
// Distinct, usable words of the chosen units (no duplicates between units).
export function buildPool(data, gradeId, unitNumbers, modeId) {
  const out = [], seen = new Set(); let unusable = 0, duplicates = 0;
  for (const n of unitNumbers) {
    const U = data[gradeId] && data[gradeId].units[String(n)]; if (!U) continue;
    for (const w of U.words) {
      if (!isUsable(w, modeId)) { unusable++; continue; }
      const k = dupKey(w); if (seen.has(k)) { duplicates++; continue; }
      seen.add(k); out.push(slim(w, n));
    }
  }
  return { words: out, unusable, duplicates };
}

/* ------------------------------------------------------------ seeded random */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function shuffleSeeded(arr, seed) { const a = arr.slice(), r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function randomSeed() { const b = new Uint32Array(1); globalThis.crypto.getRandomValues(b); return b[0]; }

// The 40 targets: a seeded shuffle of the whole pool, so the units are mixed together.
export function pickTargets(words, seed, total = TOTAL) {
  if (words.length < total) throw new Error("not enough words");
  return shuffleSeeded(words, seed).slice(0, total);
}

/* ------------------------------------------------------------ fingerprint & verification */
export async function fingerprint(words) {
  const text = words.map(w => `${w.id}|${normEn(w.english)}|${normJa(w.japanese)}`).join("\n");
  const b = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function wordIndex(data) {
  const m = new Map();
  for (const g of ["nh1", "nh2", "nh3"]) for (const [n, U] of Object.entries(data[g].units)) for (const w of U.words) m.set(w.id, slim(w, n));
  return m;
}
// Does MY copy of the vocabulary give exactly the host's 40 words? ("ok" | "missing" | "different")
export async function verifyConfig(data, config) {
  const idx = wordIndex(data), ids = Object.values(config.questionIds || {});
  if (ids.length !== TOTAL) return { status: "different", reason: "wrong number of questions" };
  const words = ids.map(id => idx.get(id));
  if (words.some(w => !w)) return { status: "missing", reason: "some words are not in your copy of the vocabulary" };
  return (await fingerprint(words)) === config.fingerprint ? { status: "ok", words } : { status: "different", reason: "the words differ from the host's" };
}
