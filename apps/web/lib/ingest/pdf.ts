/**
 * PDF text extraction for the synchronous ingest pipeline (D11, 2026-05-26).
 * Lifted from apps/worker/src/lib/pdf.ts.
 */
import pdfParse from 'pdf-parse'

export interface PdfExtractResult {
  text: string
  error: string | null
}

export async function extractPdfText(base64Data: string): Promise<PdfExtractResult> {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    const result = await pdfParse(buffer)
    const text = result.text.slice(0, 50_000)
    return { text, error: null }
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
