// The pdf.js worker shipped inside the extension (Vite copies it and gives its path).
import workerPath from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const PDF_WORKER_PATH: string = workerPath;
