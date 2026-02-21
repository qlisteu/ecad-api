declare module "pdf2json" {
  export default class PDFParser {
    constructor();
    on(event: string, cb: (data: any) => void): void;
    parseBuffer(buffer: Buffer): void;
  }
}
