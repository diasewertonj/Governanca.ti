import { describe, expect, it } from 'vitest';
import { chaveNome, lerGoogle, lerMicrosoft } from './importarLicencas.ts';

const CSV_MS = `"Nome do produto (inclui nomes personalizados)","Tipo de conta","Licenças atribuídas","Licenças disponíveis","Conta de cobrança","Frequência de cobrança","Perfil de cobrança","Status do perfil de cobrança","Possui complementos","Data da próxima fatura","Modelo de preço","Tipo de produto","Canal de compra","Data da compra","Quantidade comprada","Cobrança recorrente","Data de renovação ou de validade","Status da assinatura","ID do Locatário"
"Microsoft 365 Apps for business","Organizacional","6","0","EMPRESA X","Pague mensalmente.","Revenda Y","Não disponível","Não disponível","06/12/2026","Pago","Baseado em licença","Direto","22/07/2024","6","Habilitado","21/07/2027","Ativo","t"
"Microsoft 365 F1","Organizacional","36","19","EMPRESA X","Pague mensalmente.","Revenda Y","Não disponível","Não disponível","06/12/2026","Pago","Baseado em licença","Direto","22/07/2024","55","Habilitado","21/07/2027","Ativo","t"`;

const GOOGLE = `Assinaturas
Nome
Status
Licenças
Plano de pagamento
Pagamento pendente

[Chrome Enterprise Core](https://admin.google.com/ac/billing/subscriptions/AAA)
Ativo
Todos os licenças
Free Plan
Edição gratuita (sem cobranças)

[Cloud Identity Free](https://admin.google.com/ac/billing/subscriptions/BBB)
Ativo
Disponíveis: 50
Free Plan
Edição gratuita (sem cobranças)

[Google Workspace Business Standard](https://admin.google.com/ac/billing/subscriptions/CCC)
Ativo
2 disponíveis, [66 atribuídas](https://admin.google.com/ac/users?license=GOOGLE.GAU_2021)
Annual Plan (Monthly Payment)
[Ver faturas](https://admin.google.com/ac/billing/accounts/x/transactions)`;

describe('importar licenças', () => {
  it('Microsoft 365: assentos comprados, em uso, cobrança, renovação e revenda', () => {
    const r = lerMicrosoft(CSV_MS);
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ nome: 'Microsoft 365 F1', assentos: 55, emUso: 36, cobranca: 'mensal', renovacao: '2027-07-21', revenda: 'Revenda Y', gratuito: false });
  });

  it('Google: texto colado da página Assinaturas, gratuitos e pago anual com pagamento mensal', () => {
    const r = lerGoogle(GOOGLE);
    expect(r.map((x) => x.nome)).toEqual(['Chrome Enterprise Core', 'Cloud Identity Free', 'Google Workspace Business Standard']);
    expect(r[0].gratuito).toBe(true);
    expect(r[1]).toMatchObject({ gratuito: true, assentos: 50 });
    expect(r[2]).toMatchObject({ gratuito: false, assentos: 68, emUso: 66, cobranca: 'mensal' });
    expect(r[2].renovacao).toBeUndefined();
  });

  it('nome comparável ignora acento, caixa e pontuação', () => {
    expect(chaveNome('Microsoft 365  Business-Standard')).toBe(chaveNome('microsoft 365 business standard'));
  });
});
