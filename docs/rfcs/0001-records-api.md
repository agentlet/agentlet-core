# RFC 0001: records, structured copy and paste between web apps

- Status: draft
- Target: agentlet-core 2.3.0 (phase 1), additive, no breaking change
- API namespace: `window.agentlet.records`

## Summary

Add a `records` API to agentlet-core. It lets an agentlet copy structured data from one web page and paste it into another web app, where the paste fills a form field by field instead of dropping plain text.

A record is a small, versioned JSON envelope: a type, typed fields, and where it came from. Records travel through the system clipboard, written in several formats at once. A target page with an agentlet gets a smart paste, with a field mapping preview before anything is filled. A target without an agentlet, such as a spreadsheet, a mail or a document, still gets a clean table or readable text.

## Motivation

Copy and paste is the integration everyone already does by hand: a supplier record from a company registry into an ERP, a ticket into a CRM, a table from a spec into a pull request. Each paste is plain text, so every field is retyped or reformatted.

agentlet-core already has the pieces on each side:

- reading: `forms.quickExport()`, `tables.extract()`, `ElementSelector`, `ai.sendPrompt()`;
- writing: `forms.fill()`, `forms.fillFromAI()`.

What is missing is a shared format between the two sides and a transport that works across sites without a backend. This RFC adds both. It turns "augment one app" into "connect two apps", which is the strongest version of the agentlet promise: no backend change, no integration project.

## Constraints that shape the design

1. **No shared storage across sites in a bookmarklet.** `localStorage` is per origin. An agentlet.io iframe embedded in a host page gets partitioned storage in current Chrome and Safari, and many hosts forbid third-party frames. Without a server, the only store both sides can reach is the system clipboard.
2. **The clipboard holds one item at a time.** A list is one item that contains several records.
3. **Reading the clipboard needs a user gesture** and, in Chromium, a permission prompt for `navigator.clipboard.read()`. A `paste` event (the user presses Ctrl+V or Cmd+V) gives the data without a prompt.
4. **Custom clipboard formats are Chromium only.** `ClipboardItem` with a `web application/...` type works in Chromium 104 and later. Firefox and Safari only carry `text/plain`, `text/html` and images. The design must degrade, not fail.
5. **The clipboard is readable by any other app.** Records must never carry secrets.
6. **Pasted data is untrusted.** It comes from any page. It is data, never instructions, never selectors to run on the target.

## Design overview

```
source page                       clipboard                         target page
-----------                       ---------                         -----------
records.fromTable(el)    ->  web application/vnd.agentlet.record+json  ->  records.onPaste(cb)
records.fromForm(el)          text/html  (table or dl, record embedded)     records.match(record, form)
records.fromElement(el)       text/plain (TSV or "Label: value" lines)      records.fill(record, form)
records.create(type, data)                                                   preview, confirm, forms.fill()
```

Three layers:

1. **Format**: the record envelope and record types.
2. **Transport**: where records travel. Phase 1 ships the clipboard transport only, behind a small interface so the extension and native modes can add their own later.
3. **Mapping and fill**: matching record fields to the target form, previewing, filling through the existing `FormFiller`.

## The record envelope

```json
{
  "agentlet": "record",
  "version": 1,
  "type": "organization",
  "fields": {
    "organization": "Example SAS",
    "siren": "123456789",
    "street-address": "1 rue Exemple",
    "postal-code": "75001",
    "address-level2": "Paris",
    "country-name": "France"
  },
  "labels": {
    "siren": "SIREN"
  },
  "source": {
    "url": "https://annuaire-entreprises.data.gouv.fr/entreprise/123456789",
    "origin": "https://annuaire-entreprises.data.gouv.fr",
    "title": "Example SAS",
    "copiedAt": "2026-10-01T09:30:00.000Z"
  }
}
```

Rules:

- `fields` is flat: key to `string | number | boolean | null`. Nested data is out of scope for version 1; a list goes in a `table` record.
- Field keys use the HTML `autocomplete` token vocabulary whenever one fits (`name`, `given-name`, `email`, `tel`, `organization`, `street-address`, `postal-code`, `country-name`, `bday`, `url`...). This vocabulary is standard, already present on many real forms, and gives matching a strong first signal on the target. Other keys are free, lowercase, hyphenated (`siren`, `vat-number`, `invoice-number`).
- `labels` gives human labels for keys that are not self-explanatory. Used for the preview and the text fallbacks.
- `source` is set by the API, not by the caller, from the current page. It is shown to the user on paste.
- A `table` record carries `columns: string[]` and `rows: Array<Array<string | number | boolean | null>>` instead of `fields`.
- A list of records of the same type is written as one clipboard item: `{"agentlet": "records", "version": 1, "type": ..., "items": [...]}`.
- Size limit: 1 MB serialized. Larger payloads are rejected on copy with a clear error.
- `version` lets the format evolve. Readers ignore unknown top-level keys and reject unknown major versions.

## Record types

```ts
records.defineType({
  name: 'invoice',
  label: 'Invoice',
  fields: [
    { key: 'invoice-number', label: 'Invoice number', required: true },
    { key: 'organization', label: 'Supplier' },
    { key: 'total', label: 'Total', kind: 'number' },
    { key: 'currency', label: 'Currency' },
    { key: 'issue-date', label: 'Issue date', kind: 'date', synonyms: ['date de facture', 'invoice date'] }
  ]
});
```

- `kind`: `text` (default), `number`, `date`, `boolean`, `email`, `tel`, `url`. Used for validation and normalization on fill (for example a date written into an `input[type=date]` as `YYYY-MM-DD`).
- `synonyms` feed the label matcher.
- Built-in types in phase 1, all generic:
  - `table`: rows and columns;
  - `fields`: any key-value set, the default when no type is given;
  - `contact`, `address`, `organization`: thin types over the `autocomplete` vocabulary.
- Domain types (invoice, ticket, candidate) are defined by agentlets, not shipped in core.

## Sensitive data

- Never copied, even if the caller passes them: `input[type=password]`, fields with `autocomplete` `current-password`, `new-password`, `one-time-code`, and every `cc-*` token.
- Never filled from a record: the same set on the target side.
- `copy()` accepts `redact: string[]` to drop more keys.
- The docs state plainly that the clipboard is readable by other applications.

## Clipboard formats

`records.copy()` writes one clipboard item with up to three representations:

| Format | Content | Who reads it |
|---|---|---|
| `web application/vnd.agentlet.record+json` | the envelope | agentlet targets, Chromium only |
| `text/html` | a `<table>` for tables and lists, a `<dl>` for a single record, with the envelope embedded (see below) | spreadsheets, rich text editors, and agentlet targets on Firefox and Safari |
| `text/plain` | TSV for tables and lists, `Label: value` lines for a single record | everything else |

Embedding in `text/html`: the root element carries `data-agentlet-record` with the base64url-encoded envelope. Browsers sanitize HTML read through `navigator.clipboard.read()`, and some editors strip unknown attributes, so this path is best effort. Phase 1 starts with a short spike that records, per browser, which of these survive a copy then a `paste` event and a `clipboard.read()`. The results go into this RFC before the API is frozen.

Reading order on the target: custom format, then HTML embedding, then nothing. The API never guesses a record from plain text in phase 1; `fromText()` with AI is phase 2.

## API

```ts
interface RecordsAPI {
  // Types
  defineType(definition: RecordTypeDefinition): void;
  getType(name: string): RecordTypeDefinition | null;
  listTypes(): RecordTypeDefinition[];

  // Create records on the source page
  create(type: string, fields: Record<string, RecordValue>, options?: CreateOptions): AgentletRecord;
  fromForm(element: Element, options?: FromFormOptions): AgentletRecord;     // uses forms.quickExport()
  fromTable(table: HTMLTableElement, options?: FromTableOptions): AgentletRecord; // uses tables.extract()
  fromElement(element: Element, options?: FromElementOptions): AgentletRecord | null;
  // fromElement: table -> table record, form -> fromForm, dl / label-value pairs -> fields record
  pick(options?: PickOptions): Promise<AgentletRecord | null>;
  // pick: ElementSelector click-to-select, then fromElement

  // Transport
  copy(record: AgentletRecord | AgentletRecord[], options?: CopyOptions): Promise<CopyResult>;
  read(): Promise<AgentletRecord[] | null>;            // navigator.clipboard.read(), needs a user gesture
  fromPasteEvent(event: ClipboardEvent): AgentletRecord[] | null;
  onPaste(handler: (records: AgentletRecord[], event: ClipboardEvent) => void, options?: OnPasteOptions): () => void;
  // onPaste: listens on the document (or options.scope); only calls handler, and only calls
  // preventDefault(), when the paste carries a record; returns an unsubscribe function

  // Mapping and fill on the target page
  match(record: AgentletRecord, target: Element, options?: MatchOptions): FieldMapping;
  fill(record: AgentletRecord, target: Element, options?: RecordFillOptions): Promise<RecordFillResult>;
  // fill: match, then a preview dialog unless options.preview === false, then forms.fill()

  validate(value: unknown): { valid: true; record: AgentletRecord } | { valid: false; errors: string[] };
}
```

Key shapes:

```ts
type RecordValue = string | number | boolean | null;

interface FieldMapping {
  target: Element;
  entries: Array<{
    key: string;                 // record field key
    selector: string;            // computed on the target page, never taken from the record
    confidence: number;          // 0 to 1
    reason: 'remembered' | 'autocomplete' | 'name' | 'label' | 'type' | 'manual';
  }>;
  unmatchedKeys: string[];       // record fields with no target field
  unmatchedFields: string[];     // target selectors with no record field
}

interface RecordFillOptions {
  preview?: boolean;             // default true
  minConfidence?: number;        // default 0.6; below, the field is left for the user in the preview
  remember?: boolean;            // default true, see mapping memory
  fill?: FormFillOptions;        // forwarded to forms.fill()
}

interface RecordFillResult extends FormFillResult {
  mapping: FieldMapping;
  confirmed: boolean;            // false if the user cancelled the preview
}
```

Events on `window.agentlet.eventBus`: `records:copied`, `records:pasted`, `records:filled`, each with the record type, the field count and the source origin, never the values.

## Matching

`match()` scores each target field against each record key, then assigns greedily from the highest score. Signals, strongest first:

1. **Remembered mapping** for this record type and this target form (see below): confidence 1.
2. **`autocomplete` attribute** on the target equals the record key: 0.95.
3. **`name` or `id`** equals the key after normalization (lowercase, separators removed, `camelCase` split): 0.85.
4. **Label text** (the `label` from `forms.quickExport()`, then `aria-label`, then `placeholder`) matches the key, its label or a synonym after normalization (accents removed, case folded): 0.75. Phase 1 ships English and French synonyms for the built-in keys.
5. **Input type** compatibility (`email`, `tel`, `url`, `date`, `number`) as a tie breaker and a veto: a `number` value never goes into an `input[type=email]`.

Select elements match on option value first, then option text. Checkboxes take booleans and the strings `yes`, `true`, `1`, `oui`.

### Mapping memory

When the user corrects a mapping in the preview, the correction is saved on the target origin with `storage.local`, keyed by record type and a form signature (form `action` path plus the sorted list of field names). The next paste of the same type into the same form is exact. Nothing leaves the target origin.

## Preview dialog

`fill()` shows a dialog built on the existing `Dialog` utility:

- the source: origin, page title, how long ago it was copied;
- one row per record field: value, the target field it maps to (a select to change it), the confidence;
- unmatched record fields listed separately;
- Fill and Cancel. Fill never submits the form.

Agentlets that want their own UI call `match()`, show their own preview, then `forms.fill()` themselves.

## Transports

```ts
interface RecordTransport {
  name: string;
  write(payload: RecordPayload): Promise<void>;
  read(): Promise<RecordPayload | null>;
}
```

Phase 1 ships `clipboard` and keeps the interface internal. Phase 3 opens it:

- extension mode: `chrome.storage.local` gives a shared basket and a history across sites;
- native mode: the host app passes its own store.

## Phases

1. **Phase 1, core API, no AI** (2.3.0)
   - Clipboard spike per browser, results added to this RFC.
   - Envelope, validation, `defineType` and the built-in types.
   - `create`, `fromForm`, `fromTable`, `fromElement`, `pick`.
   - `copy`, `read`, `fromPasteEvent`, `onPaste`.
   - Rule-based `match`, mapping memory, preview dialog, `fill`.
   - Sensitive data rules, events, public types, unit tests, one example page.
2. **Phase 2, AI assisted** (opt-in, uses `ai.sendPrompt()`, bring your own key)
   - `fromElement(el, { ai: true })` and `fromText(text, type)`: extract a typed record from free text or a screenshot.
   - `match(record, target, { ai: true })`: map the low-confidence fields.
   - The preview states what was sent to the AI provider.
3. **Phase 3, transports**
   - Extension transport with a basket and a history.
   - Native transport.

## Example

Source page, a company registry:

```js
const record = window.agentlet.records.create('organization', {
  organization: document.querySelector('h1').textContent.trim(),
  siren: document.querySelector('[data-siren]').dataset.siren,
});
await window.agentlet.records.copy(record);
window.agentlet.utils.MessageBubble.success('Copied. Paste it into any form.');
```

Target page, an ERP supplier form:

```js
window.agentlet.records.onPaste(async ([record]) => {
  const form = document.querySelector('form#supplier');
  const result = await window.agentlet.records.fill(record, form);
  if (result.confirmed) {
    window.agentlet.utils.MessageBubble.success(`${result.successful} fields filled`);
  }
}, { types: ['organization'] });
```

Pasting the same record into a spreadsheet gives a two-column table, with no agentlet involved.

## Alternatives considered

- **A storage hub on agentlet.io in an iframe.** Rejected: partitioned storage, frame restrictions on hosts, and a hard dependency on one domain.
- **A backend relay.** Rejected for core: it breaks "no backend", and it moves user data to a server. A native host can still plug its own store through the phase 3 transport.
- **Only `text/plain` with a marker.** Rejected: it pollutes every paste with machine text.
- **Carrying selectors in the record.** Rejected: target selectors must be computed on the target, from the target DOM. A record is data only.

## Open questions

1. Name: `records` (current choice) or `handoff`. `clipboard` was rejected because the clipboard is only the phase 1 transport.
2. Should `contact`, `address` and `organization` stay in core, or move to an optional types package?
3. Should `onPaste` intercept pastes inside text inputs too, or only when the focus is outside an editable field? Current choice: inside the target form only, and only when the paste carries a record.
4. Spike outcome: if `text/html` embedding does not survive in Firefox or Safari, smart paste there needs a panel button and `clipboard.read()`, or stays Chromium only in phase 1.
