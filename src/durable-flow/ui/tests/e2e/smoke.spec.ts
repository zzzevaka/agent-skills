import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const VIEWER = resolve(process.cwd(), "../../../skills/durable-flow/assets/flow-ui.html");
const SCRIPTS = resolve(process.cwd(), "../../../skills/durable-flow/scripts");

const validate = (path: string) =>
  execFileSync("python3", [join(SCRIPTS, "validate.py"), "-p", path], { encoding: "utf-8" }).trim();

const FLOW = `name: demo
goal: Demo goal
stages:
  - name: first
    prompt: Do the first thing
  - name: second
    prompt: Do the second thing
  - name: third
    prompt: Do the third thing
`;

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "durable-flow-e2e-"));
}

function flowFile(text = FLOW, name = "flow.yaml"): { folder: string; path: string } {
  const folder = workspace();
  const path = join(folder, name);
  writeFileSync(path, text);
  return { folder, path };
}

/** Open the viewer the way a Firefox or Safari user would see it: no File System Access API. */
async function openViewer(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto(`file://${VIEWER}`);
  return problems;
}

/** Click Open file and answer the browser's file chooser with `path`. */
async function chooseFile(page: Page, path: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Open file" }).click(),
  ]);
  await chooser.setFiles(path);
}

async function openFlow(page: Page, text = FLOW, name = "flow.yaml") {
  const problems = await openViewer(page);
  const file = flowFile(text, name);
  await chooseFile(page, file.path);
  await expect(page.getByTestId("content")).toBeVisible(); // the start screen also has an h1
  return { ...file, problems };
}

async function saveDownload(page: Page, folder: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  const target = join(folder, "out", download.suggestedFilename());
  mkdirSync(join(folder, "out"), { recursive: true });
  await download.saveAs(target);
  return { name: download.suggestedFilename(), path: target };
}

const order = (page: Page) =>
  page.locator('[data-row] [data-sidebar="menu-button"] span.flex-1').allTextContents();

/** dnd-kit starts listening for the arrow keys a moment after Space, so wait for each announcement. */
async function keyboardDrag(page: Page, name: string, arrow: "ArrowUp" | "ArrowDown", over: string) {
  const live = page.locator("[aria-live]");
  await page.getByRole("button", { name: `Drag to reorder ${name}` }).focus();
  await page.keyboard.press("Space");
  await expect(live.filter({ hasText: /Picked up|is over position/ })).not.toHaveCount(0);
  await page.waitForTimeout(150); // the key listener is attached just after the pick-up announcement
  await page.keyboard.press(arrow);
  await expect(live.filter({ hasText: over })).not.toHaveCount(0);
  await page.keyboard.press("Space");
}

test("the start screen offers Open file and New flow", async ({ page }) => {
  const problems = await openViewer(page);
  await expect(page).toHaveTitle("durable-flow");
  await expect(page.getByRole("button", { name: "Open file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New flow" })).toBeVisible();
  await expect(page.getByText(/downloads a copy/i)).toBeVisible();
  expect(problems).toEqual([]);
});

test("open a flow file, edit it and save it as a valid file", async ({ page }) => {
  const { folder, problems } = await openFlow(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("demo");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit flow name" }).click();
  await page.getByRole("textbox", { name: "Flow name" }).fill("renamed-demo");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Add stage" }).click();
  await expect(page.getByRole("list", { name: "Stages" }).getByText("stage-4")).toBeVisible();

  const saved = await saveDownload(page, folder);
  expect(saved.name).toBe("flow.yaml");
  expect(validate(saved.path)).toContain("Flow file is valid");
  const text = readFileSync(saved.path, "utf-8");
  expect(text).toContain("name: renamed-demo");
  expect(text).toContain("name: stage-4");
  expect(text).toContain("revision: 1");

  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toContainText("Downloaded flow.yaml");
  expect(problems).toEqual([]); // includes any Content-Security-Policy violation
});

test("open a JSON flow file", async ({ page }) => {
  const json = JSON.stringify({ name: "from-json", goal: "g", stages: [{ name: "only", prompt: "p" }] });
  const { folder } = await openFlow(page, json, "flow.json");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("from-json");
  await page.getByRole("button", { name: "Edit flow name" }).click();
  await page.getByRole("textbox", { name: "Flow name" }).fill("json-renamed");
  await page.keyboard.press("Enter");
  const saved = await saveDownload(page, folder);
  expect(saved.name).toBe("flow.json");
  expect(JSON.parse(readFileSync(saved.path, "utf-8")).name).toBe("json-renamed");
  expect(validate(saved.path)).toContain("Flow file is valid");
});

test("a file with errors is reported on the start screen", async ({ page }) => {
  await openViewer(page);
  const bad = flowFile("name: broken\ngoal: g\nstages:\n  - name: a\n    prompt: p\n    depends_on: [b]\n");
  await chooseFile(page, bad.path);
  await expect(page.locator("[data-sonner-toast]")).toContainText("depends on 'b'");
  await expect(page.getByRole("button", { name: "New flow" })).toBeVisible();
});

test("create a flow from scratch and save it as a valid file", async ({ page }) => {
  const problems = await openViewer(page);
  const folder = workspace();

  await page.getByRole("button", { name: "New flow" }).click();
  await page.getByRole("list", { name: "Stages" }).getByRole("button", { name: /^(?!Drag to reorder).*stage-1/ }).click();
  await page.getByRole("group", { name: "Prompt" }).locator(".ProseMirror").fill("Write the report");

  const saved = await saveDownload(page, folder);
  expect(saved.name).toBe("new-flow.yaml");
  expect(validate(saved.path)).toContain("Flow file is valid");
  expect(readFileSync(saved.path, "utf-8")).toContain("prompt: Write the report");
  expect(problems).toEqual([]);
});

test("every button has a name on every screen", async ({ page }) => {
  const { problems } = await openFlow(page);
  for (const hash of ["#/overview", "#/stages/first", "#/schemas"]) {
    await page.evaluate((h) => (window.location.hash = h), hash);
    await expect(page.getByTestId("content")).toHaveAttribute("data-tab", hash.split("/")[1]);
    const unnamed = await page.$$eval("button", (buttons) =>
      buttons
        .filter((b) => !(b.getAttribute("aria-label") || b.textContent?.trim() || b.getAttribute("title")))
        .map((b) => b.outerHTML),
    );
    expect(unnamed, `unnamed buttons on ${hash}`).toEqual([]);
  }
  expect(problems).toEqual([]);
});

test("stages can be reordered by dragging the handle", async ({ page }) => {
  const { folder, problems } = await openFlow(page);
  expect(await order(page)).toEqual(["first", "second", "third"]);

  const grip = page.getByRole("button", { name: "Drag to reorder third" });
  await page.locator('[data-row="2"]').hover(); // handles appear on hover
  await expect(grip).toBeVisible();
  await page.waitForTimeout(150); // let the hover transition finish so the box is stable
  const from = (await grip.boundingBox())!;
  const to = (await page.locator('[data-row="0"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y - 10, { steps: 4 });
  await page.mouse.move(to.x + 40, to.y + 4, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => order(page)).toEqual(["third", "first", "second"]);
  await page.waitForTimeout(300); // dnd-kit swallows the click that follows a drop
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  const saved = await saveDownload(page, folder);
  expect(validate(saved.path)).toContain("Flow file is valid");
  const text = readFileSync(saved.path, "utf-8");
  expect(text.indexOf("name: third")).toBeLessThan(text.indexOf("name: first"));
  expect(text.indexOf("name: first")).toBeLessThan(text.indexOf("name: second"));
  expect(problems).toEqual([]);
});

test("stages can be reordered with the keyboard and the move is announced", async ({ page }) => {
  await openFlow(page);
  await keyboardDrag(page, "third", "ArrowUp", "third is over position 2 of 3");

  await expect.poll(() => order(page)).toEqual(["first", "third", "second"]);
  await expect(page.locator("[aria-live]").filter({ hasText: "Dropped third at position 2 of 3" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("a drop before a dependency is refused and explained", async ({ page }) => {
  await openFlow(
    page,
    "name: demo\ngoal: g\nstages:\n  - name: base\n    prompt: p\n  - name: next\n    prompt: p\n    depends_on: [base]\n",
  );
  await keyboardDrag(page, "next", "ArrowUp", "next is over position 1 of 2");

  await expect(page.getByRole("alert")).toContainText("stage 'next' would come before its dependency 'base'");
  expect(await order(page)).toEqual(["base", "next"]);
});

test("the sidebar collapses to an icon rail and the choice is remembered", async ({ page }) => {
  await openFlow(page);
  const sidebar = page.locator('[data-variant="sidebar"]');
  await expect(sidebar).toHaveAttribute("data-state", "expanded");

  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(sidebar).toHaveAttribute("data-collapsible", "icon");
  // every row keeps its accessible name in the rail
  await expect(
    page.getByRole("list", { name: "Stages" }).getByRole("button", { name: /^(?!Drag to reorder).*second/ }),
  ).toHaveCount(1);

  await page.reload(); // a browser without file access starts over: open a flow again
  await page.getByRole("button", { name: "New flow" }).click();
  await expect(page.locator('[data-variant="sidebar"]')).toHaveAttribute("data-state", "collapsed");
});

test("the flow graph expands to full screen and Esc brings it back", async ({ page }) => {
  const { problems } = await openFlow(page);
  const card = page.getByTestId("flow-card");
  const before = await card.boundingBox();
  await page.getByRole("button", { name: "Expand flow to full screen" }).click();
  const viewport = page.viewportSize()!;
  const full = await card.boundingBox();
  expect(full).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await page.getByRole("button", { name: "Exit full screen" }).click();
  expect((await card.boundingBox())!.width).toBe(before!.width);
  await page.getByRole("button", { name: "Expand flow to full screen" }).click();
  await page.keyboard.press("Escape");
  await expect(card).not.toHaveAttribute("data-fullscreen", "true");
  expect(problems).toEqual([]);
});

/** Add a field of `type` in the visual schema editor (the first form on the page unless `scope` is given). */
async function addSchemaField(page: Page, name: string, type: string, scope = "") {
  const suffix = scope ? ` in ${scope}` : "";
  await page.getByLabel(`Field name${suffix}`, { exact: true }).fill(name);
  await page.getByLabel(`Field type${suffix}`, { exact: true }).selectOption(type);
  await page.getByRole("button", { name: scope ? `Add field to ${scope}` : "Add field", exact: true }).click();
}

test("the page makes no network requests", async ({ page }) => {
  const local = (url: string) => /^(file|data|blob|about):/.test(url);
  const attempted: string[] = [];
  page.on("request", (request) => {
    if (!local(request.url())) attempted.push(request.url());
  });
  await page.route((url) => !local(url.toString()), (route) => route.abort());
  const { problems } = await openFlow(page);
  for (const hash of ["#/overview", "#/stages", "#/schemas"]) {
    await page.evaluate((h) => (window.location.hash = h), hash);
    await expect(page.getByTestId("content")).toBeVisible();
  }
  await page.getByRole("button", { name: "Add schema" }).click();
  for (const type of ["string", "integer", "number", "boolean", "array", "object"]) {
    await addSchemaField(page, `f-${type}`, type);
  }
  await page.getByRole("button", { name: "Expand f-string" }).click();
  await page.getByLabel("Enum value of f-string").fill("red");
  await page.getByRole("button", { name: "Add value to f-string" }).click();
  await page.getByRole("button", { name: "Expand f-object" }).click();
  await addSchemaField(page, "inner", "string", "f-object");
  await expect(page.getByLabel("Schema definition")).toBeVisible();
  await page.getByRole("list", { name: "Stages" }).getByRole("button", { name: /^(?!Drag to reorder)/ }).first().click();
  await expect(page.getByTestId("content")).toHaveAttribute("data-tab", "stages");
  expect(attempted).toEqual([]);
  expect(problems).toEqual([]);
});

test("the visual schema editor builds a schema that Python accepts", async ({ page }) => {
  const { folder, problems } = await openFlow(page);
  await page.evaluate(() => (window.location.hash = "#/schemas"));
  await page.getByRole("button", { name: "Add schema" }).click();
  await addSchemaField(page, "title", "string");
  await addSchemaField(page, "count", "integer");
  await addSchemaField(page, "tags", "array");
  await addSchemaField(page, "meta", "object");
  await page.getByRole("switch", { name: "Required: count" }).click(); // now optional
  await page.getByRole("button", { name: "Expand title" }).click();
  await page.getByLabel("Enum value of title").fill("a");
  await page.getByRole("button", { name: "Add value to title" }).click();
  await page.getByRole("button", { name: "Expand meta" }).click();
  await addSchemaField(page, "author", "string", "meta");
  await page.getByRole("button", { name: "Expand tags" }).click();
  await page.getByLabel("Type of tags items").selectOption("integer");

  const yaml = page.getByRole("textbox", { name: "Schema definition" });
  const source = await yaml.innerText();
  expect(source).toContain("type: object");
  expect(source).toContain("enum:");
  expect(source).toContain("required:");

  // the YAML side drives the visual side
  await page.getByRole("button", { name: "Edit schema name" }).click();
  await page.getByRole("textbox", { name: "Schema name" }).fill("result");
  await page.keyboard.press("Enter");

  const saved = await saveDownload(page, folder);
  expect(validate(saved.path)).toContain("Flow file is valid");
  const text = readFileSync(saved.path, "utf-8");
  expect(text).toContain("result:");
  expect(text).toContain("type: integer");
  expect(text).not.toMatch(/type: (str|int|float|bool)\b(?!e)/);
  expect(problems).toEqual([]);
});

test("dark mode follows the theme toggle and survives a reload", async ({ page }) => {
  await openFlow(page);
  const root = page.locator("html");
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(root).toHaveClass(/dark/);
  await page.reload();
  await expect(root).toHaveClass(/dark/);
  await page.getByRole("button", { name: "New flow" }).click();
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(root).not.toHaveClass(/dark/);
});

test("no console or CSP errors on any screen, collapsed rail or narrow drawer", async ({ page }) => {
  const { problems } = await openFlow(page);
  for (const hash of ["#/overview", "#/schemas", "#/stages/second"]) {
    await page.evaluate((h) => (window.location.hash = h), hash);
    await expect(page.getByTestId("content")).toHaveAttribute("data-tab", hash.split("/")[1]);
  }
  await page.getByRole("tab", { name: "Output schema" }).click();
  await expect(page.getByRole("region", { name: "Dependencies" })).toBeVisible();
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click(); // collapse
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click(); // expand again

  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("list", { name: "Stages" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(problems).toEqual([]);
});

const promptEditor = (page: Page) => page.getByRole("group", { name: "Prompt" }).locator(".ProseMirror");

async function typeAtEndOfPrompt(page: Page, text: string) {
  await promptEditor(page).click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

test("the prompt is always editable and typing is saved without any Done button", async ({ page }) => {
  const { folder, problems } = await openFlow(page);
  await page.goto(page.url().split("#")[0] + "#/stages/first");
  await expect(page.getByRole("button", { name: /Edit prompt|Done editing prompt/ })).toHaveCount(0);
  await typeAtEndOfPrompt(page, " ZZZ");

  const saved = await saveDownload(page, folder); // the Save button appears once the typing is committed
  expect(readFileSync(saved.path, "utf-8")).toContain("Do the first thing ZZZ");
  expect(validate(saved.path)).toContain("Flow file is valid");
  expect(problems).toEqual([]);
});

test("focusing the editor without typing changes nothing", async ({ page }) => {
  await openFlow(page);
  await page.goto(page.url().split("#")[0] + "#/stages/first");
  await promptEditor(page).click();
  await page.getByRole("heading", { level: 2 }).click(); // blur
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
});

test("undo puts the previous text back into the editor", async ({ page }) => {
  await openFlow(page);
  await page.goto(page.url().split("#")[0] + "#/stages/first");
  await typeAtEndOfPrompt(page, " ZZZ");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(promptEditor(page)).toHaveText("Do the first thing");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
});

test("text typed in one stage stays with that stage when another is opened right away", async ({ page }) => {
  const { folder } = await openFlow(page);
  await page.goto(page.url().split("#")[0] + "#/stages/first");
  await typeAtEndOfPrompt(page, " ZZZ");
  await page.getByRole("list", { name: "Stages" }).getByRole("button", { name: /^(?!Drag to reorder).*second/ }).click();
  await expect(promptEditor(page)).toHaveText("Do the second thing");
  const saved = await saveDownload(page, folder);
  const text = readFileSync(saved.path, "utf-8");
  expect(text).toContain("Do the first thing ZZZ");
  expect(text).toContain("Do the second thing");
  expect(text).not.toContain("second thing ZZZ");
});
