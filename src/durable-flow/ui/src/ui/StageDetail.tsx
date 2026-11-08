import { useState } from "react";
import { setStageFields } from "../domain/ops";
import type { Flow, Stage, StageState } from "../domain/types";
import { useFlowStoreApi } from "../store/flowStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { InlineEdit } from "./InlineEdit";
import { MarkdownEditor } from "./MarkdownEditor";
import { useStageActions } from "./stageActions";
import { DepsPanel, SchemaPanel, StatePanel } from "./stagePanels";
import { STATE_BG, STATE_LABELS, STATE_TEXT } from "./states";
import { ReasonDialog, type ReasonState } from "./ReasonDialog";
import { StateMenu } from "./StateMenu";
import { StageToolbar } from "./StageToolbar";

interface Props {
  flow: Flow;
  stage: Stage;
  index: number;
}

export function StageDetail({ flow, stage, index }: Props) {
  const store = useFlowStoreApi();
  const actions = useStageActions();

  const [asking, setAsking] = useState<{ state: ReasonState; editing: boolean } | null>(null);
  const apply = (fields: Parameters<typeof setStageFields>[2]) =>
    store.getState().apply((f) => setStageFields(f, stage.name, fields));

  const chooseState = (state: StageState) => {
    if (state === "waiting" || state === "failed") {
      setAsking({ state, editing: state === stage.state });
    } else if (state !== stage.state) {
      apply({ state, message: null });
    }
  };

  const commitPrompt = (prompt: string) =>
    store
      .getState()
      .apply((f) => setStageFields(f, stage.name, { prompt }), { coalesce: `prompt:${stage.name}` });

  return (
    <div className="stage-detail space-y-6" key={stage.name}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="min-w-0 text-xl font-semibold tracking-tight">
            <InlineEdit
              value={stage.name}
              inputLabel="Stage name"
              buttonLabel="Edit stage name"
              buttonTitle="Rename the stage"
              onCommit={(name) => actions.rename(stage.name, name)}
            />
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StateMenu state={stage.state} onChoose={chooseState} />
          <StageToolbar flow={flow} stage={stage} />
        </div>
      </div>

      {(stage.state === "waiting" || stage.state === "failed") && (
        <div
          data-testid="reason-note"
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
            stage.state === "failed" ? "border-status-failed/40 bg-status-failed/10" : "border-status-waiting/40 bg-status-waiting/10",
          )}
        >
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATE_BG[stage.state])} aria-hidden="true" />
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-6">
            <span className={cn("font-medium", STATE_TEXT[stage.state])}>{`${STATE_LABELS[stage.state]}: `}</span>
            {stage.message ? stage.message : <span className="text-muted-foreground">No reason given.</span>}
          </p>
          <Button
            variant="link"
            size="sm"
            className="h-auto shrink-0 p-0"
            onClick={() => setAsking({ state: stage.state as ReasonState, editing: true })}
          >
            Edit reason
          </Button>
        </div>
      )}
      {asking && (
        <ReasonDialog
          key={`${stage.name}:${asking.state}`}
          state={asking.state}
          editing={asking.editing}
          initial={asking.state === stage.state ? (stage.message ?? "") : ""}
          onCancel={() => setAsking(null)}
          onSubmit={(reason) => {
            apply({ state: asking.state, message: reason });
            setAsking(null);
          }}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 max-w-3xl">
          <MarkdownEditor
            ariaLabel="Prompt"
            placeholder="Please enter stage description ..."
            value={stage.prompt}
            onCommit={commitPrompt}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="min-w-0">
            <CardContent className="p-5">
              <Tabs defaultValue="state">
                <TabsList className="grid h-auto w-full grid-cols-2">
                  <TabsTrigger value="state" className="px-2 py-1.5 text-xs">Current state</TabsTrigger>
                  <TabsTrigger value="schema" className="px-2 py-1.5 text-xs">Output schema</TabsTrigger>
                </TabsList>
                <TabsContent value="state" className="space-y-5">
                  <StatePanel flow={flow} stage={stage} index={index} />
                </TabsContent>
                <TabsContent value="schema" className="space-y-4">
                  <SchemaPanel flow={flow} stage={stage} index={index} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="min-w-0" role="region" aria-label="Dependencies">
            <CardHeader className="pb-3">
              <CardTitle>Dependencies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <DepsPanel flow={flow} stage={stage} index={index} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
