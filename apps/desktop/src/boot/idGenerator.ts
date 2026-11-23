import type { IdGenerator } from "@jobfollo/data";
import type { CryptoLike } from "./types.js";

function bytesToUuidV4(bytes: Uint8Array): string {
  // RFC 4122 version 4 (0100xxxx) and variant 1 (10xxxxxx)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createCryptoIdGenerator(env: CryptoLike): IdGenerator {
  if (typeof env.randomUUID === "function") {
    const randomUUID = env.randomUUID.bind(env);
    return {
      newId: () => randomUUID(),
    };
  }

  if (typeof env.getRandomValues === "function") {
    const getRandomValues = env.getRandomValues.bind(env);
    return {
      newId: () => {
        const bytes = new Uint8Array(16);
        getRandomValues(bytes);
        return bytesToUuidV4(bytes);
      },
    };
  }

  throw new Error("Crypto environment does not provide randomUUID or getRandomValues.");
}
