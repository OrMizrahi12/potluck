import Link from "next/link";
import { ForgetMissingGroup } from "./forget-missing-group";

export default function GroupNotFound() {
  return (
    <main>
      <ForgetMissingGroup />
      <h1>No group at this link</h1>
      <p>
        Check that the whole link was copied. A group that was deleted
        can&apos;t be opened again.
      </p>
      <p>
        <Link href="/">Create a group</Link>
      </p>
    </main>
  );
}
