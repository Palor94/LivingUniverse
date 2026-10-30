# Living Universe

### Jegyzetekből kinyert, kétnyelvű címkék

A Media Notes mezőben a `#mosolygó` és `#full_body` jellegű hashtagek mentéskor
meglévő strukturált címkékhez kapcsolódnak. Magyar megjelenített nevek, angol
megfelelők és szerkeszthető aliasok támogatottak; ismeretlen vagy többértelmű
címkéből javaslat lesz. Pontos világhelyszínt külön kell kiválasztani.
A szótárkezelőből száraz próba, meglévő jegyzetek ellenőrzött feldolgozása és
műveletenkénti visszavonás érhető el. Használat, migráció és korlátok:
[Media Notes címkék](docs/MEDIA_NOTE_TAGS.md). Ez fejlesztői forrásváltozás;
az élő katalógus frissítése és az éles telepítés külön lépés.

## Mentés és helyreállítás

A közös alkalmazás- és ChatGPT/Grok-csatlakozóforrás a GitHub `Palor94/LivingUniverse` repository `main` ágán található. A mentési egységek, az egykattintásos friss mentés és az elkülönített helyreállítás belépőpontja: **[RECOVERY.md](RECOVERY.md)**. A privát adatbázis, helyszíntervek, helyi fájl-visszaállítási állományok és titkosított beállítások külön, dátumozott OneDrive-mentést kapnak; az eredeti médiatár a meglévő OneDrive-gyökérben marad.

**Reference-conditioned image APIs:** optional OpenAI/xAI adapters use approved
canon revisions, original hashes, private per-run approval, recoverable output
registration and provenance through ChatGPT MCP and Grok chat/Bot tools. Providers
remain disabled until configured. Native chat-host image handoff is unverified.
See [setup, use, security, tests and rollback](docs/IMAGE_GENERATION.md).

**Character events & history:** each dossier now has a shared, sourced event
timeline with uncertain chronology, participants, locations, separate story-canon
review and immutable revisions. Imported events start unapproved; profiles,
relationships, media and visual canon are preserved. The first upgraded startup
backs up the existing database before migration 017. See
[operation, AI retrieval, migration and rollback](docs/STORY_EVENTS.md).

Private iPad/iPhone text editing through Tailscale Serve is available as an optional restricted listener. It shares the existing local database, saves browser drafts, checks for cross-device conflicts, and blocks file operations and canonical approvals. See [mobile setup and security](docs/MOBILE_ACCESS.md). Enablement needs an exact Tailscale identity/origin in local configuration; desktop access remains unchanged.

A personal fictional universe with persistent character identity, visual references, memory, and history.

Current state: a working local character and media library. No AI provider is connected. No world simulation or face recognition is implemented yet.

## Open the application

Double-click **Start Living Universe.cmd**, keep its window open, and visit **http://127.0.0.1:4317** in your browser. Node.js 24 or newer is required (already available on this laptop). No dependency installation is needed.

The desktop launcher opens `%USERPROFILE%\AppData\Local\LivingUniverse\desktop-catalogue\universe.sqlite`, outside OneDrive. On its first launch, `app/bootstrap.mjs` copies the checksum-verified `backups/desktop-recovery-20261025.sqlite` snapshot into that local folder and verifies character/media/history counts. This installation happens in the desktop's own Windows environment, avoiding a coding-environment file-visibility mismatch. Subsequent launches keep the existing catalogue and all new edits; the launcher never overwrites an existing or empty database. The deliberate recovery snapshot and manifest are private, excluded from Git, and safe to retain as closed backups in OneDrive. **Database location** in the sidebar shows the active path and record counts. Advanced custom data directories remain available when starting Node directly with `LIVING_UNIVERSE_DATA`. Do not import or rescan to fix an unexpectedly empty character list before checking this location and existing backups.

### Structured tags (Phase 4)

**Character folder names:** the primary database name is now the folder name. Saving a changed primary name synchronizes that character's established folders, preserving IDs, sorting status, notes, covers, and canon. Aliases remain alternate names and are not separate move destinations. **Sync character folder names** (also under Organize folders) previews existing mismatches; **Synchronize safe folders** requires that fresh preview and rechecks it before changing originals. Source ownership comes from saved folder assignments, or a unique exact name/alias/retained original-label match backed by character assignments. Unknown/shared folders remain untouched. Existing destination folders can be merged only with disjoint filenames; collisions and conflicting character ownership are blocked. Whole-directory renames avoid reading media contents. Merges verify copied bytes and may download online-only OneDrive files. Each operation creates a local catalogue backup and a persistent folder-change journal; no recursive deletion, silent overwriting, or automatic startup batch is used. Migration `008-folder-name-sync` is additive and included in exports; its down script discards only this new journal after code rollback and a backup. Rolling back code or restoring a catalogue does not physically undo folder moves.

**Specific locations:** the sorting viewer has a **Location reference / exact place** dropdown. Choose a named place, a Setting & location tag, or a folder under Helyszín/Locations. **Add a location** creates a label such as M7 truckstop, optionally with a OneDrive folder. Saving applies that location and its structured label and excludes the item from Needs sorting without requiring any person assignment. The generic place-not-chosen option preserves older location references. Select **Character / other media** to reverse classification; existing descriptive tags remain until explicitly removed. Bulk **Set location…** assigns selected media logically without moving originals. If a location has a folder, **Save & move to location folder…** saves, previews, and then explicitly confirms the physical move; filename collisions are refused and IDs/history are retained. Open **Location references** to browse and filter by exact place.

- Restart the app and refresh your browser. Open **Tag groups & vocabulary** to add/rename groups and labels, using Hungarian or English. Starter groups cover reference role, camera angle, framing, expression, clothing, pose/activity, setting, source, and visual quality. No tags or personal details are inferred automatically.
- In the sorting viewer, **Structured tags** is open by default. Select existing labels, or use **Add & select tag** to create a label or group without closing the item. Enter in the tag-creation fields creates/selects the tag rather than finishing the whole media item. Notes and checked characters remain in place. **Finish sorting** or **Save for later** applies selected labels. Free-text tags remain editable separately, and reference-role labels never approve canon.
- In the library or Needs sorting, select thumbnails and click **Structured tags…**. Choose labels and **Add selected tags**, or explicitly choose **Remove selected tags**. Other labels and the original free text remain intact.
- Use **All structured tags** to filter the media queue. Text search also searches structured label/group names. Character presence remains in **Who appears here?**, supporting multiple characters rather than duplicate character-name tags.
- To organize older tags, open **Tag groups & vocabulary → Map existing free-text tags…**. Choose an exact original tag and a structured label, preview the file count, then confirm. Mapping adds the new label and preserves all original wording and notes. Repeat later to include new media; stored mappings are not automatically applied on import.

### Reference sorting suggestions (Phase 5 review foundation)

This release provides an experimental **local similarity baseline**, not AI face recognition. Actual AI analysis still needs a chosen model/provider; none is connected or installed. The options and tradeoffs are in [Assisted sorting](docs/ASSISTED_SORTING.md).

1. Explicitly approve the intended canonical references through each character's existing Approved identity controls. Normal assignments or structured face/body labels do not approve references.
2. Run **Duplicates & similar pictures** analysis on the relevant pictures and reference folders to prepare cached fingerprints. The suggestion step itself reads metadata and caches only, avoiding additional OneDrive downloads.
3. Open **Reference sorting suggestions**, choose a folder and Unassigned or All pictures still needing review, then **Prepare local suggestions**. You can stop after a batch. The viewer's **Save edits & find reference candidates** checks just that saved picture. No assignment happens during preparation.
4. **Review candidates → Review evidence** shows the target alongside approved reference evidence. Whole-image differences are not identity confidence. Face and body are unevaluated by the baseline; you may record separate human checks and corrections. Opening comparisons may download OneDrive originals.
5. **Accept character assignment** adds only that character, preserving other characters and leaving completion, appearance reviews, and canon unchanged. Repeat for other depicted characters if appropriate. **Reject suggestion** saves feedback without changing assignments. Identical rejected evidence stays out of the pending queue on repeated runs. The status selector shows accepted/rejected history; **Reopen suggestion** makes a current proposal pending again without removing any previously accepted link.

Changed or missing files/references and changed canon revisions block stale acceptance. Candidate history and face/body feedback stay in backups. Successful outputs never become canonical references automatically. This baseline can help with reference copies or close compositions, but can miss the same character in a different scene and suggest a different person with similar composition. No model learns automatically from the saved feedback.

Migrations `005-structured-tags` and `006-sorting-suggestions` are additive, and older backups remain supported. For rollback, export a backup, stop the app, revert the associated code, then apply the `.down.sql` scripts in reverse order (006, then 005). These remove only the new vocabulary/label links and suggestion/feedback records; original free-text tags, media IDs, depictions, notes, reviews, and canon remain. Keep the active database outside OneDrive.

### Video samples and character covers

After updating, close the launcher window, reopen **Living Universe** from the desktop shortcut, then press **Ctrl+F5** in the browser.

1. Open a video and choose **Frames every 5 seconds**. Click any sample to open a larger, paused frame preview. Longer videos retain **Sample the next 5 minutes** pagination.
2. Choose **Crop & use as character cover**, select the intended depicted character, draw the cover area, and save. A character must already be assigned to the video. Shared videos default to the current character profile; outside a profile, choose the character explicitly.
3. For a moment between samples, pause/seek the normal video player and use **View current frame / set cover**.

The selected crop is saved as a small JPEG derivative in the local database, with source video ID, timestamp, crop, and source file metadata. It creates no new catalogue media record, changes no sorting status, and never promotes a canonical reference. The source video is unchanged. Saved frame covers are included in exports and display without replaying/downloading the video. Unsupported browser codecs show an error; no external decoder or paid service is installed. New captures reject changed source metadata until the video is rescanned.

Migration `009-video-cover-frames` is additive. To roll back, export a backup, stop the app, revert the feature code, and apply its down script. This discards derived frame pictures and clears only current covers using those frames; source media, character identities, assignments, and canon remain intact. Image-based covers continue working.

### Duplicates and similar pictures (Phase 3)

Restart the launcher and refresh the browser after this update.

1. Click **Duplicates & similar pictures** in the sidebar. Choose one folder or all catalogued media, then **Analyze chosen collection**. Ordinary media scans do not run duplicate analysis automatically.
2. Leave **Allow reading online-only files** unchecked to skip Windows OneDrive files marked offline/recall-on-access, or files whose availability cannot be verified. Checking it permits reads that may download originals. The app uploads nothing. First-time hashing reads complete files, so a large/video-heavy library takes time; start with a folder if preferred.
3. Watch progress or **Stop after current batch**. Closing the dialog also stops after the current batch. Run again to resume using cached results. Unchanged size/mtime/ctime reuse SHA-256 and completed visual hashes; modified, renamed, missing, or unavailable files are rechecked or excluded. Failed image decoding can be retried without rehashing the bytes.
4. Click **Review results**, or reopen **Show cached results**. **Identical file groups** compares SHA-256 for both pictures and videos. **Similar picture pairs** compares overall image patterns using a browser-local 64-bit difference hash. Lower tolerance shows stricter matches; the distance is not an identity confidence percentage. Results include all cached folders and are paginated, with a 2,000-pair cap for similarity.
5. Click **Compare** for side-by-side pictures/video players, paths, assignments, and current or historical canonical-reference warnings. Previews load only when you request comparison and can themselves cause OneDrive downloads. **Open record** opens the existing viewer. There is no automatic delete, merge, replacement, assignment, or canonical promotion.

The lightweight visual method can suggest resized/re-encoded versions and some near-duplicates, but can miss crops, changed poses, and different generated versions; unrelated compositions may also match. Browser-supported still images are analyzed; animated image results describe the browser-decoded frame, and visual video matching is not implemented. Face/body fidelity remains a separate human review. See the original [difference-hash implementation](https://github.com/JohannesBuchner/imagehash/blob/master/imagehash/__init__.py) and Microsoft's [cloud file attribute definitions](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/ca28ec38-f155-4768-81d6-4bfeb8586fc9) for the underlying methods. No extra image dependency or paid API is needed.

Fingerprints live in the existing local database outside OneDrive, in the additive `media_fingerprints` table, and travel with catalogue exports. These are derived caches; they never replace approved reference fingerprints. Cache checks depend on filesystem metadata and do not substitute for **Check reference files**. To roll back: export a backup, stop the app, revert Phase 3 code, then apply `app/migrations/004-duplicate-cache.down.sql` to the local database. Only derived duplicate hashes are discarded; media IDs, notes, tags, links, canon, and review history remain intact.

### Faster sorting (Phase 1)

Restart the app after updating the code, then refresh the browser. In Media library, Needs sorting, or a character's media tab:

- Use a thumbnail's checkbox or Ctrl-click (Command-click on macOS) to select it. Shift-click selects the range from the last selection anchor. Normal clicks still open the viewer.
- **Select all visible (this page)** selects up to 48 displayed items, not the entire filtered collection. The counter and all bulk actions apply to selected items on the current page only. Changing pages, filters, picture/video tabs, or sections clears selection. **Clear selection** resets it manually.
- **Add characters…** adds one or more existing characters to every selected item. Existing assignments are retained and duplicate links are ignored. **Add tags…** preserves existing tags; **Remove tags…** removes only the comma-separated tags you explicitly enter. Matching ignores case and normalizes Hungarian text; it does not remove partial words. Notes, reviews, references, and physical files remain unchanged.
- Labels distinguish **Unassigned**, **Assigned · needs review**, **Multiple characters · needs annotation**, and **Categorization complete**. Assignment alone never completes sorting. Use **Mark complete** after checking all people/annotations; **Needs review** reopens items. Completion means cataloguing is sufficient, not that an image is visually faithful or canonical.
- Needs sorting includes all incomplete items. Your previously sorted media are preserved through a one-time migration of the specific pre-upgrade media IDs, as requested. Explicit Needs review choices are retained. New character assignments do not complete categorization automatically; use Mark complete after reviewing them. The status dropdown narrows this queue.
- **Finish sorting & next** (Ctrl+Enter) explicitly completes the current item and advances; **Finish sorting & save** saves and closes. Both remove it from Needs sorting, including multicharacter scenes. **Save for later / needs review** saves a draft and retains review status. **Previous/Next (keep status)** (Alt+Left/Right) save edits and navigate without changing completion. Selecting a character alone does not declare completion. The session snapshots the full filtered sequence so removing completed items cannot skip the next file. Closing/reopening starts from the refreshed queue.

Identical images in different physical folders still have separate stable media IDs. A sorted copy does not silently merge/delete other copies or copy annotations to them. Cards show the source folder to distinguish them; use duplicate review to inspect byte-identical files. The two root copies explicitly reported by the user (8872F228… and A5C31DE8…) were marked complete after a backup, retaining every assignment and annotation. Ordinary saves no longer rely on an easy-to-miss unchecked completion box.

Migration `010-specific-locations` adds location records and media-location links; exports include both and older backups remain supported. Its down script removes only specific-place metadata, retaining generic location classification, structured tags, canon, and originals. It never reverses physical file moves.

The only schema addition is `media_categorization`, created idempotently by `app/migrations/002-media-categorization.up.sql`. No existing tables or IDs are rebuilt. Catalogue exports include these flags; older exports remain supported. To reverse this migration, first export a backup, stop the app, roll back the code, and apply `002-media-categorization.down.sql` to the local database. This discards only completion flags, not existing associations/tags/notes or canon. Keep the live database outside OneDrive.

1. Select **Find my media** to catalogue supported pictures and videos under this folder. This reads file names and metadata, leaves originals in place, skips symbolic links, and does not approve or identify anyone automatically.
2. Review source folders. Choose an existing character, or edit a folder title to create a new character. Shared folders may be assigned to several people. Loose/mixed files can stay in **Needs sorting**.
   For a character folder such as Attila or Dezső, click **Preview folder**, check the counts and samples, then **Confirm folder assignments**. You can also tick several folders to preview and confirm them together. Existing assignments are retained, and the folder remembers its character even after renaming. Use **Choose another character / shared folder** to preview another target. Loose files and mixed/shared folders should not be treated as one character without reviewing them first.
3. Open an item to assign characters, add tags and notes, or review each character's appearance. Use **Set character cover** to choose a gallery portrait.
4. Edit profiles and directed relationships. **Approved identity** keeps immutable versions of explicitly approved appearance and reference choices. Output approval and gallery covers do not establish canon. Clothing tags describe individual media; underlying appearance is stored separately.

Character profile fields and the primary relationship towards Palor save automatically when you leave the textbox. Other media notes still use Save. Canonical appearance and references always require explicit approval. **Set character cover** opens a rectangle selector: drag around the face or other area to display on that character's cover. Cover cropping never edits the original or approves its appearance as canon. Image references have face/body/detail/general roles; in shared images, approve a reference only when the intended character is unambiguous.

### Folder previews and safer scans (Phase 2)

**Organize folders** now requires a confirmation preview. It shows each source folder, target character (or proposed new character), total catalogued media, already assigned count, explicit categorization-complete count, multiple-character count, and several representative images/videos. Expand each folder to inspect samples. **Cancel** creates no character or assignments. Confirming adds character links only; it never moves files, changes canon, or marks sorting complete. If catalogue membership, completion, or the target changes while the preview is open, preview again. Old direct assignment requests are rejected so an outdated browser cannot bypass the preview.

**Find new media** now opens a scan report. **Scan report / missing files** reopens the latest report after restarting. Scanning reads names, sizes, and modification times, without reading all file contents or deliberately downloading the whole collection. Categories are:

- **New:** newly imported paths without a potential relocation match.
- **Unchanged:** size and modification time match the previous observation. This is not proof that file bytes or visual identity match.
- **Modified metadata:** size or modification time changed. The same media ID, notes, assignments, completion, and canon are retained; canon fingerprints are never overwritten by scanning.
- **Missing:** a known path was absent from an inspected folder. Its record remains; OneDrive may make it available again later.
- **Unavailable:** a directory or file could not be inspected, including inaccessible resource roots. Records are retained; such paths are not treated as relocation candidates.
- **Possible moves / renames:** an unfamiliar path has the same media kind, size, and modification time as a missing record. It waits for your decision rather than receiving a duplicate media ID immediately. These are metadata suggestions, not duplicate detection or identity proof.

In **Possible moves / renames**, choose **Confirm this is the same file** only after recognizing the move. This updates the existing catalogue path while preserving its ID and history; it does not physically move anything. Current approved-reference fingerprints must match before relinking (that explicit check can trigger a OneDrive download). If the old file reappears or the proposed file changes, rescan instead. **Keep as a separate new file** imports the discovered path with a new ID and retains the missing original record. A rename that also changes metadata may instead appear as one new file and one missing record; no uncertain link is made automatically.

Scan observations and unconfirmed candidates use additive `media_scan_state` and `scan_candidates` tables, exported with the catalogue. `003-scan-reconciliation.up.sql` is idempotent; its matching down script removes only those observations after exporting a backup, stopping the app, and rolling back the code. The live database remains outside OneDrive. Scan reports are metadata observations, not cloud-sync completion or proof that online-only file contents are locally readable.

### Pictures, video previews, and file management

Media browsing opens on **Pictures**, with a separate **Videos** tab. Video thumbnails show a still frame until you hover over the thumbnail. While hovered, they silently cycle through frames five seconds apart; moving the pointer away stops cycling and keeps the last frame. Cycling also stops when the thumbnail leaves view or the browser tab is hidden. Open a video and select **Frames every 5 seconds** for a clickable frame strip. For long videos, sample additional five-minute batches on demand. These features use the browser's installed decoding support: unsupported codecs show a clear message, and no automatic transcoding is performed. Previewing online-only videos can make OneDrive download data.

**Rename file** changes the original filename, preserves its extension, and refuses collisions. **Remove…** offers catalogue-only removal (file retained in place) or removal of both the catalogue item and the original into the recoverable `.living-universe-trash` folder. **Removed items** restores either option. This is application trash, not the Windows Recycle Bin; it remains in OneDrive and consumes space. No permanent purge is implemented. Scanning does not reintroduce catalogue-only removals. Current canonical references cannot be removed until explicitly retired; history remains intact.

**Name suggestions** offers Hungarian first names for descriptive working titles. Accepting a suggestion keeps the previous title as an alias. Nothing is automatically renamed. Treat unnamed background truckers as scene extras: assign Palor if he appears and add a category such as `névtelen kamionos`. Create a distinct recurring character only when you choose that individual; a group label does not imply everyone in the group has one shared identity.

**Merge Tibor / Palor** combines the collection under Palor, keeps Tibor as an alias and archives the former source character record without deleting its identity history. It moves catalogued files from Tibor into Palor, gives colliding filenames a unique suffix, and makes Palor the default relationship target. A pre-merge catalogue backup is written in the local data folder. Approved identity histories are not automatically promoted or combined into a new canon.

### Move originals into OneDrive folders

Open a picture or video and select **Save & move original to folder…**. Assignments and notes save first. Choose from the folders of characters marked as present, preview the old and new paths, then select **Move original file**. Missing character folders are created. The application copies exclusively, verifies matching SHA-256 fingerprints, updates the same media record, and removes the old source. It refuses to overwrite another file. All character links, reviews, cover choices, and canonical reference IDs remain attached. OneDrive performs its normal synchronization after the local move; cloud completion is not monitored by the app.

A shared item has one physical location and may belong to many characters in the catalogue. Ordinary assignment saves and one-click folder sorting do not relocate files. Use the explicit move control when you want physical organization too. File move history is included in catalogue exports. If interrupted or blocked, the history records the problem and the app retains the source or verified destination; inspect both paths before retrying. Copies may need downloading from OneDrive and enough free disk space. Folder moves, sidecar-file moves, and bulk physical moves are not implemented.

## Storage and backups

The live catalogue is stored outside OneDrive at `%LOCALAPPDATA%\LivingUniverse\universe.sqlite`. Set `LIVING_UNIVERSE_DATA` to use a different local directory. Do not put a live database in OneDrive. The catalogue records paths relative to this project/resource folder; moving the whole project together preserves those paths. Individual file moves are not reconciled automatically in this version.

**Export catalogue** downloads a versioned JSON snapshot including profiles, assignments, notes, reviews, relationships, and canon history. Store dated exports in your synchronized backup location. Original pictures and videos are not in the export: keep their separate OneDrive backup. **Restore catalogue** imports an export into an empty catalogue only, preserving IDs and history. Media must have the same relative folder layout. The automated integration check verifies export/restore with fixture media; your actual OneDrive backup still needs a personal restore rehearsal before relying on it.

Restoring an old catalogue does not undo physical file moves. Export a fresh catalogue after reorganizing original files, and keep matching media backups.

Scanning does not download image contents intentionally. Opening media may cause OneDrive to retrieve an online-only file. Make commonly used reference folders available on this device for smoother browsing. Browser codec support varies, especially for MOV/HEVC; this version samples video frames in the browser and does not transcode unsupported formats. No media or private notes are filtered for profanity or adult fictional content.

## Development

Run `node app/server.mjs` to launch and `node --test tests/*.test.mjs` for the focused regression suite. The service listens on the laptop's loopback address only and blocks cross-site browser requests. It has no public hosting or remote access configuration.

Current limitations: no face recognition, world conversations, reliable crop-resistant similarity, or reference-region crops. Cover-region selection, bulk selection, optional duplicate review, and local Hungarian name suggestions are available. A rescan discovers new paths and suggests metadata-matched external moves for manual confirmation. It never automatically merges duplicates or repairs uncertain paths. Approved references receive SHA-256 fingerprints when approved; **Check reference files** detects missing or changed originals on demand. This verifies bytes, not visual correctness. Do not replace approved reference files in place.

Start with [the vision](PROJECT_VISION.md), [decisions](DECISIONS.md), [development plan](DEVELOPMENT_PLAN.md), and [visual identity design](docs/VISUAL_IDENTITY.md).

The living-world section is an explicitly marked future workspace. Generation and storytelling integrations follow incrementally.

Git records changes to source and documentation so they can be compared and recovered. The ignore rules intentionally exclude private media and user data. Git is not a backup of the media collection. The configured private source repository is Palor94/LivingUniverse. See RECOVERY.md for the separate private data backups.

## Grok and verified media imports

Sogni reference-image generation is available through the same generation tools.
For a direct desktop workflow, open a character and choose **Generálás Sognival**:
write the scene, select approved references, prepare/review the request, approve
the exact upload/cost plan and start one image. History and saved result review
are available on that tab; successful generation does not approve canon.
Open **Connect Sogni.cmd** to save your API key in a masked Windows dialog, then
restart Living Universe and refresh the connected client. The encrypted key stays
beside the existing local catalogue, outside OneDrive. Setup sends no images and
starts no paid request. Each generation still requires the private exact-plan
upload/cost approval. See [image generation and Sogni setup](docs/IMAGE_GENERATION.md#sogni-connection-28-october-2026).
See [Grok integration](docs/GROK_INTEGRATION.md) for the OAuth-protected HTTP connector, shared catalogue, private media upload fallback, provenance, limits, setup and rollback. ChatGPT retains its existing private tunnel. Native Grok attachment and generation handoff must be verified separately from API capability.


## Original images through MCP

Selected image reads now return high-quality references (up to 2048 px / 3 MiB) for ChatGPT/Grok. Lists stay metadata-only. Exact original files are an explicit option; large originals use lossless read chunks or the existing private Tailscale connection. See [limits, client behavior and original downloads](docs/ORIGINAL_IMAGES.md).

## Shared image uploads

ChatGPT native file inputs, resumable MCP image chunks and the private upload page use the same verified import service and support multiple target characters. See [setup, limits and recovery](docs/MEDIA_UPLOADS.md).

### Szellemprofil

A karaktergyűjtemény külön, nem játszható Szellemprofil sablonkaraktere adja a közös mezőszerkezetet. A mezők, az elfogadott adatok és az AI-csomag letöltése/javaslathalmaz feltöltése a karakterek rendes profilján jelennek meg. Használat és csatlakozási feltételek: [docs/GHOST_PROFILE.md](docs/GHOST_PROFILE.md). A futó alkalmazást újra kell indítani a friss backendhez.


### Import capacity recovery

ChatGPT/Grok can list import sessions with `list_media_imports` and close an
unwanted session with `cancel_media_import`. This frees its upload reservation
and removes temporary chunks while preserving all saved images and character
links. The private Tailscale editor also provides `/media-imports`, linked from
each upload page. See [media uploads](docs/MEDIA_UPLOADS.md#list-and-cancel-imports-2026-10-30)
for permissions, retry/cleanup status and connector refresh steps.


### Közös profilsablon a ChatGPT/Grok pluginból

A get_profile_template olvassa a közös mezőszerkezetet és kitöltési útmutatókat;
az update_profile_template trusted módban menti az explicit kért mezőmódosítást,
bővítést vagy átrendezést. Verzióellenőrzés, ismétlésvédelem és előzmény védi;
a meglévő karakterértékek és kánon változatlanok. Részletek:
[Közös profilsablon](docs/GHOST_PROFILE.md).
