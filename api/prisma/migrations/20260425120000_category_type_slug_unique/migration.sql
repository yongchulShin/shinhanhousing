-- DropIndex: slug alone cannot be unique when forged and aluminum share the same slugs (e.g. gates).
DROP INDEX `categories_slug_key` ON `categories`;

-- CreateIndex
CREATE UNIQUE INDEX `categories_type_slug_key` ON `categories`(`type`, `slug`);
