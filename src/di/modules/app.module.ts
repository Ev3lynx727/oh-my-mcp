import { Container } from "../container.js";
import { HttpClient } from "../../infrastructure/http/HttpClient.js";
import { ConfigCache } from "../../infrastructure/config/ConfigCache.js";
import { HealthChecker } from "../../application/HealthChecker.js";
import { EventBus } from "../../application/EventBus.js";
import { PortAllocator } from "../../application/PortAllocator.js";
import { ProcessManager } from "../../application/ProcessManager.js";
import { TransportFactory } from "../../infrastructure/transports/TransportFactory.js";
import { ServerManager } from "../../server_manager.js";

export class AppModule {
  /**
   * Register all application bindings into the container.
   *
   * This is the composition root.
   */
  static register(container: Container): void {
    // Infrastructure
    container.register(HttpClient, { useClass: HttpClient, singleton: true });
    container.register(ConfigCache, { useClass: ConfigCache, singleton: true });

    // Application services
    container.register(HealthChecker, {
      useFactory: (c) => new HealthChecker(c.resolve(HttpClient)),
      singleton: true,
    });
    container.register(EventBus, { useClass: EventBus, singleton: true });
    container.register(PortAllocator, {
      useFactory: () => new PortAllocator(8100),
      singleton: true,
    });
    container.register(ProcessManager, { useClass: ProcessManager, singleton: true });

    // Infrastructure: Transport
    container.register(TransportFactory, {
      useFactory: (c) => new TransportFactory(c.resolve(HttpClient)),
      singleton: true,
    });

    // Domain coordinator
    container.register(ServerManager, {
      useFactory: (c) => {
        const eventBus = c.resolve(EventBus) as EventBus;
        const portAllocator = c.resolve(PortAllocator) as PortAllocator;
        const processManager = c.resolve(ProcessManager) as ProcessManager;
        const transportFactory = c.resolve(TransportFactory) as TransportFactory;
        // basePort could be configurable; for now use 8100 default
        return new ServerManager(eventBus, portAllocator, processManager, transportFactory, 8100);
      },
      singleton: true,
    });
  }
}
