import initSql from "../migrations/0001_init.sql?raw";
import type { Migration } from "./types.js";

export const builtInMigrations: readonly Migration[] = [
  { version: 1, name: "0001_init", sql: initSql },
];
