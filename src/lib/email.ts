import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getRuntimeConfig } from "./config";

export interface EmailSender {
  send(message: { id: string; to: string; purpose: string; url: string }): Promise<void>;
}

export function assertSynthetic() {
  return getRuntimeConfig();
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
