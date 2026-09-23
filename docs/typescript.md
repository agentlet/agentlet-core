# TypeScript support

agentlet-core ships hand-written TypeScript declarations for its public API, so agentlet authors get autocompletion and type checking whether their own agentlet is written in JavaScript or TypeScript.

## What is typed

- The `window.agentlet` object: `utils.Dialog`, `utils.MessageBubble`, `utils.ElementSelector`, `utils.ScreenCapture`, `utils.ScriptInjector`, `utils.PDFProcessor`, `utils.shortcuts`, `utils.zIndex`, `forms.*`, `tables.*`, `ai.*`, `env`, `cookies`, `storage.*`, `modules.*`, `ui.*`, `theme`, `eventBus`, and the rest of the surface built by `GlobalAPI.setupGlobalAccess()`.
- The `Module` base class agentlets extend (`window.agentlet.Module`), including the `initModule`/`activateModule`/`cleanupModule` lifecycle hooks and the optional duck-typed hooks the core looks for (`getPanelTitle`, `showSettings`, `showHelp`, `onLocalStorageChange`, ...).
- The `AgentletCore` constructor configuration object.

The declarations live in `src/types/public-api.d.ts` and are shipped as `dist/agentlet-core.d.ts`, referenced from `package.json`'s `types` field and the `types` condition of `exports["."]`.

Agentlets written in plain JavaScript never have to write any TypeScript themselves. The two sections below cover how a JavaScript agentlet picks up the types for free, and how a TypeScript agentlet can import them directly.

## JavaScript agentlets

### Option 1: a reference directive

Add a triple-slash reference directive at the top of a `.js` file (requires `agentlet-core` to be an installed dependency):

```javascript
/// <reference types="agentlet-core" />

class MyAgentlet extends window.agentlet.Module {
    async initModule() {
        this.log('initializing');
    }

    /**
     * @param {import('agentlet-core').ModuleActivationContext} [context]
     */
    async activateModule(context) {
        window.agentlet.utils.Dialog.info('Hello from my agentlet');
        void context;
    }

    async cleanupModule() {
        this.removeAllStyles();
    }
}

window.agentlet.modules.register(new MyAgentlet({ name: 'my-agentlet', patterns: ['example.com'] }));
```

Editors such as VS Code pick this up automatically and show autocompletion and type errors on `window.agentlet.*`, with no build step required.

### Option 2: jsconfig.json

For a whole project of `.js` files, add a `jsconfig.json` next to `package.json`:

```json
{
    "compilerOptions": {
        "checkJs": true,
        "types": ["agentlet-core"]
    }
}
```

This gives every `.js` file in the project the same autocompletion and type checking as the reference-directive form, without needing the directive in each file.

## TypeScript agentlets

Import the types directly:

```typescript
import type { AgentletAPI, ModuleActivationContext } from 'agentlet-core';

function handleActivation(context: ModuleActivationContext): void {
    console.log('activated with', context);
}

const reply: Promise<string> = window.agentlet.ai.sendPrompt('Summarize this page');
```

`window.agentlet` itself is typed globally as soon as any file in the program pulls in `agentlet-core`'s declarations (via the reference directive, `types` array, or an `import`/`import type`), so `window.agentlet.ai.sendPrompt(...)` above type-checks without an explicit import of `AgentletAPI`.

This resolves correctly with both `"moduleResolution": "bundler"` and `"moduleResolution": "node16"`, since `package.json` declares `"types": "./dist/agentlet-core.d.ts"` at the top level and as the first key of `exports["."]` (TypeScript requires `types` to come before `import`/`require` in a conditional exports block). This was verified by packing the library with `npm pack`, installing the tarball into a throwaway project, and running `tsc --noEmit` against both a `.js` file using the reference directive and a `.ts` file using `import type`.

## How the types are maintained

The declarations in `src/types/public-api.d.ts` are hand-written: `public-api.d.ts` ships standalone as `dist/agentlet-core.d.ts`, so it cannot `import` from the rest of `src/` at publish time. Instead, the shared shape types (`ModuleConfig`, `EventBusAPI`, `ThemeManagerAPI`, `ZIndexConstants`, `PanelManagerAPI`, ...) are single-sourced here and the real runtime classes (`src/core/{EventBus,ThemeManager,Module}.ts`, `src/utils/ui/ZIndex.ts`, `src/ui/PanelManager.ts`) `import type` them from this file, so both sides describe the same shape instead of being hand-maintained independently. `npm run typecheck` checks the result by compiling `tests/types/public-api.test-d.ts`, a type-only test that both uses the API the way an agentlet author would (asserting incorrect usage is rejected with `@ts-expect-error`) and asserts bidirectional assignability between each real class and its declaration here, so drift between them fails the build. That test file is not run by Jest; it exists purely for `tsc` to check.

`src/core/GlobalAPI.ts` is also converted, but has no dedicated conformance check here: it has no single public-facing declared type of its own (it builds up the pieces of `AgentletAPI` described elsewhere in this file), so there is nothing to assert bidirectional assignability against.

Other underlying classes not yet converted to `.ts` (mainly `src/index.js` and `src/ui/UIManager.js`) still have their public members traced back and hand-maintained directly in `public-api.d.ts`.
