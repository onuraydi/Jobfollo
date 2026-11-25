import initSql from "../migrations/0001_init.sql?raw";
import itemDetailsSql from "../migrations/0002_item_details.sql?raw";
import applicationTypeSql from "../migrations/0003_application_type.sql?raw";
import messageTemplatesSql from "../migrations/0004_message_templates.sql?raw";
import type { Migration } from "./types.js";

export const builtInMigrations: readonly Migration[] = [
  { version: 1, name: "0001_init", sql: initSql },
  { version: 2, name: "0002_item_details", sql: itemDetailsSql },
  { version: 3, name: "0003_application_type", sql: applicationTypeSql },
  { version: 4, name: "0004_message_templates", sql: messageTemplatesSql },
];
