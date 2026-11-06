-- Mercado: vendas em reais só pelo Stripe. Anúncios por Pix ainda à venda saem da vitrine e o item volta
-- para o vendedor coletar (como um anúncio vencido). Compras por Pix já reservadas seguem o fluxo antigo até terminar.
UPDATE market_listings SET status = 'expired', closed_at = now()
WHERE status = 'active' AND pay_mode = 'pix';
