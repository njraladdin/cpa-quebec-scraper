const axios = require('axios');
const qs = require('qs');
const cheerio = require('cheerio');
const EventEmitter = require('events');
const generateCaptchaTokens = require('./generateCaptchaTokensWithAudio');
const dotenv = require('dotenv');
const fs = require('fs');
const clc = require('cli-color');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const rimraf = require('rimraf');
const SystemMonitor = require('./SystemMonitor');

dotenv.config();

const dbPath = path.join(__dirname, 'cpa_data.db');

class ResultTracker {
    constructor() {
        this.attempts = 0;
        this.successes = 0;
        this.scriptStartTime = Date.now();
        this.currentPermitNumber = null;
        this.currentWorkingNumber = null;
    }

    startTracking() {
        // Empty now, attempts counting moved to record methods
    }

    setCurrentPermit(numericPart) {
        this.currentPermitNumber = numericPart;
    }

    getElapsedTime() {
        return (Date.now() - this.scriptStartTime) / 1000;
    }

    getEstimatedTimeRemaining() {
        if (!this.currentPermitNumber || this.attempts === 0) return 'N/A';

        const remainingNumbers = 151000 - this.currentPermitNumber;
        const avgTimePerSuccess = this.getElapsedTime() / this.attempts;
        const estimatedSecondsLeft = avgTimePerSuccess * remainingNumbers;
        
        const hours = Math.floor(estimatedSecondsLeft / 3600);
        const minutes = Math.floor((estimatedSecondsLeft % 3600) / 60);
        const seconds = Math.floor(estimatedSecondsLeft % 60);
        
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    printStats() {
        const successRate = ((this.successes / this.attempts) * 100).toFixed(1);
        const avgTime = (this.getElapsedTime() / this.attempts).toFixed(2);
        const totalTime = this.getElapsedTime().toFixed(2);
        const estimatedTimeLeft = this.getEstimatedTimeRemaining();
        
        console.log(
            clc.magenta('[Stats]') + ' ' +
            clc.cyan('Success: ') + clc.white(`${this.successes}/${this.attempts}`) + 
            clc.cyan(' (') + clc.white(`${successRate}%`) + clc.cyan(')') + ' | ' +
            clc.cyan('Avg Time: ') + clc.white(`${avgTime}s`) + ' | ' +
            clc.cyan('Total Time: ') + clc.white(`${totalTime}s`) + ' | ' +
            clc.cyan('Est. Remaining: ') + clc.white(`${estimatedTimeLeft}`) + ' | ' +
            clc.cyan('Current CPA: ') + clc.white(`${this.currentWorkingNumber || 'N/A'}`)
        );
    }

    recordSuccess() {
        this.successes++;
        this.attempts++;
        this.printStats();
    }

    recordFailure() {
        this.attempts++;
        this.printStats();
    }

    setCurrentWorkingNumber(cpaNumber) {
        this.currentWorkingNumber = cpaNumber;
    }
}

class Database {
    constructor(dbPath) {
        this.dbPath = dbPath;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                this.db.serialize(() => {
                    // Existing CPA records table
                    this.db.run(`CREATE TABLE IF NOT EXISTS cpa_records (
                        permit_number TEXT PRIMARY KEY,
                        cpa_id TEXT,
                        name TEXT,
                        company TEXT,
                        address TEXT,
                        phone TEXT,
                        full_url TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`);

                    // Table for tracking last checked ID
                    this.db.run(`CREATE TABLE IF NOT EXISTS last_checked (
                        id INTEGER PRIMARY KEY,
                        permit_number TEXT NOT NULL,
                        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`);

                    resolve(this);
                });
            });
        });
    }

    async saveCPA(cpaDetails, url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const cpaId = decodeURIComponent(urlObj.searchParams.get('id'));
            
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO cpa_records 
                (permit_number, cpa_id, name, company, address, phone, full_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            
            stmt.run(
                cpaDetails.permitNumber,
                cpaId,
                cpaDetails.name,
                cpaDetails.company,
                cpaDetails.address,
                cpaDetails.phone,
                url,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
            
            stmt.finalize();
        });
    }

    async getLastCheckedPermitNumber() {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT permit_number 
                 FROM last_checked 
                 ORDER BY checked_at DESC 
                 LIMIT 1`,
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(row ? row.permit_number : null);
                }
            );
        });
    }

    async updateLastCheckedPermitNumber(permitNumber) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO last_checked (permit_number) VALUES (?)`,
                [permitNumber],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

async function searchCPA({permitNumber, captchaToken=null}) {
    let data = qs.stringify({
        'LastName': '',
        'FirstName': '',
        'PermitNumber': permitNumber,
        'g-recaptcha-response': captchaToken
    });
    
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://cpaquebec.ca/api/sitecore/FindACPA/FindACPAFormSubmit',
        headers: { 
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7', 
            'accept-language': 'en-US,en;q=0.9,be;q=0.8,ar;q=0.7', 
            'cache-control': 'max-age=0', 
            'content-type': 'application/x-www-form-urlencoded', 
            'cookie': 'OptanonAlertBoxClosed=2024-12-02T15:31:12.198Z; _gcl_au=1.1.2001702643.1733156856; _ga=GA1.1.834080694.1733156856; SC_ANALYTICS_GLOBAL_COOKIE=2e50751f0761470ca10eb0f601decd42|True; _ga_58CVQV6EL4=GS1.1.1733193826.4.1.1733193829.0.0.0; website#lang=en; ASP.NET_SessionId=sq1xupfeiqg2u5sfetl3yywc; warning-message=viewed; OptanonConsent=isGpcEnabled=0&datestamp=Thu+Dec+05+2024+01%3A47%3A01+GMT%2B0100+(GMT%2B01%3A00)&version=202310.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=1969f2c6-092b-4416-af03-3510e261a4c7&interactionCount=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A0&geolocation=TN%3B71&AwaitingReconsent=false; SC_ANALYTICS_GLOBAL_COOKIE=2e50751f0761470ca10eb0f601decd42|False', 
            'dnt': '1', 
            'origin': 'https://cpaquebec.ca', 
            'priority': 'u=0, i', 
            'referer': 'https://cpaquebec.ca/en/find-a-cpa/orders-membership-roll/', 
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', 
            'sec-ch-ua-mobile': '?0', 
            'sec-ch-ua-platform': '"Windows"', 
            'sec-fetch-dest': 'document', 
            'sec-fetch-mode': 'navigate', 
            'sec-fetch-site': 'same-origin', 
            'sec-fetch-user': '?1', 
            'upgrade-insecure-requests': '1', 
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        },
        data: data
    };
    
    try {
        const response = await axios.request(config);
        
        
        const $ = cheerio.load(response.data);
        
    
    // Find the vcard element and extract the URL
    const vcardElement = $('.vcard');
    const firstLiAnchor = vcardElement.find('li.fn a').first();
    const url = firstLiAnchor.attr('href');
    
    if (!url) {
        throw new Error('NO_CPA_FOUND');  // Simple error to indicate no CPA found
    }
    
    const baseUrl = 'https://cpaquebec.ca';
    const fullUrl = baseUrl + url;
    
    
    return fullUrl;
  } catch (error) {
    console.error(clc.red('Error in searchCPA:', error.message));
    // Save error response if available
    if (error.response) {
      const errorPath = path.join('html_responses', `${permitNumber.trim()}_error.html`);
      fs.writeFileSync(errorPath, error.response.data);
      console.log(`Saved error response to ${errorPath}`);
    }
    throw error;
  }
}

async function getCPADetails(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        // Save the raw HTML response
        const htmlPath = path.join('html_responses', 'cpa_details.html');
        fs.writeFileSync(htmlPath, response.data);
        
        // Parse the vcard information
        const vcard = $('.vcard');
        const cpaDetails = {
            name: vcard.find('h3').text().trim(),
            company: vcard.find('li strong').text().trim(),
            address: vcard.find('.street-address p').text().trim(),
            phone: vcard.find('li p:contains("Phone:")').text().replace('Phone:', '').trim(),
            permitNumber: vcard.find('li p:contains("Public accountancy permit number:")').text()
                .replace('Public accountancy permit number:', '').trim()
        };
        
        // Create directory if it doesn't exist
        if (!fs.existsSync('json_output')) {
            fs.mkdirSync('json_output');
        }
        
        // Save to JSON file using permit number as filename
        const jsonPath = path.join('json_output', `${cpaDetails.permitNumber}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(cpaDetails, null, 2));
        
        console.log(clc.green('[CPA] Details saved to:', jsonPath));
        return cpaDetails;
        
    } catch (error) {
        console.error(clc.red('[CPA] Error fetching CPA details:', error.message));
        throw error;
    }
}

function generateNextPermitNumber(currentPermit) {
    if (!currentPermit) {
        return {
            permitId: 'A100000',
            numericPart: 100000
        }; 
    }

    // Extract the numeric part and add 1 immediately since we want to start from the next number
    const numericPart = parseInt(currentPermit.substring(1)) + 1;
    
    // If we've reached our target end
    if (numericPart >= 151000) {
        return null;
    }
    
    // Return the next number
    return {
        permitId: `A${numericPart}`,
        numericPart: numericPart
    };
}

async function main() {
    const systemMonitor = new SystemMonitor();
    systemMonitor.startIPLogging();      // Start IP logging
    systemMonitor.startResourceLogging(); // Start resource logging
    
    const eventEmitter = new EventEmitter();
    const resultTracker = new ResultTracker();
    
    const database = new Database(dbPath);
    await database.initialize();
    console.log(clc.green('[DB] Database initialized'));

    let initialTestDone = false;
    let initialTestPromise = null;

    // Get the last checked permit number
    let currentPermitNumber = await database.getLastCheckedPermitNumber();
    console.log(clc.yellow(`[CPA] Resuming from permit number: ${currentPermitNumber || 'A100000'}`));

    // Create a promise that never resolves to keep the program running
    const keepAlive = new Promise(() => {});

    // Start token generation directly (don't await it)
    generateCaptchaTokens({
        eventEmitter,
        concurrentBrowsers: 5,
        tabsPerBrowser: 1,
        captchaUrl: 'https://cpaquebec.ca/en/find-a-cpa/orders-membership-roll/'
    }).catch(error => {
        console.error(clc.red('[Token] Error in token generation:'), error);
    });

    eventEmitter.on('tokenGenerated', async ({ token }) => {
        try {
            // First, do a test with a known valid CPA ID
            if (!initialTestDone) {
                // If a test is already in progress, wait for it
                if (initialTestPromise) {
                    await initialTestPromise;
                } else {
                    // Start the initial test and store the promise
                    initialTestPromise = (async () => {
                        console.log(clc.yellow('\n[CPA] Performing initial test with known valid CPA ID: A145869'));
                        try {
                            const testUrl = await searchCPA({ 
                                permitNumber: 'A145869',
                                captchaToken: token 
                            });
                            console.log(clc.green('[CPA] Initial test successful! API is working correctly :'+ testUrl));
                            initialTestDone = true;
                        } catch (error) {
                            console.error(clc.red('[CPA] Initial test failed! Please check the API functionality:'), error.message);
                            process.exit(1);
                        }
                    })();
                    await initialTestPromise;
                    return; // Only return if we used the token for the test
                }
            }

            const nextPermit = generateNextPermitNumber(currentPermitNumber);
            if (!nextPermit) {
                console.log(clc.green('[CPA] Completed scanning all permit numbers!'));
                process.exit(0);
            }

            // Capture the permit number locally for this request
            const permitToProcess = nextPermit.permitId;
            currentPermitNumber = permitToProcess; // Update the global tracker

            resultTracker.setCurrentPermit(nextPermit.numericPart);
            resultTracker.setCurrentWorkingNumber(permitToProcess);
            
            console.log(clc.yellow(`\n[CPA] Processing permit number: ${permitToProcess}...`));
            
            try {
                const url = await searchCPA({ 
                    permitNumber: permitToProcess,  // Use the local variable
                    captchaToken: token 
                });
                
                console.log(clc.yellow('[CPA] Successfully found CPA URL:'), clc.green(url));
                
                const cpaDetails = await getCPADetails(url);
                await database.saveCPA(cpaDetails, url);
                
                console.log(clc.green('[CPA] Successfully retrieved CPA details:'));
                console.log(cpaDetails);
                
                resultTracker.recordSuccess();
            } catch (error) {
                if (error.message === 'NO_CPA_FOUND') {
                    console.log(clc.yellow(`[CPA] No active CPA found for permit number ${permitToProcess}`));
                } else {
                    console.error(clc.red(`[CPA] Error processing ${permitToProcess}:`, error.message));
                }
                resultTracker.recordFailure();
            } finally {
                await database.updateLastCheckedPermitNumber(permitToProcess);
            }
        } catch (error) {
            console.error(clc.red('Fatal error:', error.message));
        }
    });

    // Wait indefinitely
    await keepAlive;

    return { database }; // Only return database
}

// Update the cleanup to handle interrupts
if (require.main === module) {
    let database;
    
    // Handle interrupts gracefully
    process.on('SIGINT', async () => {
        console.log(clc.yellow('\nGracefully shutting down...'));
        if (database) {
            try {
                await database.close();
                console.log(clc.green('Database closed successfully'));
            } catch (err) {
                console.error('Error closing database:', err);
            }
        }
        process.exit(0);
    });

    main()
        .then(res => {
            database = res.database;
        })
        .catch(error => {
            console.error('Fatal error in main:', error);
            if (database) {
                database.close().catch(err => {
                    console.error('Error closing database:', err);
                });
            }
            process.exit(1);
        });
}

module.exports = { searchCPA, getCPADetails };
