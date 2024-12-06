const https = require('https');
const fs = require('fs');
const clc = require('cli-color');
const os = require('os');
const path = require('path');

class SystemMonitor {
    constructor() {
        this.ipLoggingInterval = null;
        this.resourceLoggingInterval = null;
        this.logsDir = 'logs';
        this.initLogFiles();
    }

    initLogFiles() {
        // Create logs directory if it doesn't exist
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir);
        }

        const timestamp = new Date().toISOString();
        
        // IP logs
        const ipLogPath = path.join(this.logsDir, 'ip.log');
        if (!fs.existsSync(ipLogPath)) {
            const header = `=== IP Log Started ${timestamp} ===\n`;
            fs.writeFileSync(ipLogPath, header);
        }

        // Resource logs
        const resourceLogPath = path.join(this.logsDir, 'resources.log');
        if (!fs.existsSync(resourceLogPath)) {
            const header = `=== Resource Monitoring Started ${timestamp} ===\n`;
            fs.writeFileSync(resourceLogPath, header);
        }
    }

    async getCurrentIP() {
        return new Promise((resolve, reject) => {
            https.get('https://api.ipify.org?format=json', (resp) => {
                let data = '';
                
                resp.on('data', (chunk) => {
                    data += chunk;
                });
                
                resp.on('end', () => {
                    try {
                        const ip = JSON.parse(data).ip;
                        const timestamp = new Date().toISOString();
                        console.log(clc.blue('[IP] Current IP:'), clc.white(ip));
                        
                        const logEntry = `${timestamp} - IP: ${ip}\n`;
                        fs.appendFile(path.join(this.logsDir, 'ip.log'), logEntry, (err) => {
                            if (err) {
                                console.error(clc.red('[IP] Error writing to log file:'), err.message);
                            }
                        });
                        
                        resolve(ip);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', (err) => {
                reject(err);
            });
        });
    }

    getSystemResources() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercent = ((usedMemory / totalMemory) * 100).toFixed(2);

        // Get CPU usage
        const cpus = os.cpus();
        const cpuCount = cpus.length;
        const cpuModel = cpus[0].model;
        const loadAvg = os.loadavg();
        const cpuUsagePercent = (loadAvg[0] / cpuCount * 100).toFixed(2);

        // Get process memory usage
        const processMemoryUsage = process.memoryUsage();
        const heapUsed = (processMemoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (processMemoryUsage.heapTotal / 1024 / 1024).toFixed(2);

        return {
            memory: {
                total: (totalMemory / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                free: (freeMemory / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                used: (usedMemory / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                usagePercent: memoryUsagePercent + '%'
            },
            cpu: {
                model: cpuModel,
                cores: cpuCount,
                usagePercent: cpuUsagePercent + '%',
                loadAverage: loadAvg
            },
            process: {
                heapUsed: heapUsed + ' MB',
                heapTotal: heapTotal + ' MB',
                uptime: (process.uptime() / 60).toFixed(2) + ' minutes'
            }
        };
    }

    logSystemResources() {
        const resources = this.getSystemResources();
        const timestamp = new Date().toISOString();

        const logEntry = `
${timestamp}
Memory Usage: ${resources.memory.usagePercent} (${resources.memory.used}/${resources.memory.total})
CPU Usage: ${resources.cpu.usagePercent}
Process Heap: ${resources.process.heapUsed}/${resources.process.heapTotal}
Uptime: ${resources.process.uptime}
----------------------------------------`;

        console.log(
            clc.cyan('[Resources]'),
            `Memory: ${clc.yellow(resources.memory.usagePercent)}`,
            `CPU: ${clc.yellow(resources.cpu.usagePercent)}`,
            `Heap: ${clc.yellow(resources.process.heapUsed)}`
        );

        fs.appendFile(path.join(this.logsDir, 'resources.log'), logEntry + '\n', (err) => {
            if (err) {
                console.error(clc.red('[Resources] Error writing to log file:'), err.message);
            }
        });
    }

    logError(type, error) {
        const errorLog = `${new Date().toISOString()} - Error: ${error.message}\n`;
        console.error(clc.red(`[${type}] Error:`), error.message);
        
        const logFile = type === 'IP' ? 'ip.log' : 'resources.log';
        fs.appendFile(path.join(this.logsDir, logFile), errorLog, (err) => {
            if (err) console.error(clc.red(`[${type}] Error writing error to log file:`), err.message);
        });
    }

    startIPLogging(interval = 60000) {
        // Clear any existing interval
        if (this.ipLoggingInterval) {
            clearInterval(this.ipLoggingInterval);
        }

        // Log IP immediately on start
        this.getCurrentIP().catch(error => this.logError('IP', error));

        // Set up interval for IP logging
        this.ipLoggingInterval = setInterval(() => {
            this.getCurrentIP().catch(error => this.logError('IP', error));
        }, interval);

        console.log(clc.green('[IP] Started IP logging with interval:'), clc.white(`${interval/1000}s`));
    }

    startResourceLogging(interval = 30000) {
        // Clear any existing interval
        if (this.resourceLoggingInterval) {
            clearInterval(this.resourceLoggingInterval);
        }

        // Log resources immediately on start
        this.logSystemResources();

        // Set up interval for resource logging
        this.resourceLoggingInterval = setInterval(() => {
            this.logSystemResources();
        }, interval);

        console.log(clc.green('[Resources] Started resource logging with interval:'), clc.white(`${interval/1000}s`));
    }

    stopIPLogging() {
        if (this.ipLoggingInterval) {
            clearInterval(this.ipLoggingInterval);
            this.ipLoggingInterval = null;
            console.log(clc.yellow('[IP] Stopped IP logging'));
        }
    }

    stopResourceLogging() {
        if (this.resourceLoggingInterval) {
            clearInterval(this.resourceLoggingInterval);
            this.resourceLoggingInterval = null;
            console.log(clc.yellow('[Resources] Stopped resource logging'));
        }
    }
}

module.exports = SystemMonitor; 