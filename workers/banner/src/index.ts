/**
 * Cloudflare Worker entry point for DQX Banner Translation API.
 */

import app from "./api";
import type { Env } from "./types";

export default {
	/**
	 * Handle incoming HTTP requests.
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
};
