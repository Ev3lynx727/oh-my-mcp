import { describe, it, expect, vi } from "vitest";
import { errorHandler } from "../../src/middleware/error-handler.js";
import type { Request, Response } from "express";

describe("errorHandler Middleware", () => {
    const mockLogger = {
        error: vi.fn(),
        warn: vi.fn(),
    };

    const createMocks = (err: any = {}, nodeEnv = "development") => {
        const req = {
            method: "GET",
            path: "/test",
            log: mockLogger,
            id: "req-123",
        } as unknown as Request;

        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const next = vi.fn();

        // Preserve original NODE_ENV
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = nodeEnv;

        return { req, res, next, originalEnv };
    };

    it("should handle 500 errors and log them as errors", () => {
        const err = new Error("Boom");
        const { req, res, next, originalEnv } = createMocks(err);

        errorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: "Boom",
            status: 500,
            stack: expect.any(String)
        }));
        expect(mockLogger.error).toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
    });

    it("should handle 4xx errors and log them as warnings", () => {
        const err = { message: "Not Found", status: 404 };
        const { req, res, next, originalEnv } = createMocks(err);

        errorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(mockLogger.warn).toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
    });

    it("should hide stack trace in production", () => {
        const err = new Error("Secret error");
        const { req, res, next, originalEnv } = createMocks(err, "production");

        errorHandler(err, req, res, next);

        expect(res.json).toHaveBeenCalledWith({
            error: "Secret error",
            status: 500
        });
        expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({
            stack: expect.any(String)
        }));

        process.env.NODE_ENV = originalEnv;
    });

    it("should fallback to pino if req.log is missing", () => {
        const err = new Error("No logger");
        const { res, next, originalEnv } = createMocks(err);
        const req = { method: "GET", path: "/" } as Request; // No .log

        // This mainly verifies it doesn't crash
        expect(() => errorHandler(err, req, res, next)).not.toThrow();
        expect(res.status).toHaveBeenCalledWith(500);

        process.env.NODE_ENV = originalEnv;
    });
});
