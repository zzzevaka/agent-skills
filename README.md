# Agent Skills

## Skills

- [durable-flow](docs/durable-flow/README.md) — create, run, and resume
  persistent multi-stage workflows stored in JSON or YAML flow files.

## Development

Run the Python unit tests with:

```bash
python3 -m unittest discover -s tests -v
```

### The viewer and editor page

The viewer and editor page is a React app in [`src/durable-flow/ui/`](src/durable-flow/ui), styled with
Tailwind and shadcn/ui components (`src/durable-flow/ui/src/components/ui`, adapted from
`docs_mcp`), with `@dnd-kit` for drag-and-drop. Its build,
a single self-contained file, is committed as
`skills/durable-flow/assets/flow-ui.html`, so using the skill needs no Node.
After changing anything in `src/durable-flow/ui/`, rebuild it and commit the result; CI fails
when the committed file is out of date.

```bash
cd src/durable-flow/ui
npm ci
npm test          # unit tests
npm run build     # writes skills/durable-flow/assets/flow-ui.html
npm run e2e       # browser smoke tests (npx playwright install chromium once)
```

The page re-implements flow parsing, validation and file writing in
TypeScript. The Python code is the source of truth: shared fixtures in
`tests/skills/durable-flow/fixtures/parity` are generated from it
(`python3 tests/skills/durable-flow/generate_parity_fixtures.py`) and checked by
both test suites, and CI makes Python validate files written by the page.

Install the development dependencies, including Ruff:

```bash
poetry install --with dev
```

Check Python code for style issues and common errors:

```bash
poetry run ruff check .
```

Apply automatic lint fixes and format the code:

```bash
poetry run ruff check --fix .
poetry run ruff format .
```
