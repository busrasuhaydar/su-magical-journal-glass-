-- Eser başına sayfa/fikir: sayfa bir NFT eserine bağlanabilir (artwork_key = "sözleşme-tokenId", küçük harf).
alter table pages add column if not exists artwork_key text;
create index if not exists pages_artwork on pages (artwork_key) where artwork_key is not null;
