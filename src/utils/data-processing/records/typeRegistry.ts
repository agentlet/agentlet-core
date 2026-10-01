/**
 * Record types: the built-in ones on the HTML `autocomplete` vocabulary, the
 * English and French synonyms the label matcher uses, and the registry
 * behind `records.defineType()`.
 */
import type { RecordFieldDefinition, RecordFieldKind, RecordTypeDefinition } from '../../../types/public-api';
import { humanize, normalizeText } from './text.js';

const KINDS: ReadonlySet<string> = new Set(['text', 'number', 'date', 'boolean', 'email', 'tel', 'url']);

const TYPE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const FIELD_KEY_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;

interface KnownKey {
    label: string;
    kind?: RecordFieldKind;
    /** English and French label texts, written naturally: they are normalized when compared. */
    synonyms: string[];
}

/**
 * Keys of the `autocomplete` vocabulary the built-in types use. The
 * synonyms apply to a key in any record, whatever its type, so a `fields`
 * record with an `email` key still matches a field labelled "Courriel".
 */
export const KNOWN_KEYS: Readonly<Record<string, KnownKey>> = {
    'name': { label: 'Name', synonyms: ['full name', 'nom', 'nom complet', 'nom et prénom', 'prénom et nom'] },
    'given-name': { label: 'First name', synonyms: ['first name', 'given name', 'forename', 'prénom'] },
    'family-name': { label: 'Last name', synonyms: ['last name', 'family name', 'surname', 'nom de famille', 'nom'] },
    'email': { label: 'Email', kind: 'email', synonyms: ['e-mail', 'mail', 'courriel', 'email address', 'adresse email', 'adresse e-mail', 'adresse mail'] },
    'tel': { label: 'Phone', kind: 'tel', synonyms: ['phone', 'telephone', 'phone number', 'tel', 'mobile', 'portable', 'téléphone', 'numéro de téléphone', 'téléphone portable'] },
    'organization': {
        label: 'Organization',
        synonyms: [
            'organisation', 'company', 'company name', 'business', 'société', 'entreprise', 'raison sociale',
            'nom de l\'entreprise', 'nom de la société', 'supplier', 'supplier name', 'fournisseur', 'legal name',
            'dénomination', 'dénomination sociale'
        ]
    },
    'organization-title': { label: 'Job title', synonyms: ['job title', 'position', 'role', 'poste', 'fonction', 'titre du poste'] },
    'url': { label: 'Website', kind: 'url', synonyms: ['website', 'web site', 'site web', 'site internet', 'site', 'homepage', 'lien'] },
    'street-address': { label: 'Street address', synonyms: ['address', 'street', 'adresse', 'adresse postale', 'rue', 'voie'] },
    'address-line1': { label: 'Address line 1', synonyms: ['address 1', 'address line 1', 'adresse 1', 'adresse ligne 1', 'ligne 1'] },
    'address-line2': { label: 'Address line 2', synonyms: ['address 2', 'address line 2', 'adresse 2', 'adresse ligne 2', 'complément d\'adresse', 'complément', 'ligne 2'] },
    'postal-code': { label: 'Postal code', synonyms: ['zip', 'zip code', 'postcode', 'post code', 'code postal', 'cp'] },
    'address-level2': { label: 'City', synonyms: ['city', 'town', 'ville', 'commune', 'localité'] },
    'address-level1': { label: 'State or region', synonyms: ['state', 'province', 'region', 'région', 'département'] },
    'country-name': { label: 'Country', synonyms: ['country', 'pays', 'country name', 'nom du pays'] },
    'country': { label: 'Country code', synonyms: ['country code', 'code pays'] },
    'bday': { label: 'Birthday', kind: 'date', synonyms: ['birthday', 'birth date', 'date of birth', 'date de naissance', 'naissance'] },
    'username': { label: 'Username', synonyms: ['user name', 'login', 'identifiant', 'nom d\'utilisateur'] }
};

function fieldFromKnownKey(key: string): RecordFieldDefinition {
    const known = KNOWN_KEYS[key];
    const field: RecordFieldDefinition = { key, label: known.label, synonyms: [...known.synonyms] };
    if (known.kind) field.kind = known.kind;
    return field;
}

function builtInType(name: string, label: string, keys: string[]): RecordTypeDefinition {
    return { name, label, fields: keys.map(fieldFromKnownKey) };
}

const BUILT_IN_TYPES: RecordTypeDefinition[] = [
    { name: 'table', label: 'Table', fields: [] },
    { name: 'fields', label: 'Fields', fields: [] },
    builtInType('contact', 'Contact', ['name', 'given-name', 'family-name', 'email', 'tel', 'organization', 'organization-title', 'url']),
    builtInType('address', 'Address', ['street-address', 'address-line1', 'address-line2', 'postal-code', 'address-level2', 'address-level1', 'country-name']),
    builtInType('organization', 'Organization', ['organization', 'url', 'email', 'tel', 'street-address', 'postal-code', 'address-level2', 'country-name'])
];

const BUILT_IN_NAMES: ReadonlySet<string> = new Set(BUILT_IN_TYPES.map(type => type.name));

function cloneType(type: RecordTypeDefinition): RecordTypeDefinition {
    return {
        name: type.name,
        ...(type.label !== undefined ? { label: type.label } : {}),
        fields: type.fields.map(field => ({
            key: field.key,
            ...(field.label !== undefined ? { label: field.label } : {}),
            ...(field.kind !== undefined ? { kind: field.kind } : {}),
            ...(field.required !== undefined ? { required: field.required } : {}),
            ...(field.synonyms !== undefined ? { synonyms: [...field.synonyms] } : {})
        }))
    };
}

/** Throws a descriptive `Error` when `definition` is not a usable record type. */
function assertValidDefinition(definition: unknown): asserts definition is RecordTypeDefinition {
    if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
        throw new Error('defineType() needs a type definition object');
    }
    const candidate = definition as Partial<RecordTypeDefinition>;
    if (typeof candidate.name !== 'string' || !TYPE_NAME_PATTERN.test(candidate.name)) {
        throw new Error('Record type name must be lowercase letters, digits and hyphens, starting with a letter');
    }
    if (BUILT_IN_NAMES.has(candidate.name)) {
        throw new Error(`Record type "${candidate.name}" is built in and cannot be redefined`);
    }
    if (candidate.label !== undefined && typeof candidate.label !== 'string') {
        throw new Error('Record type label must be a string');
    }
    if (!Array.isArray(candidate.fields)) {
        throw new Error('Record type needs a fields array');
    }
    const seen = new Set<string>();
    for (const field of candidate.fields as unknown[]) {
        if (typeof field !== 'object' || field === null) {
            throw new Error('Every record type field must be an object');
        }
        const entry = field as Partial<RecordFieldDefinition>;
        if (typeof entry.key !== 'string' || !FIELD_KEY_PATTERN.test(entry.key)) {
            throw new Error(`Invalid field key: ${String(entry.key)}`);
        }
        if (seen.has(entry.key)) {
            throw new Error(`Duplicate field key: ${entry.key}`);
        }
        seen.add(entry.key);
        if (entry.kind !== undefined && !KINDS.has(entry.kind)) {
            throw new Error(`Invalid kind for field ${entry.key}: ${String(entry.kind)}`);
        }
        if (entry.label !== undefined && typeof entry.label !== 'string') {
            throw new Error(`Label of field ${entry.key} must be a string`);
        }
        if (entry.synonyms !== undefined && (!Array.isArray(entry.synonyms) || entry.synonyms.some(item => typeof item !== 'string'))) {
            throw new Error(`Synonyms of field ${entry.key} must be an array of strings`);
        }
    }
}

/** True when `key` is usable as a record field key. */
export function isValidFieldKey(key: string): boolean {
    return FIELD_KEY_PATTERN.test(key);
}

/** True when `name` is usable as a record type name. */
export function isValidTypeName(name: string): boolean {
    return TYPE_NAME_PATTERN.test(name);
}

/** Built-in types plus the ones added by `defineType()`. */
export class RecordTypeRegistry {
    private readonly types = new Map<string, RecordTypeDefinition>();

    constructor() {
        BUILT_IN_TYPES.forEach(type => this.types.set(type.name, cloneType(type)));
    }

    define(definition: RecordTypeDefinition): void {
        assertValidDefinition(definition);
        this.types.set(definition.name, cloneType(definition));
    }

    get(name: string): RecordTypeDefinition | null {
        const type = this.types.get(name);
        return type ? cloneType(type) : null;
    }

    list(): RecordTypeDefinition[] {
        return Array.from(this.types.values()).map(cloneType);
    }

    /** Label texts, already normalized, that identify `key` in a record of `typeName`. */
    labelCandidates(key: string, typeName: string, recordLabel?: string): Set<string> {
        const candidates = new Set<string>([normalizeText(key)]);
        const add = (text: string | undefined) => {
            const normalized = text ? normalizeText(text) : '';
            if (normalized) candidates.add(normalized);
        };
        add(recordLabel);
        const known = KNOWN_KEYS[key];
        if (known) {
            add(known.label);
            known.synonyms.forEach(add);
        }
        const field = this.types.get(typeName)?.fields.find(entry => entry.key === key);
        if (field) {
            add(field.label);
            field.synonyms?.forEach(add);
        }
        return candidates;
    }

    /** The label texts that are synonyms (not the key itself): used to also accept a field `name` such as `raison_sociale`. */
    synonymCandidates(key: string, typeName: string): Set<string> {
        const all = this.labelCandidates(key, typeName);
        all.delete(normalizeText(key));
        return all;
    }

    kindFor(key: string, typeName: string): RecordFieldKind | undefined {
        const field = this.types.get(typeName)?.fields.find(entry => entry.key === key);
        return field?.kind ?? KNOWN_KEYS[key]?.kind;
    }

    /** Label shown for a key: the record's own label, the type's, a known one, or the humanized key. */
    labelFor(key: string, typeName: string, recordLabel?: string): string {
        if (recordLabel) return recordLabel;
        const field = this.types.get(typeName)?.fields.find(entry => entry.key === key);
        return field?.label ?? KNOWN_KEYS[key]?.label ?? humanize(key);
    }
}

let reverseIndex: Map<string, string> | null = null;

/**
 * The `autocomplete` key a label text stands for, if any: "Raison sociale"
 * gives `organization`, "Courriel" gives `email`. First key wins when a
 * synonym is shared (for example "nom").
 */
export function knownKeyForLabel(label: string): string | null {
    if (!reverseIndex) {
        reverseIndex = new Map();
        for (const [key, known] of Object.entries(KNOWN_KEYS)) {
            for (const text of [key, known.label, ...known.synonyms]) {
                const normalized = normalizeText(text);
                if (normalized && !reverseIndex.has(normalized)) reverseIndex.set(normalized, key);
            }
        }
    }
    return reverseIndex.get(normalizeText(label)) ?? null;
}
