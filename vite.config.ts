import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// In GitHub Actions gesetzt (z. B. "user/walkflow"), lokal leer
const githubRepo = process.env.GITHUB_REPOSITORY ?? '';

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GITHUB_REPO__: JSON.stringify(githubRepo),
  },
  build: { target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
