-- Include existing uploads, including hidden records, in each Shanghai calendar month.
INSERT INTO quotas (id, bytes, count)
SELECT 'upload-month:' || strftime('%Y-%m', created_at / 1000, 'unixepoch', '+8 hours'), SUM(size), COUNT(*)
FROM files
GROUP BY strftime('%Y-%m', created_at / 1000, 'unixepoch', '+8 hours')
ON CONFLICT(id) DO NOTHING;
