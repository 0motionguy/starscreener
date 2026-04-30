-- x402-volume.sql
-- 12-month x402 settlement volume by day by facilitator on Base.
-- Replaces public Dune query 6240463 (which has a SQL syntax error).
--
-- USAGE:
--   1. Paste this into https://dune.com/queries → save as a private query.
--   2. Note the numeric query id from the URL.
--   3. Run: node scripts/fetch-dune-x402.mjs --query-id <ID>
--
-- TODO(solana): Solana spellbook does not expose SPL transfer enrichment
-- with the same coverage as Base. Mirror this query once tokens_solana.transfers
-- (or equivalent) is available.

WITH facilitators(address, name) AS (
  VALUES
    -- Coinbase
    (0xdbdf3d8ed80f84c35d01c6c9f9271761bad90ba6, 'Coinbase'),
    (0x9aae2b0d1b9dc55ac9bab9556f9a26cb64995fb9, 'Coinbase'),
    (0x3a70788150c7645a21b95b7062ab1784d3cc2104, 'Coinbase'),
    (0x708e57b6650a9a741ab39cae1969ea1d2d10eca1, 'Coinbase'),
    (0xce82eeec8e98e443ec34fda3c3e999cbe4cb6ac2, 'Coinbase'),
    (0x7f6d822467df2a85f792d4508c5722ade96be056, 'Coinbase'),
    -- Thirdweb
    (0x80c08de1a05df2bd633cf520754e40fde3c794d3, 'Thirdweb'),
    (0xaaca1ba9d2627cbc0739ba69890c30f95de046e4, 'Thirdweb'),
    (0xa1822b21202a24669eaf9277723d180cd6dae874, 'Thirdweb'),
    (0xec10243b54df1a71254f58873b389b7ecece89c2, 'Thirdweb'),
    (0x052aaae3cad5c095850246f8ffb228354c56752a, 'Thirdweb'),
    (0x91ddea05f741b34b63a7548338c90fc152c8631f, 'Thirdweb'),
    -- Heurist
    (0xb578b7db22581507d62bdbeb85e06acd1be09e11, 'Heurist'),
    (0x021cc47adeca6673def958e324ca38023b80a5be, 'Heurist'),
    (0x3f61093f61817b29d9556d3b092e67746af8cdfd, 'Heurist'),
    (0x290d8b8edcafb25042725cb9e78bcac36b8865f8, 'Heurist'),
    (0x612d72dc8402bba997c61aa82ce718ea23b2df5d, 'Heurist'),
    (0x1fc230ee3c13d0d520d49360a967dbd1555c8326, 'Heurist'),
    -- CodeNut
    (0x8d8fa42584a727488eeb0e29405ad794a105bb9b, 'CodeNut'),
    (0x87af99356d774312b73018b3b6562e1ae0e018c9, 'CodeNut'),
    (0x65058cf664d0d07f68b663b0d4b4f12a5e331a38, 'CodeNut'),
    (0x88e13d4c764a6c840ce722a0a3765f55a85b327e, 'CodeNut')
)

SELECT
  DATE_TRUNC('day', tt.evt_block_time) AS day,
  f.name                                AS facilitator,
  COUNT(*)                              AS tx_count,
  SUM(CAST(tt.value AS DOUBLE) / 1e6)   AS volume_usdc
FROM tokens_base.transfers tt
JOIN facilitators f ON f.address = tt."from"
WHERE tt.contract_address = 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913  -- USDC on Base
  AND tt.evt_block_time >= NOW() - INTERVAL '365' DAY
GROUP BY 1, 2
ORDER BY 1 ASC, 2 ASC;
