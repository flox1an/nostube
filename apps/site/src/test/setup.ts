// Radix constructs ResizeObserver with `new` (e.g. RadioGroup's size measurement), which jsdom
// does not implement. Must be a class: an arrow-function mock is not constructible.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// jsdom has no matchMedia; the toaster follows the system colour scheme through it.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList
