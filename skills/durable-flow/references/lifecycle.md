# Worked lifecycle

This walkthrough uses a copy of [`example.yaml`](example.yaml) at
`path/to/spanish-review.yaml`. Set the task-specific `FLOW_TOOL` shell variable
to the path of `scripts/state_management.py` resolved from the skill directory.
The revision values illustrate a flow with no other writer; always use the
latest revision returned by the preceding successful command.

## Start and finish the first stage

Read the new flow. Its revision is `0`, and every stage is `pending`.

```bash
"$FLOW_TOOL" get_flow -p "path/to/spanish-review.yaml"
"$FLOW_TOOL" start_next_stage -p "path/to/spanish-review.yaml" -r 0
```

`find-last-lesson` is now `inprogress` at revision `1`. It has the
`last-lesson` object schema, so finish it with valid JSON:

```bash
"$FLOW_TOOL" finish_stage -p "path/to/spanish-review.yaml" -r 1 -m '{"lesson-date":"2026-09-20","document-id":"lesson-020"}'
"$FLOW_TOOL" start_next_stage -p "path/to/spanish-review.yaml" -r 2
```

`find-new-lessons` is now active at revision `3`, and `get_flow` provides the
validated `find-last-lesson` output as its input.

## Save progress, wait, and resume

Suppose the first lesson is available but a second export is still pending.
Save the useful partial result before entering `waiting`:

```bash
"$FLOW_TOOL" set_output -p "path/to/spanish-review.yaml" -r 3 -m '[{"lesson_date":"2026-09-21","start_row":1,"end_row":8,"media_file_id":"media-021"}]'
"$FLOW_TOOL" pause_stage -p "path/to/spanish-review.yaml" -r 4 -m 'Waiting for the 2026-09-22 lesson export; resume when it is available.'
```

The stage is `waiting` at revision `5`; its saved output and the reason for
waiting remain available through `get_flow`. When the export arrives, resume
the same stage:

```bash
"$FLOW_TOOL" resume_stage -p "path/to/spanish-review.yaml" -r 5 -m 'The 2026-09-22 lesson export is available.'
```

The stage returns to `inprogress` at revision `6` and still contains the saved
partial output.

## Validate and complete the remaining stages

Finish `find-new-lessons` with the complete list. Passing the output to
`finish_stage` validates it against `lesson-list` before marking the stage
finished.

```bash
"$FLOW_TOOL" finish_stage -p "path/to/spanish-review.yaml" -r 6 -m '[{"lesson_date":"2026-09-21","start_row":1,"end_row":8,"media_file_id":"media-021"},{"lesson_date":"2026-09-22","start_row":1,"end_row":9,"media_file_id":"media-022"}]'
"$FLOW_TOOL" start_next_stage -p "path/to/spanish-review.yaml" -r 7
"$FLOW_TOOL" finish_stage -p "path/to/spanish-review.yaml" -r 8 -m 'Created grammar and new-word review materials for both lessons.'
"$FLOW_TOOL" get_flow -p "path/to/spanish-review.yaml"
```

All three stages are now `finished` at revision `9`. If structured output
fails validation, the stage remains `inprogress` at the same revision. Correct
the output and call `finish_stage` again with that revision.
