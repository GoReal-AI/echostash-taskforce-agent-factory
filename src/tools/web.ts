/**
 * Web tools — search and fetch with clean text extraction.
 *
 * Uses Google Custom Search API for search, and a HTML-to-text
 * approach for fetching pages (strips tags, extracts readable content).
 */

import { execSync } from 'child_process';
import type { ToolDef } from '../core/tool-types.js';

/**
 * Web search using Google (via scraping the search results page).
 * Falls back to a simple curl-based approach.
 */
export const webSearchTool: ToolDef = {
  name: 'web_search',
  description: 'Search the web and return a list of results with titles, URLs, and snippets. Use this to find information online.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      numResults: { type: 'number', description: 'Number of results. Default: 5' },
    },
    required: ['query'],
  },
  async execute(input) {
    const query = input.query as string;
    const num = (input.numResults as number) ?? 5;

    try {
      // Use Python to do a clean web search (more reliable than curl + grep)
      const script = `
import urllib.request, urllib.parse, json, re, html

query = ${JSON.stringify(query)}
url = f"https://www.google.com/search?q={urllib.parse.quote(query)}&num=${num}"
headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
req = urllib.request.Request(url, headers=headers)
resp = urllib.request.urlopen(req, timeout=10)
text = resp.read().decode("utf-8", errors="ignore")

# Extract search results
results = []
# Find all result blocks
for match in re.finditer(r'<a href="/url\\?q=([^&"]+).*?>(.*?)</a>', text):
    link = urllib.parse.unquote(match.group(1))
    title = re.sub(r'<[^>]+>', '', match.group(2))
    title = html.unescape(title).strip()
    if link.startswith('http') and title and '/search?' not in link:
        results.append({"url": link, "title": title})

# Deduplicate by URL
seen = set()
unique = []
for r in results:
    if r["url"] not in seen:
        seen.add(r["url"])
        unique.append(r)

for i, r in enumerate(unique[:${num}]):
    print(f"{i+1}. {r['title']}")
    print(f"   {r['url']}")
    print()

if not unique:
    print("No results found.")
`;
      const result = execSync(`python3 -c ${JSON.stringify(script)}`, {
        timeout: 15000,
        encoding: 'utf-8',
      });
      return result || 'No results found.';
    } catch (error: any) {
      return `Search failed: ${error.message}`;
    }
  },
};

/**
 * Fetch a web page and return clean text content (no HTML tags).
 */
export const webFetchTool: ToolDef = {
  name: 'web_fetch',
  description: 'Fetch a web page and return its text content (HTML stripped). Use this to read the content of a specific URL.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      maxLength: { type: 'number', description: 'Max characters to return. Default: 5000' },
    },
    required: ['url'],
  },
  async execute(input) {
    const url = input.url as string;
    const maxLen = (input.maxLength as number) ?? 5000;

    try {
      const script = `
import urllib.request, re, html

url = ${JSON.stringify(url)}
headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
req = urllib.request.Request(url, headers=headers)
resp = urllib.request.urlopen(req, timeout=15)
raw = resp.read().decode("utf-8", errors="ignore")

# Remove script and style tags
text = re.sub(r'<script[^>]*>.*?</script>', '', raw, flags=re.DOTALL)
text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
# Remove HTML tags
text = re.sub(r'<[^>]+>', ' ', text)
# Decode HTML entities
text = html.unescape(text)
# Collapse whitespace
text = re.sub(r'\\s+', ' ', text).strip()
# Trim
text = text[:${maxLen}]

print(text)
`;
      const result = execSync(`python3 -c ${JSON.stringify(script)}`, {
        timeout: 20000,
        encoding: 'utf-8',
      });
      return result || 'Empty page.';
    } catch (error: any) {
      return `Fetch failed: ${error.message}`;
    }
  },
};
