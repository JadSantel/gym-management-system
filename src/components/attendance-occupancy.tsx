"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = { occupancy: { label: "People inside", color: "var(--brand-foreground)" } } satisfies ChartConfig;
const hourLabel = (hour: number) => `${hour % 12 || 12}${hour % 24 < 12 ? "am" : "pm"}`;

// shadcn chart-bar-default, adapted to recorded hourly peak occupancy.
export function AttendanceOccupancy({ hours, today }: { hours: { hour: number; occupancy: number | null }[]; today: string }) {
  const peak = Math.max(0, ...hours.map(hour => hour.occupancy ?? 0));
  return <Card className="mb-7 gap-4 rounded-lg py-5 shadow-none">
    <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5">
      <div><CardTitle><h2 className="text-base font-semibold">Occupancy by hour</h2></CardTitle><CardDescription className="mt-1">Today’s peak people inside each hour · Asia/Manila</CardDescription></div>
      <p className="text-sm text-muted-foreground">Peak <strong className="ml-1 font-semibold text-foreground tabular-nums">{peak}</strong></p>
    </CardHeader>
    <CardContent className="min-w-0 px-3 sm:px-5">
      <ChartContainer config={config} className="h-44 w-full aspect-auto sm:h-48 [&_.recharts-surface]:focus-visible:outline-2 [&_.recharts-surface]:focus-visible:outline-ring" role="group" aria-label={`Hourly peak occupancy for ${today}. Peak ${peak} people. Use arrow keys to explore.`}>
        <BarChart accessibilityLayer data={hours} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="hour" tick={{ fill: "var(--muted-foreground)" }} tickLine={false} tickMargin={10} axisLine={false} tickFormatter={hourLabel} minTickGap={22} />
          <YAxis tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} tickLine={false} axisLine={false} domain={[0, Math.max(1, peak)]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_value, payload) => `${hourLabel(payload[0].payload.hour)} – ${hourLabel(payload[0].payload.hour + 1)}`} />} />
          <Bar dataKey="occupancy" fill="var(--color-occupancy)" radius={4} maxBarSize={32} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
        <p>{peak ? "Each bar shows the highest recorded occupancy during that hour." : "No recorded occupancy today yet."} Future hours have no values.</p>
        <details><summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">View hourly values</summary><dl className="grid grid-cols-2 gap-x-5 gap-y-2 pb-3">{hours.map(item => <div key={item.hour} className="flex justify-between gap-3"><dt>{hourLabel(item.hour)}</dt><dd className="tabular-nums">{item.occupancy ?? "Not yet"}</dd></div>)}</dl></details>
      </div>
    </CardContent>
  </Card>;
}
