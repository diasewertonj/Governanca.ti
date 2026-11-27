// Seção 30 · Endereços que eram do sistema quando ele ficava em "/": vão para /app/ com
// o mesmo complemento (etiquetas QR já impressas, e-mails de senha e convite, janela de processo).
export function destinoNoSistema(search: string, hash: string): string | null {
  const ehDoSistema =
    /^#asset\//.test(hash) ||
    /(access_token|refresh_token|type=(recovery|invite|signup|magiclink)|error_description)/.test(hash) ||
    /[?&](code|token_hash|processo|type)=/.test(search);
  return ehDoSistema ? `/app/${search}${hash}` : null;
}
