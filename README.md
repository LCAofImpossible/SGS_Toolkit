# SGS Toolkit · LCA Material Mapper

Prima versione di un tool locale per cercare dataset ecoinvent e costruire una catena di processi per ogni componente BOM:

1. Produzione o approvvigionamento del materiale.
2. Trasformazione in semilavorato, quando necessaria.
3. Finitura opzionale.

## Avvio

Apri il sito GitHub Pages oppure scarica il repository e apri `index.html` con Edge o Chrome. Non serve installare software, avviare un server, accedere a una CDN o configurare API. Non è abilitato alcun trasferimento di file.

Al primo utilizzo carica il catalogo ecoinvent e conferma le colonne. Il file originale viene conservato **solo nell'IndexedDB del browser** e caricato automaticamente alle aperture successive. Il pulsante **Rimuovi dal browser** elimina la copia locale. Su un altro PC o in un altro profilo/browser serve un primo caricamento separato. Anche la cancellazione dei dati del sito o la modalità privata può cancellare questa copia. Il database ecoinvent non è nel repository né sul server GitHub Pages. Le BOM e i progetti non vengono salvati automaticamente.

## Input

- **Catalogo ecoinvent:** carica direttamente il file `.xlsx` fornito, oppure un CSV/TSV. Il file analizzato contiene 25.412 attività e colonne `Activity Name`, `Geography`, `Special Activity Type`, `Sector`, `Unit` e `Product Information`. È obbligatorio soltanto `Activity Name`; `Reference product` è facoltativo in altri export. Indica manualmente versione e system model, poiché il nome del file non basta a stabilire il modello di sistema. Il catalogo non è incluso nel repository.
- **BOM:** XLSX/CSV/TSV con almeno `Component` e `Material`. Scarica dall'app il modello che include massa, unità, specifica, forma, processo, finitura e paese fornitore.
- Il lettore XLSX esamina il primo foglio di lavoro tabellare. Le intestazioni si possono associare manualmente all'importazione. CSV con separatore `;`, `,` o tabulazione e campi con virgolette sono supportati. Per numeri decimali con virgola usa il separatore `;` o tabulazione.
- Puoi provare l'interfaccia con il **catalogo dimostrativo sintetico** e la BOM dimostrativa integrati. I nomi del catalogo demo sono inventati per il test e non sono dati ecoinvent.

## Lavoro

Cerca le attività per una o più parole chiave. Il ranking privilegia i termini nel nome dell'attività, poi reference product se disponibile; settore e descrizione contribuiscono solo in misura minore. Puoi filtrare per geografia, unità e tipo di attività, oppure indicare una fase preferita. I risultati raggruppano le varianti geografiche della stessa attività e mostrano il motivo del punteggio. Nel BOM Mapper seleziona un dataset per fase. Puoi marcare trasformazione e finitura come **già incluse** o **non applicabili**; scrivi sempre la motivazione quando la scelta non è evidente. Mapping QA segnala passaggi mancanti, unità non in kg, disallineamenti geografici e possibili sovrapposizioni. Esporta un CSV di mappatura con metadati e rilievi oppure salva/riapri un progetto JSON.

Il punteggio è un ordinamento euristico della ricerca, non una misura di adeguatezza o una conferma del confine del dataset. La classificazione automatica dei processi si basa sui nomi: prima di confermare verifica scheda dataset, flussi, tecnologia, geografia, system model e rischio di doppio conteggio. Nessun contenuto ecoinvent va caricato nel repository.

## Limiti della v0.1

Il lettore XLSX gestisce i normali file OOXML con celle testuali, numeriche e shared strings, ma non legge formule prive di valori salvati, file protetti, macro o più fogli contemporaneamente. Nessun impatto ambientale viene calcolato: masse e processi sono associati come tracciato di modellazione. Il file allegato non contiene reference product, UUID o indicazione verificata del system model. Il JSON esportato include il catalogo importato e può essere voluminoso e riservato: non condividerlo pubblicamente.

Il lettore ZIP offline usa JSZip, incluso localmente in `vendor/` sotto licenza MIT (testo in `vendor/JSZIP-LICENSE.md`).

## Verifica del codice

`node --test tests/*.test.js`
