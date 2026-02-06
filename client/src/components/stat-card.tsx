import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: "primary" | "secondary" | "accent" | "orange";
  trendClassName?: string;
}

export function StatCard({ title, value, icon: Icon, trend, color = "primary", trendClassName }: StatCardProps) {
  const colors = {
    primary: "bg-primary/5 text-primary border-primary/20",
    secondary: "bg-secondary/5 text-secondary border-secondary/20",
    accent: "bg-accent/5 text-accent border-accent/20",
    orange: "bg-orange-500/5 text-orange-600 border-orange-200",
  };

  const iconColors = {
    primary: "bg-primary text-white shadow-primary/30",
    secondary: "bg-secondary text-white shadow-secondary/30",
    accent: "bg-accent text-white shadow-accent/30",
    orange: "bg-orange-500 text-white shadow-orange-500/30",
  };

  return (
    <div className={cn(
      "rounded-2xl p-6 border shadow-sm transition-all duration-300 hover:shadow-md bg-white",
      colors[color]
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-70 mb-1">{title}</p>
          <h3 className="text-3xl font-display font-bold tracking-tight">{value}</h3>
          {trend && (
            <p className={cn("text-xs font-medium mt-2 opacity-80", trendClassName)}>
              {trend}
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-xl shadow-lg", iconColors[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
