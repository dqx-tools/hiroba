/**
 * Type definitions for Durable Object RPC interfaces.
 *
 * These match the methods exposed by WorkflowManager in apps/workflow.
 */

export type WorkflowTriggerResponse = {
  status: 'started' | 'already_processing';
  instanceId: string;
};

export type WorkflowStatusResponse =
  | { status: 'idle' }
  | {
      status: 'running' | 'queued' | 'complete' | 'errored';
      instanceId: string;
      output?: unknown;
      error?: string;
    };

/**
 * WorkflowManager DO interface.
 * Used via stub.fetch() with appropriate URL paths.
 * The stub is obtained from DurableObjectNamespace.get() in the runtime env.
 */
