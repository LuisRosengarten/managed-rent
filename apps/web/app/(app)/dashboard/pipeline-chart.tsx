"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import type { ApplicationStatus } from "@workspace/core/status"

const STATUS_COLORS: Record<ApplicationStatus, { solid: string; pastel: string; text: string }> = {
  new:               { solid: "hsl(217, 91%, 60%)", pastel: "hsl(217, 80%, 94%)", text: "hsl(217, 70%, 40%)" },
  contacted:         { solid: "hsl(38, 92%, 50%)",  pastel: "hsl(38, 80%, 92%)",  text: "hsl(38, 70%, 35%)" },
  viewing_scheduled: { solid: "hsl(271, 91%, 65%)", pastel: "hsl(271, 70%, 93%)", text: "hsl(271, 60%, 42%)" },
  applied:           { solid: "hsl(189, 94%, 43%)", pastel: "hsl(189, 70%, 92%)", text: "hsl(189, 70%, 30%)" },
  accepted:          { solid: "hsl(160, 84%, 39%)", pastel: "hsl(160, 60%, 92%)", text: "hsl(160, 60%, 28%)" },
  rejected:          { solid: "hsl(0, 84%, 60%)",   pastel: "hsl(0, 70%, 94%)",   text: "hsl(0, 60%, 40%)" },
  withdrawn:         { solid: "hsl(240, 5%, 65%)",  pastel: "hsl(240, 5%, 93%)",  text: "hsl(240, 5%, 40%)" },
}

type PipelineItem = {
  status: ApplicationStatus
  label: string
  count: number
}

export function PipelineChart({
  data,
  total,
}: {
  data: PipelineItem[]
  total: number
}) {
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.status, { label: d.label, color: STATUS_COLORS[d.status].solid }])
  )

  const chartData = data.filter((d) => d.count > 0)

  if (total === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
        Keine Bewerbungen
      </div>
    )
  }

  return (
    <div className="flex items-center gap-6">
      {/* Donut — left */}
      <div className="shrink-0">
        <ChartContainer config={config} className="h-[140px] w-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={62}
                paddingAngle={2}
                strokeWidth={0}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status].solid} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltipContent indicator="dot" />} />
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground text-2xl font-bold"
              >
                {total}
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                gesamt
              </text>
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Legend — right */}
      <div className="flex flex-1 flex-wrap gap-2">
        {data.map((d) => (
          <div
            key={d.status}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1"
            style={{
              backgroundColor: STATUS_COLORS[d.status].pastel,
              color: STATUS_COLORS[d.status].text,
            }}
          >
            <span className="text-xs font-semibold tabular-nums">{d.count}</span>
            <span className="text-[11px]">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
