---
name: durable-flow
description: Run and resume persistent multi-stage workflows stored in JSON or YAML flow files. Use when asked to execute, continue, or manage a durable flow.
---

# Skill durable-flow

## Reference flow files

When the user asks for a sample or needs a starting point, consult the examples
in [`references/`](references/): [`example.json`](references/example.json),
[`example.yaml`](references/example.yaml), and [`test.yaml`](references/test.yaml).
Treat these as templates, not as the user's flow state.

## Requirements

The user must provide the path to the flow state file. A flow is a repeatable,
multi-stage workflow whose progress and intermediate results persist across
pauses.

Resolve `scripts/state_management.py` relative to this `SKILL.md` directory,
not relative to the agent's current working directory. Use the resolved path
when running the commands below.

## Constraints

- Use `scripts/state_management.py` for every state read or transition. Do not
  read or edit the flow file directly.
- Run the script as documented; do not inspect or modify its implementation.

## Flow model

A flow contains:

- `name`: the flow name.
- `goal`: the overall goal shared by the workflow.
- `schemas`: optional named output schemas.
- `stages`: stages executed sequentially.

Each stage has a unique `name`, detailed `prompt`, an optional `depends_on`
list, and an optional `output_schema` name. The flow `goal` is always
available in `get_flow`; it is not a stage dependency. Dependencies may name
preceding stages. A missing or empty `depends_on` means the stage has no
stage-output inputs.

The stage input is an object containing the outputs named by `depends_on`. For
example, `depends_on: [find-lessons]` provides the validated output of that
stage; without dependencies the input is `{}`. A stage may start only after
all its stage dependencies have finished successfully.

The stage also holds runtime fields:

- `state`: `pending` | `inprogress` | `waiting` | `finished` | `failed`.
- `output`: the current intermediate or final result.
- `message`: a status explanation, such as why the stage is waiting.

When `output_schema` is omitted, the output is treated as a string. Schemas support
`str`, `int`, `float`, `bool`, `array`, and `object`, including nested values.
The stage input is derived from its dependencies when `get_flow` is called; it
is not copied into the flow state. Outputs are checked only when a stage is
finished.

## Flow execution

### Get the current state

```bash
scripts/state_management.py get_flow -p "path/to/the/flow.json"
```

The script prints the flow as JSON. In normal mode, only an in-progress or
waiting stage includes its full prompt, input, and saved output. Other stages'
prompts and data are truncated. Pass `-v` to inspect the full state.
Do not read the full state if it is not really required.

The flow includes an integer `revision`. Every successful state-changing
command increments it once and prints the updated flow with the new revision.
Pass the latest revision with `-r`/`--revision` on every write command. This is
an optimistic local lock: if another writer has changed the flow since the
revision you saw, the command is rejected. Run `get_flow` and make a decision
using the new state; do not blindly retry with an old revision. Read commands
such as `get_flow` do not need a revision.
In the examples below, replace `7` with the latest revision returned by
`get_flow`.

### Start the next stage

```bash
scripts/state_management.py start_next_stage -p "path/to/the/flow.json" -r 7
```

Stages run sequentially. The command starts the first pending stage whose
dependencies have completed. Then call `get_flow` to read the overall goal,
active stage instructions, and dynamically assembled input. Work only on that
stage, delegating it to a subagent when the agent environment supports
delegation. Pass the goal, prompt, and input to the subagent. After a pause,
`get_flow` reconstructs the same input from finished dependencies and shows the
saved output for resumption.

### Save intermediate output

```bash
scripts/state_management.py set_output -p "path/to/the/flow.json" -r 7 -m 'intermediate result'
```

Use this to persist useful progress before pausing or while work continues.
Saving output does not validate it. The stage's output is shown again by
`get_flow` when the stage resumes.

### Finish the current stage

Either provide the final output directly:

```bash
scripts/state_management.py finish_stage -p "path/to/the/flow.json" -r 7 -m 'final result'
```

Or validate the most recently saved output:

```bash
scripts/state_management.py finish_stage -p "path/to/the/flow.json" -r 7
```

The output is checked against the stage's `output_schema` (or string by
default). If it is invalid, the stage remains in progress so the output can be
corrected and submitted again. Only a successfully finished stage makes its
output available to dependent stages.

### Fail or pause the current stage

```bash
scripts/state_management.py fail_stage -p "path/to/the/flow.json" -r 7 -m 'failure reason'
scripts/state_management.py pause_stage -p "path/to/the/flow.json" -r 7 -m 'waiting reason'
```

Pausing preserves the stage output. The input is reconstructed from its
dependencies. Resume a waiting stage with:

```bash
scripts/state_management.py resume_stage -p "path/to/the/flow.json" -r 7 -m 'resume reason'
```

## Guidelines

- Execute stages sequentially; parallel execution is not supported.
- If every stage is complete, say so and stop.
- Use the scripts for every state transition; do not edit the flow file or read
  the implementation scripts directly.
- Each stage must have a detailed prompt. Use `depends_on` only for outputs
  from preceding stages; the overall goal is already available in `get_flow`.
- If output validation fails, correct the output and retry `finish_stage`.
