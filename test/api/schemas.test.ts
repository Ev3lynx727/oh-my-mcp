import { describe, it, expect } from "vitest";
import {
    ServerIdSchema,
    ListServersQuerySchema,
    ServerActionSchema,
    validationErrorToResponse
} from "../../src/api/schemas.js";
import { z } from "zod";

describe("API Schemas", () => {
    describe("ServerIdSchema", () => {
        it("should validate a valid server ID", () => {
            const result = ServerIdSchema.safeParse({ id: "test-server" });
            expect(result.success).toBe(true);
        });

        it("should fail for empty ID", () => {
            const result = ServerIdSchema.safeParse({ id: "" });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Server ID is required");
            }
        });

        it("should fail for excessively long ID", () => {
            const result = ServerIdSchema.safeParse({ id: "a".repeat(101) });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Server ID too long");
            }
        });
    });

    describe("ListServersQuerySchema", () => {
        it("should validate valid query params", () => {
            const result = ListServersQuerySchema.safeParse({
                status: "running",
                limit: "10",
                offset: "5"
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.limit).toBe(10);
                expect(result.data.offset).toBe(5);
                expect(result.data.status).toBe("running");
            }
        });

        it("should use defaults", () => {
            const result = ListServersQuerySchema.safeParse({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.limit).toBe(50);
                expect(result.data.offset).toBe(0);
                expect(result.data.status).toBeUndefined();
            }
        });

        it("should fail for invalid status", () => {
            const result = ListServersQuerySchema.safeParse({ status: "invalid" });
            expect(result.success).toBe(false);
        });
    });

    describe("validationErrorToResponse", () => {
        it("should format Zod errors correctly", () => {
            const schema = z.object({
                name: z.string(),
                age: z.number().min(18)
            });
            const result = schema.safeParse({ name: 123, age: 10 });

            const response = validationErrorToResponse(result);
            expect(response.error).toBe("Validation failed");
            expect(response.details).toBeDefined();
            expect(response.details?.name).toContain("Expected string, received number");
            expect(response.details?.age).toContain("Number must be greater than or equal to 18");
        });

        it("should handle successful parse results (empty errors)", () => {
            const schema = z.string();
            const result = schema.safeParse("ok");
            const response = validationErrorToResponse(result);
            expect(response.details).toEqual({});
        });
    });
});
