import { mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';

// An uncached cross-format scan can exceed fetch's five-minute headers limit.
// Keep the bounded audit connected while the server finishes the same request.
function search(body) {
  return new Promise((resolve, reject) => {
    const req = request('http://localhost:5177/api/token-cards', { method: 'POST', headers: { 'content-type': 'application/json' }, timeout: 1800000 }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        try { resolve({ ok: response.statusCode === 200, status: response.statusCode, result: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Preparation audit exceeded 30 minutes')));
    req.end(JSON.stringify(body));
  });
}

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const formats = process.argv.slice(3).length ? process.argv.slice(3) : ['standard', 'legacy', 'pioneer'];
const dir = new URL(`../.cache/format-preparation-${date}/`, import.meta.url);
await mkdir(dir, { recursive: true });
for (const format of formats) {
  if (!['standard', 'legacy', 'pioneer', 'modern'].includes(format)) throw new Error('Unsupported format');
  console.log(`Start ${format}: target 300 published lists`);
  const response = await search({ format, targetDate: date, maxChildPages: 300, useCache: true });
  const { result } = response;
  await writeFile(new URL(`${format}.json`, dir), JSON.stringify(result, null, 2) + '\n');
  if (!response.ok) throw new Error(`${format}: ${response.status} ${result.error}`);
  console.log(JSON.stringify({ format, start: result.environmentStartDate, lists: result.searchedDeckCount,
    sources: result.cards?.length, objects: result.objects?.length, candidates: result.candidateCount,
    errors: result.errors, issues: result.sourceIssues, warnings: result.objectWarnings, unresolved: result.unresolvedCardCount,
    bySite: result.siteStats }));
}
