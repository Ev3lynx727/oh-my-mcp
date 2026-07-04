import { z } from "zod";

export const ServerIdSchema = z.object({
  id: z.string().min(1, "Server ID is required").max(100, "Server ID too long"),
});

export type ServerId = z.infer<typeof ServerIdSchema>;

export const ListServersQuerySchema = z.object({
  status: z.enum(["running", "stopped", "error", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListServersQuery = z.infer<typeof ListServersQuerySchema>;

export const HealthResponseSchema = z.object({
  id: z.string(),
  healthy: z.boolean(),
  lastCheck: z.string().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ServerActionSchema = z.object({
  force: z.boolean().optional().default(false),
  timeout: z.number().int().positive().max(120000).optional(),
});

export type ServerAction = z.infer<typeof ServerActionSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.record(z.array(z.string())).optional(),
  code: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function validationErrorToResponse(result: z.SafeParseReturnType<unknown, unknown>): ErrorResponse {
  const errors: Record<string, string[]> = {};
  
  if (result.error) {
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(issue.message);
    }
  }
  
  return {
    error: "Validation failed",
    details: errors,
  };
}
