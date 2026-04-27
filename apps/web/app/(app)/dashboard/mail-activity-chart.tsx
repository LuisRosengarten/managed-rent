"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

const config: ChartConfig = {
  total: { label: "Gesamt", color: "hsl(var(--muted-foreground))" },
  relevant: { label: "Relevant", color: "hsl(217, 91%, 60%)" },
}

type DayEntry = {
  day: string
  label: string
  total: number
  relevant: number
}

export function MailActivityChart({ data }: { data: DayEntry[] }) {
  const hasData = data.some((d) => d.total > 0)

  if (!hasData) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
        Noch keine Mail-Daten
      </div>
    )
  }

  return (
    <ChartContainer config={config} className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.15} />
              <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRelevant" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={10}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltipContent indicator="dot" />} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            fill="url(#gradTotal)"
          />
          <Area
            type="monotone"
            dataKey="relevant"
            stroke="hsl(217, 91%, 60%)"
            strokeWidth={1.5}
            fill="url(#gradRelevant)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
