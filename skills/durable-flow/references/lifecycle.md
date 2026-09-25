# Worked lifecycle

This walkthrough uses a copy of [`example.yaml`](example.yaml) at
`path/to/spanish-lessons.yaml`. Set the task-specific `FLOW_TOOL` shell variable
to the path of `scripts/state_management.py` resolved from the skill directory.
The revision values illustrate a flow with no other writer; always use the
latest revision returned by the preceding successful command.

## Start and finish the first stages

Read the new flow. Its revision is `0`, and every stage is `pending`.

```bash
"$FLOW_TOOL" get_flow -p "path/to/spanish-lessons.yaml"
"$FLOW_TOOL" start_next_stage -p "path/to/spanish-lessons.yaml" -r 0
```

`find-last-processed-lesson` is now `inprogress` at revision `1`. It has the
`last-processed-lesson` object schema, so finish it with valid JSON:

```bash
"$FLOW_TOOL" finish_stage -p "path/to/spanish-lessons.yaml" -r 1 -m '{"document_id":"doc-0731","lesson_date":"2026-07-31"}'
"$FLOW_TOOL" start_next_stage -p "path/to/spanish-lessons.yaml" -r 2
```

`find-new-lessons` is now active at revision `3`, and `get_flow` provides the
validated `find-last-processed-lesson` output as its input. Passing the output
to `finish_stage` validates it against `new-lessons` before marking the stage
finished.

```bash
"$FLOW_TOOL" finish_stage -p "path/to/spanish-lessons.yaml" -r 3 -m '{"media_file_id":"media-001","new_lessons":[{"lesson_date":"2026-08-05","start_row":1915,"end_row":1974},{"lesson_date":"2026-08-07","start_row":1975,"end_row":2016}]}'
"$FLOW_TOOL" start_next_stage -p "path/to/spanish-lessons.yaml" -r 4
```

`create-lesson-summaries` is now active at revision `5`.

## Save progress, wait, and resume

Suppose the first summary is stored but DocuMur rejects the second one. Save
the useful partial result before entering `waiting`:

```bash
"$FLOW_TOOL" set_output -p "path/to/spanish-lessons.yaml" -r 5 -m '["2026-08-05"]'
"$FLOW_TOOL" pause_stage -p "path/to/spanish-lessons.yaml" -r 6 -m 'DocuMur is unavailable while storing the 2026-08-07 summary; resume when it is back.'
```

The stage is `waiting` at revision `7`; its saved output and the reason for
waiting remain available through `get_flow`. When DocuMur is available again,
resume the same stage:

```bash
"$FLOW_TOOL" resume_stage -p "path/to/spanish-lessons.yaml" -r 7 -m 'DocuMur is available again.'
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
