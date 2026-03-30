import { BillingPayload } from "./apiClient";
import { config } from "./config";

const SALES_LEDGER: Record<string, string> = {
  Advance: "Sales - Advance",
  Performa: "Sales - Proforma",
  Retention: "Sales - Retention",
  Dispatch: "Sales - Dispatch",
  Installation: "Sales - Installation",
};

const GST_LEDGER = "Output IGST 18%";

export function buildTallyXML(billing: BillingPayload): string {
  const baseAmount = Number(billing.invoiceValue ?? 0);
  const gstAmount = Number(billing.gstAmount ?? 0);
  const partyAmount = Number(
    billing.balanceInvoiceValue ?? baseAmount + gstAmount,
  );

  const invoiceType = billing.invoiceType ?? "Dispatch";
  const salesLedger = SALES_LEDGER[invoiceType] ?? `Sales - ${invoiceType}`;
  const partyLedger = billing.companyName;
  const invoiceDate = resolveVoucherDate(billing.paymentHistory?.[0]?.timestamp);

  const narration = [
    billing.poNumber ? `PO: ${billing.poNumber}` : null,
    billing.salesNumber ? `SO: ${billing.salesNumber}` : null,
    invoiceType ? `Type: ${invoiceType}` : null,
    billing.enquiryNumber ? `Enquiry: ${billing.enquiryNumber}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>${esc(config.tallyCompany)}</SVCURRENTCOMPANY>
        <SVFROMDATE>${invoiceDate}</SVFROMDATE>
        <SVTODATE>${invoiceDate}</SVTODATE>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View" DATE="${invoiceDate}">
          <DATE>${invoiceDate}</DATE>
          <VOUCHERDATE>${invoiceDate}</VOUCHERDATE>
          <EFFECTIVEDATE>${invoiceDate}</EFFECTIVEDATE>
          <REFERENCEDATE>${invoiceDate}</REFERENCEDATE>
          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
          <ISINVOICE>No</ISINVOICE>
          <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${esc(billing.invoiceNo)}</VOUCHERNUMBER>
          <PARTYNAME>${esc(partyLedger)}</PARTYNAME>
          <PARTYLEDGERNAME>${esc(partyLedger)}</PARTYLEDGERNAME>
          <NARRATION>${esc(narration)}</NARRATION>

          <LEDGERENTRIES.LIST>
            <LEDGERNAME>${esc(partyLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
            <AMOUNT>-${partyAmount.toFixed(2)}</AMOUNT>
            <BILLALLOCATIONS.LIST>
              <NAME>${esc(billing.invoiceNo)}</NAME>
              <BILLTYPE>New Ref</BILLTYPE>
              <BILLDATE>${invoiceDate}</BILLDATE>
              <DUEDATE>${invoiceDate}</DUEDATE>
              <AMOUNT>-${partyAmount.toFixed(2)}</AMOUNT>
            </BILLALLOCATIONS.LIST>
          </LEDGERENTRIES.LIST>

          <LEDGERENTRIES.LIST>
            <LEDGERNAME>${esc(salesLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
            <AMOUNT>${baseAmount.toFixed(2)}</AMOUNT>
          </LEDGERENTRIES.LIST>

          <LEDGERENTRIES.LIST>
            <LEDGERNAME>${GST_LEDGER}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
            <AMOUNT>${gstAmount.toFixed(2)}</AMOUNT>
          </LEDGERENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

function resolveVoucherDate(ts: string | undefined): string {
  const parsed = parseDateToYmd(ts) ?? todayTallyDate();
  const minAllowed = parseDateToYmd(config.tallyMinVoucherDate);
  if (!minAllowed) return parsed;
  return parsed < minAllowed ? minAllowed : parsed;
}

function parseDateToYmd(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  const ddMmYyyy = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (ddMmYyyy) {
    const [, dd, mm, yyyy] = ddMmYyyy;
    return `${yyyy}${mm}${dd}`;
  }

  const yyyymmdd = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) return trimmed;

  const yyyyMmDd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDd) {
    const [, yyyy, mm, dd] = yyyyMmDd;
    return `${yyyy}${mm}${dd}`;
  }

  return null;
}

function todayTallyDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function esc(val: any): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildLedgerCreationXML(
  companyName: string,
  tallyCompany: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(tallyCompany)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${esc(companyName)}" ACTION="Create">
            <NAME>${esc(companyName)}</NAME>
            <PARENT>Sundry Debtors</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
            <AFFECTSSTOCK>No</AFFECTSSTOCK>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
