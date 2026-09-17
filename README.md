# Fortalesa Mutant · *Mutant Fortress*

Tower defense **per torns** on no construeixes torres fixes: governes una ciutat viva que
es reconfigura entre onada i onada. La mecànica diferencial és que **cada defensa recorda
què mata** i muta segons el seu perfil de víctimes, de manera que cada partida genera un
arbre de defenses diferent.

Tot corre al navegador. Sense dependències, sense build, sense `npm install`.
Preparat per publicar-se com a **YouTube Playable** — vegeu [PLAYABLES.md](PLAYABLES.md).

Idiomes: anglès (per defecte) i català, commutables amb el botó EN/CA.

## Com jugar-hi

```bash
python -m http.server 5178
```

I obre <http://localhost:5178>. (Cal servir-ho per HTTP: són mòduls ES, amb `file://` no carreguen.)

## Les regles en 30 segons

Cada torn té dues fases:

- **Planificació** — gastes ⚡energia per moure, transformar, mutar o fusionar defenses.
  L'energia es recarrega sencera cada torn; el que no gastes es perd.
- **Invasió** — els enemics avancen una casella per tic i les defenses disparen.
  Pots actuar en plena invasió, però tot costa el doble.

Objectiu: sobreviure 10 onades amb el nucli per sobre de 0. L'última porta el Colòs.

### Mutacions

A les 7 baixes, una defensa base pot mutar, i **tries entre dues opcions** que surten del
seu perfil de víctimes: la mutació de la categoria que més ha matat i la de la segona.

Aquí hi ha la decisió: una torre que s'ha alimentat de **dues coses et dona dues portes**,
mentre que una d'especialitzada en dona una de sola però garantida. O sigui que on
col·loques cada defensa no només decideix quant dispara, sinó en què pot arribar a
convertir-se. Si cap categoria arriba al 40% de les víctimes, la primera opció és sempre
el Prisma Caòtic.

Aquesta és la taula de categoria → mutació:

| Perfil dominant de víctimes | Mutació |
|---|---|
| Ràpids | Torre de Gel — alenteix una àrea al 50% |
| Blindats | Canó Perforador — ignora el blindatge |
| Voladors | Xarxa Ionitzant — clava els aeris a terra |
| Divisors | Incineradora — crema i anul·la la divisió |
| Alteradors | Ancoratge Quàntic — immune a events, +abast als veïns |
| Sense dominant | Prisma Caòtic — dany erràtic 2–30 |

Amb teclat: `M` agafa la primera opció i `⇧M` la segona.

Dues torres mutades **adjacents** es poden fusionar en una arma de tercer nivell
(Llança Criogènica, Rail Orbital, Cúpula Gravitatòria, Supernova…). La taula de fusions
és a `src/config.js`.

### El mapa és una eina

Les defenses **bloquegen el pas**, així que moure-les allarga o escurça el laberint.
Mai no pots segellar la ciutat del tot: sempre ha de quedar un camí obert des de cada
entrada. En mode construcció, la previsualització verda ensenya com quedarien les
trajectòries abans de confirmar.

El perímetre cedeix a les onades 4 i 7: s'obre una entrada nova cada vegada.

## Estructura

| Fitxer | Què hi ha |
|---|---|
| `src/config.js` | Totes les dades: torres, mutacions, fusions, enemics, 10 onades, esdeveniments |
| `src/grid.js` | Generació del mapa, camp de flux BFS, regla anti-segellat |
| `src/game.js` | Estat, accions de planificació i resolució del tic d'invasió |
| `src/camera.js` | Enquadrament del tauler: zoom, desplaçament i conversió pantalla↔casella |
| `src/render.js` | Canvas 2D: siluetes de cada torre, enemics, bloom, fons i vinyeta |
| `src/fx.js` | Partícules: fogonades, explosions, runa, fum, anells |
| `src/audio.js` | So sintetitzat amb WebAudio (cap fitxer d'àudio) |
| `src/input.js` | Entrada unificada: punter (ratolí/dit/llapis) i teclat |
| `src/ui.js` | Panells DOM (paleta, inspector, esdeveniments, registre, modals) |
| `src/i18n.js` | Tots els textos, en anglès i català |
| `src/platform.js` | Embolcall del SDK de YouTube Playables (no-op fora de YouTube) |
| `src/save.js` | Serialització de la partida per al desat al núvol |
| `src/main.js` | Arrencada, bucle, orquestració de fases |

Tot el balanç viu a `config.js`. El motor (`game.js`) no depèn del DOM, i per això es pot
simular sense navegador.

## Balanç

```bash
node tools/balance.mjs 40      # 40 partides senceres amb una IA bàsica
node tools/test-mutation.mjs   # proves de la mecànica de mutació
node tools/test-routes.mjs     # comprova que cap enemic camini fora de les línies
```

Juga N partides senceres amb una IA bàsica i treu la taxa de victòries, les mutacions per
partida i el dany al nucli onada per onada. Serveix per detectar corbes de dificultat
invertides i bucles infinits abans de tocar res a mà.

Referència actual (40 partides, IA bàsica): **68% de victòries**, 7,7 mutacions i 2,4
fusions per partida, ~382 tics d'invasió. Com que la IA no reposiciona torres ni fa servir
la sobrecàrrega, un jugador humà hauria d'anar bastant per sobre d'aquests números.

## Controls

Es pot jugar sencer amb **ratolí**, amb **dit** o **només amb teclat**.

### Ratolí

Passa per sobre per veure abast i detalls, un clic col·loca o selecciona,
roda del ratolí per fer zoom, arrossega per moure la vista.

### Tàctil

| Gest | Què fa |
|---|---|
| Toc | Selecciona torre o enemic |
| Toc en mode construcció | **Apunta** la casella; el botó ✓ Confirmar la col·loca |
| Segon toc a la mateixa casella | Equival a confirmar |
| Arrossegar | Mou la vista |
| Pinça / doble toc | Zoom |
| Mantenir premut | Fitxa de la torre o l'enemic |

La col·locació va en dos temps perquè al tàctil no hi ha «hover»: el primer toc
ensenya l'abast i com quedarien les trajectòries, i només després es confirma.
Amb ratolí es manté el clic únic de tota la vida.

### Teclat

| Tecla | Acció |
|---|---|
| `↑↓←→` / `WASD` | Mouen el cursor de graella (amb `Maj`, de 3 en 3) |
| `Enter` | Actua sobre la casella del cursor |
| `Tab` / `Maj+Tab` | Salta entre les teves torres |
| `1`-`4` | Tria defensa (o destí en mode transformar) |
| `M` `F` `R` `T` `X` | Mutar · Fusionar · Reubicar · Transformar · Reciclar |
| `Espai` | Acaba el torn / resol l'onada |
| `O` | Sobrecàrrega (−1 nucli → +4 energia) |
| `P` `V` | Trajectòries · velocitat |
| `+` `−` `0` | Zoom endins, enfora, encabir tot el tauler |
| `Esc` | Cancel·la |

## Mòbil

La graella és de 18×12, exactament 3:2, i en vertical el tauler ocupa una franja
d'aquesta relació just sota la barra superior: així no queda cap marge mort.
Els panells passen a un full inferior amb tres pestanyes (Defenses · Onada ·
Registre) i el tauler no es comparteix mai l'espai amb ells.

En horitzontal el tauler ocupa tota l'esquerra i el full passa a una columna
estreta a la dreta.

El text del canvas (dany, vida, integritat del nucli) es dibuixa amb mida
constant **a pantalla**, no al món, de manera que amb el tauler encabit en un
mòbil (caselles de ~21 px) els números segueixen sent llegibles.

## Desat de partida

Es desa a l'inici de cada fase de planificació i al final de la partida: un punt de
represa honest, sense haver de congelar enemics a mig vol. Dins de YouTube el desat va
per `ytgame.game.saveData`; fora, per `localStorage`, perquè es pugui provar igual.
Ocupa uns 530 bytes.

Si en engegar hi ha una partida a mitges, el menú inicial ofereix continuar-la.
Un desat il·legible o d'una versió futura simplement s'ignora: mai no fa petar el joc.

## So

Tot sintetitzat amb WebAudio en temps real: **zero bytes de bundle**, cap fitxer d'àudio.
Cada tipus de torre té el seu tret (el Pulsar fa un espetec curt, el Morter un tro greu,
el Rail Orbital una escombrada descendent).

### Busos

```
master                    ← només el controla el mute de YouTube
├── sfxBus  0.9           ← trets, morts, fuites, interfície
└── musicBus
    └── musicHP (38 Hz)
        ├── padBus  1.0   ← pad (via passabaix) + arpegi (directe, per brillar)
        ├── clickBus 1.8  ← atac del bombo i xarles
        └── percBus  0.3  ← cos subgreu del bombo i drone
```

El bombo va en **dues capes amb bus propi cadascuna**: el cos és un subgreu de 50–72 Hz
i l'atac és un escombrat curt a la zona mitjana més un espetec de soroll. Sense l'atac,
el pols desapareix en qualsevol altaveu que no baixi als 50 Hz, que són gairebé tots els
portàtils i mòbils. Tenir-los separats permet abaixar el subgreu sense perdre el ritme.

El pressupost de veus simultànies només s'aplica als efectes: si la música hi competís,
una invasió amb moltes torres disparant faria desaparèixer el bombo.

Per ajustar la mescla en calent hi ha `busGain(nom[, valor])` i `spectrum()` a
`src/audio.js`, pensats per a la consola del navegador.

### Un tema per onada

Les 10 onades tenen banda sonora pròpia, també generada. Cada tema defineix arrel,
progressió d'acords, timbre del pad, cadència del canvi d'acord, arpegi, oscil·lació del
filtre, percussió i drone:

| Onada | Caràcter |
|---|---|
| 1 · Sondeig | La menor, acords lents de 8 s, sense arpegi: la calma abans de res |
| 2 · Cursa | Entra l'arpegi i el xarles a cada tic |
| 3 · Xapa | Baixa a Sol, pad d'ona quadrada: metàl·lic |
| 4 · Formació | Fa#, marxa regular d'acords curts |
| 5 · Cel Obert | Puja a Si i s'obre el filtre: aire i brillantor |
| 6 · Mitosi | Acords disminuïts — res no acaba de resoldre |
| 7 · Distorsió | Mode frigi, desafinada a 24 cents, el filtre respira; entra el drone |
| 8 · Ariet | Re, la més greu, acords cada 3,5 s i bombo fort |
| 9 · Eixam | Arpegi a 110 ms: dens i nerviós |
| 10 · El Colòs | Menor harmònica amb drone dues octaves avall |

L'arpegi només sona durant la **invasió**: la planificació es queda amb el pad, per
deixar pensar. El pols greu del bombo va lligat a cada tic del joc, així que el ritme de
la música és literalment el ritme dels torns.

El context no es crea fins al primer gest de l'usuari, com demana la política d'autoplay.
Hi ha dos interruptors independents (♪ música i FX efectes); **no** hi ha un botó de
silenci general, perquè dins de YouTube això ho porta la plataforma. El guany mestre
només s'escriu en un lloc, i només depèn del silenci de YouTube: cap control del joc el
pot aixecar.

Per no convertir la invasió a 8× en soroll blanc, cada tic limita els efectes a dues
repeticions per tipus i sis en total, amb un sostre de 18 veus simultànies.

## Gràfics

- **Bloom** en dues passades: es redueix el fotograma a la meitat i es torna a compondre
  desenfocat en mode `lighter`. Com que el fons és molt fosc, només hi guanyen els neons.
  Si el temps de fotograma passa de 27 ms, es desactiva sol.
- **Partícules** (`src/fx.js`): fogonades direccionals, explosions amb runa i fum, anells
  d'energia i rastres per als enemics ràpids i voladors. Sostre dur de 420.
- El text (dany, vida, integritat del nucli) es dibuixa **després** del bloom perquè
  quedi nítid, i a mida constant de pantalla perquè es llegeixi amb el tauler encabit
  en un mòbil.
- El nucli s'esquerda i canvia de color a mesura que perd integritat, i les entrades són
  vòrtexs giratoris en comptes de marques planes.

## Llicència

[MIT](LICENSE) — pots fer-ne el que vulguis, només cal que en mantinguis l'avís de
copyright. Les fonts Orbitron i Rajdhani es carreguen de Google Fonts i tenen la seva
pròpia llicència (SIL Open Font License).

