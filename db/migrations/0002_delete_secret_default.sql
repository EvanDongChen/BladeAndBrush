-- The initial submit path omits delete_secret; default it server-side.
ALTER TABLE gallery_entries ALTER COLUMN delete_secret SET DEFAULT gen_random_uuid();
