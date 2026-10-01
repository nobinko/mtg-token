import {extractDeckEntries} from '../../lib/deck.js';

// MTGTop8 uses a legacy charset and inserts a nested div into companion rows.
// Decode bytes before parsing, and remove only that decorative marker; the
// companion's actual name and count remain part of the sideboard.
export function decodeSource(buffer, contentType = '') {
 const charset = contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1] || 'utf-8';
 return new TextDecoder(charset.replace(/["']/g, '')).decode(buffer);
}
export function extractReportDeck(html, link) {
 const clean = html.replace(/<div\b[^>]*>\s*<img\b[^>]*\bid\s*=\s*["']?companion_[^>]*>\s*<\/div>/gi, '');
 const [deck] = extractDeckEntries(clean, link.url, link.name, [], '', 'modern');
 return deck ? {...deck, ...link} : null;
}
export async function fetchSourcePage(url) {
 const response = await fetch(url, {headers:{'User-Agent':'Modern-Meta-Study/2.0 (personal educational reference)'}, signal:AbortSignal.timeout(40000)});
 if (!response.ok) throw Error(`${response.status}: ${url}`);
 return decodeSource(await response.arrayBuffer(), response.headers.get('content-type'));
}
