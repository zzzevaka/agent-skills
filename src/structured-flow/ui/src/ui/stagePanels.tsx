import { useEffect, useState } from "react";
import { outputFromText, outputToText } from "../domain/output";
import { addDependencyToFollowing, addSchema, dependentsOf, newSchemaName, resetFrom, resetStage, setDependencies, setOutputSchema, setStageFields } from "../domain/ops";
import { toYaml } from "../domain/serialize";
import type { Flow, Stage } from "../domain/types";
import { outputProblem, schemaFor } from "../domain/warnings";
import { useFlowStoreApi } from "../store/flowStore";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { CodeEditor } from "./CodeEditor";
import { navigate } from "./route";
import { STATE_BG } from "./states";
import { ValueBlock } from "./ValueBlock";

interface PanelProps {
  flow: Flow;
  stage: Stage;
  index: number;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chips({ flow, names }: { flow: Flow; names: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {names.map((name) => {
        const state = flow.stages.find((s) => s.name === name)?.state ?? "pending";
        return (
          <Button
            key={name}
            variant="outline"
            size="sm"
            className="chip h-7 gap-1.5 px-2.5 font-normal"
            onClick={() => navigate({ tab: "stages", item: name })}
          >
            <span className={cn("size-2 rounded-full", STATE_BG[state])} aria-hidden="true" />
            {name}
          </Button>
        );
      })}
    </div>
  );
}

const linkButton = "h-auto p-0 text-xs";

export function StatePanel({ flow, stage }: PanelProps) {
  const store = useFlowStoreApi();
  const apply = (op: (f: Flow) => Flow) => store.getState().apply(op);

  const definition = schemaFor(flow, stage);
  const stringSchema = definition === null || definition.type === "string";
  const [editingOutput, setEditingOutput] = useState(false);
  const [outputText, setOutputText] = useState(outputToText(stage.output));
  useEffect(() => setOutputText(outputToText(stage.output)), [stage.output]);

  const candidate = editingOutput ? outputFromText(outputText, stringSchema) : stage.output;
  const problem = candidate === null ? null : outputProblem(flow, stage, candidate);

  const dependencies = stage.depends_on.map((name) => flow.stages.find((s) => s.name === name));
  const inputReady = dependencies.length > 0 && dependencies.every((d) => d?.state === "finished");

  const commitOutput = () => {
    const value = outputFromText(outputText, stringSchema);
    if (JSON.stringify(value) !== JSON.stringify(stage.output) || typeof value !== typeof stage.output) {
      apply((f) => setStageFields(f, stage.name, { output: value }));
    }
  };

  return (
    <>
      {inputReady && (
        <Section title="Input">
          <details className="group text-sm">
            <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
              Outputs of dependencies
            </summary>
            <div className="pt-2">
              <ValueBlock
                key={`input:${stage.name}`}
                value={Object.fromEntries(dependencies.map((d) => [d!.name, d!.output]))}
              />
            </div>
          </details>
        </Section>
      )}

      <Section
        title={`Output · ${stage.output_schema ?? "string"}`}
        action={
          <Button
            variant="link"
            className={linkButton}
            aria-label={editingOutput ? "Done editing output" : "Edit output"}
            onClick={() => {
              if (editingOutput) commitOutput();
              setEditingOutput(!editingOutput);
            }}
          >
            {editingOutput ? "Done" : "Edit"}
          </Button>
        }
      >
        {editingOutput ? (
          <CodeEditor
            value={outputText}
            language={stringSchema ? "text" : "json"}
            ariaLabel="Output"
            onChange={setOutputText}
            onBlur={commitOutput}
          />
        ) : (
          <ValueBlock key={`output:${stage.name}`} value={stage.output} />
        )}
        {problem && (
          <p className="text-sm text-status-waiting" data-testid="output-warning">
            {`Output does not match the schema: ${problem}`}
          </p>
        )}
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => apply((f) => resetStage(f, stage.name))}>
          Reset stage
        </Button>
        <Button variant="outline" size="sm" onClick={() => apply((f) => resetFrom(f, stage.name))}>
          Reset from here
        </Button>
      </div>
    </>
  );
}

export function SchemaPanel({ flow, stage }: PanelProps) {
  const store = useFlowStoreApi();
  const names = Object.keys(flow.schemas);
  const current = stage.output_schema;
  const definition = current !== null && Object.hasOwn(flow.schemas, current) ? flow.schemas[current] : null;

  const createSchema = () => {
    const name = newSchemaName(flow);
    store
      .getState()
      .apply((f) => setOutputSchema(addSchema(f, name, { type: "object", properties: {} }), stage.name, name));
    navigate({ tab: "schemas", item: name });
  };

  return (
    <>
      <Section
        title="Output schema"
        action={
          <Button variant="link" className={linkButton} onClick={createSchema}>
            New schema…
          </Button>
        }
      >
        <NativeSelect
          aria-label="Output schema"
          value={current ?? ""}
          onChange={(event) =>
            store.getState().apply((f) => setOutputSchema(f, stage.name, event.target.value || null))
          }
        >
          <option value="">None (string)</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {current !== null && definition === null && <option value={current}>{`${current} (missing)`}</option>}
        </NativeSelect>
      </Section>
      {current === null && (
        <p className="text-sm text-muted-foreground">No output schema: the output is a string.</p>
      )}
      {current !== null && definition === null && (
        <p className="text-sm text-muted-foreground">{`Schema ${current} is not defined.`}</p>
      )}
      {definition && (
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-[13px] leading-5">
          {toYaml(definition)}
        </pre>
      )}
    </>
  );
}

export function DepsPanel({ flow, stage, index }: PanelProps) {
  const store = useFlowStoreApi();
  const earlier = flow.stages.slice(0, index).map((s) => s.name);
  const dependents = dependentsOf(flow, stage.name);
  const following = flow.stages.slice(index + 1);

  const setDeps = (next: string[]) => store.getState().apply((f) => setDependencies(f, stage.name, next));

  return (
    <>
      <Section title="Depends on">
        <MultiSelect
          label="Dependencies"
          placeholder="Add dependency"
          emptyText={earlier.length ? "Every earlier stage is a dependency." : "No earlier stages."}
          options={earlier.map((value) => ({ value }))}
          value={stage.depends_on}
          onChange={setDeps}
        />
      </Section>
      <Section title="Required by">
        {dependents.length ? (
          <Chips flow={flow} names={dependents} />
        ) : (
          <p className="text-sm text-muted-foreground">No dependent stages.</p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-1 h-8"
          disabled={following.length === 0 || following.every((s) => s.depends_on.includes(stage.name))}
          title="Make every later stage depend on this stage"
          onClick={() => store.getState().apply((f) => addDependencyToFollowing(f, stage.name))}
        >
          Dependency to all following stages
        </Button>
      </Section>
    </>
  );
}
