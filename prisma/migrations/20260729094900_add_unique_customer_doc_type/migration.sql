-- Step 1: Remove duplicate documents, keeping only the most recently submitted
-- one per (customer_id, doc_type) pair before adding the unique constraint.
DELETE FROM documents
WHERE id NOT IN (
  SELECT DISTINCT ON (customer_id, doc_type) id
  FROM documents
  ORDER BY customer_id, doc_type, submitted_at DESC
);

-- Step 2: Add the unique constraint so future upserts work correctly.
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_doc_type_key" UNIQUE ("customer_id", "doc_type");
