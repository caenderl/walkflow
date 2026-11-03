// Content types of the files the desktop app serves from its own scheme (electron/main.ts). A type that is missing here
// is served as application/octet-stream, which the browser refuses for scripts and module workers.

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // The map's worker is a module file of its own
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

export function mimeFor(file: string): string {
  const dot = file.lastIndexOf('.');
  const ext = dot > file.lastIndexOf('/') ? file.slice(dot).toLowerCase() : '';
  return MIME[ext] ?? 'application/octet-stream';
}
