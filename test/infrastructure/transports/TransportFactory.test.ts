import { describe, it, expect, vi } from "vitest";
import { TransportFactory } from "../../../src/infrastructure/transports/TransportFactory.js";
import { SuperGatewayTransport } from "../../../src/infrastructure/transports/SuperGatewayTransport.js";
import { DirectStdioTransport } from "../../../src/infrastructure/transports/DirectStdioTransport.js";
import { HttpClient } from "../../../src/infrastructure/http/HttpClient.js";

describe("TransportFactory", () => {
    const mockHttpClient = {} as HttpClient;
    const factory = new TransportFactory(mockHttpClient);

    describe("createTransport", () => {
        it("should create SuperGatewayTransport by default", () => {
            const transport = factory.createTransport();
            expect(transport).toBeInstanceOf(SuperGatewayTransport);
        });

        it("should create SuperGatewayTransport explicitly", () => {
            const transport = factory.createTransport("supergateway");
            expect(transport).toBeInstanceOf(SuperGatewayTransport);
        });

        it("should create DirectStdioTransport", () => {
            const transport = factory.createTransport("stdio");
            expect(transport).toBeInstanceOf(DirectStdioTransport);
        });

        it("should throw for unknown transport", () => {
            expect(() => factory.createTransport("unknown" as any)).toThrow("Unknown transport type: unknown");
        });
    });

    describe("createFromConfig", () => {
        it("should default to supergateway if config is missing", () => {
            const transport = factory.createFromConfig();
            expect(transport).toBeInstanceOf(SuperGatewayTransport);
        });

        it("should use transport from config", () => {
            const transport = factory.createFromConfig("stdio");
            expect(transport).toBeInstanceOf(DirectStdioTransport);
        });

        it("should throw for invalid config transport", () => {
            expect(() => factory.createFromConfig("invalid")).toThrow("Invalid transport type in config: invalid");
        });
    });
});
