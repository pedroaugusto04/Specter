UPDATE "scraping_jobs"
SET "extraction_plan" = jsonb_set("extraction_plan", '{intent}', ("extraction_plan"->'intent') - 'filters')
WHERE "extraction_plan" IS NOT NULL AND ("extraction_plan"->'intent') ? 'filters';
