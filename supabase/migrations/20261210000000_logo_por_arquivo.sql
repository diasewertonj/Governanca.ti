-- Seção 29 · Logo por arquivo: além do link https, aceita a imagem embutida (data URL) que o
-- sistema gera ao enviar PNG, JPG, WEBP ou SVG (reduzida no navegador). Troca só a regra; sem DROP de coluna.
alter table public.configuracoes_empresa drop constraint if exists chk_config_logo_https;
alter table public.configuracoes_empresa add constraint chk_config_logo_https check (
  logo_url is null
  or logo_url ~ '^https://'
  or (logo_url ~ '^data:image/(png|jpeg|webp|svg\+xml);base64,' and char_length(logo_url) <= 600000)
);
