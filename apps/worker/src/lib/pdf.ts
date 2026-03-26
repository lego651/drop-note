import pdfParse from 'pdf-parse'

interface PdfExtractResult {
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
