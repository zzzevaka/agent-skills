import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import type { StoreApi } from "zustand";
import type { PersistenceState } from "../io/persistence";
import { usePersistence, usePersistenceApi } from "./persistenceContext";

const NOTICE = "notice";

/** The page's notices float above the content as toasts, so they never move the layout. */
function Notices({ api }: { api: StoreApi<PersistenceState> }) {
  const notice = usePersistence(api, (s) => s.notice);

  useEffect(() => {
    if (!notice) {
      toast.dismiss(NOTICE);
      return;
    }
    const show = notice.kind === "error" ? toast.error : toast;
    show(notice.text, {
      id: NOTICE,
      // Errors stay until dismissed; information goes away by itself.
      duration: notice.kind === "error" ? Infinity : 6000,
      closeButton: true,
      onDismiss: () => api.getState().dismissNotice(),
      onAutoClose: () => api.getState().dismissNotice(),
    });
  }, [notice, api]);

  return null;
}

function useResolvedTheme(): "light" | "dark" {
  const read = (): "light" | "dark" => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function Banner() {
  const api = usePersistenceApi();
  const theme = useResolvedTheme();
  return (
    <>
      <Toaster
        theme={theme}
        position="bottom-center"
        offset={{ bottom: 56 }}
        mobileOffset={{ bottom: 56 }}
        toastOptions={{
          classNames: {
            toast: "!border-border !bg-background !text-foreground !shadow-lg",
            description: "!text-muted-foreground",
          },
        }}
      />
      {api && <Notices api={api} />}
    </>
  );
}
