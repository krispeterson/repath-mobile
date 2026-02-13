#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

function parseArgs(argv) {
  const args = {
    index: null,
    itemsDir: null,
    baseUrl: null,
    fetchItems: false,
    downloadDir: null,
    allowlist: null,
    outDir: path.join("assets", "models"),
    includeKeywords: true
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--index") {
      args.index = argv[++i];
    } else if (arg === "--items-dir") {
      args.itemsDir = argv[++i];
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++i];
    } else if (arg === "--fetch-items") {
      args.fetchItems = true;
    } else if (arg === "--download-dir") {
      args.downloadDir = argv[++i];
    } else if (arg === "--allowlist") {
      args.allowlist = argv[++i];
    } else if (arg === "--out-dir") {
      args.outDir = argv[++i];
    } else if (arg === "--no-keywords") {
      args.includeKeywords = false;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects"));
      return;
    }
    const client = url.startsWith("https://") ? https : http;
    client
      .get(url, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          fetchUrl(nextUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        if (status >= 400) {
          reject(new Error(`Request failed with status ${status}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      })
      .on("error", reject);
  });
}

async function readSource(source) {
  if (isUrl(source)) {
    return fetchUrl(source);
  }
  return fs.readFileSync(source, "utf-8");
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  return text
    .replace(/&([a-z]+);/gi, (match, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
    })
    .replace(/&#(\d+);/g, (match, num) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    });
}

function cleanText(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function extractTables(html) {
  return html.match(/<table[\s\S]*?<\/table>/gi) || [];
}

function chooseTable(tables) {
  for (const table of tables) {
    const text = cleanText(stripTags(table)).toLowerCase();
    if (text.includes("keywords") && text.includes("item")) {
      return table;
    }
  }
  return tables[0] || "";
}

function extractRows(tableHtml) {
  return tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
}

function extractCells(rowHtml) {
  return rowHtml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
}

function extractAnchors(html) {
  const anchors = [];
  const re = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    anchors.push({ href: match[1], text: cleanText(stripTags(match[2])) });
  }
  return anchors;
}

function extractItemId(href) {
  if (!href) return null;
  const match = href.match(/[?&]item=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractHeading(html) {
  const re = /<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/i;
  const match = html.match(re);
  return match ? cleanText(stripTags(match[2])) : "";
}

function splitKeywords(text) {
  return text
    .split(/[;|,]/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function normalizeLabel(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function findDetailFile(itemsDir, itemId) {
  if (!itemsDir || !itemId) return null;
  const candidates = [
    path.join(itemsDir, `${itemId}.html`),
    path.join(itemsDir, `${itemId}.htm`)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const files = fs.readdirSync(itemsDir);
    const match = files.find((name) => name.includes(itemId));
    return match ? path.join(itemsDir, match) : null;
  } catch (error) {
    return null;
  }
}

function resolveHref(href, baseUrl) {
  if (!href) return null;
  if (isUrl(href)) return href;
  if (!baseUrl) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return null;
  }
}

function ensureDir(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.index) {
    console.log("Usage: node scripts/extract-class-list.js --index <file-or-url> [--items-dir path/to/items] [--base-url https://example] [--fetch-items] [--download-dir path/to/save] [--allowlist path/to/list.txt] [--out-dir assets/models] [--no-keywords]");
    process.exit(args.help ? 0 : 1);
  }

  const indexHtml = await readSource(args.index);
  const tables = extractTables(indexHtml);
  const table = chooseTable(tables);
  if (!table) {
    throw new Error("No table found in index HTML.");
  }

  const rows = extractRows(table);
  if (!rows.length) {
    throw new Error("No table rows found in index HTML.");
  }

  let keywordIndex = -1;
  let headerFound = false;
  const items = [];
  const classes = new Map();
  let allowlist = null;
  if (args.allowlist) {
    const rawAllow = fs.readFileSync(args.allowlist, "utf-8");
    allowlist = rawAllow
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const indexBaseUrl = isUrl(args.index) ? args.index : args.baseUrl;
  const downloadDir = args.downloadDir ? path.resolve(args.downloadDir) : null;
  ensureDir(downloadDir);

  for (const row of rows) {
    const cells = extractCells(row);
    if (!cells.length) continue;

    const cellTexts = cells.map((cell) => cleanText(stripTags(cell)));
    const cellTextLower = cellTexts.map((text) => text.toLowerCase());

    if (!headerFound && cellTextLower.includes("keywords")) {
      keywordIndex = cellTextLower.indexOf("keywords");
      headerFound = true;
      continue;
    }
    if (!headerFound) continue;

    const anchors = extractAnchors(row);
    const anchorWithText = anchors.find((a) => a.text);
    const name = anchorWithText?.text || cellTexts[0] || "";
    if (!name) continue;

    const href = anchorWithText?.href || "";
    const itemId = extractItemId(href);
    const keywordText = keywordIndex >= 0 ? cellTexts[keywordIndex] || "" : "";
    const keywords = args.includeKeywords ? splitKeywords(keywordText) : [];

    const resolvedHref = resolveHref(href, indexBaseUrl);
    const item = { id: itemId, name, keywords, href: resolvedHref || href || null };
    if (args.itemsDir && itemId) {
      const detailFile = findDetailFile(args.itemsDir, itemId);
      if (detailFile) {
        const detailHtml = fs.readFileSync(detailFile, "utf-8");
        const detailName = extractHeading(detailHtml);
        if (detailName) {
          item.detail_name = detailName;
        }
        item.detail_file = path.relative(process.cwd(), detailFile);
      }
    } else if (args.fetchItems && resolvedHref) {
      try {
        const detailHtml = await fetchUrl(resolvedHref);
        const detailName = extractHeading(detailHtml);
        if (detailName) {
          item.detail_name = detailName;
        }
        if (downloadDir) {
          const filename = itemId ? `${itemId}.html` : `${slugify(detailName || name)}.html`;
          const outPath = path.join(downloadDir, filename);
          fs.writeFileSync(outPath, detailHtml, "utf-8");
          item.detail_file = path.relative(process.cwd(), outPath);
        }
      } catch (error) {
        item.detail_error = String(error.message || error);
      }
    }
    items.push(item);

    const normName = normalizeLabel(name);
    if (normName && !classes.has(normName)) {
      classes.set(normName, name);
    }
    for (const keyword of keywords) {
      const normKeyword = normalizeLabel(keyword);
      if (normKeyword && !classes.has(normKeyword)) {
        classes.set(normKeyword, keyword);
      }
    }
  }

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  let classesList = Array.from(classes.values());
  let missingAllowlist = [];
  if (allowlist) {
    const allowMap = new Map();
    for (const entry of allowlist) {
      allowMap.set(normalizeLabel(entry), entry);
    }
    const filtered = [];
    for (const entry of allowlist) {
      const key = normalizeLabel(entry);
      if (classes.has(key)) {
        filtered.push(classes.get(key));
      } else {
        missingAllowlist.push(entry);
      }
    }
    classesList = filtered;
    if (missingAllowlist.length) {
      console.log(`Warning: ${missingAllowlist.length} allowlist entries not found in index.`);
    }
  }
  fs.writeFileSync(path.join(outDir, "classes.json"), JSON.stringify(classesList, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(outDir, "classes.txt"), classesList.join("\n") + "\n", "utf-8");

  const meta = {
    extracted_at: new Date().toISOString(),
    index: path.relative(process.cwd(), path.resolve(args.index)),
    items_dir: args.itemsDir ? path.relative(process.cwd(), path.resolve(args.itemsDir)) : null,
    allowlist: args.allowlist ? path.relative(process.cwd(), path.resolve(args.allowlist)) : null,
    missing_allowlist: missingAllowlist.length ? missingAllowlist : null,
    include_keywords: args.includeKeywords,
    items
  };
  fs.writeFileSync(path.join(outDir, "classes.meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf-8");

  console.log(`Wrote ${classesList.length} classes to ${path.join(outDir, "classes.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
