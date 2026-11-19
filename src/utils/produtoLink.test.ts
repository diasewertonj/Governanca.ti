import { describe, expect, it } from 'vitest';
import { enderecoBloqueado, extrairDadosProduto, lerPreco } from '../../supabase/functions/dados-do-link/extrair.ts';

describe('Seção 14 · dados do produto pelo link', () => {
  it('lê JSON-LD de produto (nome, marca, modelo, preço, imagem)', () => {
    const html = `<html><head><title>Loja</title>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},
        {"@type":"Product","name":"Monitor LG 27&quot; 4K","brand":{"@type":"Brand","name":"LG"},"mpn":"27UP850",
         "image":["https://img.loja.test/m.jpg"],"offers":{"@type":"Offer","price":"1899.90","priceCurrency":"BRL"}}]}</script>
      </head></html>`;
    expect(extrairDadosProduto(html, 'https://www.loja.test/p/1')).toEqual({
      nome: 'Monitor LG 27" 4K',
      marca: 'LG',
      modelo: '27UP850',
      preco: 1899.9,
      moeda: 'BRL',
      imagem: 'https://img.loja.test/m.jpg',
      loja: 'loja.test',
    });
  });

  it('sem JSON-LD, usa Open Graph e metatags de preço', () => {
    const html = `<meta content="Teclado Logitech K270" property="og:title"><meta property="og:image" content="/img/k270.png">
      <meta property="product:price:amount" content="149,90"><meta property="og:site_name" content="Kalunga">`;
    const d = extrairDadosProduto(html, 'https://www.kalunga.test/k270');
    expect(d.nome).toBe('Teclado Logitech K270');
    expect(d.preco).toBe(149.9);
    expect(d.imagem).toBe('https://www.kalunga.test/img/k270.png');
    expect(d.loja).toBe('Kalunga');
  });

  it('JSON-LD inválido não derruba a leitura; imagem http é descartada', () => {
    const html = `<script type="application/ld+json">{quebrado</script><title>Cadeira</title><meta property="og:image" content="http://x.test/a.jpg">`;
    const d = extrairDadosProduto(html, 'http://x.test/');
    expect(d.nome).toBe('Cadeira');
    expect(d.imagem).toBeUndefined();
  });

  it('entende preços no formato brasileiro e internacional', () => {
    expect(lerPreco('R$ 1.299,90')).toBe(1299.9);
    expect(lerPreco('1299.90')).toBe(1299.9);
    expect(lerPreco('1.299')).toBe(1299);
    expect(lerPreco(0)).toBeUndefined();
  });

  it('bloqueia endereços internos (SSRF)', () => {
    for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.10', '169.254.169.254', '[::1]', 'fd00::1', 'metadata.google.internal'])
      expect(enderecoBloqueado(h)).toBe(true);
    for (const h of ['www.kabum.com.br', '8.8.8.8', '172.32.0.1']) expect(enderecoBloqueado(h)).toBe(false);
  });
});
