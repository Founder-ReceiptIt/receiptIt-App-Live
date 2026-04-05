/*
  # Add Receipt Type and Source Categorization

  1. New Columns
    - `receipt_type` (text): Categorizes the type of purchase proof
      - 'receipt': Traditional till/POS receipt
      - 'invoice': Formal invoice (Amazon, online retailer)
      - 'order_confirmation': Order/delivery confirmation
      - 'statement': Account/transaction statement
      - 'proof_of_purchase': Other valid proof format
    - `source` (text): Where the purchase proof came from
      - 'upload': User uploaded file
      - 'email': From email/forwarded
      - 'account': From retailer account system
      - 'scanner': From camera/scanner app
    - `retailer_name` (text, nullable): Clean retailer/merchant identifier
    - `order_reference` (text, nullable): Order number, confirmation, or transaction ID
    - `is_financial_record` (boolean): Whether this should count as primary spend record vs. proof-oriented

  2. Purpose
    - Support diverse retailer proof formats (Amazon, supermarket, marketplace)
    - Track where/how proof came from
    - Distinguish between primary spend records and proof-oriented items
    - Enable future warranty/dispute support
    - Keep wallet financially accurate

  3. Behavior
    - All receipt types treated as valuable proof
    - is_financial_record determines wallet display prominence
    - order_reference enables better deduplication across order systems
    - Supports both classic receipts and modern account-based proof
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'receipt_type'
  ) THEN
    ALTER TABLE receipts ADD COLUMN receipt_type text DEFAULT 'receipt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'source'
  ) THEN
    ALTER TABLE receipts ADD COLUMN source text DEFAULT 'upload';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'retailer_name'
  ) THEN
    ALTER TABLE receipts ADD COLUMN retailer_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'order_reference'
  ) THEN
    ALTER TABLE receipts ADD COLUMN order_reference text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'is_financial_record'
  ) THEN
    ALTER TABLE receipts ADD COLUMN is_financial_record boolean DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receipts_receipt_type_idx ON receipts(user_id, receipt_type);
CREATE INDEX IF NOT EXISTS receipts_order_reference_idx ON receipts(user_id, order_reference) WHERE order_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS receipts_retailer_idx ON receipts(user_id, retailer_name) WHERE retailer_name IS NOT NULL;
