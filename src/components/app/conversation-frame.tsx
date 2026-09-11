// The frame around one conversation: a header with the title and status,
// the conversation itself, and a contextual right panel that resizes, folds
// away, and becomes a sheet on narrow screens.
import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { type PanelImperativeHandle, useDefaultLayout } from "react-resizable-panels";
import { HeaderChrome } from "@/components/app/header-chrome";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePersistedState } from "@/lib/client/persisted";

export function ConversationFrame({
  title,
  status,
  actions,
  panel,
  panelTitle,
  children,
}: {
  title: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  panel: ReactNode;
  panelTitle: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = usePersistedState<boolean>("panel", true);
  const [sheetOpen, setSheetOpen] = usePersistedState<boolean>("panel-sheet", false);
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  // The panel width the browser remembers; SSR renders the default width.
  const layout = useDefaultLayout({
    id: "openmuse:conversation-layout",
    panelIds: ["conversation", "panel"],
    onlySaveAfterUserInteractions: true,
    storage: typeof window === "undefined" ? { getItem: () => null, setItem: () => undefined } : window.localStorage,
  });

  useEffect(() => {
    if (isMobile) return;
    const handle = panelRef.current;
    if (!handle) return;
    if (panelOpen && handle.isCollapsed()) handle.expand();
    if (!panelOpen && !handle.isCollapsed()) handle.collapse();
  }, [panelOpen, isMobile]);

  // On a phone the panel is a sheet; the label, the pressed state and the
  // icon all follow the state the button actually toggles.
  const open = isMobile ? sheetOpen : panelOpen;
  const toggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={open ? `Hide ${panelTitle.toLowerCase()}` : `Show ${panelTitle.toLowerCase()}`}
          aria-pressed={open}
          onClick={() => (isMobile ? setSheetOpen(!sheetOpen) : setPanelOpen(!panelOpen))}
        >
          {open ? <PanelRightCloseIcon className="size-4" /> : <PanelRightOpenIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{panelTitle}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
        <SidebarTrigger aria-label="Toggle sidebar" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
        {status}
        {actions}
        <HeaderChrome />
        {toggle}
      </header>
      {isMobile ? (
        <>
          <div className="min-h-0 flex-1">{children}</div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="w-[92vw] max-w-md overflow-y-auto p-0 sm:max-w-md">
              <SheetHeader className="sr-only">
                <SheetTitle>{panelTitle}</SheetTitle>
                <SheetDescription>Details for this conversation</SheetDescription>
              </SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="conversation" minSize={360} className="min-w-0">
            {children}
          </ResizablePanel>
          <ResizableHandle aria-label={`Resize ${panelTitle.toLowerCase()}`} />
          <ResizablePanel
            id="panel"
            panelRef={panelRef}
            defaultSize={360}
            minSize={280}
            maxSize={560}
            collapsible
            collapsedSize={0}
            onResize={(size) => {
              const collapsed = size.inPixels === 0;
              if (collapsed === panelOpen) setPanelOpen(!collapsed);
            }}
            className="min-w-0 overflow-hidden bg-panel"
          >
            <aside aria-label={panelTitle} className="h-full min-h-0 overflow-y-auto border-l" hidden={!panelOpen}>
              {panelOpen ? panel : null}
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
