# Structured Flow

An agent skill for complex multi-stage processes, such as sorting a month of
invoices or turning a pile of documents into notes. Run in one long agent
session, such a process gets expensive and fragile: the context keeps growing,
the model makes more mistakes, and an interruption loses the progress. Structured
Flow runs the process one stage at a time and keeps its state in a JSON or YAML
flow file.

- Agent instructions: [`SKILL.md`](../../skills/structured-flow/SKILL.md)
- Starter flows: [`example.json`](../../skills/structured-flow/references/example.json),
  [`example.yaml`](../../skills/structured-flow/references/example.yaml)
- A full run with a pause and a resume: [`lifecycle.md`](../../skills/structured-flow/references/lifecycle.md)

## Goals

- Lower the cost of complex multi-stage processes.
- Improve their quality and repeatability.

## How it works

The skill is a [`SKILL.md`](../../skills/structured-flow/SKILL.md) plus a few
scripts, so it runs in any harness that supports skills: Claude Code, Codex,
OpenCode, Pi Agent, and others.

- **One stage at a time.** The flow file splits the process into atomic
  stages. The main agent acts as an orchestrator: it starts a stage, hands it
  to a subagent, and records the result. The subagent sees only the flow goal,
  the stage prompt, and the stage input (the outputs of the stages it depends
  on). The other stages stay hidden, so the prompt stays small: the model has
  less room to hallucinate, and a smaller, cheaper model can handle the stage.
- **Scripts instead of file edits.** The agent reads and changes the flow only
  through the scripts, never by opening the file. The scripts show only the
  active stage in full, and every write passes the flow revision the agent
  last saw, so a stale agent cannot overwrite newer progress.
- **Structured outputs.** A stage can declare an output schema, similar to
  structured output in LLM APIs. The stage finishes only when its output
  matches the schema, so the next stages get the data they expect.
- **Durable state.** The flow file holds the state of the whole run, so a run
  can stop at any point and resume in another session. A stage can also pause
  on purpose to wait for an outside event, such as a person's approval or a
  pull request review.

These rules are instructions, not guarantees: the skill relies on the agent
following them. A harness with an extension API, such as Pi Agent, could
enforce them instead (see [Future enhancements](#future-enhancements)).

## Installation

```bash
npx skills add https://github.com/zzzevaka/agent-skills --skill structured-flow
```

## Usage

The examples use OpenCode. In other harnesses, make the same request the way
that harness invokes skills.

### Run the whole flow

```bash
opencode run "@structured-flow run path/to/flow.yaml"
```

### Run one stage and stop

```bash
opencode run "@structured-flow run only next stage and stop path/to/flow.yaml"
```

### View and edit the flow

The skill ships a single static page, [`flow-ui.html`](../../skills/structured-flow/assets/flow-ui.html).
There is nothing to run: open it in a browser (it needs no server and no network),
click **Open file** and choose your flow file. Ask the agent to "show the flow" and it
gives you the path of the page:

```bash
open skills/structured-flow/assets/flow-ui.html
```

A sidebar lists the Overview, every stage with its status and every output schema; the
page shows the goal, the progress, the stage graph, each stage's prompt, state, input
and output, and the schemas. The sidebar collapses to an icon rail, and becomes a drawer
on small screens.

![The spanish-lessons flow with the find-new-lessons stage selected](visualization.png)

The same page is a full editor. You can create, rename, duplicate, delete and reorder
stages (drag a stage by its grip handle in the sidebar, or focus the handle and use Space
and the arrow keys), choose their dependencies and output schemas, edit prompts and the goal right on the page in a Markdown editor (no edit mode: type and it is a change),
change a stage's state by clicking its badge (moving it to waiting or failed asks for the
reason in a dialog), edit outputs, edit the schemas in a visual field editor (or as YAML next to it), and change the flow name and the
revision. A floating **Save** button appears as soon as something changes, and the page lists
every problem that would make the flow invalid before you can save it. Text you click into but do not change keeps its original markup.

![Editing a stage in the Markdown editor, with the floating Save button](editor.png)

Output schemas are written in a simplified JSON Schema (`string`, `integer`, `number`,
`boolean`, `array`, `object`, plus `required` and `enum`). The Schemas tab edits them in a
visual field editor, next to the YAML source; either side updates the other.

![The visual schema editor beside the YAML definition](schema-editor.png)

**New flow** starts a blank flow in the page; the first **Save** asks where to put the file.

**Saving.** Every save writes the next revision, like any script command, so an agent that
still holds the previous revision is rejected instead of overwriting your changes.

- In Chromium-based browsers (Chrome, Edge, Arc, Brave) **Open file** gives the page access
  to the file, so **Save** writes into it in place. The page remembers the last file you
  opened or saved: reloading the page re-reads it, so you can watch a run by reloading. (The
  browser may ask permission again after a reload; the start screen then offers **Reopen**.)
  If the file changed on disk since you opened it, saving asks whether to reload, save a
  copy or overwrite.
- In other browsers (Firefox, Safari) **Open file** loads the file for viewing and editing,
  and **Save** downloads it; put it in place of the original. Open the file again to see
  newer progress.

Limits: comments in a hand-written YAML file are not preserved when the page saves it,
exactly as when the scripts rewrite it.

### Validate a flow file

After writing a flow by hand, check it without an agent:

```bash
python3 skills/structured-flow/scripts/validate.py -p path/to/flow.yaml
```

The script lists every problem it finds, including unknown keys such as a
misspelled `output_shema`, and exits with `1`; a valid flow exits with `0`.

## Example: categorize invoices

A flow that sorts a month of invoices and summarizes the spending:

```yaml
name: invoices
goal: |
  Categorize this month's invoices and write
  a short spending summary.

schemas:
  invoice-list:
    type: array
    items:
      type: object
      properties:
        file:
          type: string
        vendor:
          type: string
        amount:
          type: number
      required: [file, vendor, amount]
  category-list:
    type: array
    items:
      type: object
      properties:
        file:
          type: string
        category:
          type: string
          enum: [utilities, travel, software, other]
      required: [file, category]

stages:
  - name: find-invoices
    prompt: |
      List the PDF invoices in ~/Documents/Invoices/2026-09
      with their vendor and amount.
    output_schema: invoice-list

  - name: categorize
    prompt: |
      Assign each invoice in the input one category:
        - utilities
        - travel
        - software
        - or other
      Ask the user when the category is unclear.
    depends_on: [find-invoices]
    output_schema: category-list

  - name: summarize
    prompt: |
      Write a short spending summary with a total per category.
    depends_on: [find-invoices, categorize]
```

## Background

I wanted to automate parts of my routine: sorting documents, invoices, and
important messages from different sources. For another project, I had to
convert a large set of documents into notes for my Obsidian knowledge base.

At first, I used frontier models from OpenAI and Anthropic in their own
harnesses, Claude Cowork and Codex. This approach had two problems:

1. Cost. At a large volume of tasks, cheap subscriptions are no longer enough.
2. Privacy. Some workflows process personal documents that I'd rather not show
   to LLM providers.

Next, I tried Pi Agent and OpenCode with local models that fit on my MacBook
Pro M4 Pro with 24 GB of unified memory. gpt-oss-20b did best, but still not
well enough: it often made mistakes, and the more complex the workflow, the
less likely it was to finish. The context was too large. So I split the work
into stages and gave the model only the context each stage needs.

## Future enhancements

- **Parallelism.** Stage dependencies already form a directed acyclic graph
  (DAG), so stages whose inputs are ready could run in parallel when the
  harness supports it. Today, stages run one at a time.
- **Execution log.** `set_output` keeps only the latest intermediate output. A
  log of checkpoints would let a long stage resume from any saved point.
- **Harness integration.** Enforce the rules through the harness, for example
  with a Pi Agent extension, rather than as instructions to the agent.
