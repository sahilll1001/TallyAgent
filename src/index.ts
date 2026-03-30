import {
  fetchPending,
  reportSynced,
  reportFailed,
  SyncEntry,
  BillingPayload,
} from "./apiClient";
import { buildTallyXML, buildLedgerCreationXML } from "./xmlBuilder";
import { postToTally } from "./tallyClient";
import { logger } from "./logger";
import { config } from "./config";

function pick(...values: any[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizePayload(entry: SyncEntry): BillingPayload {
  const raw: any = entry.payload ?? {};

  return {
    ...raw,
    id: pick(raw.id, entry.invoiceId, entry.id),
    salesNumber: pick(raw.salesNumber, raw.sales_number),
    enquiryNumber: pick(raw.enquiryNumber, raw.enquiry_number),
    poNumber: pick(raw.poNumber, raw.po_number),
    companyId: pick(raw.companyId, raw.company_id),
    subCompanyId: pick(raw.subCompanyId, raw.sub_company_id),
    companyName: pick(raw.companyName, raw.company_name, entry.companyName),
    invoiceNo: pick(raw.invoiceNo, raw.invoice_no, entry.invoiceNo),
    invoiceType: pick(raw.invoiceType, raw.invoice_type, entry.invoiceType),
    invoiceCurrency: pick(raw.invoiceCurrency, raw.invoice_currency, "INR"),
    invoiceValue: Number(raw.invoiceValue ?? raw.invoice_value ?? 0),
    gstAmount: Number(raw.gstAmount ?? raw.gst_amount ?? 0),
    balanceInvoiceValue: Number(
      raw.balanceInvoiceValue ?? raw.balance_invoice_value ?? 0,
    ),
    status: pick(raw.status, "Billable"),
    paymentHistory: Array.isArray(raw.paymentHistory)
      ? raw.paymentHistory
      : Array.isArray(raw.payment_history)
        ? raw.payment_history
        : [],
    workOrderNumbers: Array.isArray(raw.workOrderNumbers)
      ? raw.workOrderNumbers
      : Array.isArray(raw.work_order_numbers)
        ? raw.work_order_numbers
        : [],
  };
}

async function processEntry(entry: SyncEntry): Promise<void> {
  const payload = normalizePayload(entry);
  const label = `[${payload.invoiceType}] ${payload.invoiceNo} | ${payload.companyName}`;

  try {
    if (!payload.companyName) {
      throw new Error("Missing companyName in queue payload");
    }
    if (!payload.invoiceNo) {
      throw new Error("Missing invoiceNo in queue payload");
    }

    // Step 1: ensure party ledger exists.
    const ledgerXml = buildLedgerCreationXML(payload.companyName, config.tallyCompany);
    await postToTally(ledgerXml);
    logger.info(`  Ledger ensured: ${payload.companyName}`);

    // Step 2: post Sales voucher.
    const voucherXml = buildTallyXML(payload);
    const result = await postToTally(voucherXml);

    if (result.success) {
      await reportSynced(entry.id);
      logger.info(`OK SYNCED   ${label} - created: ${result.created}, altered: ${result.altered}`);
    } else {
      const errMsg = result.errors.length
        ? result.errors.join(" | ")
        : "Tally returned 0 vouchers - verify voucher type and ledger names";
      throw new Error(errMsg);
    }
  } catch (err: any) {
    logger.error(`XX FAILED   ${label} - ${err.message}`);
    try {
      await reportFailed(entry.id, err.message);
    } catch (reportErr: any) {
      logger.error(`  Could not report failure: ${reportErr.message}`);
    }
  }
}

async function runCycle(): Promise<void> {
  let entries: SyncEntry[];
  try {
    entries = await fetchPending();
  } catch (err: any) {
    logger.error(`Cannot reach Spring API - ${err.message}`);
    return;
  }

  if (entries.length === 0) return;

  logger.info(`---- Processing ${entries.length} invoice(s) ----`);
  for (const entry of entries) {
    await processEntry(entry);
  }
}

async function start(): Promise<void> {
  logger.info("========================================");
  logger.info("  Tally Local Agent starting");
  logger.info(`  API    : ${config.springApiUrl}`);
  logger.info(`  Tally  : ${config.tallyUrl}`);
  logger.info(`  Company: ${config.tallyCompany}`);
  logger.info(`  Poll   : every ${config.pollIntervalMs}ms`);
  logger.info("========================================");

  const tick = async (): Promise<void> => {
    try {
      await runCycle();
    } catch (e: any) {
      logger.error(`Cycle error: ${e.message}`);
    } finally {
      setTimeout(tick, config.pollIntervalMs);
    }
  };

  await tick();
}

start();
