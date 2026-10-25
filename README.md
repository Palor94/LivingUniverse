# Living Universe

A personal fictional universe with persistent character identity, visual references, memory, and history.

Current state: a working local character and media library. No AI provider is connected. No world simulation or face recognition is implemented yet.

## Open the application

Double-click **Start Living Universe.cmd**, keep its window open, and visit **http://127.0.0.1:4317** in your browser. Node.js 24 or newer is required (already available on this laptop). No dependency installation is needed.

1. Select **Find my media** to catalogue supported pictures and videos under this folder. This reads file names and metadata, leaves originals in place, skips symbolic links, and does not approve or identify anyone automatically.
2. Review source folders. Choose an existing character, or edit a folder title to create a new character. Shared folders may be assigned to several people. Loose/mixed files can stay in **Needs sorting**.
   For an already sorted character folder such as Attila or Dezső, click **Sort this folder** once. The application creates or reuses that character and assigns all pictures and videos in the folder, including subfolders. You can also tick several folders and click **Sort selected folders**. Repeating this is safe: existing assignments are retained, and the folder remembers its character even after you rename them. Use **Choose another character / shared folder** for other assignments. Loose files and mixed/shared folders should not be treated as one character.
3. Open an item to assign characters, add tags and notes, or review each character's appearance. Use **Set character cover** to choose a gallery portrait.
4. Edit profiles and directed relationships. **Approved identity** keeps immutable versions of explicitly approved appearance and reference choices. Output approval and gallery covers do not establish canon. Clothing tags describe individual media; underlying appearance is stored separately.

Character profile fields and the primary relationship towards Palor save automatically when you leave the textbox. Other media notes still use Save. Canonical appearance and references always require explicit approval. **Set character cover** opens a rectangle selector: drag around the face or other area to display on that character's cover. Cover cropping never edits the original or approves its appearance as canon. Image references have face/body/detail/general roles; in shared images, approve a reference only when the intended character is unambiguous.

### Pictures, video previews, and file management

Media browsing opens on **Pictures**, with a separate **Videos** tab. Visible video thumbnails silently cycle through frames five seconds apart. Open a video and select **Frames every 5 seconds** for a clickable frame strip. For long videos, sample additional five-minute batches on demand. These features use the browser's installed decoding support: unsupported codecs show a clear message, and no automatic transcoding is performed. Previewing online-only videos can make OneDrive download data.

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

Run `node app/server.mjs` to launch and `node --test tests/catalogue.test.mjs tests/improvements.test.mjs` for integration checks. The service listens on the laptop's loopback address only and blocks cross-site browser requests. It has no public hosting or remote access configuration.

Current limitations: no face recognition, AI generation, world conversations, collection-wide duplicate detection, reference-region crops, or bulk individual-file selection. Cover-region selection and local Hungarian name suggestions are available. A rescan discovers new paths but does not merge duplicates or repair files moved outside the app. Approved references receive SHA-256 fingerprints when approved; **Check reference files** detects missing or changed originals on demand. This verifies bytes, not visual correctness. Do not replace approved reference files in place.

Start with [the vision](PROJECT_VISION.md), [decisions](DECISIONS.md), [development plan](DEVELOPMENT_PLAN.md), and [visual identity design](docs/VISUAL_IDENTITY.md).

The living-world section is an explicitly marked future workspace. Generation and storytelling integrations follow incrementally.

Git records changes to source and documentation so they can be compared and recovered. The ignore rules intentionally exclude private media and user data. Git is not a backup of the media collection. A remote repository has not been configured.
