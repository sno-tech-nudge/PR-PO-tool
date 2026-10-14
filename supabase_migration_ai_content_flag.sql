-- Marks a receipt or bill image that is clearly AI-generated: 'metadata' when the
-- file itself says so (an AI-generation tag in its embedded data), 'model' when the
-- reader was certain from the picture. Empty for everything else. A small label only;
-- it never blocks anything.
ALTER TABLE expense_captures ADD COLUMN IF NOT EXISTS ai_content_flag text;
