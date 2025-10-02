BEGIN;

-- 1. Add image fields to clarifications table
ALTER TABLE clarifications 
ADD COLUMN image_url_main TEXT,
ADD COLUMN image_url_qualifying TEXT,
ADD COLUMN sign TEXT;

-- 2. Copy image data from orders to clarifications
UPDATE clarifications 
SET 
  image_url_main = o.image_url_main,
  image_url_qualifying = o.image_url_qualifying,
  sign = o.sign
FROM orders o
WHERE clarifications.order_id = o.id;

-- 3. Remove image fields from orders table
ALTER TABLE orders 
DROP COLUMN image_url_main,
DROP COLUMN image_url_qualifying,
DROP COLUMN sign;

-- 4. Add indexes for the new fields in clarifications
CREATE INDEX idx_clarifications_image_url_main ON clarifications(image_url_main);
CREATE INDEX idx_clarifications_image_url_qualifying ON clarifications(image_url_qualifying);

COMMIT;