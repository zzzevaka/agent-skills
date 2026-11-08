import { FilePlus2, FolderOpen, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Banner } from "./Banner";

interface Props {
  /** Name of the file remembered from last time, when the browser needs a click to read it. */
  rememberedName: string | null;
  fsSupported: boolean;
  onOpen(): void;
  onNew(): void;
  onReopen(): void;
}

export function StartScreen({ rememberedName, fsSupported, onOpen, onNew, onReopen }: Props) {
  return (
    <div className="grid min-h-svh place-content-center gap-4 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">durable-flow</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Open a flow file (YAML or JSON) to see its progress and edit it, or start a new flow.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {rememberedName !== null && (
              <Button onClick={onReopen}>
                <RotateCcw aria-hidden="true" />
                {`Reopen ${rememberedName}`}
              </Button>
            )}
            <Button variant={rememberedName === null ? "default" : "outline"} onClick={onOpen}>
              <FolderOpen aria-hidden="true" />
              Open file
            </Button>
            <Button variant="outline" onClick={onNew}>
              <FilePlus2 aria-hidden="true" />
              New flow
            </Button>
          </div>
          {!fsSupported && (
            <p className="text-xs leading-5 text-muted-foreground">
              This browser cannot save into the file you open: Save downloads a copy. Chrome, Edge and
              other Chromium browsers save in place.
            </p>
          )}
        </CardContent>
      </Card>
      <Banner />
    </div>
  );
}
