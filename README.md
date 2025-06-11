# Wiley Academic Research Scraper

A Node.js-based web scraping project that extracts comprehensive academic research data from Wiley publications. The project is designed to gather detailed information about academic articles, including author profiles and contributions.

## Project Structure

```
.
├── src/                    # Source code directory
│   ├── linkScraper.js     # Scrapes article links from Wiley search results
│   ├── articleScraper.js  # Extracts detailed article and author information
│   ├── runScraper.js      # Orchestrates the scraping process
│   └── utils.js           # Utility functions
├── data/                   # Input data directory
│   └── keywords.csv       # Search keywords for different research areas
├── output/                 # Output directory for scraped data
│   ├── part1Links/        # JSON files containing article URLs
│   └── author_csv/        # CSV files with detailed article and author data
├── node_modules/          # Project dependencies
├── package.json           # Project configuration and dependencies
└── .gitignore            # Git ignore rules
```

## Features

- **Comprehensive Data Collection**:
  - Article metadata (title, journal, DOI, publication date)
  - Author information and profiles
  - Author contributions and related works
  - Full article URLs and references

- **Advanced Scraping Capabilities**:
  - Non-headless browser operation for monitoring
  - Stealth mode to avoid detection
  - URL tracking and logging
  - Automatic retry and error handling

- **Data Organization**:
  - Structured JSON output for article links
  - CSV format for detailed article and author data
  - Organized by research areas and keywords

## Prerequisites

- Node.js (v14 or higher)
- Google Chrome browser installed
- Access to Wiley publications

## Setup

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd wiley
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Dependencies

- `puppeteer`: Browser automation
- `puppeteer-extra` & `puppeteer-extra-plugin-stealth`: Enhanced scraping capabilities
- `dotenv`: Environment variable management
- `csv-parser` & `csv-writer`: CSV file handling
- `loglevel`: Logging utility

## Usage

The project consists of two main components:

1. **Link Scraper** (`src/linkScraper.js`):
   ```bash
   npm run scrape-links
   ```
   - Scrapes article links from Wiley search results
   - Uses keywords from `data/keywords.csv`
   - Saves results as JSON files in `output/part1Links/`

2. **Article Scraper** (`src/articleScraper.js`):
   ```bash
   node src/articleScraper.js
   ```
   - Processes article URLs from `output/part1Links/`
   - Extracts detailed article and author information
   - Saves results as CSV files in `output/author_csv/`

## Output Format

### Article Links (JSON)
```json
[
  "https://onlinelibrary.wiley.com/doi/...",
  "https://onlinelibrary.wiley.com/doi/..."
]
```

### Article Data (CSV)
- Title
- Journal
- DOI
- Publication Date
- Author Name
- Author Email
- Author Profile URL
- Author Contributions
- Article URL

## Notes

- The scraper runs in non-headless mode by default for monitoring
- Uses stealth mode to avoid detection
- Implements rate limiting and delays between requests
- Respects Wiley's terms of service and rate limits

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the ISC License. 