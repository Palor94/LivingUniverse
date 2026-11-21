# Munkamenetenkénti jóváhagyás – konkrét szövegjavaslat

Állapot: **a tulajdonos 2026-11-17-én kifejezetten jóváhagyta; beillesztve az AGENTS.md-be és a DECISIONS.md-be**. A jóváhagyás erre a szabályszövegre vonatkozik. Nem kapcsol be éles futást, nem ad ki pénzkeretet és nem tölti fel a gyűjteményt. A tulajdonos által jelzett Sogni-fiókhiba alatt az ellenőrzés csak próbaszolgáltatóval történik.

A felhatalmazás forrása a `CODEX_TERV_2026-11-16.md` Tulajdonosi döntések része: „a megvalósítás első lépése egy **javasolt** `AGENTS.md`- és `DECISIONS.md`-szöveg, amelyet a tulajdonos hagy jóvá. Az `AGENTS.md`-t magadtól ne írd át.”

## Az AGENTS.md-be javasolt új bekezdés

> Scoped session approval exception (2026-11-17): the authenticated owner may explicitly approve one bounded image-generation session instead of approving every run separately. Before approval, show and freeze the provider/model/version, LoRA/settings, output sizes/counts, exact finite job list and prompts, stable character/location IDs, approved canon revisions, and reference IDs/crops/byte fingerprints. The grant must name an expiry, maximum image count, maximum provider capacity and maximum USD cost, plus explicit permission to upload only those listed references to that provider. A session cannot add jobs, substitute references, change models or broaden content after approval; changed scope requires a new grant. Each job still has an immutable attributed manifest. Reserve its full estimated image/capacity/USD budget atomically before dispatch; reject missing/unverified monetary estimates, expired grants and over-budget jobs before any paid call. Uncertain billed outcomes consume their reservation and must never trigger an automatic retry, fallback, resume or prompt rewording. Revocation prevents new dispatches; it does not promise to cancel already submitted work. No new characters, canon promotion, training, model installs or collection uploads are authorized by a session grant. Per-run approval remains available. Generic requests to continue work do not create a live session grant.

## A DECISIONS.md-be javasolt bejegyzés

> 2026-11-17: Owner-approved scoped generation sessions
>
> The owner approved the scoped-session exception in AGENTS.md. The authenticated admin can approve a fixed list of exact image jobs with named references, provider/model/settings, expiry, image/capacity/USD ceilings and explicit upload acknowledgement. A changed scope requires a fresh grant. Reservations are atomic before dispatch; unknown prices and uncertain outcomes never lead to automatic resubmission. Existing per-run approval and canon gates remain. This policy approval alone enables no live session, paid call or private-media upload. The initial implementation is verified with synthetic providers; live Sogni validation waits for the owner's account recovery.

## Ellenőrizhető működés

- Az engedélyt az adminfelület külön művelete hozza létre, az ott megmutatott pontos tartalomra.
- A keretet nem a böngésző számlálja; a szerver foglalja le egyetlen tranzakcióban.
- Lejárat, visszavonás, referencia-/modellváltozás vagy hiányzó igazolt USD-becslés esetén nincs új indítás.
- A bizonytalan kimenetel teljes foglalása megmarad; a rendszer nem küld új fizetős kérést helyette.
- A munkamenet-jóváhagyás nem karakter- vagy referenciajóváhagyás. A kánon és a meglévő média megmarad.
