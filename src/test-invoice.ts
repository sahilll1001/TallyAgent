import "dotenv/config";
import { buildLedgerCreationXML, buildTallyXML } from "./xmlBuilder";
import { postToTally } from "./tallyClient";
import { BillingPayload } from "./apiClient";
import { config } from "./config";

// Set to true when ready to actually POST to Tally
const SEND_TO_TALLY = true;

const sample: BillingPayload = {
  id: "69b140428d3f2bf9de0b09b1",
  salesNumber: "SON06710",
  enquiryNumber: "0326AADE06710",
  poNumber: "0326AADE06710",
  companyId: "comp665",
  subCompanyId: "comp665sub1",
  companyName: "ACG Universal Capsules Pvt Ltd",
  invoiceNo: "Inv-012",
  invoiceType: "Advance",
  invoiceCurrency: "INR",
  invoiceValue: 70960,
  gstAmount: 12772.8,
  balanceInvoiceValue: 83732.8,
  status: "Billable",
  paymentHistory: [{ status: "Billable", timestamp: "11-03-2026 03:43:22" }],
};

async function run(): Promise<void> {
  console.log("\n========================================");
  console.log("  Tally XML Test");
  console.log(`  Mode: ${SEND_TO_TALLY ? "LIVE - will POST to Tally" : "DRY RUN - XML only"}`);
  console.log("========================================\n");

  console.log(`Invoice : ${sample.invoiceNo} (${sample.invoiceType})`);
  console.log(`Party   : ${sample.companyName}`);
  console.log(`Base    : Rs${sample.invoiceValue}`);
  console.log(`GST     : Rs${sample.gstAmount}`);
  console.log(`Total   : Rs${sample.balanceInvoiceValue}`);
  console.log(`Date    : ${sample.paymentHistory[0].timestamp}`);

  const xml = buildTallyXML(sample);

  console.log("\n-- Generated XML -----------------------");
  console.log(xml);

  if (SEND_TO_TALLY) {
    console.log("\n-- Posting to Tally --------------------");
    try {
      console.log("\n-- Ensuring party ledger ---------------");
      const ledgerXml = buildLedgerCreationXML(sample.companyName, config.tallyCompany);
      const ledgerResult = await postToTally(ledgerXml);
      if (ledgerResult.success) {
        console.log(
          `OK  Ledger ready - created: ${ledgerResult.created}, altered: ${ledgerResult.altered}`,
        );
      } else {
        const ledgerErr = ledgerResult.errors.length
          ? ledgerResult.errors.join(" | ")
          : "No create/alter response from Tally";
        console.log(`XX  Ledger check failed - ${ledgerErr}`);
        if (ledgerResult.rawXml) {
          console.log("\n-- Ledger raw response -----------------");
          console.log(ledgerResult.rawXml);
        }
      }

      const result = await postToTally(xml);
      if (result.success) {
        console.log(`OK  SUCCESS - vouchers created: ${result.created}`);
      } else {
        console.log(`XX  FAILED  - ${result.errors.join(" | ")}`);
        console.log("\n-- Raw Tally response ------------------");
        console.log(result.rawXml);
      }
    } catch (err: any) {
      console.error(`XX  ERROR   - ${err.message}`);
    }
  }
}

run().catch(console.error);
