# Fortalesa Mutant · estat per a YouTube Playables

Estat de compliment davant dels [requisits de certificació](https://developers.google.com/youtube/gaming/playables/certification/requirements).
Comprovat contra la versió anglesa dels requisits, que és la que val.

## Integració amb el SDK

| Requisit | Estat |
|---|---|
| 1 · Carregar el SDK abans que cap codi del joc | ✅ `<script src="https://www.youtube.com/game_api/v1">` és el primer element del `<head>`, abans del CSS i del mòdul |
| 2 · `firstFrameReady()` amb pantalla de càrrega visible | ✅ hi ha una pantalla de càrrega que diu explícitament que està carregant; la crida es fa al primer moment de `boot()` |
| 2 · `gameReady()` només quan és interactuable | ✅ es crida després de dibuixar el tauler i obrir el menú inicial, mai abans |
| 3 · `sendScore` coherent amb el desat | ✅ es desa el `best` primer i s'envia exactament aquest valor |
| 4 · `saveData` com a únic mecanisme de progrés | ✅ dins de Playables només s'hi fa servir `saveData`; `localStorage` només s'usa quan `IN_PLAYABLES_ENV` és fals, per poder-ho provar en local |
| 4 · `loadData` abans del primer `saveData` | ✅ `platform.saveData()` espera `loadData()` si encara no s'ha fet |
| 4 · Tolerar desats de versions anteriors | ✅ `save.js` valida camp a camp i torna `null` davant de qualsevol cosa estranya; el joc comença net sense petar |
| 4 · Desar a fites importants | ✅ a l'inici de cada planificació i al final de partida (~530 bytes) |
| 5 · Respectar el silenci de YouTube | ✅ el guany mestre només s'escriu a `applyGain()`, que depèn exclusivament de `audioEnabled()`: cap control del joc el pot aixecar |
| 5 · Sense botó de silenci general propi | ✅ no n'hi ha; hi ha dos controls **granulars** (música i efectes), que el requisit permet explícitament |
| 5 · El so no pot sonar inesperadament | ✅ el context d'àudio no es crea fins al primer gest de l'usuari |
| 6 · `onPause` atura TOTA l'execució | ✅ es cancel·la el `requestAnimationFrame`, s'atura la música, se suspèn el context d'àudio, no es dibuixa res i l'entrada s'ignora; verificat comparant píxels del canvas |
| 6 · No fer servir la Page Visibility API | ✅ no s'utilitza enlloc |

## Disseny

| Requisit | Estat |
|---|---|
| 1 · Jugable de 9:32 a 32:9 | ✅ provat a 9:32, 3:4, 1:1, 16:9, 21:9 i 32:9 |
| 1 · Omplir el viewport (o centrar amb bandes) | ✅ el `#app` ocupa el 100% i el tauler es centra amb bandes quan la relació no dona |
| 1 · No bloquejar l'orientació | ✅ no es toca `screen.orientation` ni hi ha manifest |
| 1 · Mantenir l'estat en redimensionar | ✅ la càmera es reajusta conservant el zoom relatiu; la partida no es reinicia |
| 2 · Tàctil per a totes les interaccions | ✅ |
| 2 · Ratolí per a totes les interaccions | ✅ |
| 2 · Teclat per a direccions | ✅ es pot jugar la partida sencera només amb teclat |
| 2 · Esc tanca modals | ✅ |
| 2 · **Mai `preventDefault()` sobre Esc** | ✅ corregit; verificat que `defaultPrevented` és `false` |
| 3.1 · Text i gràfics nítids a qualsevol densitat | ✅ el canvas es dimensiona per `devicePixelRatio` i el text es dibuixa a mida constant de pantalla |
| 5 · Comunicar que s'ha acabat el contingut | ✅ la pantalla de victòria ho diu explícitament |
| 6.1 · Sense compartir dins del joc | ✅ |
| 6.2 · Sense enllaços externs clicables | ✅ |
| 6.3 · Sense acords d'usuari addicionals | ✅ |
| 6.4 · Sense botó de sortida ni icones que es confonguin | ✅ no hi ha botó de sortir; els controls de zoom s'han mogut a baix a l'esquerra, lluny d'on YouTube posa tancar/silenciar/menú |

## Estabilitat i rendiment

| Requisit | Límit | Actual |
|---|---|---|
| Bundle inicial | < 30 MiB (recomanat < 15) | **~295 KB** |
| Bundle total | < 250 MiB | ~295 KB |
| Fitxer individual | < 30 MiB (recomanat < 512 KiB) | 34 KB el més gran |
| Mida del desat | < 3 MiB (recomanat < 500 KiB) | ~530 bytes |
| Temps de càrrega | < 5 s | instantani (sense build ni assets) |
| Nombre de fitxers | ≤ 8000 | 19 |
| Només rutes relatives | obligatori | ✅ `styles.css`, `src/main.js`, `./*.js` |
| Noms de fitxer alfanumèrics + `_ - .` | obligatori | ✅ |
| APIs web estàndard | obligatori | ✅ Canvas 2D, WebAudio i DOM, sense dependències |

Les dues úniques URL absolutes són el SDK i Google Fonts, i **totes dues estan
permeses explícitament** pel CSP que YouTube injecta (`script-src` inclou
`game_api`; `style-src` i `font-src` inclouen `fonts.googleapis.com` i
`fonts.gstatic.com`). Tot i així, el CSS declara una pila de fonts de sistema com
a alternativa, de manera que si la font no arriba el joc es veu bé igualment.

Compte amb dues coses del CSP que ja estan cobertes: `sandbox` no porta
`allow-modals`, així que `alert()`/`confirm()` no funcionarien — no se'n fa servir
cap; i `connect-src` és `'self'`, així que el joc no fa cap petició de xarxa.

## Internacionalització

| Requisit | Estat |
|---|---|
| **Suport d'anglès obligatori** | ✅ l'anglès és l'idioma per defecte |
| No fer servir `navigator.language` | ✅ mai; l'idioma ve de `ytgame.system.getLanguage()` |
| `getLanguage()` opcional | ✅ s'utilitza, amb anglès com a alternativa |

Tots els textos viuen a `src/i18n.js` (anglès i català). Hi ha un botó EN/CA a la
barra superior i el canvi és immediat: fins i tot retradueix les entrades antigues
del registre, perquè es guarden com a clau + paràmetres i no com a text.

> Nota: en mode no-op (fora de YouTube) `getLanguage()` torna `{}`, no pas un
> string. `platform.getLanguage()` només accepta strings, per això no peta.

## Pendent — decisions del desenvolupador

- **Accessibilitat.** WCAG AA és un *SHOULD* i no s'ha fet cap auditoria formal.
  Les etiquetes AGI es declaren al Developer Portal, no al codi.
- **Anuncis.** No n'hi ha. Els requisits de monetització només apliquen si se'n posen.

## El que has de fer tu

El codi ja compleix la part tècnica. La resta és paperassa i no la puc fer jo:

1. **Enviar el formulari d'interès**: <https://docs.google.com/forms/d/e/1FAIpQLSdvdQ0lgIq2369aemj1O6w8R8FwGn9O5ARRGODDDUbVINCRJQ/viewform>
   Demana el teu correu, com has conegut Playables i, a la segona pàgina, les dades
   del joc. En enviar-lo declares que en tens tots els drets, per això l'has de
   signar tu. No accepten idees ni conceptes: només jocs acabats o jugables.
2. **Provar amb el Test Suite** un cop tinguis accés:
   <https://developers.google.com/youtube/gaming/playables/certification/sdktestsuite>
3. **Provar el CSP en local** abans d'enviar res, amb els *local overrides* de Chrome
   i la capçalera que dona la guia del Test Suite. Així surten els problemes de CSP
   abans de la certificació i no durant.
4. **Metadades al Developer Portal**: títol, descripció, gènere, dades de
   desenvolupador i miniatures en diverses relacions d'aspecte. Atenció: les
   miniatures, el títol i la descripció **no poden portar marques ni logotips**.

L'accés de desenvolupador a Playables encara és en accés anticipat i avisen que
potser no responen a totes les sol·licituds.
