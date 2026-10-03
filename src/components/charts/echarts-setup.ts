/**
 * Tree-shaken ECharts registration (ADR 0007). Only what PEOS uses is bundled. Loaded lazily by
 * the EChart component so charts never block first render.
 */
import { BarChart, GraphChart, RadarChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  RadarChart,
  GraphChart,
  RadarComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  SVGRenderer,
]);

export { echarts };
