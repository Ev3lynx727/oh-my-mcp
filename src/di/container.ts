/**
 * Simple dependency injection container.
 *
 * Supports singleton and transient (factory) bindings.
 * Does not require decorators; manual registration.
 */

export type Binding = {
  useClass?: new (...args: any[]) => any;
  useValue?: any;
  useFactory?: (container: Container) => any;
  singleton?: boolean;
};

export class Container {
  private bindings: Map<any, Binding> = new Map();
  private singletons: Map<any, any> = new Map();

  /**
   * Register a token with a binding.
   *
   * @param token - Class or token to register
   * @param binding - Binding definition (one of useClass, useValue, useFactory)
   */
  register(token: any, binding: Binding): void {
    this.bindings.set(token, binding);
  }

  /**
   * Resolve an instance for a token.
   *
   * Throws if token not registered.
   */
  resolve<T>(token: any): T {
    const binding = this.bindings.get(token);
    if (!binding) {
      throw new Error(`No binding registered for token: ${token}`);
    }

    // If singleton and already instantiated, return cached
    if (binding.singleton !== false) {
      if (this.singletons.has(token)) {
        return this.singletons.get(token);
      }
    }

    // Create instance
    let instance: any;
    if (binding.useValue !== undefined) {
      instance = binding.useValue;
    } else if (binding.useFactory) {
      instance = binding.useFactory(this);
    } else if (binding.useClass) {
      // Auto-wire constructor dependencies by reading metadata or heuristics.
      // For simplicity, we'll manually construct known classes with explicit deps.
      instance = new binding.useClass();
    } else {
      throw new Error(`Invalid binding for token ${token}`);
    }

    // Cache singleton
    if (binding.singleton !== false) {
      this.singletons.set(token, instance);
    }

    return instance;
  }

  /**
   * Check if a token is registered.
   */
  has(token: any): boolean {
    return this.bindings.has(token);
  }

  /**
   * Create a child container (inherits bindings but separate singleton cache).
   */
  createChild(): Container {
    const child = new Container();
    child.bindings = new Map(this.bindings);
    return child;
  }
}
