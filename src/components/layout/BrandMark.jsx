export default function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="relative grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] border border-border/80 bg-card"
    >
      <span className="h-[7px] w-[7px] rounded-full bg-brand" />
      <span className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset ring-foreground/[0.04]" />
    </span>
  );
}