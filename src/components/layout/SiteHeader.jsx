import { NavLink, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { to: "/trends", label: "Trends" },
  { to: "/saved", label: "Saved" },
];

// Compact working header: identity and navigation on the left, appearance control on the
// right, one hairline below. No marketing treatment.
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1160px] items-center gap-5 px-4 sm:px-6 lg:px-8">
        <Link
          to="/trends"
          className="flex items-center gap-2.5 rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark />
          <span className="flex items-baseline gap-2">
            <span className="text-[14.5px] font-medium tracking-[-0.01em]">OneAISpace</span>
            <span className="hidden text-[13px] text-muted-foreground sm:inline">Trends</span>
          </span>
        </Link>

        <nav aria-label="Sections" className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-[7px] px-2.5 py-1.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}