/**
 * @file Create the `document_metadata` table.
 *
 * Holds the structured metadata for a document: audience restrictions,
 * tags, extracted dates, and AI-extracted entities. Required by the
 * `POST /documents` contract (`.agent/api/API_SPEC_SHEET.md` §6).
 * See `.agent/architecture/TECHNICAL_SPEC.md` §5 (Document Metadata model).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('document_metadata', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'documents',
      onDelete: 'CASCADE',
    },
    academic_year: {
      type: 'text',
    },
    course: {
      type: 'text',
    },
    semester: {
      type: 'integer',
    },
    audience: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    tags: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
    },
    entities: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    extracted_dates: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
    },
    extra: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('document_metadata');
};
