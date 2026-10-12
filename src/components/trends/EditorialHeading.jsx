import { cn } from "@/lib/utils";

// Editorial section heading: the section name at display size, the honest one line about what
// the section is built from, and the section's own action at the far end of the row. The rule
// above it is optional, so a heading that opens the page carries no line of its own.
export default function EditorialHeading({ id, title, note, action, bordered = true }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-[18px] gap-y-2",
        bordered && "border-t border-ed-line pt-[26px]"
      )}
    >
      <h2 id={id} className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] lg:text-[36px]">
        {title}
      </h2>
      {note ? <p className="text-[14px] font-light text-ed-muted lg:text-[15px]">{note}</p> : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}