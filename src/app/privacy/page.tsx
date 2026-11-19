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

      <h2>What stays on your device</h2>
      <p>
        Your browser keeps a list of the groups you&apos;ve opened, with their
        links, and which member you said you are in each. This stays in your
        browser&apos;s storage and is never sent to Potluck. Anyone using this
        browser can see that list, and clearing your browser&apos;s site data
        removes it.
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

      <h2>Error reports</h2>
      <p>
        When something goes wrong, Potluck sends a report of the error to
        Sentry, a service that collects errors so they can be fixed. Sentry
        receives errors only: nothing about pages that work, and no recording of
        your visit. Before a report leaves, Potluck removes group link tokens
        and IP addresses from it. Sentry keeps each report for 30 days, stored
        in the US.
      </p>

      <h2>How long it&apos;s kept</h2>
      <p>
        A group is kept until someone deletes it. To delete a group, open Group
        settings and choose Delete this group. Deleting a group removes it for
        good: there is no undo.
      </p>
      <p>
        Potluck keeps encrypted backups, so its data can be restored if its
        database is lost. A deleted group stays in those encrypted backups for
        up to 14 days, until the last backup holding it expires. A single group
        is never restored on request: backups bring back the whole database
        after a disaster, not one group someone deleted.
      </p>
    </main>
  );
}
