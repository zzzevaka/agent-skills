import { Trash2 } from "lucide-react";
import { useState } from "react";
import { setSchema, usedBy } from "../domain/ops";
import { pyRepr } from "../domain/pyCompat";
import { ValidationError, validateDefinition } from "../domain/schemaDef";
import { toYaml } from "../domain/serialize";
import { useFlowStore, useFlowStoreApi } from "../store/flowStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SchemaEditor } from "@/components/schema-editor/SchemaEditor";
import { CodeEditor } from "./CodeEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { InlineEdit } from "./InlineEdit";
import { navigate } from "./route";
import { useSchemaActions } from "./schemaActions";
import { currentSchemaName } from "./selection";

function definitionError(definition: unknown, name: string): string | null {
  try {
    validateDefinition(definition, `schemas.${name}`);
    return null;
  } catch (err) {
    if (err instanceof ValidationError) return err.message;
    throw err;
  }
}

/** The schema pane; the list of schemas lives in the sidebar. */
export function SchemasTab({ selected }: { selected: string | null }) {
  const store = useFlowStoreApi();
  const flow = useFlowStore((s) => s.draft);
  const buffers = useFlowStore((s) => s.schemaBuffers);
  const extraErrors = useFlowStore((s) => s.extraErrors);
  const actions = useSchemaActions();
  const [confirming, setConfirming] = useState(false);
  const current = currentSchemaName(flow, selected);

  if (current === null) {
    return <p className="text-sm text-muted-foreground">No schemas defined.</p>;
  }

  const definition = flow.schemas[current];
  const buffer = buffers[current];
  const text = buffer && buffer.def === definition ? buffer.text : toYaml(definition);
  const definitionProblem = definitionError(definition, current);
  const error = extraErrors[`schema:${current}`] ?? definitionProblem;
  const users = usedBy(flow, current);

  return (
    <section className="space-y-6" data-testid="schema-detail" key={current}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schema</p>
          <h2 className="min-w-0 text-xl font-semibold tracking-tight">
            <InlineEdit
              value={current}
              inputLabel="Schema name"
              buttonLabel="Edit schema name"
              buttonTitle="Rename the schema"
              onCommit={(name) => actions.rename(current, name)}
            />
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Delete schema"
          title="Delete schema"
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle>Fields</CardTitle>
          </CardHeader>
          <CardContent>
            {definitionProblem !== null ? (
              <p className="text-sm text-muted-foreground" data-testid="schema-editor-unavailable">
                Fix the YAML to use the visual editor.
              </p>
            ) : (
              <SchemaEditor
                value={definition}
                readOnly={Boolean(extraErrors[`schema:${current}`])}
                onChange={(next, options) =>
                  store.getState().apply((f) => setSchema(f, current, next), {
                    coalesce: options?.coalesce ? `schema:${current}:${options.coalesce}` : undefined,
                  })
                }
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle>Definition (YAML)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CodeEditor
              value={text}
              language="yaml"
              ariaLabel="Schema definition"
              onChange={(value) => store.getState().editSchemaText(current, value)}
            />
            {error && (
              <p className="font-mono text-sm text-destructive" data-testid="schema-error">
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Used by</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length ? (
            <div className="flex flex-wrap gap-2">
              {users.map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  className="chip h-7 px-2.5 font-normal"
                  onClick={() => navigate({ tab: "stages", item: name })}
                >
                  {name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not used by any stage.</p>
          )}
        </CardContent>
      </Card>

      {confirming && (
        <ConfirmDialog
          title={`Delete schema ${pyRepr(current)}?`}
          confirmLabel={users.length ? "Unlink and delete" : "Delete"}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            actions.remove(current);
          }}
        >
          {users.length > 0 && (
            <p>
              This schema is used by: {users.join(", ")}. Those stages will go back to a plain
              string output.
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
