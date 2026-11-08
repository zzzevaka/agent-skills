import { act, render, renderHook, screen } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const KEY = "durable-flow-sidebar";

const wrapper =
  (props: { storageKey?: string; defaultOpen?: boolean } = {}) =>
  ({ children }: { children: ReactNode }) => <SidebarProvider {...props}>{children}</SidebarProvider>;

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
});

afterEach(() => vi.restoreAllMocks());

describe("cn", () => {
  it("cn_merges_conflicting_tailwind_classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "hidden", "font-medium")).toBe("text-sm font-medium");
  });
});

describe("Button", () => {
  it("button_renders_variants_and_forwards_ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} variant="destructive" size="sm">
        Delete
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Delete" });
    expect(ref.current).toBe(button);
    expect(button.className).toContain("bg-destructive");
    expect(buttonVariants({ variant: "outline" })).toContain("border-input");
  });

  it("asChild_renders_the_child_element", () => {
    render(
      <Button asChild>
        <a href="#x">Go</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "#x");
  });
});

describe("SidebarProvider", () => {
  it("sidebar_provider_defaults_to_open", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: wrapper() });
    expect(result.current.open).toBe(true);
    expect(result.current.state).toBe("expanded");
  });

  it("sidebar_provider_restores_open_state_from_localStorage", () => {
    localStorage.setItem(KEY, "false");
    const { result } = renderHook(() => useSidebar(), { wrapper: wrapper() });
    expect(result.current.open).toBe(false);
    expect(result.current.state).toBe("collapsed");
  });

  it("sidebar_toggle_writes_localStorage", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: wrapper() });
    act(() => result.current.toggleSidebar());
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
    act(() => result.current.toggleSidebar());
    expect(localStorage.getItem(KEY)).toBe("true");
  });

  it("sidebar_provider_survives_blocked_storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useSidebar(), { wrapper: wrapper() });
    expect(result.current.open).toBe(true);
    expect(() => act(() => result.current.toggleSidebar())).not.toThrow();
    expect(result.current.open).toBe(false);
  });

  it("an_unknown_stored_value_is_ignored", () => {
    localStorage.setItem(KEY, "maybe");
    const { result } = renderHook(() => useSidebar(), { wrapper: wrapper({ defaultOpen: false }) });
    expect(result.current.open).toBe(false);
  });

  it("ctrl_b_toggles_the_sidebar", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: wrapper() });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    });
    expect(result.current.open).toBe(false);
  });

  it("useSidebar_outside_a_provider_throws", () => {
    expect(() => renderHook(() => useSidebar())).toThrow(/SidebarProvider/);
  });
});

describe("useIsMobile", () => {
  it("use_mobile_follows_the_window_width", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
  });

  it("is_false_on_wide_windows", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
