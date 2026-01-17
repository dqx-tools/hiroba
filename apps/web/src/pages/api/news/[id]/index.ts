/**
 * GET /api/news/:id - Get single news item with lazy body fetch
 *
 * If body is not fetched, triggers the workflow to fetch it.
 */

import type { APIRoute } from 'astro';

import { createDb, getNewsItem } from '@hiroba/db';

export const GET: APIRoute = async ({ locals, params }) => {
  const runtime = locals.runtime;
  const db = createDb(runtime.env.DB);
  const id = params.id!;

  const item = await getNewsItem(db, id);

  if (!item) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // If body not yet fetched, trigger workflow (but don't wait for it)
  if (item.contentJa === null) {
    try {
      const doId = runtime.env.WORKFLOW_MANAGER.idFromName(id);
      const stub = runtime.env.WORKFLOW_MANAGER.get(doId);

      // Fire and forget - trigger the workflow
      stub.fetch(
        new Request('http://internal/trigger', {
          method: 'POST',
          body: JSON.stringify({ itemId: id }),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    } catch (error) {
      // Workflow trigger failed but we can still return metadata
      console.error(`Workflow trigger failed for ${id}:`, error);
    }
  }

  return new Response(JSON.stringify({ item }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
