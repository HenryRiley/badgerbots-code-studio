import { createHmac, timingSafeEqual } from "node:crypto";
import type { EnvelopeAuthenticator } from "./envelope.js";

export class NodeHmacSha256Authenticator implements EnvelopeAuthenticator {
  constructor(private readonly secret: Uint8Array) {
    if (secret.byteLength < 32)
      throw new Error("Runtime HMAC secret must contain at least 32 bytes.");
  }

  sign(message: string): Promise<string> {
    return Promise.resolve(createHmac("sha256", this.secret).update(message).digest("base64url"));
  }

  async verify(message: string, signature: string): Promise<boolean> {
    const expected = Buffer.from(await this.sign(message));
    const actual = Buffer.from(signature);
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
  }
}
