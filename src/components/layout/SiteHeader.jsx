import { NavLink, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { to: "/trends", label: "Trends" },
  { to: "/saved", label: "Saved" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:gap-6 sm:px-6 lg:px-10">
        <Link
          to="/trends"
          className="flex items-center gap-2.5 rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark />
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">OneAISpace</span>
            <span className="hidden text-[13px] text-muted-foreground sm:inline">Trends</span>
          </span>
        </Link>

        <nav aria-label="Sections" className="flex items-center gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-[7px] px-2.5 py-1.5 text-[13.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-secondary/70 font-medium text-foreground"
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