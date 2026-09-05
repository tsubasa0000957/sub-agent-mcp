import { describe, expect, it } from "vitest";
import { errorCode } from "../../src/infra/logging.js";

describe("safe error logging", () => {
  it("preserves stable error classes and rejects arbitrary names", () => {
    expect(errorCode(new DOMException("aborted", "AbortError"))).toBe("AbortError");
    const unsafe = new Error("private prompt text");
    unsafe.name = "bad\nprivate prompt text";
    expect(errorCode(unsafe)).toBe("Error");
    expect(errorCode("private prompt text")).toBe("UnknownError");
  });
});
