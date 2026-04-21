"use client";

import type { ElementType } from "react";
import {
  Activity,
  AppWindow,
  LayoutGrid,
  MessagesSquare,
  Orbit,
  Scale,
  School,
  Shapes,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";

export const brandIcon: ElementType = Shapes;
export const portfolioIcon: ElementType = AppWindow;
export const allProductsIcon: ElementType = LayoutGrid;
export const teamIcon: ElementType = UsersRound;
export const incidentIcon: ElementType = ShieldAlert;
export const fallbackNavIcon: ElementType = Activity;

const groupIconMapById: Record<string, ElementType> = {
  mbzuai: MessagesSquare,
  "mbzuai-ug": School,
  "lawa-rag": Scale,
  "agent-studio": Sparkles,
  external: Orbit,
};

export function getGroupNavIcon(groupId: string): ElementType {
  return groupIconMapById[groupId] || fallbackNavIcon;
}
