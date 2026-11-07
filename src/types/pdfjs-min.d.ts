// pdf.js ships types for its unminified build only; the minified build has the same API.
declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export * from 'pdfjs-dist';
}
