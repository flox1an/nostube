// Radix constructs ResizeObserver with `new` (e.g. RadioGroup's size measurement), which jsdom
// does not implement. Must be a class: an arrow-function mock is not constructible.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
