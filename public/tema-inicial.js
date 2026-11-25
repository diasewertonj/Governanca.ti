// Seção 22: aplica o tema escolhido (claro, escuro ou automático) antes da tela
// aparecer, para não piscar branco no escuro. Mesma regra de src/utils/tema.ts.
// Arquivo separado (e não script no HTML) por causa da política de segurança do site.
(function () {
  var t = 'auto';
  try {
    t = localStorage.getItem('nexus_tema') || 'auto';
  } catch (e) {
    /* sem armazenamento: automático */
  }
  var escuro = t === 'escuro' || (t !== 'claro' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (escuro) document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = escuro ? 'dark' : 'light';
})();
