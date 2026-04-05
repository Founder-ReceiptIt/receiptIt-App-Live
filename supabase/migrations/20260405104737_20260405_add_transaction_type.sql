/*
  # Add Transaction Type Column

  1. New Column
    - `transaction_type` (text, default='purchase')
      - 'purchase': Normal receipt/purchase
      - 'return': Return confirmation/documentation
      - 'refund': Refund confirmation/documentation

  2. Purpose
    - Distinguish between purchases and return/refund documents
    - Allows wallet to exclude returns/refunds from spend calculations
    - Makes return-related records understandable and properly categorized

  3. Behavior
    - Purchases (transaction_type='purchase') show in main wallet
    - Returns/Refunds (transaction_type='return'|'refund') appear separately or in a returns section
    - Return/refund amounts do not contribute to wallet total
*/

ALTER TABLE receipts
ADD COLUMN transaction_type text DEFAULT 'purchase';

CREATE INDEX idx_receipts_transaction_type ON receipts(user_id, transaction_type);
