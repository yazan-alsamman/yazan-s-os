"use client";

import type { ECharts, EChartsCoreOption } from "echarts/core";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

export interface ChartPalette {
  brand: string;
  success: string;
  warning: string;
  danger: string;
  neutral: string;
  text: string;
  mutedText: string;
  grid: string;
}

function readPalette(): ChartPalette {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim() || "#6b7280";
  return {
    brand: v("--chart-brand"),
    success: v("--chart-success"),
    warning: v("--chart-warning"),
    danger: v("--chart-danger"),
    neutral: v("--chart-neutral"),
    text: v("--chart-text"),
    mutedText: v("--chart-muted-text"),
    grid: v("--chart-grid"),
  };
}

interface EChartProps {
  /** Builds the option from the current theme palette (re-run on theme change). */
  option: (palette: ChartPalette) => EChartsCoreOption;
  /** One-sentence summary announced instead of the graphic (the data table carries the detail). */
  ariaLabel: string;
  height: number;
  /** Changes whenever the underlying data changes; the chart is rebuilt only then (or on theme change). */
  dataKey: string;
  /** Drill-down on bar click (mouse); keyboard users use the data table links. */
  onSelect?: (dataIndex: number, seriesIndex: number) => void;
}

/**
 * Accessible ECharts wrapper:
 * - the graphic is `role="img"` with a summary label; the full data is in the adjacent table
 * - decal patterns (ECharts aria) so series are distinguishable without colour
 * - theme-aware colours from CSS tokens; animation off for reduced-motion users
 * - SVG renderer (no canvas fingerprinting, crisp scaling); resized with the container
 */
export function EChart({ option, ariaLabel, height, dataKey, onSelect }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const optionRef = useRef(option);
  const selectRef = useRef(onSelect);
  const labelRef = useRef(ariaLabel);
  // Keep the latest callbacks without re-creating the chart (runs before the effect below).
  useEffect(() => {
    optionRef.current = option;
    selectRef.current = onSelect;
    labelRef.current = ariaLabel;
  });

  useEffect(() => {
    let disposed = false;
    let chart: ECharts | undefined;
    let observer: ResizeObserver | undefined;
    void import("./echarts-setup").then(({ echarts }) => {
      if (disposed || !ref.current) return;
      chart = echarts.init(ref.current, null, { renderer: "svg" });
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      chart.setOption({
        animation: !reduced,
        // ECharts writes its own aria-label onto the container; give it ours instead of the
        // auto-generated series dump so the accessible name stays the one-sentence summary.
        aria: { enabled: true, label: { description: labelRef.current }, decal: { show: true } },
        textStyle: { fontFamily: "inherit" },
        ...optionRef.current(readPalette()),
      });
      chart.on("click", (params) => {
        // Graph edges also carry a dataIndex; only nodes and data items drill down.
        if (typeof params.dataIndex === "number" && params.dataType !== "edge")
          selectRef.current?.(params.dataIndex, params.seriesIndex ?? 0);
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
    // Re-create on theme change so colours are re-read from the CSS tokens.
  }, [resolvedTheme, dataKey]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      style={{ height }}
      className="w-full"
      data-testid="echart"
    />
  );
}
