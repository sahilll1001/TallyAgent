import fs   from 'fs';
import path from 'path';
import { config } from './config';

function getLogPath(): string {
    fs.mkdirSync(config.logDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    return path.join(config.logDir, `agent-${today}.log`);
}

function write(level: string, ...args: any[]): void {
    const ts  = new Date().toISOString();
    const msg = args
        .map(a => typeof a === 'object' ? JSON.stringify(a) : String(a))
        .join(' ');
    const line = `[${ts}] [${level.padEnd(5)}] ${msg}`;
    console.log(line);
    try {
        fs.appendFileSync(getLogPath(), line + '\n');
    } catch {}
}

export const logger = {
    info:  (...a: any[]) => write('INFO',  ...a),
    warn:  (...a: any[]) => write('WARN',  ...a),
    error: (...a: any[]) => write('ERROR', ...a),
};