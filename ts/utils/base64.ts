export function toBase64(input: string): string {
  if (typeof btoa === "function") {
    return btoa(input);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "binary").toString("base64");
  }

  throw new Error("No base64 encoder available in the current environment");
}
