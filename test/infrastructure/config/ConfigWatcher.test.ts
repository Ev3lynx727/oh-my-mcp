import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfigWatcher } from "../../../src/infrastructure/config/ConfigWatcher.js";
import chokidar from "chokidar";
import * as configLoader from "../../../src/config_loader.js";

const mockOn = vi.fn().mockReturnThis();
const mockClose = vi.fn().mockResolvedValue(true);
const mockWatcherInstance = { on: mockOn, close: mockClose };

vi.mock("chokidar", () => {
    return {
        default: {
            watch: vi.fn(() => mockWatcherInstance)
        }
    };
});

vi.mock("../../../src/config_loader.js", () => ({
    loadConfig: vi.fn()
}));

describe("ConfigWatcher", () => {
    const configPath = "config.yaml";
    let watcher: ConfigWatcher;

    beforeEach(() => {
        vi.useFakeTimers();
        watcher = new ConfigWatcher(configPath, { debounceMs: 100 });
    });

    afterEach(async () => {
        await watcher.stop();
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it("should start chokidar and listen for events", async () => {
        const callback = vi.fn();
        await watcher.start(callback);

        expect(chokidar.watch).toHaveBeenCalledWith(configPath, expect.any(Object));
        expect(mockOn).toHaveBeenCalledWith("change", expect.any(Function));
        expect(mockOn).toHaveBeenCalledWith("add", expect.any(Function));
        expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("should debounce config reloading", async () => {
        const callback = vi.fn().mockResolvedValue(undefined);
        const mockConfig = { servers: {} };
        vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig as any);

        await watcher.start(callback);

        // Get the internal callback passed to .on('change')
        const changeHandler = mockOn.mock.calls.find(call => call[0] === "change")[1];

        // Trigger change twice rapidly
        changeHandler("path/to/config");
        changeHandler("path/to/config");

        expect(configLoader.loadConfig).not.toHaveBeenCalled();

        // Fast-forward time
        await vi.advanceTimersByTimeAsync(150);

        expect(configLoader.loadConfig).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(mockConfig);
    });

    it("should handle reload errors gracefully", async () => {
        const callback = vi.fn();
        vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error("Parse error"));

        await watcher.start(callback);
        const changeHandler = mockOn.mock.calls.find(call => call[0] === "change")[1];

        changeHandler("path");
        await vi.advanceTimersByTimeAsync(110);

        expect(callback).not.toHaveBeenCalled();
        // It should log error but not throw
    });
});
