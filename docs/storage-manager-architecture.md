# Storage Manager Architecture for oh-my-mcp

## Executive Summary

This document proposes a Storage Manager system for the oh-my-mcp gateway that enables persistent storage and management of MCP server configuration profiles. The system provides capabilities for creating, versioning, importing, and exporting server configurations, with support for multiple storage backends including local filesystem, database, and Redis. This enables administrators to manage multiple server configurations efficiently, support different deployment environments, and maintain configuration history for audit and rollback purposes.

## 1. Introduction and Problem Statement

The oh-my-mcp gateway manages multiple MCP servers, each requiring distinct configuration settings including server definitions, connection parameters, authentication credentials, and operational policies. Currently, these configurations are managed through static YAML files, which presents several challenges for production deployments. Administrators cannot easily switch between different configuration profiles without manually editing files or maintaining multiple configuration directories. There is no built-in support for configuration versioning, making it difficult to track changes over time or roll back to previous states when problems arise. The lack of a structured storage system makes it cumbersome to share configurations across environments or replicate setups between different gateway installations.

The Storage Manager addresses these challenges by providing a comprehensive solution for configuration profile management that combines persistent storage, versioning capabilities, and flexible access patterns. The system is designed to integrate seamlessly with the existing oh-my-mcp architecture while extending its capabilities to support enterprise-grade configuration management workflows.

## 2. System Architecture

### 2.1 High-Level Overview

The Storage Manager operates as a centralized configuration management layer that sits between the gateway's runtime configuration system and the underlying storage backends. It provides a unified API for all configuration operations while abstracting the specifics of how and where configurations are actually stored. This abstraction allows deployments to choose the most appropriate storage mechanism for their environment while maintaining consistent behavior across different backends.

```
┌─────────────────────────────────────────────────────────────────┐
│                      oh-my-mcp Gateway                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Storage Manager                         │   │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────┐   │   │
│  │  │  Profile   │  │  Version   │  │     Import/    │   │   │
│  │  │  Manager   │  │  Control   │  │     Export     │   │   │
│  │  └─────┬──────┘  └──────┬─────┘  └────────┬────────┘   │   │
│  │        │                │                  │             │   │
│  │        └────────────────┼──────────────────┘             │   │
│  │                         │                                  │   │
│  │               ┌─────────┴─────────┐                       │   │
│  │               │   Storage Layer  │                       │   │
│  │               └─────────┬─────────┘                       │   │
│  └─────────────────────────┼─────────────────────────────────┘   │
│                            │                                     │
│              ┌─────────────┴─────────────┐                       │
│              │                           │                       │
│       ┌──────┴──────┐          ┌───────┴──────┐              │
│       │  Filesystem │          │     Redis     │              │
│       │   (YAML)   │          │   (Default)   │              │
│       └─────────────┘          └───────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Components

The Storage Manager consists of four primary components that work together to provide comprehensive configuration management. The Profile Manager handles the lifecycle of configuration profiles, including creation, reading, updating, deletion, and listing operations. The Version Control component maintains historical versions of each profile, enabling audit trails and rollback capabilities. The Import/Export module supports transferring configurations between systems or creating backups for disaster recovery. The Storage Abstraction layer provides a unified interface for different storage backends while allowing new backends to be added through a plugin architecture.

## 3. Configuration Profile Management

### 3.1 Profile Structure

Each configuration profile contains a complete definition of how the gateway should manage one or more MCP servers. The profile structure includes metadata for identification and organization, the actual server configurations, operational policies that govern how servers behave, and secrets that should be stored securely. This comprehensive structure ensures that profiles are self-contained and can be deployed as complete units.

```typescript
interface ConfigurationProfile {
  id: string;
  name: string;
  description?: string;
  metadata: {
    createdAt: number;
    updatedAt: number;
    createdBy: string;
    version: number;
    tags: string[];
    environment?: string;
  };
  servers: ServerConfig[];
  policies: PolicyConfig;
  secrets?: EncryptedSecrets;
}

interface ServerConfig {
  id: string;
  name: string;
  type: "stdio" | "http" | "websocket";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  auth?: AuthConfig;
  transport?: TransportConfig;
}

interface PolicyConfig {
  rateLimit?: RateLimitConfig;
  timeout?: number;
  retry?: RetryConfig;
  healthCheck?: HealthCheckConfig;
}
```

### 3.2 Profile Operations

The Profile Manager provides a complete set of CRUD operations for managing configuration profiles. Create operations generate new profiles with unique identifiers and initialize version tracking. Read operations support both fetching individual profiles by ID and listing profiles with filtering and pagination. Update operations modify existing profiles while automatically creating new versions to maintain history. Delete operations can either permanently remove profiles or perform soft deletes that preserve data for recovery purposes.

```typescript
interface ProfileManager {
  create(profile: CreateProfileInput): Promise<ConfigurationProfile>;
  get(id: string): Promise<ConfigurationProfile | null>;
  list(filter?: ProfileFilter): Promise<ProfileListResult>;
  update(id: string, data: UpdateProfileInput): Promise<ConfigurationProfile>;
  delete(id: string, options?: DeleteOptions): Promise<void>;
  duplicate(id: string, newName: string): Promise<ConfigurationProfile>;
  merge(sourceIds: string[], targetName: string): Promise<ConfigurationProfile>;
}
```

### 3.3 Profile Activation

The Storage Manager integrates with the gateway's runtime configuration system to enable profile activation. When a profile is activated, its server configurations are loaded into the running gateway, allowing administrators to switch between different configurations without restarting the gateway process. This enables zero-downtime configuration changes and supports blue-green deployment patterns where new configurations can be tested before being fully applied.

```typescript
interface ProfileActivation {
  activate(profileId: string, options?: ActivationOptions): Promise<ActivationResult>;
  deactivate(profileId: string): Promise<void>;
  getActive(): Promise<ConfigurationProfile | null>;
  switchover(profileId: string): Promise<SwitchoverResult>;
}

interface ActivationOptions {
  validateOnly?: boolean;
  preserveState?: boolean;
  preview?: boolean;
}
```

## 4. Version Control System

### 4.1 Version Management

Every modification to a configuration profile automatically creates a new version, preserving the complete state of the profile at that point in time. Version numbers are assigned sequentially within each profile, providing a clear ordering of changes. The version control system maintains complete historical data, allowing any previous version to be retrieved, compared, or restored at any time.

```typescript
interface VersionInfo {
  profileId: string;
  version: number;
  createdAt: number;
  createdBy: string;
  changeDescription?: string;
  diff?: ProfileDiff;
}

interface ProfileDiff {
  added: string[];
  removed: string[];
  modified: {
    path: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
}
```

### 4.2 Version Operations

The version control system provides comprehensive operations for interacting with profile history. Retrieve operations fetch specific versions by number or retrieve the complete version history for a profile. Comparison operations generate diffs between any two versions, highlighting what changed and helping administrators understand the impact of changes. Restore operations create new versions from historical snapshots, allowing easy rollback while preserving the complete history.

```typescript
interface VersionControl {
  getVersion(profileId: string, version: number): Promise<ConfigurationProfile>;
  getHistory(profileId: string, options?: HistoryOptions): Promise<VersionInfo[]>;
  compare(profileId: string, v1: number, v2: number): Promise<ProfileDiff>;
  restore(profileId: string, version: number, options?: RestoreOptions): Promise<ConfigurationProfile>;
  prune(profileId: string, keepVersions: number[]): Promise<void>;
}
```

### 4.3 Change Tracking

The system automatically captures change metadata including who made the change, when it was made, and optionally a description of what changed. This information supports compliance requirements by providing an audit trail of all configuration modifications. Administrators can configure retention policies to determine how long historical versions are preserved, balancing storage costs against the need for historical visibility.

## 5. Import and Export Capabilities

### 5.1 Export Operations

Export functionality allows administrators to download configuration profiles for backup, sharing, or migration purposes. Exports can be performed at multiple levels, including individual profiles, collections of profiles, or complete configuration snapshots that include all profiles and their complete version histories. Exported data can be formatted as JSON for machine processing or YAML for human readability.

```typescript
interface ExportOptions {
  format: "json" | "yaml";
  includeVersions?: boolean;
  includeSecrets?: boolean;
  encryptionPassword?: string;
  compression?: boolean;
}

interface ExportResult {
  data: string | Buffer;
  metadata: {
    profileCount: number;
    versionCount: number;
    exportedAt: number;
    format: string;
  };
}
```

### 5.2 Import Operations

Import operations support bringing external configurations into the Storage Manager. The import system validates incoming data against the configuration schema, detecting conflicts with existing profiles and providing options for how to handle them. Import operations can create new profiles, update existing profiles while preserving version history, or merge imported data with existing configurations.

```typescript
interface ImportOptions {
  conflictResolution: "create" | "update" | "skip" | "error";
  updateStrategy: "replace" | "merge";
  validateOnly?: boolean;
  owner?: string;
}

interface ImportResult {
  imported: string[];
  skipped: string[];
  errors: ImportError[];
  warnings: ImportWarning[];
}
```

### 5.3 Template System

The import system supports configuration templates that provide starting points for common deployment scenarios. Templates can be distributed as standalone files or bundled into template packs that contain related configurations for specific use cases. The template system includes variable substitution, allowing imported templates to be customized through parameter overrides.

```typescript
interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  variables: TemplateVariable[];
  content: ConfigurationProfile;
}

interface TemplateVariable {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  required: boolean;
  defaultValue?: unknown;
  description: string;
}
```

## 6. Storage Backend Abstraction

### 6.1 Backend Interface

The storage abstraction layer defines a common interface that all storage backends must implement. This interface covers all operations needed by the Storage Manager, including profile CRUD operations, version management, metadata storage, and file attachment handling. The abstraction ensures that switching between backends requires only configuration changes rather than code modifications.

```typescript
interface StorageBackend {
  // Profile operations
  saveProfile(profile: ConfigurationProfile): Promise<void>;
  getProfile(id: string): Promise<ConfigurationProfile | null>;
  listProfiles(filter?: ProfileFilter): Promise<string[]>;
  deleteProfile(id: string): Promise<void>;

  // Version operations
  saveVersion(profileId: string, version: ConfigurationProfile): Promise<void>;
  getVersion(profileId: string, version: number): Promise<ConfigurationProfile | null>;
  listVersions(profileId: string): Promise<number[]>;

  // Metadata operations
  saveMetadata(profileId: string, metadata: ProfileMetadata): Promise<void>;
  getMetadata(profileId: string): Promise<ProfileMetadata | null>;

  // Administrative operations
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<boolean>;
}
```

### 6.2 Filesystem Backend

The default filesystem backend stores configurations as YAML files in a configurable directory structure. Each profile is stored in its own directory, with version history maintained as timestamped files within that directory. This backend is suitable for single-instance deployments or environments where configurations are managed through external version control systems.

```yaml
storage:
  backend: "filesystem"
  filesystem:
    path: "${CONFIG_PATH:./config}"
    watchForChanges: true
    fileExtension: ".yaml"
    encoding: "utf-8"
```

### 6.3 Redis Backend (Default)

The Redis backend provides high-performance storage with sub-millisecond access times and native support for distributed deployments. Since Redis is already available in the oh-my-mcp ecosystem, this backend is the recommended default for production environments. Redis pub/sub enables real-time change propagation across multiple gateway instances.

```yaml
storage:
  backend: "redis"
  redis:
    host: "${REDIS_HOST:localhost}"
    port: 6379
    password: "${REDIS_PASSWORD}"
    db: 3
    prefix: "oh-my-mcp:profiles:"
    cluster:
      enabled: true
      nodes:
        - host: "${REDIS_CLUSTER_1}"
        - host: "${REDIS_CLUSTER_2}"
```

## 7. Hot Reload and Dynamic Updates

### 7.1 Change Detection

The Storage Manager integrates with the existing configuration watching system to detect changes to stored profiles. When using the filesystem backend, file system watchers monitor the configuration directory for modifications, additions, and deletions. For database and Redis backends, polling or pub/sub mechanisms detect changes made by other gateway instances or administrative tools.

```typescript
interface ChangeDetection {
  onProfileChange(callback: (event: ProfileChangeEvent) => void): void;
  onProfileCreate(callback: (profile: ConfigurationProfile) => void): void;
  onProfileUpdate(callback: (profile: ConfigurationProfile) => void): void;
  onProfileDelete(callback: (profileId: string) => void): void;
}

interface ProfileChangeEvent {
  type: "create" | "update" | "delete";
  profileId: string;
  timestamp: number;
  source: "local" | "remote" | "api";
}
```

### 7.2 Graceful Reload

When configuration changes are detected, the Storage Manager coordinates a graceful reload of affected server configurations. This process validates the new configuration before applying it, rolls back automatically if validation fails, and maintains service continuity throughout the transition. The reload mechanism is designed to minimize disruption, reusing existing connections where possible and staggering server restarts to maintain capacity.

```typescript
interface ReloadStrategy {
  type: "immediate" | "gradual" | "scheduled";
  staggerDelay?: number;
  maxConcurrent?: number;
  healthCheck?: boolean;
  rollbackOnFailure?: boolean;
}

interface ReloadResult {
  success: boolean;
  reloaded: string[];
  failed: string[];
  errors: Error[];
  duration: number;
}
```

## 8. Configuration Examples

### 8.1 Basic Configuration

```yaml
storage:
  enabled: true
  backend: "filesystem"
  filesystem:
    path: "./config/profiles"
    watchForChanges: true

profiles:
  defaultProfile: "production"
  autoActivate: true
  hotReload:
    enabled: true
    strategy: "gradual"
```

### 8.2 Production Configuration with Redis

```yaml
storage:
  enabled: true
  backend: "redis"
  redis:
    host: "${REDIS_HOST}"
    port: 6379
    password: "${REDIS_PASSWORD}"
    db: 3

profiles:
  defaultProfile: "production"
  autoActivate: true
  versioning:
    enabled: true
    maxVersions: 50
    retentionDays: 90

hotReload:
  enabled: true
  strategy: "gradual"
  healthCheck: true
```

## 9. API Endpoints

### 9.1 Profile Management API

The Storage Manager exposes a comprehensive REST API for programmatic configuration management. This API enables integration with external tooling, CI/CD pipelines, and administrative dashboards.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/profiles | List all configuration profiles |
| POST | /api/profiles | Create a new profile |
| GET | /api/profiles/:id | Get profile details |
| PUT | /api/profiles/:id | Update a profile |
| DELETE | /api/profiles/:id | Delete a profile |
| POST | /api/profiles/:id/activate | Activate a profile |
| POST | /api/profiles/:id/duplicate | Duplicate a profile |

### 9.2 Version Control API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/profiles/:id/versions | Get version history |
| GET | /api/profiles/:id/versions/:version | Get specific version |
| POST | /api/profiles/:id/versions/:version/restore | Restore to version |
| GET | /api/profiles/:id/compare | Compare two versions |

### 9.3 Import/Export API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/profiles/:id/export | Export a profile |
| POST | /api/profiles/import | Import a profile |
| GET | /api/templates | List available templates |
| POST | /api/templates/:id/instantiate | Create profile from template |

## 10. Implementation Roadmap

### 10.1 Phase 1: Core Storage (Filesystem)

The initial phase implements the fundamental storage capabilities including the storage backend abstraction, filesystem backend as the default option, basic profile CRUD operations, and integration with the existing configuration loading system. This phase delivers immediate value by enabling structured configuration management without requiring Redis infrastructure.

### 10.2 Phase 2: Redis Backend + Versioning

The second phase adds Redis backend support as the recommended production option and version control capabilities. Since Redis is already part of the oh-my-mcp ecosystem, this phase integrates seamlessly with existing deployments. Features include automatic version creation on profile changes, version history retrieval, diff comparison between versions, restore operations, and hot reload with real-time change propagation across gateway instances.

### 10.3 Phase 3: Import/Export + Templates

The final phase implements the import and export functionality with support for JSON and YAML formats, template instantiation, conflict resolution strategies, and administrative APIs for programmatic configuration management.

## 11. Conclusion

The Storage Manager architecture provides oh-my-mcp with enterprise-grade configuration profile management capabilities using just two storage backends: **Filesystem** (simple, default) and **Redis** (production, distributed). Since Redis is already available in the oh-my-mcp ecosystem, production deployments can leverage high-performance storage with sub-millisecond access times and real-time change propagation across gateway instances.

The modular design ensures that deployments can adopt the capabilities they need, starting with simple filesystem-based storage and graduating to Redis storage as requirements evolve. The comprehensive profile versioning, flexible import/export options, and hot reload capabilities address the limitations of static YAML configuration while maintaining compatibility with existing workflows.

The integration with the existing gateway architecture ensures that new capabilities complement rather than replace current functionality. Administrators can adopt profile management incrementally, enabling features as their needs grow without requiring immediate changes to established deployment patterns. This approach positions oh-my-mcp as a production-ready gateway suitable for organizations of varying scales and complexity.
