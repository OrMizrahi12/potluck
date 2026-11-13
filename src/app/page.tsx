import { CreateGroupForm } from "./create-group-form";

export default function Home() {
  return (
    <main>
      <h1>Potluck</h1>
      <p>
        Track what a group spends together. No sign-up: create a group and share
        its link.
      </p>
      <h2>Create a group</h2>
      <CreateGroupForm />
    </main>
  );
}
