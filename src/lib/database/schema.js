import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const scans = sqliteTable('scans', {
	id: text().primaryKey(),
	data: text().notNull(),
	scan_group_id: text()
		.notNull()
		.references(() => scanGroups.id),
	scan_type: text().notNull(),

	createdAt: text('created_at')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull()
});

export const scanGroups = sqliteTable('scan_groups', {
	id: text().primaryKey(),
	public: integer().notNull().default(0),
	system: text(),

	createdAt: text('created_at')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull()
});
