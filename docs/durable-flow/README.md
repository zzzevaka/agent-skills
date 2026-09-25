# Durable Flow

A skill for running persistent, multi-stage workflows with an AI agent. The
workflow and its progress live in a single JSON or YAML flow file, so a run can
stop at any point and continue later, in the same session or a new one.

- Skill instructions for the agent: [`SKILL.md`](../../skills/durable-flow/SKILL.md)
- Starter flows: [`example.json`](../../skills/durable-flow/references/example.json),
  [`example.yaml`](../../skills/durable-flow/references/example.yaml)
- Another worked run: [`lifecycle.md`](../../skills/durable-flow/references/lifecycle.md)

## Usage

### Run the full flow
```bash
opencode run "@durable-flow run path/to/flow.yaml"
```

### Run a single step.
```bash
opencode run "@durable-flow run only next stage and stop path/to/flow.yaml"
```

### Visualize the flow.
```bash
opencode run "@durable-flow render path/to/flow.yaml"
```
![The spanish-lessons flow with the create-lesson-summaries stage in progress](visualization.png)

## Why

At some point, I decided to automate certain aspects of my routine, such as
categorizing documents, invoices, and important messages from various sources.
Also, for one of my projects, I needed to read a lot of doc files and convert
them into the format I needed for my knowledge base in Obsidian.

At first, I used OpenAI and Anthropic's frontier models and their harnesses,
Claude Workspace and Codex, for this. This approach has two problems:

1. Cost. When dealing with a large volume of tasks, cheap subscriptions are no
   longer sufficient.
2. Privacy. Some workflows process personal documents that I'd rather not show
   to LLM providers.

Another approach I tried was Pi Agent and OpenCode together with local LLMs,
which my MacBook Pro M4 Pro with 24GB of unified memory could handle.
gpt-oss-20b showed the best results, but they were still unsatisfactory; the
model often made mistakes, and the more complex the workflow, the lower the
chances of successfully completing it. The problem was clear: the context was
too large. I came up with the idea of splitting the work into stages and
providing only the necessary part of the context at each stage.

So the solution has to:

- describe the process as clearly separated stages;
- run in any harness: OpenAI Codex, Anthropic Claude, OpenCode, Pi Agent, etc.;
- keep its execution state, so it can wait for external events and resume after
  an interruption;
- promote determinism: the same process under the same conditions should lead
  to similar results.

## How it works

The skill is a [`SKILL.md`](../../skills/durable-flow/SKILL.md) plus two
scripts. The flow file describes the stages; the scripts are the only way the
agent reads or changes it.

- The main agent is an orchestrator. It starts a stage, hands the work to a
  subagent, and records the result.
- The subagent sees only the flow goal, the stage prompt, and the stage input
  (the outputs of the stages it depends on). Everything else stays out of its
  context.
- Every change passes the flow revision the agent last saw, so a stale agent
  cannot overwrite newer progress.

The flow can be paused and resumed. For example, it can wait for a approval from a person or review of a pull request.

These are instructions, not guarantees: the skill relies on the agent following
them. A harness with an extension API, such as Pi Agent, could enforce them
instead (see [Future enhancements](#future-enhancements)).

## Example: categorize invoices

### Describe the flow

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
          type: str
        vendor:
          type: str
        amount:
          type: float
  category-list:
    type: array
    items:
      type: object
      properties:
        file:
          type: str
        category:
          type: str

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
    depends_on: [find-invoices]
```

## Future enhancements

- **Parallelism.** The dependencies already form a directed acyclic graph (DAG), so every stage that is
  ready could run at the same time when the harness supports it. Currently, stages run one at a time.
- **Execution log.** `set_output` keeps only the latest intermediate output. A
  log of checkpoints would let a long stage resume from any saved point.
- **Harness integration.** Enforce the rules through the harness, for example a Pi Agent extension, rather than as instructions to the agent.
