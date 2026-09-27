/**
 * People notes.
 *
 * Responsibilities:
 * - Decide which notes count as people, so mentions and people views agree.
 *
 * Contracts:
 * - A person is any Markdown note under the vault's `People/` folder, at any
 *   depth, matched case-insensitively. Nothing inside the note is required.
 */

// ponytail: fixed folder name; make it a vault setting if someone keeps
// people elsewhere.
export const peopleDirectory = "People";

export function isPersonNotePath(relativePath: string) {
  return relativePath.toLowerCase().startsWith(`${peopleDirectory.toLowerCase()}/`);
}
