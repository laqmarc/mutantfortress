// Comprova contractes bàsics d accessibilitat del shell HTML/CSS.
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
};

console.log('\n── Accessibilitat bàsica ──');
check('el tauler és enfocable', /id="board"[^>]*tabindex="0"/.test(html));
check('el tauler té nom accessible', /id="board"[^>]*aria-label=/.test(html));
check('el canvi d idioma té etiqueta localitzada', /id="btnLang"[^>]*data-i18n-title="ui\.lang"/.test(html));
check('els recursos anuncien canvis', (html.match(/aria-live="polite"/g) || []).length >= 4);
check('les regions dinàmiques tenen rol', /id="actionHint"[^>]*role="status"/.test(html)
  && /id="log"[^>]*role="log"/.test(html));
check('hi ha focus visible', /:focus-visible/.test(css));
check('respecta reducció de moviment', /prefers-reduced-motion: reduce/.test(css));

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);