// =============================================================================
// Seção 29 · Logo da empresa por arquivo: vira um data URL pequeno guardado na própria
// configuração (sem depender de link nem do armazenamento de arquivos).
// PNG/JPG/WEBP são reduzidos a no máximo 512 px; SVG vai como está (é leve).
// =============================================================================
const LADO_MAX = 512;
const TAMANHO_MAX = 400 * 1024; // depois de convertido

const lerComo = (arquivo: Blob, modo: 'dataurl' | 'texto') =>
  new Promise<string>((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    if (modo === 'dataurl') r.readAsDataURL(arquivo);
    else r.readAsText(arquivo);
  });

export async function logoParaDataUrl(arquivo: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) throw new Error('Use PNG, JPG, WEBP ou SVG.');
  if (arquivo.size > 5 * 1024 * 1024) throw new Error('Arquivo acima de 5 MB.');
  if (arquivo.type === 'image/svg+xml') {
    const svg = await lerComo(arquivo, 'texto');
    if (/<script|on\w+\s*=/i.test(svg)) throw new Error('SVG com script não é aceito.');
    const url = await lerComo(arquivo, 'dataurl');
    if (url.length > TAMANHO_MAX) throw new Error('SVG muito grande: use um arquivo menor que 300 KB.');
    return url;
  }
  const original = await lerComo(arquivo, 'dataurl');
  const img = await new Promise<HTMLImageElement>((ok, falha) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error('Imagem inválida.'));
    i.src = original;
  });
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  // PNG mantém o fundo transparente; se ficar grande, tenta WEBP
  let url = canvas.toDataURL('image/png');
  if (url.length > TAMANHO_MAX) url = canvas.toDataURL('image/webp', 0.9);
  if (url.length > TAMANHO_MAX) throw new Error('Imagem muito detalhada mesmo reduzida: tente um arquivo mais simples.');
  return url;
}
