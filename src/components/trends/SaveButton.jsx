import { Bookmark } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useSaves } from "@/hooks/useSaves";
import { cn } from "@/lib/utils";

// Compact labelled save control: it states what it does and reports its own state through
// aria-pressed, so the icon is never the only thing carrying the meaning.
export default function SaveButton({ item, className }) {
  const { isSaved, isPending, toggle, signedIn } = useSaves();
  const { toast } = useToast();
  const saved = isSaved(item.id);
  const pending = isPending(item.id);

  const handleClick = async () => {
    const result = await toggle(item);
    if (result.requiresAuth) {
      toast({
        title: "Sign in to save items",
        description: "Saved items stay with your account and are private to you.",
      });
      return;
    }
    if (!result.ok) {
      toast({ title: "That item could not be saved", description: "Nothing was changed. Please try again." });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          aria-pressed={saved}
          aria-label={saved ? `Remove "${item.title}" from saved items` : `Save "${item.title}"`}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-border/60 px-2 text-[12.5px] outline-none transition-colors duration-150",
            "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:opacity-60",
            saved ? "text-brand" : "text-muted-foreground hover:text-foreground",
            className
          )}
        >
          <Bookmark className={cn("h-[15px] w-[15px]", saved && "fill-current")} strokeWidth={1.75} aria-hidden="true" />
          <span>{saved ? "Saved" : "Save"}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{signedIn ? (saved ? "Saved" : "Save") : "Sign in to save"}</TooltipContent>
    </Tooltip>
  );
}