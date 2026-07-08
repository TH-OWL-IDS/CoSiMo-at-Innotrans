/**
 * CoSiMo's agentic tools. Claude calls these to act inside the cabin and to
 * express emotion; the handlers drive the WebSocket hub so all four iPads stay
 * in sync. Each handler returns a short string that goes back to Claude as the
 * tool result, plus an optional structured record of what happened (for the
 * research dataset).
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  CABIN_CONTROLS,
  EXPRESSIVE_EMOTIONS,
  isFaceEmotion,
  type CabinControlId,
  type ExpressiveEmotion,
  type Locale,
  type TurnAction,
} from "@cosimo/shared";
import type { Hub } from "../hub.js";
import type { TelemetryProvider } from "./telemetry.js";

export interface ToolResult {
  /** Text returned to Claude as the tool_result content. */
  text: string;
  /** Structured action to record on the turn, if any. */
  action?: TurnAction;
  /** Expressive emotion Claude chose, if this was set_emotion. */
  emotion?: ExpressiveEmotion;
}

const CONTROL_IDS = CABIN_CONTROLS.map((c) => c.id);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_telemetry",
    description:
      "Get the MonoCab's current status: speed, location, line, destination, next stops with arrival times, occupancy, battery and doors. Call this whenever the rider asks anything about the journey, timing, or where we are.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_cabin_control",
    description:
      "Turn a cabin function on/off or set its level. Use this when the rider asks to change the cabin (light, reading lamp, ventilation, window tint, ambient sound). 'interior-light' is real hardware; the others are simulated.",
    input_schema: {
      type: "object",
      properties: {
        control: { type: "string", enum: CONTROL_IDS, description: "Which cabin control to change." },
        on: { type: "boolean", description: "On/off for toggle controls (interior-light, reading-lamp, ambient-sound)." },
        level: { type: "integer", minimum: 0, maximum: 100, description: "0–100 for level controls (ventilation, window-tint)." },
      },
      required: ["control"],
      additionalProperties: false,
    },
  },
  {
    name: "request_stop",
    description:
      "Register a request to stop at an upcoming stop, on the rider's behalf. This is a demo action — it does not control the real vehicle.",
    input_schema: {
      type: "object",
      properties: {
        stopId: { type: "string", description: "Id of the upcoming stop, from get_telemetry's nextStops." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_emotion",
    description:
      "Set your facial expression to colour the reply. Use sparingly and genuinely: 'happy' for warm/helpful moments, 'surprised' for something unexpected, 'sad' when you cannot help or share bad news, 'neutral' to reset. Mechanical states (listening/thinking/speaking) are handled automatically — do not set those.",
    input_schema: {
      type: "object",
      properties: {
        emotion: { type: "string", enum: [...EXPRESSIVE_EMOTIONS], description: "The expressive emotion to show." },
      },
      required: ["emotion"],
      additionalProperties: false,
    },
  },
];

/** Execute a tool call and return the result for Claude + the turn record. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { hub: Hub; telemetry: TelemetryProvider; lang: Locale; deviceId: string },
): Promise<ToolResult> {
  switch (name) {
    case "get_telemetry": {
      const t = await ctx.telemetry.refresh();
      ctx.hub.emitTelemetry(t);
      return { text: JSON.stringify(t), action: { tool: name } };
    }

    case "set_cabin_control": {
      const control = input.control as CabinControlId;
      if (!CONTROL_IDS.includes(control)) {
        return { text: `error: unknown control "${String(input.control)}"`, action: { tool: name } };
      }
      const change: { on?: boolean; level?: number } = {};
      if (typeof input.on === "boolean") change.on = input.on;
      if (typeof input.level === "number") change.level = input.level;
      const state = await ctx.hub.applyCabinControl(ctx.deviceId, control, change);
      return {
        text: `ok: ${control} is now ${JSON.stringify({ on: state.on, level: state.level })}`,
        action: { tool: name, control, args: change },
      };
    }

    case "request_stop": {
      const stopId = typeof input.stopId === "string" ? input.stopId : undefined;
      return {
        text: `ok: stop request registered${stopId ? ` for "${stopId}"` : ""} (demo — vehicle not actually controlled)`,
        action: { tool: name, args: stopId ? { stopId } : undefined },
      };
    }

    case "set_emotion": {
      const emotion = input.emotion;
      if (!isFaceEmotion(emotion)) {
        return { text: `error: unknown emotion "${String(emotion)}"`, action: { tool: name } };
      }
      ctx.hub.setEmotion(emotion);
      return { text: "ok", action: { tool: name, args: { emotion } }, emotion: emotion as ExpressiveEmotion };
    }

    default:
      return { text: `error: unknown tool "${name}"` };
  }
}
