import { Bookmark } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useSaves } from "@/hooks/useSaves";
import { cn } from "@/lib/utils";

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
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground outline-none transition-colors duration-150",
            "hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:opacity-60",
            saved && "text-brand hover:text-brand",
            className
          )}
        >
          <Bookmark className={cn("h-[17px] w-[17px]", saved && "fill-current")} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{signedIn ? (saved ? "Saved" : "Save") : "Sign in to save"}</TooltipContent>
    </Tooltip>
  );
}