import { invoke } from "@tauri-apps/api/core";
import { createTauriSqlExecutor, getDataLocation } from "./tauriSqlExecutor.js";

export const defaultSqlExecutor = createTauriSqlExecutor(invoke);

export function getDefaultDataLocation(): Promise<string> {
  return getDataLocation(invoke);
}
