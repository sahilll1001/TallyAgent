import 'dotenv/config';

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env variable: ${key}`);
    return val;
}

function getCurrentFyStartDdMmYyyy(now: Date = new Date()): string {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const fyStartYear = month >= 4 ? year : year - 1;
    return `01-04-${fyStartYear}`;
}

function resolveTallyMinVoucherDate(): string {
    const raw = (process.env.TALLY_MIN_VOUCHER_DATE ?? '').trim();
    if (!raw || /^auto$/i.test(raw)) {
        return getCurrentFyStartDdMmYyyy();
    }
    return raw;
}

export const config = {
    springApiUrl:   requireEnv('SPRING_API_URL').replace(/\/$/, ''),
    agentApiKey:    requireEnv('AGENT_API_KEY'),
    tallyUrl:       process.env.TALLY_URL        ?? 'http://localhost:9000',
    tallyCompany:   requireEnv('TALLY_COMPANY'),
    tallyMinVoucherDate: resolveTallyMinVoucherDate(),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000),
    batchSize:      Number(process.env.BATCH_SIZE       ?? 5),
    logDir:         process.env.LOG_DIR           ?? 'C:\\TallyAgent\\logs',
};
