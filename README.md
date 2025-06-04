# Wiley Article Scraper

A Node.js-based web scraping project that extracts article information from Wiley publications. The project consists of two main components: a link scraper and an article scraper.

## Project Structure

```
.
├── src/                    # Source code directory
│   ├── linkScraper.js     # Scrapes article links from Wiley
│   └── articleScraper.js  # Extracts article details from individual pages
├── data/                   # Data storage directory
├── output/                 # Output directory for scraped data
│   └── articles/          # Individual article JSON files
├── node_modules/          # Project dependencies
├── package.json           # Project configuration and dependencies
└── .env                   # Environment variables (not tracked in git)
```

## Prerequisites

- Node.js (v14 or higher)
- Google Chrome browser installed
- Access to Wiley publications

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Dependencies

- `puppeteer`: Headless Chrome automation
- `puppeteer-extra` & `puppeteer-extra-plugin-stealth`: Enhanced scraping capabilities
- `dotenv`: Environment variable management
- `csv-parser`: CSV file handling

## Configuration

The scraper is configured to:
- Run in non-headless mode (visible browser)
- Use the local Chrome installation at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Set a default timeout of 30 seconds
- Use stealth mode to avoid detection

## Usage

The project consists of two main scripts:

1. **Link Scraper** (`src/linkScraper.js`)
   - Scrapes article links from Wiley publications
   - Saves links to `links.json`

2. **Article Scraper** (`src/articleScraper.js`)
   - Processes each article URL from `links.json`
   - Extracts:
     - Title
     - Authors
     - Abstract
   - Saves individual article data as JSON files in `output/articles/`
   - Creates a merged CSV file (`output/merged.csv`) with all article data

## Output

The scraper generates two types of output:

1. Individual JSON files in `output/articles/` containing:
   - Article URL
   - Title
   - Authors
   - Abstract

2. A merged CSV file (`output/merged.csv`) containing all article data in a tabular format

## Notes

- The scraper runs in non-headless mode by default (browser is visible)
- Uses stealth mode to avoid detection
- Make sure to respect Wiley's terms of service and rate limits when scraping 