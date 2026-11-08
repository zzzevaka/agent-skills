// tests/setup.ts skips timers that fire after the test environment is gone (sonner leaves a
// 200 ms removal timer behind, and Vitest reports its "window is not defined" as an unhandled error).

/** Let timers run for `ms` without using setTimeout, which the guard under test wraps. */
function waitWithoutTimers(ms: number): Promise<void> {
  const start = Date.now();
  const channel = new MessageChannel();
  return new Promise((resolve) => {
    channel.port1.onmessage = () => (Date.now() - start > ms ? resolve() : channel.port2.postMessage(0));
    channel.port2.postMessage(0);
  });
}

describe("timers that outlive the test environment", () => {
  it("a_timer_firing_while_window_is_gone_does_not_run", async () => {
    let ran = false;
    const realWindow = window;
    setTimeout(() => {
      ran = true;
    }, 5);
    vi.stubGlobal("window", undefined);
    await waitWithoutTimers(40);
    vi.stubGlobal("window", realWindow);
    expect(ran).toBe(false);
  });

  it("a_timer_firing_normally_still_runs_and_gets_its_arguments", async () => {
    const seen = await new Promise<unknown[]>((resolve) => {
      setTimeout((...args: unknown[]) => resolve(args), 5, "a", 2);
    });
    expect(seen).toEqual(["a", 2]);
  });
});
