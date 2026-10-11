import { Outlet } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SavesProvider } from "@/hooks/useSaves";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

export default function AppShell() {
  return (
    <SavesProvider>
      <TooltipProvider delayDuration={250}>
        <div className="flex min-h-screen flex-col bg-background">
          <SiteHeader />
          <main className="flex-1">
            <Outlet />
          </main>
          <SiteFooter />
        </div>
      </TooltipProvider>
    </SavesProvider>
  );
}