const fs = require('fs').promises;
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Sleep function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Random sleep between 2-5 seconds
const randomSleep = async () => {
    const ms = Math.floor(Math.random() * (5000 - 2000 + 1) + 2000);
    await sleep(ms);
};

// Read JSON file
const readJsonFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return [];
    }
};

// Write JSON file
const writeJsonFile = async (filePath, data) => {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error);
    }
};

// Initialize CSV writer
const createCsvFile = (outputPath) => {
    return createCsvWriter({
        path: outputPath,
        header: [
            { id: 'Title', title: 'Title' },
            { id: 'Journal', title: 'Journal' },
            { id: 'DOI', title: 'DOI' },
            { id: 'PublicationDate', title: 'PublicationDate' },
            { id: 'GivenName', title: 'GivenName' },
            { id: 'Surname', title: 'Surname' },
            { id: 'Affiliation', title: 'Affiliation' },
            { id: 'Email', title: 'Email' },
            { id: 'AuthorProfileURL', title: 'AuthorProfileURL' },
            { id: 'AuthorContributions', title: 'AuthorContributions' },
            { id: 'URL', title: 'URL' }
        ]
    });
};

// Ensure directory exists
const ensureDirectoryExists = async (dirPath) => {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
};

module.exports = {
    sleep,
    randomSleep,
    readJsonFile,
    writeJsonFile,
    createCsvFile,
    ensureDirectoryExists
}; 