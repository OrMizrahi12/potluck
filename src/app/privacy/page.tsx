import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · Potluck",
};

export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy</h1>
      <p>
        Potluck has no accounts. It keeps what a group records, and nothing
        about the people who visit.
      </p>

      <h2>What Potluck stores</h2>
      <ul>
        <li>Each group&apos;s name, currency and link.</li>
        <li>The names of its members, as typed by whoever added them.</li>
        <li>
          The expenses and settlements recorded in it: descriptions, amounts,
          dates and which members they involve.
        </li>
      </ul>
      <p>
        No email addresses, passwords or phone numbers. No cookies, no
        analytics, no advertising and nothing from other sites that could follow
        you. Potluck&apos;s own logs leave out IP addresses. Vercel, which hosts
        Potluck, sees your IP address to deliver each page and to protect the
        service from abuse.
      </p>

      <h2>The link is the key</h2>
      <p>
        <strong>
          Anyone with a group&apos;s link has full control of the group
        </strong>
        : they can see everything in it and change anything, including deleting
        it. There is no password or sign-in on top of the link. The link
        can&apos;t be changed, so once it reaches someone it can&apos;t be taken
        back. Share it only with the group&apos;s members.
      </p>
      <p>
        Group pages ask search engines not to list them, and Potluck
        doesn&apos;t pass a group&apos;s link on to other sites.
      </p>

      <h2>How long it&apos;s kept</h2>
      <p>
        A group is kept until someone deletes it. Deleting a group removes it
        for good: there is no undo.
      </p>
    </main>
  );
}
