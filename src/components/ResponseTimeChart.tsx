"use client";

import { HealthCheckResult } from "@/types";
import { useMemo } from "react";

interface ResponseTimeChartProps {
  checks: HealthCheckResult[];
  height?: number;
}

export default function ResponseTimeChart({
  checks,
  height = 80,
}: ResponseTimeChartProps) {
  const chartData = useMemo(() => {
    const reversed = [...checks].reverse().slice(-30);
    if (reversed.length === 0) return null;

    const times = reversed.map((c) => c.responseTimeMs);
    const maxTime = Math.max(...times, 1);
    const minTime = Math.min(...times);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    return { reversed, maxTime, minTime, avgTime };
  }, [checks]);

  if (!chartData) {
    return (
      <div
        className="flex items-center justify-center text-xs text-gray-600"
        style={{ height }}
      >
        No response time data
      </div>
    );
  }

  const { reversed, maxTime, avgTime } = chartData;
  const barWidth = 100 / reversed.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">Response Time</span>
        <span className="text-xs text-gray-400">
          avg {Math.round(avgTime)}ms
        </span>
      </div>
      <div className="relative" style={{ height }}>
        {/* Average line */}
        <div
          className="absolute w-full border-t border-dashed border-gray-700 z-10"
          style={{ bottom: `${(avgTime / maxTime) * 100}%` }}
        />

        {/* Bars */}
        <svg width="100%" height="100%" className="overflow-visible">
          {reversed.map((check, i) => {
            const barHeight = (check.responseTimeMs / maxTime) * height;
            const x = i * barWidth;
            const color =
              check.status === "operational"
                ? "#34d399"
                : check.status === "degraded"
                  ? "#fbbf24"
                  : "#f87171";

            return (
              <g key={i}>
                <rect
                  x={`${x}%`}
                  y={height - barHeight}
                  width={`${Math.max(barWidth - 0.5, 0.5)}%`}
                  height={barHeight}
                  fill={color}
                  opacity={0.6}
                  rx={1}
                >
                  <title>
                    {Math.round(check.responseTimeMs)}ms -{" "}
                    {new Date(check.timestamp).toLocaleString()}
                  </title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
