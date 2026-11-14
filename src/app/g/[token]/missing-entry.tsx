import Link from "next/link";

/**
 * The edit page of an expense or settlement that isn't in the group, e.g. one
 * deleted since its link was opened. The group is still there, so this isn't
 * `notFound()`: g/not-found.tsx would say there's no group and this device
 * would forget it, and the member it claims there.
 */
export function MissingEntry({
  token,
  groupName,
  entry,
}: {
  token: string;
  groupName: string;
  entry: "expense" | "settlement";
}) {
  return (
    <>
      <p>
        <Link href={`/g/${token}`}>← {groupName}</Link>
      </p>
      <h1>No {entry} at this link</h1>
      <p>It may have been deleted, maybe from another device.</p>
    </>
  );
}
