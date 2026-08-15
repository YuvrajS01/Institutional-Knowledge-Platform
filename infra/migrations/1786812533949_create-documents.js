/**
 * @file Create the `documents` and `document_versions` tables.
 *
 * A document is the institutional record; every upload/edit produces a new
 * version. `documents.current_version_id` is a circular FK to
 * `document_versions`, added after both tables exist.
 *
 * See `.agent/architecture/TECHNICAL_SPEC.md` §5 (Document / Document
 * Version models), §9 (lifecycle: DRAFT → IN_REVIEW → APPROVED → PUBLISHED
 * → SUPERSEDED → ARCHIVED) and `.agent/AGENTS.md` §7.5 (preserve historical
 * document versions — never delete them).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createType('document_type', [
    'NOTICE',
    'CIRCULAR',
    'POLICY',
    'FORM',
    'SCHEDULE',
    'REPORT',
    'OTHER',
  ]);
  pgm.createType('document_status', [
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'PUBLISHED',
    'SUPERSEDED',
    'ARCHIVED',
  ]);

  pgm.createTable('documents', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    institution_id: {
      type: 'uuid',
      notNull: true,
      references: 'institutions',
      onDelete: 'CASCADE',
    },
    current_version_id: {
      type: 'uuid',
    },
    title: {
      type: 'text',
      notNull: true,
    },
    slug: {
      type: 'text',
      notNull: true,
    },
    document_type: {
      type: 'document_type',
      notNull: true,
      default: 'NOTICE',
    },
    status: {
      type: 'document_status',
      notNull: true,
      default: 'DRAFT',
    },
    department_id: {
      type: 'uuid',
      references: 'departments',
      onDelete: 'SET NULL',
    },
    published_at: {
      type: 'timestamptz',
    },
    effective_from: {
      type: 'timestamptz',
    },
    effective_to: {
      type: 'timestamptz',
    },
    created_by: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
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

  pgm.createIndex('documents', ['institution_id', 'status']);
  pgm.createIndex('documents', ['institution_id', 'department_id']);
  pgm.createIndex('documents', ['institution_id', 'published_at']);
  pgm.createIndex('documents', ['institution_id', 'slug'], {
    name: 'documents_institution_slug_unique',
    unique: true,
  });
  pgm.createIndex('documents', 'status');

  pgm.createTable('document_versions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
    },
    version_number: {
      type: 'integer',
      notNull: true,
    },
    storage_key: {
      type: 'text',
      notNull: true,
    },
    mime_type: {
      type: 'text',
      notNull: true,
    },
    size_bytes: {
      type: 'bigint',
      notNull: true,
    },
    sha256: {
      type: 'text',
      notNull: true,
    },
    extracted_text: {
      type: 'text',
    },
    ocr_status: {
      type: 'text',
    },
    page_count: {
      type: 'integer',
    },
    created_by: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('document_versions', ['document_id', 'version_number'], {
    name: 'document_versions_document_version_unique',
    unique: true,
  });
  pgm.createIndex('document_versions', 'storage_key', {
    name: 'document_versions_storage_key_unique',
    unique: true,
  });
  pgm.createIndex('document_versions', 'document_id');

  pgm.addConstraint('documents', 'documents_current_version_id_fkey', {
    foreignKeys: {
      columns: 'current_version_id',
      references: 'document_versions',
      onDelete: 'SET NULL',
    },
  });
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropConstraint('documents', 'documents_current_version_id_fkey');
  pgm.dropTable('document_versions');
  pgm.dropTable('documents');
  pgm.dropType('document_status');
  pgm.dropType('document_type');
};
