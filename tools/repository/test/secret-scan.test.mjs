import assert from "node:assert/strict";
import test from "node:test";
import { scanText } from "../src/secret-scan.mjs";

test("detects a private key header", () => {
  const privateKeyHeader = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  assert.deepEqual(scanText(`safe\n${privateKeyHeader}\nsecret`), [
    { line: 2, name: "private key" },
  ]);
});

test("detects a representative AWS access key", () => {
  const accessKey = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
  assert.deepEqual(scanText(`credential=${accessKey}`), [{ line: 1, name: "AWS access key" }]);
});

test("does not reject documented placeholder values", () => {
  assert.deepEqual(scanText("AUTH_SESSION_SECRET=replace-with-at-least-32-random-bytes"), []);
});
