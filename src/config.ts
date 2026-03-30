import 'dotenv/config';

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env variable: ${key}`);
    return val;
}

export const config = {
    springApiUrl:   requireEnv('SPRING_API_URL').replace(/\/$/, ''),
    agentApiKey:    requireEnv('AGENT_API_KEY'),
    tallyUrl:       process.env.TALLY_URL        ?? 'http://localhost:9000',
    tallyCompany:   requireEnv('TALLY_COMPANY'),
    tallyMinVoucherDate: process.env.TALLY_MIN_VOUCHER_DATE ?? '',
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000),
    batchSize:      Number(process.env.BATCH_SIZE       ?? 5),
    logDir:         process.env.LOG_DIR           ?? 'C:\\TallyAgent\\logs',
};
