/// <reference types="astro/client" />

type RuntimeEnv = {
  DB: D1Database;
  WORKFLOW_MANAGER: DurableObjectNamespace;
};

declare namespace App {
  type Locals = {
    runtime: { env: RuntimeEnv };
  };
}

type ImportMetaEnv = {
  readonly API_URL: string;
};

type ImportMeta = {
  readonly env: ImportMetaEnv;
};
