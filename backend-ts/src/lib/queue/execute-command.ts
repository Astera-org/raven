import { type InsertOptions, type JobInsert, type SendOptions } from "pg-boss";
import { getBoss } from "./pg-boss.js";

export type BossCommand = {
  key: string;
} & (
  | {
      method: "insert";
      options?: InsertOptions;
      data: JobInsert<object>[];
    }
  | {
      method: "send";
      options?: SendOptions;
      data: object | null | undefined;
    }
);

export async function executeCommand(bossCommand: BossCommand) {
  if (bossCommand.method === "send") {
    await getBoss().send(
      bossCommand.key,
      bossCommand.data,
      bossCommand.options
    );
  } else if (bossCommand.method === "insert") {
    await getBoss().insert(
      bossCommand.key,
      bossCommand.data,
      bossCommand.options
    );
  }
}
