---
name: structured-flow
description: Create, run, and resume persistent multi-stage workflows stored in JSON or YAML flow files.
---

# Skill structured-flow

## Reference flow files

When the user needs a new flow or an example, consult the relevant reference:

- [`example.json`](references/example.json) is a compact, unstructured starter.
- [`example.yaml`](references/example.yaml) is a multi-stage starter with structured outputs.
- [`lifecycle.md`](references/lifecycle.md) shows a complete start, save, pause,
  resume, validation, and completion sequence.

Treat these as templates or documentation, not as the user's flow state.

## Create or select a flow file

A flow is a repeatable, multi-stage workflow whose progress and intermediate
results persist across pauses.

- If the user supplies a flow path, use that file.
- If the user asks to create a flow, adapt the appropriate reference file and
  save it at a task-scoped path supplied by the user or already established by
  the task. If there is no suitable location, ask where to create it.
- An initial flow must define `name`, `goal`, and `stages`; add `schemas` only
  when a stage needs structured output. Omit `state`, `output`, `message`, and
  `revision` from a new flow: they default to `pending`, `null`, `null`, and
  `0`.

Directly copy and edit a reference only while creating the initial flow file.
Then run `scripts/validate.py` on it (see [Validate the flow file](#validate-the-flow-file))
and fix every reported error before starting the flow. After the file exists,
use the state-management script for every state read or transition.

Resolve `scripts/state_management.py` relative to this `SKILL.md` directory,
not relative to the agent's current working directory. Use the resolved path
when running the commands below.

## Constraints

- After initialization, use `scripts/state_management.py` for every state read
  or transition, and `scripts/validate.py` to check it. To show or edit a flow in
  a UI, give the user the viewer page (see
  [Show or edit the flow](#show-or-edit-the-flow)). Do not read or edit the flow
  file directly.
- Run the script as documented; do not inspect or modify its implementation.
- The script allows to read the entire flow definition. However, avoid doing that.
  Use it when it is requested explicitly.

## Flow model

A flow contains:

- `name`: the flow name.
- `goal`: the overall goal shared by the workflow.
- `schemas`: optional named output schemas.
- `stages`: the workflow stages. Only one runs at a time, and you choose which.

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

- `state`: `pending` | `inprogress` | `waiting` | `finished` | `failed` in the
  file. `get_flow` splits `pending` by the stage's dependencies:
  `ready_to_start` (all dependencies are finished) or `waiting_for_dependencies`
  (at least one is not, including a failed one).
- `output`: the current intermediate or final result.
- `message`: a status explanation, such as why the stage is waiting.

When `output_schema` is omitted, the output is treated as a string. A schema is a
simplified JSON Schema: `type` is `string`, `integer`, `number`, `boolean`, `array`
(with `items`) or `object` (with `properties`), nested as deeply as needed. Besides
`description` and `examples`, an object lists its mandatory fields in `required`
(the other fields are optional, and extra fields are allowed), and a string, integer
or number may limit its values with `enum`. No other keyword is supported, and the old
names `str`, `int`, `float` and `bool` are rejected.
The stage input is derived from its dependencies when `get_flow` is called; it
is not copied into the flow state. Outputs are checked only when a stage is
finished.

## Flow execution

### Validate the flow file

```bash
scripts/validate.py -p "path/to/the/flow.json"
```

The script is read-only. It exits with `0` and prints `Flow file is valid` when
the flow can run. Otherwise it exits with `1` and lists every problem it found:
unknown keys (usually typos such as `output_shema`, which the other scripts
silently ignore), invalid schema definitions, duplicated stages, dependencies
on stages that are not earlier, and unknown output schemas. A missing required
key or a malformed stage stops parsing, so only that one is reported alongside
unknown keys; fix it and run the script again. Stage outputs are not checked
here; they are validated by `finish_stage`.

### Get the current state

```bash
scripts/state_management.py get_flow -p "path/to/the/flow.json"
```

The script prints the flow as JSON. In normal mode, only the in-progress stage
includes its full prompt, input, and saved output. Other stages' prompts and
data are truncated; a waiting stage still shows its message, which says what it
waits for. Pass `-v` to inspect the full state.
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

### Show or edit the flow

When the user asks to see, show, visualize, or edit a flow, or to create one in a
UI, point them to the viewer page. There is nothing to run: the page is a single
static HTML file that works offline,
[`assets/flow-ui.html`](assets/flow-ui.html) in this skill's directory (resolve it
relative to this `SKILL.md`). Tell the user its absolute path and what to do:

1. Open the file in a browser (for example `open "<path>"` on macOS).
2. Click **Open file** and choose the flow file. **New flow** starts a blank
   flow instead.

The page shows the goal, progress, stage graph, every stage's prompt, state,
input and output, and the schemas, and it is a full editor: the user can change
the name, goal, stages (including drag-and-drop reordering), schemas, states,
and revision, and a Save button appears when something has changed.

- In Chromium-based browsers (Chrome, Edge, Arc, Brave) the page saves into the
  opened file in place and remembers it: reloading the page re-reads it (the
  browser may ask permission again first). Other browsers open the file for
  viewing and editing, and Save downloads a copy to put in its place.
- Every save from the page increments `revision`, like a script command does.
  After the user says they saved changes, run `get_flow` again and use the new
  revision; never reuse an older one.
- Run `scripts/validate.py` on a file the user saved if anything looks off.

### Choose and start a stage

```bash
scripts/state_management.py start_stage -p "path/to/the/flow.json" -r 7 -s "stage-name"
```

Only one stage is `inprogress` at a time, and you choose which one. Call
`get_flow` and pick:

- a `ready_to_start` stage, started with `start_stage`; or
- a `waiting` stage whose reason is now resolved, continued with
  `resume_stage` (see [Pause the current stage](#pause-the-current-stage)).

`start_stage` fails if the stage is not `ready_to_start` or another stage is
`inprogress`. When the stage is blocked, the error lists the stages that can
start, or, if none can, the waiting stages and what they wait for. `-s` is
accepted only by `start_stage` and `resume_stage`. Then call `get_flow`
to read the overall goal, active stage instructions, and dynamically assembled
input. Work only on that stage, delegating it to a subagent when the agent
environment supports delegation. Pass the goal, prompt, and input to the
subagent. After a pause, `get_flow` reconstructs the same input from finished
dependencies and shows the saved output for resumption.

Prefer the earliest ready stage in the order of the flow file, and skip ahead
only past stages that are waiting for an outside event and that the later stage
does not need. A stage without `depends_on` is ready from the start, so a flow
author who needs an order declares it with `depends_on`. When a stage pauses and
other stages are `ready_to_start`, or another waiting stage has been unblocked,
continue with that work instead of stopping. If no
stage can run, tell the user what each waiting stage is waiting for and stop.

### Save intermediate output

```bash
scripts/state_management.py set_output -p "path/to/the/flow.json" -r 7 -m 'intermediate result'
```

Use this to persist useful progress before pausing or while work continues.
Saving output does not validate it. The stage's output is shown again by
`get_flow` when the stage resumes.

### Decide whether to pause

Keep a stage `inprogress` while there is useful work that can be completed
without outside input. Pause it only when forward progress depends on a
specific external condition, such as a user answer or approval, restored
access, an unavailable resource, or a future result.

Before pausing, save useful partial work with `set_output`. The pause message
must state both what is awaited and what will allow the stage to resume. A
paused stage can wait for days; meanwhile you can start any other ready stage. For
example: `Waiting for the transcript export; resume when the export is
available.`

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

### Pause the current stage

```bash
scripts/state_management.py pause_stage -p "path/to/the/flow.json" -r 7 -m 'waiting reason'
```

Pausing preserves the stage output. The input is reconstructed from its
dependencies. Resume a waiting stage by name, once no other stage is
`inprogress`:

```bash
scripts/state_management.py resume_stage -p "path/to/the/flow.json" -r 7 -s "stage-name" -m 'resume reason'
```

### Record a failure

```bash
scripts/state_management.py fail_stage -p "path/to/the/flow.json" -r 7 -m 'failure reason'
```

Failure recovery belongs to manual mode. Do not automatically retry, restart,
or alter a failed flow from this skill.

## Guidelines

- Keep one stage `inprogress` at a time. You may interleave stages: pause one
  that is blocked and start another that is ready, then resume the first when
  it is unblocked. Parallel execution is not supported.
- If every stage is complete, say so and stop.
- After initialization, use the scripts for every state transition; do not edit
  the flow file or read the implementation scripts directly.
- Each stage must have a detailed prompt. List in `depends_on` every
  preceding stage this one needs finished first, whether or not it uses that
  stage's output; the overall goal is already available in `get_flow`.
- If output validation fails, correct the output and retry `finish_stage`.
