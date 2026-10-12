// Compact section heading: the section name plus the honest note about what the
// section is built from. Both lines are text-only, so the section reads as information.
export default function SectionHeading({ id, title, note, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <h2 id={id} className="flex items-center gap-2 text-[14.5px] font-medium tracking-[-0.01em]">
        <span className="h-3 w-[2px] shrink-0 rounded-full bg-brand" aria-hidden="true" />
        {title}
      </h2>
      <div className="flex items-center gap-3">
        {note ? <p className="text-[12.5px] text-muted-foreground">{note}</p> : null}
        {action}
      </div>
    </div>
  );
}