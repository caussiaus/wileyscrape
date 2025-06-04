// ─── src/linkScraper.js ─────────────────────────────────────────────────────────

require("dotenv").config();
const fs        = require("fs-extra");
const path      = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");

// Add stealth plugin so Wiley’s anti‐bot checks are bypassed
puppeteer.use(StealthPlugin());

/**
 * 1) Helper: Build a “doSearch” URL that:
 *    • Filters “Journals since January 2015”
 *    • Applies a single ConceptID (87 or 41)
 *    • Searches “Anywhere = <keyword>” (field1=AllField & text1=…)
 *    • Restricts results to “Articles & Chapters” (content=articlesChapters)
 *    • Sets pageSize & startPage for pagination
 *
 *    We rely on URLSearchParams to convert spaces into “+”, so
 *    “Artificial Intelligence” becomes “Artificial+Intelligence” in the query string.
 */
function makeSearchUrl({
  keyword    = "",      // e.g. "Artificial Intelligence"
  conceptId  = 87,      // 87=Accounting; 41=Business & Management
  afterYear  = 2015,
  afterMonth = 1,
  beforeYear = "",
  beforeMonth= "",
  pubType    = "journal",
  pageSize   = 100,
  startPage  = 1
} = {}) {
  const params = new URLSearchParams();

  // 1) Date filter: Since Jan 2015
  params.set("AfterMonth",  afterMonth);
  params.set("AfterYear",   afterYear);
  params.set("BeforeMonth", beforeMonth);
  params.set("BeforeYear",  beforeYear);

  // 2) Subject filter (either 87 or 41)
  params.set("ConceptID",   conceptId);

  // 3) Only “Journal” content type
  params.set("PubType",      pubType);

  // 4) KEYWORD (Anywhere in metadata) — raw string let URLSearchParams do encoding
  params.set("field1",       "AllField");
  params.set("text1",        keyword);

  // 5) No specific journal name
  params.set("publication",  "");

  // 6) Restrict to “Articles & Chapters”
  params.set("content",      "articlesChapters");

  // 7) Pagination
  params.set("pageSize",     pageSize);
  params.set("startPage",    startPage);

  return "https://onlinelibrary.wiley.com/action/doSearch?" + params.toString();
}


/**
 * 2) Scrape all DOI‐links for a single (subject, keyword) pairing.
 *
 *    Steps:
 *    1) Launch Puppeteer (with optional proxy)
 *    2) Open a tab for page 1; wait for <span.result__count> and at least one <a href^="/doi/">
 *    3) Parse totalCount, compute maxPages = ceil(totalCount / pageSize)
 *    4) Extract DOI links from page 1 (one DOI per <li.search__item> if present; else fallback to all <a href^="/doi/">)
 *    5) Close page 1; then loop pages 2..maxPages:
 *         a) Open a new tab, navigate with 30 s timeout, wait for <a href^="/doi/">
 *         b) Extract links exactly as in step 4; close the tab
 *         c) If this page adds zero *new* links to our Set, break out (Wiley has started repeating results)
 *    6) Write deduplicated JSON array of all “https://onlinelibrary.wiley.com/doi/…” URLs
 */
async function scrapeLinksForPair({
  keyword,
  conceptId,
  subjectName,      // "accounting" or "business_and_management"
  afterYear   = 2015,
  pageSize    = 100,
  proxyServer = null
}) {
  // 1) Launch Puppeteer
  const launchArgs = {
    headless: true,
    executablePath: process.env.CHROME_PATH || executablePath(),
    args: []
  };
  if (proxyServer) {
    launchArgs.args.push(`--proxy-server=${proxyServer}`);
  }
  const browser = await puppeteer.launch(launchArgs);

  // 2) Ensure output directory for this subject exists
  const outDir = path.resolve(__dirname, `../output/links-${subjectName}`);
  await fs.ensureDir(outDir);

  // 3) Open a single tab for page 1
  const page = await browser.newPage();
  const NAV_TIMEOUT = 30000; // 30 s for both navigation & selector waits
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  page.setDefaultTimeout(NAV_TIMEOUT);

  if (proxyServer) {
    // If your proxy requires auth, you could do:
    // await page.authenticate({ username: "user", password: "pass" });
  }

  // 4) Navigate to page 1
  const urlPage1 = makeSearchUrl({
    keyword,
    conceptId,
    afterYear,
    pageSize,
    startPage: 1
  });
  console.log(`\n→ [${subjectName.toUpperCase()}] page=1 | "${keyword}"`);
  console.log(`  ${urlPage1}`);
  try {
    await page.goto(urlPage1, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
  } catch (err) {
    console.error(`Error loading page 1 for "${keyword}": ${err.message}`);
    await page.close();
    await browser.close();
    return;
  }

  // 4a) Wait for both <span.result__count> and at least one <a href^="/doi/">
  try {
    await page.waitForSelector("span.result__count", { timeout: NAV_TIMEOUT });
    await page.waitForSelector("a[href^='/doi/']",   { timeout: NAV_TIMEOUT });
  } catch (err) {
    console.error(
      `Could not find <span.result__count> or any <a href^="/doi/"> on page 1 for "${keyword}": ${err.message}`
    );
    await page.close();
    await browser.close();
    return;
  }

  // 4b) Parse totalCount, compute maxPages
  let totalCount = 0;
  try {
    const rawCount = await page.$eval("span.result__count", el => el.innerText.trim());
    totalCount = parseInt(rawCount.replace(/,/g, ""), 10);
    if (isNaN(totalCount) || totalCount < 1) {
      console.warn(`Parsed totalCount invalid for "${keyword}". Falling back to pageSize.`);
      totalCount = pageSize;
    }
  } catch (err) {
    console.warn(`Error reading totalCount for "${keyword}": ${err.message}`);
    totalCount = pageSize;
  }
  const maxPages = Math.ceil(totalCount / pageSize);
  console.log(`  → totalCount = ${totalCount}; pageSize = ${pageSize}; maxPages = ${maxPages}`);

  // Prepare a Set to dedupe all DOI URLs
  const allHrefs = new Set();

  // 5) Extract from page 1
  try {
    // Attempt #1: exactly one DOI per <li.search__item>
    const hrefsOnPage1 = await page.$$eval(
      "li.search__item",
      items =>
        items
          .map(li => {
            const a = li.querySelector("a[href^='/doi/']");
            return a ? a.getAttribute("href") : null;
          })
          .filter(h => h !== null)
    );

    if (hrefsOnPage1.length > 0) {
      hrefsOnPage1.forEach(rel => {
        allHrefs.add("https://onlinelibrary.wiley.com" + rel);
      });
      console.log(`  → Page 1: extracted ${hrefsOnPage1.length} DOI links (total so far: ${allHrefs.size})`);
    } else {
      // Fallback: grab *all* <a href^="/doi/"> if no <li.search__item> was found
      const fallbackHref = await page.$$eval(
        "a[href^='/doi/']",
        anchors => anchors.map(a => a.getAttribute("href"))
      );
      fallbackHref.forEach(rel => {
        allHrefs.add("https://onlinelibrary.wiley.com" + rel);
      });
      console.log(
        `  → Page 1 (Fallback): extracted ${fallbackHref.length} DOI links (total so far: ${allHrefs.size})`
      );
    }
  } catch (err) {
    console.error(`Error extracting DOI links on page 1 for "${keyword}": ${err.message}`);
  }
  await page.close();

  // 6) Loop pages 2..maxPages
  for (let pageIndex = 2; pageIndex <= maxPages; pageIndex++) {
    const pageUrl = makeSearchUrl({
      keyword,
      conceptId,
      afterYear,
      pageSize,
      startPage: pageIndex
    });
    console.log(`\n→ [${subjectName.toUpperCase()}] page=${pageIndex}/${maxPages} | "${keyword}"`);
    console.log(`  ${pageUrl}`);

    const p = await browser.newPage();
    p.setDefaultNavigationTimeout(NAV_TIMEOUT);
    p.setDefaultTimeout(NAV_TIMEOUT);

    try {
      await p.goto(pageUrl, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
      await p.waitForSelector("a[href^='/doi/']", { timeout: NAV_TIMEOUT });
    } catch (err) {
      console.error(`Error loading page ${pageIndex} for "${keyword}": ${err.message}`);
      await p.close();
      break; // bail out if this page fails
    }

    // 6a) Extract from this page (same “one per <li.search__item>” + fallback logic)
    const beforeCount = allHrefs.size;
    try {
      // Try exactly one DOI per <li.search__item>
      const hrefsOnThisPage = await p.$$eval(
        "li.search__item",
        items =>
          items
            .map(li => {
              const a = li.querySelector("a[href^='/doi/']");
              return a ? a.getAttribute("href") : null;
            })
            .filter(h => h !== null)
      );

      if (hrefsOnThisPage.length > 0) {
        hrefsOnThisPage.forEach(rel => {
          allHrefs.add("https://onlinelibrary.wiley.com" + rel);
        });
        const afterCount = allHrefs.size;
        console.log(
          `  → Page ${pageIndex}: extracted ${hrefsOnThisPage.length} DOI links, set grew by ${afterCount - beforeCount}`
        );
      } else {
        // Fallback: all <a href^="/doi/"> if no <li.search__item>
        const fallbackHref = await p.$$eval(
          "a[href^='/doi/']",
          anchors => anchors.map(a => a.getAttribute("href"))
        );
        fallbackHref.forEach(rel => {
          allHrefs.add("https://onlinelibrary.wiley.com" + rel);
        });
        const afterCount = allHrefs.size;
        console.log(
          `  → Page ${pageIndex} (Fallback): extracted ${fallbackHref.length} DOI links, set grew by ${afterCount - beforeCount}`
        );
      }
    } catch (err) {
      console.error(`Error extracting DOI links on page ${pageIndex} for "${keyword}": ${err.message}`);
    }

    await p.close();

    // 6b) If this page yielded no new links, stop paginating (Wiley is repeating results)
    if (allHrefs.size === beforeCount) {
      console.log(`  → No new links on page ${pageIndex}, stopping early (likely repeats).`);
      break;
    }
  }

  // 7) Write final JSON for (subjectName, keyword)
  const safeKeyword = keyword
    .trim()
    .replace(/\s+/g, "_")        // spaces → underscore
    .replace(/[^\w_-]/g, "");    // remove any non–alphanumeric/underscore
  const outputPath = path.join(outDir, `${subjectName}_${safeKeyword}.json`);
  await fs.writeJson(outputPath, Array.from(allHrefs), { spaces: 2 });
  console.log(`\n✔ [${subjectName}] saved ${allHrefs.size} total URLs → ${outputPath}`);

  // Close Puppeteer
  await browser.close();
}


/**
 * 3) MAIN
 *    - Read keywords from data/keywords.csv
 *    - For each of two subjects (Accounting, Business & Management), loop over all keywords
 *    - Check if output JSON already exists; if yes, skip
 *    - Otherwise, call scrapeLinksForPair()
 *    - Finally build a “master” JSON per subject mapping keyword → [URLs]
 */
(async () => {
  // ─── (A) Read keywords from data/keywords.csv ───────────────────────────────
  const csvPath = path.resolve(__dirname, "../data/keywords.csv");
  let csvData;
  try {
    csvData = await fs.readFile(csvPath, "utf8");
  } catch (err) {
    console.error("✖ Could not read data/keywords.csv. Make sure the file exists and is UTF-8.");
    process.exit(1);
  }

  // Split on newlines, trim, filter out empty lines
  const KEYWORD_BANK = csvData
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (KEYWORD_BANK.length === 0) {
    console.error("✖ No keywords found in data/keywords.csv—exiting.");
    process.exit(1);
  }
  console.log(`→ Loaded ${KEYWORD_BANK.length} keywords from data/keywords.csv.`);

  // ─── (B) Define subject filters ───────────────────────────────────────────────
  const SUBJECTS = [
    {
      name:      "accounting",
      conceptId: 87
    },
    {
      name:      "business_and_management",
      conceptId: 41
    }
  ];

  // ─── (C) Optional: Proxy (if any). Otherwise null.
  const PROXY = null;
  // Example: "http://username:password@host:port"

  // ─── (D) Loop over each subject & each keyword ───────────────────────────────
  for (let subj of SUBJECTS) {
    console.log(`\n==========\nStarting subject: ${subj.name} (ConceptID=${subj.conceptId})\n==========`);

    // Ensure the folder is there
    const outDir = path.resolve(__dirname, `../output/links-${subj.name}`);
    await fs.ensureDir(outDir);

    for (let kw of KEYWORD_BANK) {
      // Compute safeKeyword & outputPath up front so we can skip if it already exists
      const safeKeyword = kw
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w_-]/g, "");
      const outputPath = path.join(outDir, `${subj.name}_${safeKeyword}.json`);

      if (await fs.pathExists(outputPath)) {
        console.log(`→ [${subj.name.toUpperCase()}] skipping "${kw}" (already have ${outputPath})`);
        continue;
      }

      // Otherwise, scrape this (subject, keyword)
      await scrapeLinksForPair({
        keyword:     kw,
        conceptId:   subj.conceptId,
        subjectName: subj.name,
        afterYear:   2015,
        pageSize:    100,
        proxyServer: PROXY
      });
    }

    // ─── (E) Build a “master” JSON mapping keyword → [URLs] for this subject ───────
    const files = await fs.readdir(outDir);
    const master = {};

    for (let fn of files) {
      if (fn.endsWith(".json") && fn.startsWith(subj.name + "_")) {
        const keywordKey = fn.replace(`${subj.name}_`, "").replace(/\.json$/, "");
        const arr = await fs.readJson(path.join(outDir, fn));
        master[keywordKey] = arr;
      }
    }

    const masterPath = path.join(outDir, `all_${subj.name}_links.json`);
    await fs.writeJson(masterPath, master, { spaces: 2 });
    console.log(`✔ Wrote master JSON for subject="${subj.name}" → ${masterPath}`);
  }

  console.log("\n✅ Phase 1 (link scraping) finished.");
})();
