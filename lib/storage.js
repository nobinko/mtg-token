import * as fs from "node:fs/promises";
import { relative, resolve } from "node:path";
import { hostedRuntime } from "./runtime.js";

// Keep the existing local caches; hosted requests use durable, server-only R2.
function bucketPath(path) {
  const runtime = hostedRuntime();
  if (!runtime) return null;
  const key = relative(resolve(".cache"), resolve(path)).replaceAll("\\", "/");
  if (key.startsWith("../") || key === "..") return null;
  if (!runtime.env.BUCKET) throw new Error("保存領域を利用できません。時間をおいて再試行してください。");
  return { bucket: runtime.env.BUCKET, key: `cache/${key}` };
}

export async function readFile(path, encoding) {
  const target = bucketPath(path);
  if (!target) return fs.readFile(path, encoding);
  const object = await target.bucket.get(target.key);
  if (!object) throw Object.assign(new Error("Cache miss"), { code: "ENOENT" });
  return encoding ? object.text() : new Uint8Array(await object.arrayBuffer());
}

export async function writeFile(path, value, encoding) {
  const target = bucketPath(path);
  if (!target) return fs.writeFile(path, value, encoding);
  await target.bucket.put(target.key, value);
}

export async function mkdir(path, options) {
  if (!bucketPath(path)) await fs.mkdir(path, options);
}

export async function rename(from, to) {
  const source = bucketPath(from);
  const target = bucketPath(to);
  if (!source && !target) return fs.rename(from, to);
  if (!source || !target) throw new Error("保存先が不正です。");
  const object = await source.bucket.get(source.key);
  if (!object) throw new Error("保存データがありません。");
  await target.bucket.put(target.key, object.body);
  await source.bucket.delete(source.key);
}

export async function rm(path, options) {
  const target = bucketPath(path);
  if (!target) return fs.rm(path, options);
  let cursor;
  do {
    const objects = await target.bucket.list({ prefix: `${target.key}/`, cursor });
    if (objects.objects.length) await target.bucket.delete(objects.objects.map(object => object.key));
    cursor = objects.truncated ? objects.cursor : undefined;
  } while (cursor);
}
