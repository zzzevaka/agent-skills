import "@testing-library/jest-dom/vitest";

// jsdom lacks the layout APIs CodeMirror measures with.
if (!Range.prototype.getClientRects) {
  const empty = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => empty as DOMRect;
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
}

// jsdom lacks these browser APIs, which Radix UI and the sidebar rely on.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};

// jsdom cannot host ProseMirror; unit tests use a textarea stand-in (Playwright covers the real editor).
vi.mock("../src/ui/MarkdownEditor", () => import("./mocks/markdownEditor"));

// sonner removes a dismissed toast 200 ms later with a timer it never clears. When a test file ends
// first, jsdom is already gone and the timer throws "window is not defined", which Vitest reports as
// an unhandled error (seen on slower CI runners). A timer that fires after the environment is torn
// down has nothing left to update, so skip it.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
  realSetTimeout(
    typeof handler === "function"
      ? (...inner: unknown[]) => {
          if (typeof window === "undefined") return;
          return (handler as (...a: unknown[]) => unknown)(...inner);
        }
      : handler,
    timeout,
    ...args,
  )) as typeof setTimeout;
