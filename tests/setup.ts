import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

// jsdom doesn't implement scrolling.
window.scrollTo = (() => undefined) as typeof window.scrollTo;
