import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import { config } from './config';
import { logger } from './logger';

export interface PaymentHistory {
    status:    string;
    timestamp: string;
}

export interface BillingPayload {
    id:                  string;
    salesNumber:         string;
    enquiryNumber:       string;
    poNumber:            string;
    companyId:           string;
    subCompanyId:        string;
    companyName:         string;
    invoiceNo:           string;
    invoiceType:         string;
    invoiceCurrency:     string;
    invoiceValue:        number;
    gstAmount:           number;
    balanceInvoiceValue: number;
    status:              string;
    paymentHistory:      PaymentHistory[];
    workOrderNumbers?:   string[];
}

export interface SyncEntry {
    id:           string;
    invoiceId:    string;
    invoiceNo:    string;
    invoiceType:  string;
    companyName:  string;
    payload:      BillingPayload;
    attemptCount: number;
}

const httpAgent = new http.Agent({ family: 4 });
const httpsAgent = new https.Agent({ family: 4 });

const api: AxiosInstance = axios.create({
    baseURL: config.springApiUrl,
    headers: {
        'X-Agent-Key':  config.agentApiKey,
        'Content-Type': 'application/json',
    },
    // Avoid IPv6-first connection stalls on networks where IPv6 routing is broken.
    httpAgent,
    httpsAgent,
    proxy: false,
    timeout: 15_000,
});

api.interceptors.request.use(req => {
    logger.info(`→ ${req.method?.toUpperCase()} ${req.url}`);
    return req;
});

export async function fetchPending(): Promise<SyncEntry[]> {
    const { data } = await api.get<SyncEntry[]>(
        `/api/tally/pending?limit=${config.batchSize}`
    );
    return data;
}

export async function reportSynced(id: string): Promise<void> {
    await api.post(`/api/tally/${id}/synced`);
}

export async function reportFailed(id: string, error: string): Promise<void> {
    await api.post(`/api/tally/${id}/failed`, { error });
}
