// Rebuild data/photo-embeddings.json after editing data/photos.json.
// From the repo root, with @huggingface/transformers installed:
//   node scripts/embed-photos.mjs

import { readFile, writeFile } from "node:fs/promises";
import { pipeline, env } from "@huggingface/transformers";

const model = "Xenova/all-MiniLM-L6-v2";
const dtype = "q8";
const minScore = 0.55;
const tightScore = 0.73;
const tightAt = 0.7;

env.cacheDir = new URL("../.cache/transformers/", import.meta.url).pathname;

const photos = JSON.parse(
  await readFile(new URL("../data/photos.json", import.meta.url), "utf8")
);

const extractor = await pipeline("feature-extraction", model, { dtype });

async function embed(text) {
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data, (n) => Math.round(n * 1e5) / 1e5);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function best(vector, photo) {
  let score = -1;
  for (const embedding of photo.embeddings) {
    const next = dot(vector, embedding);
    if (next > score) score = next;
  }
  return score;
}

const indexed = [];
for (const photo of photos) {
  const embeddings = [];
  for (const phrase of photo.phrases) embeddings.push(await embed(phrase));
  indexed.push({ id: photo.id, phrases: photo.phrases, embeddings });
}

const index = { model, dtype, minScore, tightScore, tightAt, photos: indexed };

await writeFile(
  new URL("../data/photo-embeddings.json", import.meta.url),
  JSON.stringify(index)
);

const probes = [
  "hockey",
  "running",
  "conference",
  "poster",
  "research",
  "school",
  "campus",
  "new york",
  "night",
  "skyline",
  "tesla",
  "truck",
  "car",
  "factory",
  "austin",
  "arduino",
  "circuit",
  "robot",
  "hackathon",
  "soccer",
  "football",
  "hike",
  "mountains",
  "snow",
  "lake",
  "chess",
  "board game",
  "purple",
  "waterloo",
  "toronto",
  "cn tower",
  "medal",
  "ice",
  "sports",
  "winter",
  "electronics",
  "hardware",
  "mountain",
  "desert",
  "pizza",
  "ocean",
  "something i like to do",
  "things i like to do",
  "hobbies",
  "for fun",
  "hocke",
];

for (const probe of probes) {
  const vector = await embed(probe);
  const ranked = indexed
    .map((photo) => ({ id: photo.id, score: best(vector, photo) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0].score;
  const floor = top >= tightAt ? tightScore : minScore;
  const shown =
    top >= minScore
      ? ranked.filter((item, i) => i === 0 || item.score >= floor)
      : [];
  const line = shown.map((item) => `${item.id} ${item.score.toFixed(3)}`).join(", ");
  console.log(`${probe.padEnd(26)} ${line || "none"}`);
}

console.log(`wrote ${indexed.length} photos`);
