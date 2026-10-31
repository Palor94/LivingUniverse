---
name: rename-character
description: Rename or undo a Living Universe character as one complete operation including the primary profile name, Hungarian text references and ID-owned OneDrive character folder. Preserve stable IDs and verified media. Use the connected rename_character MCP tools for explicit user rename requests.
---

# Complete Living Universe rename

Resolve the existing character by stable ID. Do not create a replacement
character or merely rewrite biography/relationship prose while leaving the
primary name unchanged. A rename request includes the primary name, safe text
references, old name as an alias, and the character's OneDrive folder. The user
does not need to enumerate these parts or request a separate folder operation.

Call `rename_character` with `character_id`, `new_name`, and a stable fresh
`request_key`. In locally configured trusted mode, an explicit user request
authorizes the complete operation; default `preview_only:false` performs it
without an extra conversational confirmation or mandatory private approval page.
Use `preview_only:true` if the user requested inspection only. Review mode
continues to require approval on the returned private page.

If writable references are ambiguous, no partial name/folder change is saved.
Read every `get_character_rename` page and resolve only the ambiguous identities.
Use exact `plan_id`/`plan_hash`, selected_ids and individual confirmed_ids with
`apply_approved_character_rename` when authorized in trusted mode. Never force
unknown suffixes, another person's references, source provenance or visual canon.
Full private context is available to the human on the review page; do not reveal
administrator text through an ordinary character conversation.

Check `status:applied`, the primary name, unchanged character-ID, folder receipt
and original media availability. Pending, stale or recovery-required results are
not a completed rename. Name/alias and filesystem collisions must not cause
overwrite or hidden merging. Shared media originals remain in their shared
location; if there was no character folder, an ID-owned folder is created.

Use the same request_key for an identical lost-response retry. Never fix a
failed write with direct SQL or ad hoc file moves; the durable filesystem journal
must reconcile interrupted operations. Changed data requires a new preview.

For an explicit undo request call `undo_character_rename` with the original
plan_id and a new stable request_key. Trusted mode performs the complete inverse;
`preview_only:true` prepares it. A later affected-record edit causes a conflict
rather than being overwritten. History and canonical references remain intact.

The owner's explicit current Áron→Ábel request authorizes that live rename and
its folder as a real operation after verified backup, not as a production test.
Development tests use disposable synthetic records. The active deployment is
under `00_SYSTEM/project`; updating a separate development checkout does not
update its running MCP adapters.
