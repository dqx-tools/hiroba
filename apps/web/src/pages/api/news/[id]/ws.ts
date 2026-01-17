/**
 * WebSocket endpoint for workflow progress updates.
 *
 * Proxies WebSocket connection to the WorkflowManager DO for the given news item.
 */

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, params, request }) => {
  const runtime = locals.runtime;
  const id = params.id!;

  // Check for WebSocket upgrade
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 400 });
  }

  // Get the WorkflowManager DO for this item
  const doId = runtime.env.WORKFLOW_MANAGER.idFromName(id);
  const stub = runtime.env.WORKFLOW_MANAGER.get(doId);

  // Forward the WebSocket upgrade request to the DO
  return stub.fetch(`http://internal/ws?itemId=${id}`, {
    headers: request.headers,
  });
};
