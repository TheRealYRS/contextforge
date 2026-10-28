import type { Scenario } from "./scenario";

export interface User { id: number; name: string }
export type Priority = "High" | "Medium" | "Low";
export const isHigh = (p: Priority): boolean => p === "High";
