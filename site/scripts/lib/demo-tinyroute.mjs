// The tinyroute demo repo: a TypeScript HTTP router with `node --test` tests
// (Node 23.6+ runs the .ts files as they are). Used by demo-repos.mjs.

export const tinyroute = {
  name: "tinyroute",
  commits: [
    {
      message: "Path patterns with :params",
      files: {
        "package.json": `${JSON.stringify(
          {
            name: "tinyroute",
            version: "0.1.0",
            description: "A tiny HTTP router for node:http",
            type: "module",
            main: "src/index.ts",
            scripts: { test: "node --test test/*.test.ts" },
            license: "MIT",
          },
          null,
          2,
        )}\n`,
        "tsconfig.json": `${JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              module: "NodeNext",
              strict: true,
              noEmit: true,
              allowImportingTsExtensions: true,
              erasableSyntaxOnly: true,
            },
            include: ["src", "test"],
          },
          null,
          2,
        )}\n`,
        ".gitignore": "node_modules/\n",
        "README.md":
          "# tinyroute\n\nA tiny HTTP router for `node:http`: `get()` and `post()` with `:params`.\n\n" +
          "```ts\nconst router = new Router();\nrouter.get(\"/users/:id\", (req, res, params) => res.end(params.id));\n" +
          "http.createServer((req, res) => router.handle(req, res)).listen(3000);\n```\n\n`npm test` runs the tests.\n",
        "src/path.ts": `/** A compiled path pattern such as "/users/:id". */
export interface Pattern {
  keys: string[];
  regex: RegExp;
}

/** Compile "/users/:id" into a regex with one group per :param. */
export function compile(pattern: string): Pattern {
  const keys: string[] = [];
  const source = pattern
    .split("/")
    .map((part) => {
      if (!part.startsWith(":")) return part.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
      keys.push(part.slice(1));
      return "([^/]+)";
    })
    .join("/");
  return { keys, regex: new RegExp(\`^\${source}/?$\`) };
}

/** The params of \`path\` if it matches, else null. */
export function match(p: Pattern, path: string): Record<string, string> | null {
  const m = p.regex.exec(path);
  if (!m) return null;
  return Object.fromEntries(p.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
}
`,
        "test/path.test.ts": `import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, match } from "../src/path.ts";

test("matches a static path", () => {
  assert.deepEqual(match(compile("/health"), "/health"), {});
  assert.equal(match(compile("/health"), "/healthz"), null);
});

test("captures params", () => {
  assert.deepEqual(match(compile("/users/:id"), "/users/42"), { id: "42" });
  assert.deepEqual(match(compile("/a/:x/b/:y"), "/a/1/b/two"), { x: "1", y: "two" });
});

test("decodes params and allows a trailing slash", () => {
  assert.deepEqual(match(compile("/files/:name"), "/files/a%20b/"), { name: "a b" });
});
`,
      },
    },
    {
      message: "Router with get() and post()",
      files: {
        "src/router.ts": `import type { IncomingMessage, ServerResponse } from "node:http";
import { compile, match, type Pattern } from "./path.ts";

export type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => void;

interface Route {
  method: string;
  pattern: Pattern;
  handler: Handler;
}

/** Routes requests by method and path; the first route that matches wins. */
export class Router {
  private routes: Route[] = [];

  route(method: string, path: string, handler: Handler): this {
    this.routes.push({ method, pattern: compile(path), handler });
    return this;
  }

  get(path: string, handler: Handler): this {
    return this.route("GET", path, handler);
  }

  post(path: string, handler: Handler): this {
    return this.route("POST", path, handler);
  }

  /** Handle \`req\`; answers 404 when no route matches. Returns whether one did. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const params = match(r.pattern, path);
      if (params) {
        r.handler(req, res, params);
        return true;
      }
    }
    res.statusCode = 404;
    res.end("Not found");
    return false;
  }
}
`,
        "src/index.ts": `export { Router, type Handler } from "./router.ts";\nexport { compile, match } from "./path.ts";\n`,
        "test/router.test.ts": `import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { Router } from "../src/router.ts";

function call(router: Router, method: string, url: string) {
  const res = { statusCode: 200, body: "", end(b = "") { this.body = b; } };
  router.handle({ method, url } as IncomingMessage, res as unknown as ServerResponse);
  return res;
}

test("routes GET with params", () => {
  const r = new Router().get("/users/:id", (_q, res, p) => res.end(\`user \${p.id}\`));
  assert.equal(call(r, "GET", "/users/7").body, "user 7");
});

test("routes POST separately from GET", () => {
  const r = new Router()
    .get("/items", (_q, res) => res.end("list"))
    .post("/items", (_q, res) => res.end("created"));
  assert.equal(call(r, "POST", "/items").body, "created");
});

test("answers 404 when nothing matches", () => {
  assert.equal(call(new Router(), "GET", "/nope").statusCode, 404);
});
`,
      },
    },
    {
      message: "Ignore the query string when matching",
      files: {
        "test/query.test.ts": `import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { Router } from "../src/router.ts";

test("matches the path without its query string", () => {
  let hit = "";
  const r = new Router().get("/search", (req) => {
    hit = req.url ?? "";
  });
  r.handle({ method: "GET", url: "/search?q=router" } as IncomingMessage, {} as ServerResponse);
  assert.equal(hit, "/search?q=router");
});
`,
      },
    },
  ],
};
