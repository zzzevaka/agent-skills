import { PanelLeft } from "lucide-react";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { Banner } from "./Banner";
import { Overview } from "./Overview";
import { useRoute } from "./route";
import { SaveBar } from "./SaveBar";
import { SchemasTab } from "./SchemasTab";
import { StagesTab } from "./StagesTab";
import { StatusBar } from "./StatusBar";

/** On small screens the sidebar is a drawer; this fixed button opens it. */
function MobileToggle() {
  const { isMobile, toggleSidebar } = useSidebar();
  if (!isMobile) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle sidebar"
      className="fixed left-3 top-3 z-20 bg-background/95 shadow-sm backdrop-blur"
      onClick={toggleSidebar}
    >
      <PanelLeft />
    </Button>
  );
}

export function AppShell({ onSave }: { onSave(): void }) {
  const route = useRoute();
  return (
    <SidebarProvider>
      <AppSidebar route={route} />
      <SidebarInset className="min-h-svh">
        <Banner />
        <div
          className="flex-1 p-4 pb-24 pt-16 md:p-6 md:pb-24"
          data-testid="content"
          data-tab={route.tab}
          data-item={route.item ?? ""}
        >
          <div className="mx-auto w-full max-w-6xl">
            {route.tab === "overview" && <Overview selected={route.item} />}
            {route.tab === "stages" && <StagesTab selected={route.item} />}
            {route.tab === "schemas" && <SchemasTab selected={route.item} />}
          </div>
        </div>
        <StatusBar />
        <SaveBar onSave={onSave} />
        <MobileToggle />
      </SidebarInset>
    </SidebarProvider>
  );
}
