import axios from "axios";

/**
 * Service for extracting text from various document formats
 * Centralized text extraction logic to avoid duplication across services
 */
export class TextExtractionService {
  /**
   * Downloads and extracts text from PDF documents
   * @param pdfUrl URL of the PDF to download and parse
   * @returns Extracted text content
   */
  async downloadAndExtractPdfText(pdfUrl: string): Promise<string> {
    try {
      console.log(`Downloading PDF from: ${pdfUrl}`);

      const response = await axios.get(pdfUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const pdfParse = (await import("pdf-parse")).default;
      const pdfData = await pdfParse(Buffer.from(response.data));

      console.log(`Extracted ${pdfData.text.length} characters from PDF`);
      return pdfData.text;
    } catch (error) {
      console.error(`Failed to download/parse PDF: ${error}`);
      return "";
    }
  }

  /**
   * Extracts text from a response based on content type
   * @param response Fetch response object
   * @param baseUrl Base URL for constructing full URLs
   * @param documentPath Path to the document (relative to baseUrl)
   * @returns Extracted text content
   */
  async extractTextFromResponse(
    response: Response,
    baseUrl: string,
    documentPath: string,
  ): Promise<string> {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/pdf")) {
      // Check if documentPath is already an absolute URL
      const pdfUrl = documentPath.startsWith("http")
        ? documentPath
        : `${baseUrl}${documentPath}`;

      const pdfText = await this.downloadAndExtractPdfText(pdfUrl);
      console.log(`Extracted ${pdfText.length} characters from PDF document`);
      return pdfText;
    } else if (contentType.includes("text/plain")) {
      return await response.text();
    } else {
      // Try to get text response
      return await response.text();
    }
  }

  /**
   * Validates if extracted text has meaningful content
   * @param text Text to validate
   * @param minLength Minimum length for valid content
   * @returns True if text is valid
   */
  isValidText(text: string, minLength: number = 100): boolean {
    return text.trim().length >= minLength;
  }

  /**
   * Cleans and normalizes extracted text
   * @param text Raw text to clean
   * @returns Cleaned text
   */
  cleanText(text: string): string {
    return text
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\w\s\u00A0-\u017F\u0400-\u04FF]/g, " ") // Keep letters, numbers, spaces, and Romanian/Cyrillic characters
      .trim();
  }
}

export const textExtractionService = new TextExtractionService();
