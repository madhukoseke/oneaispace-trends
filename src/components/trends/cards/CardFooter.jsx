import ItemAttribution from "./ItemAttribution";
import SaveButton from "../SaveButton";

export default function CardFooter({ item, meta = [] }) {
  const details = meta.filter(Boolean);

  return (
    <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/60 px-3.5 pb-2 pt-2.5">
      <div className="min-w-0">
        <ItemAttribution item={item} />
        {details.length ? (
          <p className="mt-0.5 truncate text-[12px] leading-tight text-muted-foreground">{details.join(" · ")}</p>
        ) : null}
      </div>
      <SaveButton item={item} className="-mb-1" />
    </div>
  );
}