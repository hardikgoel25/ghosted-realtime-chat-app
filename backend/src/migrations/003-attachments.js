export const id = "003-attachments";
export const description =
  "Add attachment kind/resourceType and reactions to messages created before Phase 2";

/** Idempotent: only documents missing the new fields are touched. */
export async function up(db, { dryRun = false } = {}) {
  const messages = db.collection("messages");
  const kindFilter = { "attachments.0": { $exists: true }, "attachments.kind": { $exists: false } };
  const reactionsFilter = { reactions: { $exists: false } };

  if (dryRun) {
    return {
      attachmentsUpdated: await messages.countDocuments(kindFilter),
      reactionsAdded: await messages.countDocuments(reactionsFilter),
    };
  }

  const attachments = await messages.updateMany(kindFilter, {
    $set: { "attachments.$[].kind": "image", "attachments.$[].resourceType": "image" },
  });
  const reactions = await messages.updateMany(reactionsFilter, { $set: { reactions: [] } });
  return {
    attachmentsUpdated: attachments.modifiedCount,
    reactionsAdded: reactions.modifiedCount,
  };
}
