# Worked lifecycle

This walkthrough uses a copy of [`example.yaml`](example.yaml) at
`path/to/spanish-lessons.yaml`. Set the task-specific `FLOW_TOOL` shell variable
to the path of `scripts/state_management.py` resolved from the skill directory.
The revision values illustrate a flow with no other writer; always use the
latest revision returned by the preceding successful command.

## Start and finish the first stages

Read the new flow. Its revision is `0`. The first stage is `ready_to_start`; the other two are
`waiting_for_dependencies`. (The file itself stores them as `pending`.)

```bash
"$FLOW_TOOL" get_flow -p "path/to/spanish-lessons.yaml"
"$FLOW_TOOL" start_stage -p "path/to/spanish-lessons.yaml" -r 0 -s find-last-processed-lesson
```

`find-last-processed-lesson` is now `inprogress` at revision `1`. It has the
`last-processed-lesson` object schema, so finish it with valid JSON:

```bash
"$FLOW_TOOL" finish_stage -p "path/to/spanish-lessons.yaml" -r 1 -m '{"document_id":"doc-0731","lesson_date":"2026-07-31"}'
"$FLOW_TOOL" start_stage -p "path/to/spanish-lessons.yaml" -r 2 -s find-new-lessons
```

`find-new-lessons` is now active at revision `3`, and `get_flow` provides the
validated `find-last-processed-lesson` output as its input. Passing the output
to `finish_stage` validates it against `new-lessons` before marking the stage
finished.

```bash
"$FLOW_TOOL" finish_stage -p "path/to/spanish-lessons.yaml" -r 3 -m '{"media_file_id":"media-001","new_lessons":[{"lesson_date":"2026-08-05","start_row":1915,"end_row":1974},{"lesson_date":"2026-08-07","start_row":1975,"end_row":2016}]}'
"$FLOW_TOOL" start_stage -p "path/to/spanish-lessons.yaml" -r 4 -s create-lesson-summaries
```

`create-lesson-summaries` is now active at revision `5`.

## Save progress, wait, and resume

Suppose the first summary is stored but DocuMur rejects the second one. Save
the useful partial result before entering `waiting`:

```bash
"$FLOW_TOOL" set_output -p "path/to/spanish-lessons.yaml" -r 5 -m '["2026-08-05"]'
"$FLOW_TOOL" pause_stage -p "path/to/spanish-lessons.yaml" -r 6 -m 'DocuMur is unavailable while storing the 2026-08-07 summary; resume when it is back.'
```

The stage is `waiting` at revision `7`; `get_flow` shows the reason for waiting,
and its saved output stays in the flow file (`get_flow -v` shows it, and plain
`get_flow` shows it again once the stage is resumed). When DocuMur is available again,
resume the same stage:

```bash
"$FLOW_TOOL" resume_stage -p "path/to/spanish-lessons.yaml" -r 7 -s create-lesson-summaries -m 'DocuMur is available again.'
```

The stage returns to `inprogress` at revision `8` and still contains the saved
partial output, so it skips `2026-08-05`.

## Complete the flow

Finish `create-lesson-summaries` with the complete list:

```bash
"$FLOW_TOOL" finish_stage -p "path/to/spanish-lessons.yaml" -r 8 -m '["2026-08-05","2026-08-07"]'
"$FLOW_TOOL" get_flow -p "path/to/spanish-lessons.yaml"
```

All three stages are now `finished` at revision `9`. If structured output
fails validation, the stage remains `inprogress` at the same revision. Correct
the output and call `finish_stage` again with that revision.

## Work on another stage while one waits

A stage can wait for days, for example for a pull request review. Meanwhile
the agent can work on any other stage that is ready. This walkthrough uses a
small flow in `path/to/release.yaml` with three stages; `merge` depends on
`open-pr`, and `write-docs` depends on nothing:

```yaml
name: release
goal: Ship the change.
stages:
- name: open-pr
  prompt: Open the pull request and link the ticket.
- name: write-docs
  prompt: Write the release notes.
- name: merge
  prompt: Merge the approved pull request.
  depends_on:
  - open-pr
```

At revision `0` `open-pr` and `write-docs` are `ready_to_start`, and `merge` is
`waiting_for_dependencies`. Start `open-pr`, do the work, and pause it for the
review:

```bash
"$FLOW_TOOL" start_stage -p "path/to/release.yaml" -r 0 -s open-pr
"$FLOW_TOOL" pause_stage -p "path/to/release.yaml" -r 1 -m 'Waiting for the pull request review; resume when it is approved.'
```

At revision `2` `open-pr` is `waiting`, `write-docs` is still
`ready_to_start`, and `merge` stays `waiting_for_dependencies`. Instead of
stopping, start `write-docs` and finish it:

```bash
"$FLOW_TOOL" start_stage -p "path/to/release.yaml" -r 2 -s write-docs
"$FLOW_TOOL" finish_stage -p "path/to/release.yaml" -r 3 -m 'Release notes written.'
```

Nothing else can run until the review is done, so the agent reports that
`open-pr` is waiting for the review and stops. Days later, once the pull request
is approved, resume it by name, finish it, and the dependent stage becomes ready:

```bash
"$FLOW_TOOL" resume_stage -p "path/to/release.yaml" -r 4 -s open-pr -m 'The pull request is approved.'
"$FLOW_TOOL" finish_stage -p "path/to/release.yaml" -r 5 -m 'Pull request #12 approved.'
"$FLOW_TOOL" start_stage -p "path/to/release.yaml" -r 6 -s merge
```

`start_stage` on `merge` before `open-pr` is finished fails with
`waiting_for_dependencies` and lists the stages that can start.
