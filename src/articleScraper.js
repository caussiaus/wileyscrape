// wileyScraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const log = require('loglevel');
const { executablePath } = require('puppeteer');

puppeteer.use(StealthPlugin());
log.setLevel('info');

// ---- CONFIGURATION ----
const outputFolder   = path.join(__dirname, 'scraped_wiley');
const urlsFolder     = path.join(__dirname, 'output_urls');
const proxiesFilePath= path.join(__dirname, 'proxies.csv');
const useProxies     = false; // SWITCH: set true to use proxies, false to use local connection

if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

// ---- HELPERS ----
const delay = ms => new Promise(res => setTimeout(res, ms));

function loadProxies() {
  try {
    const lines = fs.readFileSync(proxiesFilePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim() && !l.includes('{host}:'));
    return lines.map(l => {
      const [host, port, username, password] = l.trim().split(':');
      if (!password) throw new Error('bad proxy format');
      return { host, port, username, password };
    });
  } catch (e) {
    log.error('Failed to load proxies:', e.message);
    return [];
  }
}

function loadUrls(filename) {
  const file = path.join(urlsFolder, filename);
  if (!fs.existsSync(file)) return [];
  const seen = new Set();
  return fs.readFileSync(file, 'utf-8')
    .trim().split('\n')
    .map(line => {
      const [label, url, doneFlag] = line.split(';');
      if (!url || seen.has(url)) return null;
      seen.add(url);
      return { line, url, processed: doneFlag === '1' };
    })
    .filter(x => x);
}

function markUrlAsProcessed(filename, origLine) {
  const file = path.join(urlsFolder, filename);
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    const updated = lines.map(l => (l === origLine && !l.endsWith(';1')) ? `${l};1` : l);
    fs.writeFileSync(file, updated.join('\n'), 'utf-8');
    return true;
  } catch (e) {
    log.error('Error marking URL:', e.message);
    return false;
  }
}

async function extractArticleData(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    log.info(`⏳ Loaded: ${url}`);

    const title = await page.$eval('h1.citation__title', el => el.textContent.trim()).catch(() => 'N/A');
    const journal = await page.$eval('span.epub-section__title', el => el.textContent.trim()).catch(() => 'N/A');
    const doi = await page.$eval('meta[name="citation_doi"]', el => el.content).catch(() => 'N/A');
    const pubDate = await page.$eval('meta[name="citation_publication_date"]', el => el.content).catch(() => 'N/A');

    const authors = await page.$$eval('a.author-name', nodes => nodes.map(a => ({
      name: a.textContent.trim(),
      profileUrl: a.href
    })));

    const rows = [];
    for (const author of authors) {
      let contributions = 'N/A';
      if (author.profileUrl.includes('/authored-by/')) {
        try {
          const newPage = await page.browser().newPage();
          await newPage.goto(author.profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          const titles = await newPage.$$eval('.citation__title', els => els.slice(0, 3).map(e => e.textContent.trim()));
          contributions = titles.join(', ');
          await newPage.close();
        } catch (e) {
          log.warn(`Failed to get author profile for ${author.name}:`, e.message);
        }
      }
      rows.push(`${title};${journal};${doi};${pubDate};${author.name};;${author.profileUrl};${contributions};${url}\n`);
    }
    return rows.join('');

  } catch (e) {
    log.error(`Failed to extract ${url}:`, e.message);
    return null;
  }
}

async function processBatch(urlFile) {
  const entries = loadUrls(urlFile);
  if (!entries.length) return log.info(`No unprocessed URLs in ${urlFile}`);

  const proxyList = useProxies ? loadProxies() : [];
  const proxy = useProxies ? proxyList[0] : null;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath(),
    args: proxy ? [`--proxy-server=${proxy.host}:${proxy.port}`, '--no-sandbox'] : ['--no-sandbox']
  });

  const page = await browser.newPage();
  if (proxy) {
    await page.authenticate({ username: proxy.username, password: proxy.password });
  }
  await page.setViewport({ width: 1280, height: 800 });

  const chapter = urlFile.replace('_urls.txt', '');
  const outPath = path.join(outputFolder, `${chapter}.csv`);
  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, 'Title;Journal;DOI;PublicationDate;Author;Email;AuthorProfileURL;AuthorContributions;URL\n');
  }

  for (const entry of entries.filter(e => !e.processed)) {
    const data = await extractArticleData(page, entry.url);
    if (data) {
      fs.appendFileSync(outPath, data);
      markUrlAsProcessed(urlFile, entry.line);
    }
    await delay(2000 + Math.random() * 2000);
  }

  await browser.close();
}

// ---- MAIN ----
(async () => {
  const files = fs.readdirSync(urlsFolder).filter(f => f.endsWith('_urls.txt'));
  for (const file of files) {
    await processBatch(file);
  }
})();
