-- docs/04-database-schema.md §6. Caps category hierarchy at one level: a
-- category can't be given a parent that itself already has a parent.
-- Hand-authored because Drizzle's schema DSL has no trigger builder.
CREATE FUNCTION enforce_category_depth() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Kategori hanya boleh satu tingkat kedalaman';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER categories_depth_check
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();
