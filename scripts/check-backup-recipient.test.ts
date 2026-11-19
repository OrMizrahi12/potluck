import { describe, expect, it } from "vitest";
import { checkBackupRecipient } from "./check-backup-recipient.mjs";

// The second recipient below is the example key from age's README.

describe("backup recipient check", () => {
  it("passes when the workflow encrypts only to the recorded recipient", () => {
    const result = checkBackupRecipient({
      workflow: [
        "      AGE_RECIPIENT: age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx",
        '            | age --encrypt --recipient "$AGE_RECIPIENT" --output "$file"',
      ].join("\n"),
      adr: "The recipient is `age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx`.",
    });

    expect(result).toEqual({
      passed: true,
      summary: expect.stringContaining(
        "age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx"
      ),
    });
  });

  it("fails when the workflow encrypts to a recipient the ADR doesn't record", () => {
    const result = checkBackupRecipient({
      workflow: [
        "      AGE_RECIPIENT: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p",
        '            | age --encrypt --recipient "$AGE_RECIPIENT" --output "$file"',
      ].join("\n"),
      adr: "The recipient is `age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx`.",
    });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain(
      "age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p"
    );
  });

  it.each([
    [
      "a second recipient key beside the recorded one",
      '| age --encrypt --recipient "$AGE_RECIPIENT" --recipient age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p --output "$file"',
    ],
    [
      "an ssh key as a second recipient",
      '| age --encrypt -r "$AGE_RECIPIENT" -r "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample" --output "$file"',
    ],
    [
      "a recipients file",
      '| age --encrypt --recipient "$AGE_RECIPIENT" -R keys.txt --output "$file"',
    ],
    [
      "a plugin recipient",
      '| age --encrypt --recipient "$AGE_RECIPIENT" --recipient age1yubikey1qwt50d05nh5vutpdzmlg5wn80xq5negm4uj9ghv0snvdd3yysf5yw3rhl3t --output "$file"',
    ],
    ["no recipient at all", '| age --encrypt --passphrase --output "$file"'],
  ])("fails when age is given %s", (_, ageLine) => {
    const result = checkBackupRecipient({
      workflow: [
        "      AGE_RECIPIENT: age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx",
        `            ${ageLine}`,
      ].join("\n"),
      adr: "The recipient is `age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx`.",
    });

    expect(result.passed).toBe(false);
  });

  it.each([
    ["records no recipient", "# Back up nightly\n"],
    [
      "records two recipients",
      "The recipient is `age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx`, or `age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p`.",
    ],
  ])("fails when the ADR %s", (_, adr) => {
    const result = checkBackupRecipient({
      workflow: [
        "      AGE_RECIPIENT: age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx",
        '            | age --encrypt --recipient "$AGE_RECIPIENT" --output "$file"',
      ].join("\n"),
      adr,
    });

    expect(result.passed).toBe(false);
  });
});
