import axios from "axios";
import { parseStringPromise } from "xml2js";
import { config } from "./config";

export interface TallyResult {
  success: boolean;
  created: number;
  altered: number;
  errors: string[];
  rawXml?: string;
}

export async function postToTally(xml: string): Promise<TallyResult> {
  const firstAttemptXml = await postXml(xml);
  const firstResult = await parseResponse(firstAttemptXml);

  if (shouldRetryWithoutCompanyContext(firstResult.errors)) {
    const retryXml = removeCurrentCompanyContext(xml);
    const secondAttemptXml = await postXml(retryXml);
    return parseResponse(secondAttemptXml);
  }

  return firstResult;
}

async function postXml(xml: string): Promise<string> {
  try {
    const response = await axios.post(config.tallyUrl, xml, {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      timeout: 30_000,
    });
    return response.data as string;
  } catch (err: any) {
    if (err.code === "ECONNREFUSED") {
      throw new Error(
        `Cannot connect to Tally at ${config.tallyUrl} - is Tally open and TallyPrime Server enabled on port 9000?`,
      );
    }
    if (err.code === "ETIMEDOUT") {
      throw new Error(`Tally connection timed out at ${config.tallyUrl}`);
    }
    throw err;
  }
}

async function parseResponse(xmlStr: string): Promise<TallyResult> {
  let doc: any;
  try {
    doc = await parseStringPromise(xmlStr, { explicitArray: false });
  } catch {
    throw new Error(`Tally returned non-XML: ${xmlStr.slice(0, 200)}`);
  }

  const importResult = doc?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT ?? {};
  const responseRoot = doc?.RESPONSE ?? {};
  const created = parseInt(
    importResult.CREATED ?? responseRoot.CREATED ?? "0",
    10,
  );
  const altered = parseInt(
    importResult.ALTERED ?? responseRoot.ALTERED ?? "0",
    10,
  );

  const errors = extractErrors(doc, importResult);

  return {
    success: created > 0 || altered > 0,
    created,
    altered,
    errors,
    rawXml: xmlStr,
  };
}

function extractErrors(doc: any, importResult: any): string[] {
  const errors: string[] = [];

  // Common shape: <IMPORTRESULT><ERRORS><LINEERROR>...</LINEERROR></ERRORS></IMPORTRESULT>
  pushText(errors, importResult?.ERRORS?.LINEERROR);
  pushText(errors, importResult?.LINEERROR);
  if (importResult?.ERRORS && typeof importResult.ERRORS === "string") {
    const counter = importResult.ERRORS.trim();
    if (!/^\d+$/.test(counter)) {
      pushText(errors, importResult.ERRORS);
    }
  }

  // Alternate validation shape: <RESPONSE><LINEERROR>...</LINEERROR></RESPONSE>
  pushText(errors, doc?.RESPONSE?.LINEERROR);

  // Fallback shape sometimes seen in envelope responses
  pushText(errors, doc?.ENVELOPE?.BODY?.DATA?.LINEERROR);

  return dedupe(errors);
}

function pushText(out: string[], value: any): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) pushText(out, item);
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return;
  }

  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      pushText(out, value[key]);
    }
  }
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

function shouldRetryWithoutCompanyContext(errors: string[]): boolean {
  return errors.some((e) => /could not set ['\"]?svcurrentcompany['\"]?/i.test(e));
}

function removeCurrentCompanyContext(xml: string): string {
  const withoutCompany = xml.replace(
    /<SVCURRENTCOMPANY>[\s\S]*?<\/SVCURRENTCOMPANY>/gi,
    "",
  );

  return withoutCompany.replace(/<STATICVARIABLES>\s*<\/STATICVARIABLES>/gi, "");
}
