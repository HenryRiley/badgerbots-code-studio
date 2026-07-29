import { describe, expect, it } from "vitest";
import { devicePublicIdFromHash, urlWithoutDeviceFragment } from "./device-link.js";

describe("privacy-safe Connect device handoff", () => {
  it("reads only a canonical v4 device UUID from the URL fragment", () => {
    expect(devicePublicIdFromHash("#bbDevice=123e4567-e89b-42d3-a456-426614174000")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(devicePublicIdFromHash("#bbDevice=not-a-device")).toBe("");
    expect(devicePublicIdFromHash("?bbDevice=123e4567-e89b-42d3-a456-426614174000")).toBe("");
  });

  it("removes the fragment without changing the hosted path or query", () => {
    expect(
      urlWithoutDeviceFragment({
        pathname: "/classroom/",
        search: "?build=pilot",
      }),
    ).toBe("/classroom/?build=pilot");
  });
});
