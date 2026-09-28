import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Emits dist/sw.js with the exact list of built files, so the installed app can start offline.
 * The cache name changes whenever the file list or the worker changes, which retires the old cache.
 */
function serviceWorker(): Plugin {
  return {
    name: 'lingua-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = listFiles('public').map((f) => relative('public', f).replace(/\\/g, '/'));
      const files = [...new Set(['index.html', ...built, ...publicFiles])].sort();
      const template = readFileSync('pwa/sw-template.js', 'utf8');
      const version = createHash('sha256').update(files.join('\n')).update(template).digest('hex').slice(0, 12);
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files.map((f) => `./${f}`)], null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // Relative base so the built app also works when served from a sub-path.
  base: './',
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
