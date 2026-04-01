# Tally Sync Agent - Complete Setup Guide

This document explains the full end-to-end setup:
- MongoDB Atlas Trigger (`sales_invoice` -> `tally_sync_queue`)
- Spring Boot API queue processing endpoints
- Local Tally Agent (this project)
- Tally posting requirements and troubleshooting

## 1) What this system does

1. A billing invoice is created/updated in MongoDB collection `Billing.sales_invoice`.
2. Atlas Trigger checks the invoice status.
3. If status is `Billable`, trigger inserts one queue record in `Billing.tally_sync_queue`.
4. Local Tally Agent polls your Spring API (`/api/tally/pending`).
5. Agent ensures ledger in Tally and posts voucher XML.
6. Agent calls API to mark queue row as `SYNCED` or `FAILED`.

## 2) Prerequisites

- Node.js installed (recommended v20+)
- TallyPrime running locally
- Tally XML server enabled on port `9000`
- MongoDB Atlas App Services Trigger configured
- Spring API deployed and reachable from this machine

## 3) Local project setup

From `C:\TallyAgent`:

```powershell
npm install
```

Create or verify `.env` values:

```env
SPRING_API_URL=https://your-api-url
AGENT_API_KEY=your-agent-key
TALLY_URL=http://localhost:9000
TALLY_COMPANY=Optimate
TALLY_MIN_VOUCHER_DATE=AUTO
POLL_INTERVAL_MS=5000
BATCH_SIZE=5
LOG_DIR=C:\TallyAgent\logs
```

Important:
- `TALLY_MIN_VOUCHER_DATE` avoids Tally error when invoice date is older than current FY start.
- Set `TALLY_MIN_VOUCHER_DATE=AUTO` to compute FY start automatically (`01-04-YYYY`).
- You can still set a fixed date in `DD-MM-YYYY` when needed.

## 4) Run and test locally

Test one invoice XML post:

```powershell
node .\node_modules\ts-node\dist\bin.js src\test-invoice.ts
```

Run continuous agent poller:

```powershell
node .\node_modules\ts-node\dist\bin.js src\index.ts
```

## 5) Run as Windows service

Install service:

```powershell
node .\install-service.js
```

Uninstall service:

```powershell
node .\uninstall-service.js
```

## 6) Atlas Trigger setup (full process)

Open MongoDB Atlas -> App Services -> Triggers -> Add Trigger.

Set:
- Trigger Type: `Database`
- Operation Type: `Insert` and `Update` (if you want updates)
- Cluster/Data Source: your Atlas service
- Database: `Billing`
- Collection: `sales_invoice`
- Full Document: `Update Lookup` (required for update events)

Use this function code:

```javascript
exports = async function(changeEvent) {
    try {
        const doc = changeEvent.fullDocument;

        // Safety check
        if (!doc) {
            console.log("No fullDocument found — skipping");
            return;
        }

        // Only process invoices with status = "Billable"
        if (doc.status !== "Billable") {
            return;
        }

        // Ensure invoice number exists
        if (!doc.invoice_no) {
            console.log("Skipping — no invoice_no found");
            return;
        }

        // FIXED: Use correct service name
        const queue = context.services
            .get("demo-manufacturing-2-DB")
            .db("Billing")
            .collection("tally_sync_queue");

        const invoiceId = doc._id.toString();

        // Idempotency check
        const existing = await queue.findOne({ invoiceId: invoiceId });
        if (existing) {
            console.log(`Already queued: ${doc.invoice_no} — skipping`);
            return;
        }

        // Build queue entry
        const entry = {
            invoiceId:   invoiceId,
            invoiceNo:   doc.invoice_no,
            invoiceType: doc.invoice_type,
            companyName: doc.company_name,

            payload: {
                id:                  invoiceId,
                salesNumber:         doc.sales_number,
                enquiryNumber:       doc.enquiry_number,
                poNumber:            doc.po_number,
                companyId:           doc.company_id,
                subCompanyId:        doc.sub_company_id,
                companyName:         doc.company_name,
                creditCycle:         doc.credit_cycle,
                taxExemptionZone:    doc.tax_exemption_zone,
                invoiceNo:           doc.invoice_no,
                invoiceType:         doc.invoice_type,
                invoiceCurrency:     doc.invoice_currency,
                invoiceValue:        doc.invoice_value,
                gstAmount:           doc.gst_amount,
                balanceInvoiceValue: doc.balance_invoice_value,
                status:              doc.status,
                totalPoValue:        doc.total_po_value,
                balancePoValue:      doc.balance_po_value,
                workOrderNumbers:    doc.work_order_numbers || [],
                productIds:          doc.productIds || [],
                paymentHistory:      doc.payment_history || [],
            },

            // Sync state
            status:       "PENDING",
            attemptCount: 0,
            nextRetryAt:  new Date(),
            createdAt:    new Date(),
            lastError:    null,
            syncedAt:     null,
        };

        // Insert into queue
        await queue.insertOne(entry);

        console.log(
            `Queued [${doc.invoice_type}] ${doc.invoice_no}` +
            ` for ${doc.company_name}` +
            ` - total Rs${doc.balance_invoice_value}`
        );

    } catch (error) {
        console.error("Trigger Error:", error);
    }
};
```

## 7) Trigger test event sample

In App Services Function tester, use:

```json
{
  "operationType": "insert",
  "fullDocument": {
    "_id": { "$oid": "660000000000000000000001" },
    "status": "Billable",
    "invoice_no": "Inv-012",
    "invoice_type": "Advance",
    "company_name": "ACG Universal Capsules Pvt Ltd",
    "sales_number": "SON06710",
    "enquiry_number": "0326AADE06710",
    "po_number": "0326AADE06710",
    "company_id": "comp665",
    "sub_company_id": "comp665sub1",
    "invoice_currency": "INR",
    "invoice_value": 70960,
    "gst_amount": 12772.8,
    "balance_invoice_value": 83732.8,
    "payment_history": [
      { "status": "Billable", "timestamp": "11-03-2026 03:43:22" }
    ]
  }
}
```

If you run test with empty event `{}`, you will see:
- `No fullDocument found — skipping`
- result `{"$undefined": true}`

This is expected.

## 8) Spring API contract used by agent

Agent expects these endpoints:

- `GET /api/tally/pending?limit=5`
- `POST /api/tally/{id}/synced`
- `POST /api/tally/{id}/failed`

And queue entry fields:
- `invoiceNo`, `invoiceType`, `companyName`
- `payload` object with invoice data

## 9) Common issues and fixes

### Issue: `Could not set 'SVCurrentCompany'...`
Fix:
- Confirm `TALLY_COMPANY` exactly matches Tally company name.
- Agent already retries without this tag when needed.

### Issue: `Date cannot be below the Financial Year beginning date`
Fix:
- Set `.env` `TALLY_MIN_VOUCHER_DATE=AUTO` (or set a fixed `DD-MM-YYYY` FY start date).

### Issue: `Ledger ensured: null`
Cause:
- Queue payload missing/mismatched `companyName`.
Fix:
- Ensure trigger script sends `company_name` and `payload.companyName`.
- Ensure backend payload deserialization supports snake_case and camelCase.

### Issue: `Tally returned 0 vouchers`
Fix:
- Verify Tally ledger names exist exactly:
  - `Sales - Advance`
  - `Sales - Dispatch`
  - `Output IGST 18%`
- Verify party ledger exists under Sundry Debtors.

## 10) Log files

Runtime logs are written to:

```text
C:\TallyAgent\logs\agent-YYYY-MM-DD.log
```

Use these logs first for diagnosis.

