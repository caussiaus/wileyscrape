// src/articleScraper.js
require('dotenv').config();
const fs  = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const csvWriter = require('csv-write-stream');

(async ()=>{
  const links = await fs.readJson('links.json');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(+process.env.TIMEOUT);

  // prepare merged CSV
  const writer = csvWriter({ headers: ['file','title','authors','abstract'] });
  writer.pipe(fs.createWriteStream('output/merged.csv'));

  for (let i=0; i<links.length; i++) {
    const url = links[i];
    await page.goto(url);

    // extract fields — tweak selectors as needed
    const title = await page.$eval('h1.article-title', el => el.innerText.trim());
    const authors = await page.$$eval('.authors-list span.name', els => els.map(e=>e.innerText).join('; '));
    const abstract = await page.$eval('.article-section__content p', el => el.innerText.trim());

    // save per-article JSON
    const fileName = `article_${i+1}.json`;
    const filePath = path.join('output','articles', fileName);
    await fs.writeJson(filePath, { url, title, authors, abstract }, { spaces:2 });

    // append to merged.csv
    writer.write({ file: fileName, title, authors, abstract });
    console.log(`✅  Scraped ${i+1}/${links.length}`);
  }

  writer.end();
  await browser.close();
  console.log('All done — output in output/');
})();
