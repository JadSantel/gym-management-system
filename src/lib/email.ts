import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface EmailSender {
  send(message: { id: string; to: string; purpose: string; url: string }): Promise<void>;
}

export function assertSynthetic() {
  const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
  const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://invalid");
  if (process.env.SYNTHETIC_DATA_ONLY !== "true" || database.hostname !== "127.0.0.1"
      || database.port !== "55432" || database.pathname !== "/gym_crm_synthetic" || origin.hostname !== "127.0.0.1") {
    throw new Error("Only isolated local synthetic identity workflows are enabled.");
  }
}

export const localEmail: EmailSender = {
  async send(message) {
    assertSynthetic();
    if (!/^[^\s@]+@[^\s@]+\.test$/.test(message.to)) throw new Error("Synthetic email requires a reserved .test recipient.");
    const directory = resolve(".local/mailbox");
    await mkdir(directory, { recursive: true });
    // Private synthetic capture, never an HTTP route or general application log.
    await writeFile(resolve(directory, `${message.id}.json`), JSON.stringify(message), { mode: 0o600 });
  },
};
