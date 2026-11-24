import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import plugin from "../index.js";

const linter = new Linter();

const config = [
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022 as const,
        sourceType: "module" as const,
      },
    },
    plugins: { raven: plugin },
    rules: { "raven/prefer-api-version-alias": "error" as const },
  },
];

// `@typescript-eslint/utils` rule modules are structurally compatible with
// `eslint`'s runtime plugin/rule shape but not with its stricter public types,
// so the config is cast at the Linter boundary rather than typed as `Linter.Config[]`.
function lint(code: string) {
  return linter.verify(code, config as never);
}

function fix(code: string) {
  return linter.verifyAndFix(code, config as never);
}

describe("prefer-api-version-alias", () => {
  it("flags a generic #src/api-v0 import and fixes it to #v0", () => {
    const code =
      'import { markdownToText } from "#src/api-v0/lib/utils/markdown.js";\n';
    const messages = lint(code);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toBe(
      "Use '#v0/lib/utils/markdown.js' instead of '#src/api-v0/lib/utils/markdown.js'."
    );
    expect(fix(code).output).toBe(
      'import { markdownToText } from "#v0/lib/utils/markdown.js";\n'
    );
  });

  it("flags a generic #src/api-v1 import and fixes it to #v1", () => {
    const code =
      "import { postDoi } from '#src/api-v1/routes/handlers/post-doi.js';\n";

    expect(lint(code)).toHaveLength(1);
    expect(fix(code).output).toBe(
      "import { postDoi } from '#v1/routes/handlers/post-doi.js';\n"
    );
  });

  it("preserves the original quote style when fixing", () => {
    const single = fix("import x from '#src/api-v0/x.js';\n").output;
    const double = fix('import x from "#src/api-v0/x.js";\n').output;

    expect(single).toBe("import x from '#v0/x.js';\n");
    expect(double).toBe('import x from "#v0/x.js";\n');
  });

  it("fixes a bare #src/api-v0 or #src/api-v1 specifier with no sub-path", () => {
    expect(fix('import v0 from "#src/api-v0";\n').output).toBe(
      'import v0 from "#v0";\n'
    );
    expect(fix('import v1 from "#src/api-v1";\n').output).toBe(
      'import v1 from "#v1";\n'
    );
  });

  it("flags `export ... from` and `export *` re-exports", () => {
    const named = 'export { getDoi } from "#src/api-v0/routes/get-doi.js";\n';
    const all = 'export * from "#src/api-v1/routes/index.js";\n';

    expect(fix(named).output).toBe(
      'export { getDoi } from "#v0/routes/get-doi.js";\n'
    );
    expect(fix(all).output).toBe('export * from "#v1/routes/index.js";\n');
  });

  it("flags dynamic import() calls", () => {
    const code = 'const load = () => import("#src/api-v0/lib/utils.js");\n';
    expect(fix(code).output).toBe(
      'const load = () => import("#v0/lib/utils.js");\n'
    );
  });

  it("flags TypeScript `import(...)` type references", () => {
    const code = 'type Foo = import("#src/api-v1/types.js").Foo;\n';
    expect(fix(code).output).toBe('type Foo = import("#v1/types.js").Foo;\n');
  });

  it("does not flag imports that already use the #v0/#v1 aliases", () => {
    expect(lint('import { a } from "#v0/lib/a.js";\n')).toHaveLength(0);
    expect(lint('import { b } from "#v1/lib/b.js";\n')).toHaveLength(0);
  });

  it("does not flag unrelated specifiers, including other #src/ paths", () => {
    expect(lint('import { c } from "#src/lib/c.js";\n')).toHaveLength(0);
    expect(lint('import fs from "node:fs";\n')).toHaveLength(0);
    expect(lint('export { d } from "./d.js";\n')).toHaveLength(0);
    expect(lint("export const e = 1;\n")).toHaveLength(0);
  });

  it("does not flag specifiers that merely start with the same prefix but aren't a path segment", () => {
    expect(lint('import x from "#src/api-v0-legacy/x.js";\n')).toHaveLength(0);
  });
});
