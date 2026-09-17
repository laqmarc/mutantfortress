# Idees pendents

Backlog de millores per a Fortalesa Mutant, ordenat per retorn sobre esforç.
Anotat el 2026-09-17, després de tenir el joc jugable amb so i preparat per a Playables.

> ✅ **Mutació amb elecció** — feta.
> ✅ **Arbre de fusions complet** — fet: 21 parelles, 21 torres diferents.
> ✅ **Millores de nivell** — fetes, i de passada resolen el sumider de ferralla.

## Full de ruta de les deu millores

Aquest és el paquet de millores que es farà de manera incremental, començant pel mode
infinit perquè dona més vida al bucle de joc i aprofita el sistema de puntuació existent.

1. **Mode infinit** — ✅ motor, desat i selector inicial fets; pendent ajustar la puntuació
  i el balanç amb partides llargues.
2. **Nivells de dificultat** — ✅ selector, motor i desat fets; pendent calibrar les tres
  corbes amb simulacions més llargues.
3. **Informe de final d'onada** — ✅ mostra dany per torre, fuites, categories eliminades
  i durada; també queda inclòs en el desat.
4. **Tutorial contextual** — ✅ ajuda inferior contextual per construir, observar rutes i
  arribar a la primera mutació; pendent afegir una guia específica de fusions.
5. **Arquetips de mapa** — ✅ mapes obert, canó, laberint i espiral, seleccionats per la
  llavor i protegits per la prova de connectivitat.
6. **Avís de cobertura** — ✅ la previsualització detecta mancances contra Voladors,
  Blindats, Divisors i Alteradors, amb prova específica.
7. **Desfer accions de planificació** — ✅ botó i `Ctrl+Z` recuperen l’última instantània
  vàlida; queda desactivat durant la invasió.
8. **Més tipus d'enemic** — incorporar Sanador, Escut frontal i Excavador amb proves de
  combat específiques.
9. **Accessibilitat** — revisar contrast, focus de teclat, etiquetes ARIA, mida de text i
  dependència dels colors.
10. **Resum de partida** — donar puntuació, estadístiques, mutacions descobertes i
   configuració final de la ciutat a la pantalla de victòria o derrota.

Cada punt s'ha d'implementar amb una prova o simulació que pugui detectar una regressió.

---

## Prioritat alta

### Mode infinit i nivells de dificultat

Dues raons independents:

- El simulador (`node tools/balance.mjs 40`) guanya el **58-67%** de les partides amb una
  IA que no reposiciona torres ni fa servir la sobrecàrrega. Per a un jugador humà el joc
  és probablement massa fàcil. Calen com a mínim tres nivells, i cada un s'hauria de
  validar amb el simulador abans de donar-lo per bo.
- Per a un Playable de YouTube el bucle de retenció és la puntuació, i `sendScore` ja està
  connectat al marcador de la plataforma. Un mode que escali més enllà de l'onada 10
  converteix una partida acabada en una partida per superar.

Implementació: generar onades procedurals a partir de l'onada 11 escalant `hpMul` i les
quantitats; la puntuació passa a ser l'onada assolida.

---

## Prioritat mitjana

### Arquetips de mapa

`generateTerrain()` fa taques de roca aleatòries, i el resultat és que tots els mapes es
juguen igual. Amb quatre arquetips —canó, laberint, camp obert, espiral— canvia la textura
tàctica sencera per molt poc codi. L'arquetip es tria amb la llavor, així que la llavor
segueix sent compartible.

### Informe de final d'onada

El sistema de perfils de baixes és invisible: el jugador no sap quina torre fa la feina.
Un resum en acabar cada onada —repartiment del dany per torre, per quina via han entrat
les fuites, quants enemics s'han escapat de cada tipus— ensenya a jugar i fa llegible la
mecànica central. El motor ja té les dades a `g.stats` i a les baixes per torre; només cal
acumular-les per onada.

### Tutorial contextual a l'onada 1

El modal d'introducció és un mur de text i un públic casual de YouTube no el llegirà. Una
seqüència de missatges contextuals durant la primera onada («col·loca una defensa aquí»,
«mira com canvia el camí», «aquesta torre ja pot mutar») és la diferència entre un joc
que agrada i un joc que la gent acaba. Per a la certificació de Playables això és
retenció pura.

### Enemics nous

- **Sanador**: cura els enemics adjacents cada tic. Obliga a matar-lo primer.
- **Escut frontal**: absorbeix el primer impacte de cada tic; premia les torres de
  cadència alta per sobre de les de cop fort.
- **Excavador**: ignora una casella de mur per onada.

---

## Prioritat baixa (però barates)

### Desfer l'última acció de planificació

En un joc per torns, perdre 2 d'energia per un clic errat fa ràbia i no aporta res.
N'hi ha prou amb desar una instantània (`serialize()` ja existeix) a l'inici de cada acció
i poder-hi tornar mentre no s'hagi iniciat la invasió.

### Modificadors de partida

Triats a l'inici: boira permanent, doble ferralla i mig nucli, sense fusions, tots els
enemics volen… Reaprofita el sistema d'esdeveniments que ja existeix. Varietat molt barata
i encaixa amb el mode infinit.

### Avís de cobertura

Durant la planificació, comprovar la composició de la propera onada contra les defenses
col·locades i avisar del que no pots tocar: «cap defensa antiaèria» quan venen Voladors,
«cap perforant» quan venen Blindats. Evita la derrota per desconeixement, que és la pitjor
manera de perdre.

---

## Descartat, i per què

**Que els enemics destrueixin torres.** És la idea que demana el cos, però xoca amb el
disseny: aquí les torres *són* el laberint, i que te les esborrin converteix una decisió
tàctica en una loteria. El desgast ja està resolt amb l'Alterador, que les desactiva
temporalment sense trencar la planificació.

**Temporitzador a la fase de planificació.** Mataria el que fa bo aquest joc, que és poder
pensar-te la reconfiguració amb calma.

---

## Notes de so, per si es reprèn

El motor d'àudio (`src/audio.js`) té busos separats i dues eines de consola,
`busGain(nom[, valor])` i `spectrum()`, per ajustar la mescla en calent. Coses que es
podrien afegir sense tocar l'arquitectura:

- Veu de megafonia de la ciutat en esdeveniments i a l'inici de cada onada (sintetitzada
  amb formants, o simplement un senyal acústic amb caràcter).
- Un *stinger* propi per a cada mutació segons el perfil de baixes, en comptes de l'acord
  genèric actual.
- Que el filtre de la música s'obri segons la integritat del nucli: com més a prop de la
  derrota, més tens el so.
