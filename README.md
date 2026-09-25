# SGS Toolkit · LCA Material Mapper

Prima versione di un tool locale per cercare dataset ecoinvent e costruire una catena di processi per ogni componente BOM:

1. Produzione o approvvigionamento del materiale.
2. Trasformazione in semilavorato, quando necessaria.
3. Finitura opzionale.

## Avvio

Scarica il repository e apri `index.html` con Edge o Chrome. Non serve installare software, avviare un server, accedere a una CDN o configurare API. Non è abilitato alcun trasferimento di file. Gli input restano nella memoria della pagina e si perdono alla chiusura, salvo esportazione esplicita del progetto JSON.

## Input

- **Catalogo ecoinvent:** esporta dal tuo accesso autorizzato un CSV/TSV con `Activity name` e `Reference product`; consigliati anche `Geography`, `Unit`, `Classification`, `Activity UUID`. Indica manualmente versione e system model. Il catalogo non è incluso nel repository.
- **BOM:** CSV/TSV esportato da Excel con almeno `Component` e `Material`. Scarica dall'app il modello che include massa, unità, specifica, forma, processo, finitura e paese fornitore.
- Le intestazioni si possono associare manualmente all'importazione. CSV con separatore `;`, `,` o tabulazione e campi con virgolette sono supportati. Per numeri decimali con virgola usa il separatore `;` o tabulazione.
- Puoi provare l'interfaccia con il **catalogo dimostrativo sintetico** e la BOM dimostrativa integrati. I nomi del catalogo demo sono inventati per il test e non sono dati ecoinvent.

## Lavoro

Cerca i dataset per activity, reference product, geografia e unità. Nel BOM Mapper seleziona un dataset per fase. Puoi marcare trasformazione e finitura come **già incluse** o **non applicabili**; scrivi sempre la motivazione quando la scelta non è evidente. Mapping QA segnala passaggi mancanti, unità non in kg, disallineamenti geografici e possibili sovrapposizioni. Esporta un CSV di mappatura con metadati e rilievi oppure salva/riapri un progetto JSON.

Il punteggio è un ordinamento euristico della ricerca, non una misura di adeguatezza o una conferma del confine del dataset. La classificazione automatica dei processi si basa sui nomi: prima di confermare verifica scheda dataset, flussi, tecnologia, geografia, system model e rischio di doppio conteggio. Nessun contenuto ecoinvent va caricato nel repository.

## Limiti della v0.1

Importazione CSV/TSV, non `.xlsx` diretto. Nessun impatto ambientale viene calcolato: masse e processi sono associati come tracciato di modellazione. I metadati incompleti nell'export limitano il controllo. Il JSON esportato include il catalogo importato e può essere voluminoso e riservato: non condividerlo pubblicamente.

## Verifica del codice

`node --test tests/*.test.js`
