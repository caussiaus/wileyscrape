const path = require('path');
const fs = require('fs').promises;
const ArticleScraper = require('./articleScraper');
const { ensureDirectoryExists } = require('./utils');

async function main() {
    try {
        // Create output directory for CSV files
        const csvOutputDir = path.join(__dirname, '..', 'output', 'author_csv');
        await ensureDirectoryExists(csvOutputDir);

        // Initialize scraper
        const scraper = new ArticleScraper();
        await scraper.initialize();

        // Process files from part1Links directory
        const part1LinksDir = path.join(__dirname, '..', 'output', 'part1Links');
        const files = await fs.readdir(part1LinksDir);

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            console.log(`\nProcessing file: ${file}`);
            const inputFile = path.join(part1LinksDir, file);
            const outputFile = path.join(csvOutputDir, file.replace('.json', '.csv'));

            await scraper.processFile(inputFile, outputFile);
            console.log(`Completed processing ${file}`);
        }

        await scraper.close();
        console.log('\nScraping completed successfully!');
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

main(); 