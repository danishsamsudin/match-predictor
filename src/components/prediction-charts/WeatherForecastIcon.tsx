import {
  resolveWeatherIconKind,
  weatherIconComponent,
  type WeatherIconKind,
} from "@/lib/prediction/weather-forecast-icon";

const ICON_CLASS: Record<WeatherIconKind, string> = {
  clear: "text-amber-400",
  "partly-cloudy": "text-amber-300",
  cloudy: "text-slate-400",
  fog: "text-slate-500",
  rain: "text-sky-400",
  snow: "text-cyan-200",
  thunder: "text-violet-400",
};

export function WeatherForecastIcon({
  weatherCode,
  condition,
  className,
}: {
  weatherCode?: number;
  condition?: string;
  className?: string;
}) {
  const kind = resolveWeatherIconKind({ weatherCode, condition });
  const Icon = weatherIconComponent(kind);
  const label = condition?.trim() || "Kickoff forecast";
  const iconClass = className ?? `h-4 w-4 shrink-0 ${ICON_CLASS[kind]}`;

  return (
    <span title={label} className="inline-flex">
      <Icon className={iconClass} aria-label={label} />
    </span>
  );
}
