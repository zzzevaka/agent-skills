import { downloadAdapter } from "../src/io/download";
import { connectFile, fsAccessSupported, restoreHandle, saveAs } from "../src/io/fsAccess";

describe("downloadAdapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("triggers_a_download_with_the_file_name_and_text", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:fake";
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    });

    const adapter = downloadAdapter("my-flow.yaml");
    await adapter.write("name: x\n");

    expect(adapter.kind).toBe("download");
    expect(adapter.name).toBe("my-flow.yaml");
    expect(clicked).toEqual([{ download: "my-flow.yaml", href: "blob:fake" }]);
    expect(await blob!.text()).toBe("name: x\n");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("cannot_be_read_back", async () => {
    await expect(downloadAdapter("x.json").read()).rejects.toThrow(/cannot be read/);
  });
});

describe("File System Access wrappers", () => {
  it("report_unsupported_browsers", async () => {
    expect(fsAccessSupported()).toBe(false);
    await expect(connectFile()).rejects.toThrow(/not supported/);
    await expect(saveAs("x.yaml", "text")).rejects.toThrow(/not supported/);
  });

  it("restoreHandle_returns_null_when_nothing_can_be_restored", async () => {
    await expect(restoreHandle("flow.yaml")).resolves.toBeNull();
  });
});
