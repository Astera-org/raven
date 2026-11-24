-- Custom SQL migration file, put your code below! --

-- `references`.`url` must compare case-sensitively: some sources (e.g. YouTube)
-- mint URLs whose casing is significant, so the database default collation
-- (utf8mb4_unicode_ci, case-insensitive) causes distinct URLs to collide on
-- the UNIQUE(url) constraint and on WHERE url IN (...) lookups. This can't be
-- expressed in schema.ts (drizzle-orm's mysql-core varchar() has no collate
-- option), so it's applied here as a hand-written migration instead of a
-- generated one. Any future migration that touches this column must restate
-- COLLATE utf8mb4_bin or it will silently revert to the table default.
ALTER TABLE `references`
  MODIFY COLUMN `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
