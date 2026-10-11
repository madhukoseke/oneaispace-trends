// Compact section heading: the section name plus the honest note about what the
// section is built from.
export default function SectionHeading({ id, title, note }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {note ? <p className="text-[12px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}