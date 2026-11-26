-- Run this only against the SQL database configured for the staging slot.
-- Adds four sample products without deleting or changing existing data.
INSERT INTO webapp_details.Products (Name, Description, Price, StockQuantity, ImageUrl)
SELECT source.Name, source.Description, source.Price, source.StockQuantity, NULL
FROM (VALUES
    ('Portable Bluetooth Speaker', 'Compact wireless speaker with rich sound and all-day battery life.', CAST(2899.00 AS DECIMAL(10,2)), 30),
    ('1080p Webcam', 'Full HD webcam with a privacy cover and built-in stereo microphone.', CAST(3299.00 AS DECIMAL(10,2)), 22),
    ('Wireless Charging Pad', 'Fast Qi wireless charging pad with a soft-touch, non-slip finish.', CAST(1199.00 AS DECIMAL(10,2)), 45),
    ('USB-C Power Bank', 'Slim 20,000 mAh power bank with USB-C fast charging.', CAST(2499.00 AS DECIMAL(10,2)), 18)
) AS source(Name, Description, Price, StockQuantity)
WHERE NOT EXISTS (
    SELECT 1 FROM webapp_details.Products AS existing WHERE existing.Name = source.Name
);
GO
