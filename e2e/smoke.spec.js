import { expect, test } from "@playwright/test";

const PASSWORD = "e2e-strong-passphrase-2026";
const suffix = () => Math.random().toString(36).slice(2, 8);

async function signup(page, fullname, username) {
  await page.goto("/signup");
  await page.fill("#signup-fullname", fullname);
  await page.fill("#signup-username", username);
  await page.selectOption("#signup-gender", "other");
  await page.fill("#signup-password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "New chat" }).first()).toBeVisible();
}

async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflow).toBe(false);
}

test("two people can find each other, chat in realtime and see typing and seen state", async ({
  browser,
}) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const aliceName = `alice_${suffix()}`;
  const bobName = `bob_${suffix()}`;

  await signup(alice, "Alice Test", aliceName);
  await signup(bob, "Bob Test", bobName);
  await expectNoHorizontalScroll(alice);

  // Alice starts a conversation with Bob
  await alice.getByRole("button", { name: "New chat" }).first().click();
  await alice.getByLabel("Search people").fill(bobName);
  await alice
    .getByRole("listitem")
    .filter({ hasText: `@${bobName}` })
    .click();
  await expect(alice).toHaveURL(/\/c\/[a-f0-9]{24}$/);
  await expectNoHorizontalScroll(alice);

  await alice.getByRole("textbox", { name: "Message", exact: true }).fill("hello bob");
  await alice.getByRole("button", { name: "Send message" }).click();
  await expect(alice.locator(".bubble").last()).toContainText("hello bob");

  // Bob sees it arrive in his list with an unread badge, then opens it
  const item = bob
    .getByRole("list", { name: "Chats" })
    .getByRole("listitem")
    .filter({ hasText: "Alice Test" });
  await expect(item).toBeVisible();
  await expect(item.locator(".badge-primary")).toHaveText("1");
  await item.click();
  await expect(bob).toHaveURL(/\/c\/[a-f0-9]{24}$/);
  await expect(bob.locator(".bubble").last()).toContainText("hello bob");

  // Alice's message is now marked as seen
  await expect(alice.locator('[aria-label="Seen"]').last()).toBeVisible();

  // Bob typing shows up for Alice, and his reply lands instantly
  await bob.getByRole("textbox", { name: "Message", exact: true }).fill("hi alice, typing here");
  // Scoped to the chat pane: the sidebar also shows it but is hidden on phones
  await expect(alice.locator("main").getByText("typing…")).toBeVisible();
  await bob.getByRole("button", { name: "Send message" }).click();
  await expect(alice.locator(".bubble").last()).toContainText("hi alice, typing here");
  await expect(alice.locator("main").getByText("typing…")).toHaveCount(0);

  await expectNoHorizontalScroll(bob);
  await aliceContext.close();
  await bobContext.close();
});

test("login redirect preserves deep links and invalid credentials are refused", async ({
  page,
}) => {
  await page.goto("/settings/appearance");
  await expect(page).toHaveURL(/\/login$/);

  await page.fill("#login-username", "nobody_here");
  await page.fill("#login-password", "definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid credentials")).toBeVisible();

  const username = `deep_${suffix()}`;
  await page.goto("/signup");
  await page.fill("#signup-fullname", "Deep Link");
  await page.fill("#signup-username", username);
  await page.selectOption("#signup-gender", "other");
  await page.fill("#signup-password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/settings/appearance");
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("messages can be replied to, reacted to, edited and deleted", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the hover toolbar is desktop-only");
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const bobName = `bob_${suffix()}`;
  await signup(alice, "Alice Test", `alice_${suffix()}`);
  await signup(bob, "Bob Test", bobName);

  await alice.getByRole("button", { name: "New chat" }).first().click();
  await alice.getByLabel("Search people").fill(bobName);
  await alice
    .getByRole("listitem")
    .filter({ hasText: `@${bobName}` })
    .click();
  const composer = (page) => page.getByRole("textbox", { name: "Message", exact: true });
  await composer(alice).fill("original message");
  await alice.getByRole("button", { name: "Send message" }).click();
  await expect(alice.locator(".bubble").last()).toContainText("original message");

  await bob
    .getByRole("list", { name: "Chats" })
    .getByRole("listitem")
    .filter({ hasText: "Alice Test" })
    .click();
  const bobRow = bob.locator(".group", { hasText: "original message" }).first();
  await expect(bobRow).toBeVisible();

  // Reply with a quote
  await bobRow.hover();
  await bobRow.getByRole("button", { name: "Reply" }).click();
  await expect(bob.getByText("Replying to")).toBeVisible();
  await composer(bob).fill("a reply");
  await bob.getByRole("button", { name: "Send message" }).click();
  const replyBubble = alice.locator(".bubble", { hasText: "a reply" });
  await expect(replyBubble).toBeVisible();
  await expect(
    replyBubble.getByRole("button", { name: "Jump to the quoted message" })
  ).toContainText("original message");

  // React
  await bobRow.hover();
  await bobRow.getByRole("button", { name: "Add reaction" }).click();
  await bob.getByRole("button", { name: "React with 👍" }).click();
  await expect(bob.getByRole("button", { name: /^👍 1/ })).toBeVisible();
  await expect(alice.getByRole("button", { name: /^👍 1/ })).toBeVisible();

  // Edit own message
  const aliceRow = alice.locator(".group", { hasText: "original message" }).first();
  await aliceRow.hover();
  await aliceRow.getByRole("button", { name: "More actions" }).click();
  await alice.getByRole("menuitem", { name: "Edit" }).click();
  await expect(alice.getByText("Editing message")).toBeVisible();
  await composer(alice).fill("original message, corrected");
  await composer(alice).press("Enter");
  await expect(alice.locator(".bubble", { hasText: "original message, corrected" })).toContainText(
    "edited"
  );
  await expect(bob.locator(".bubble", { hasText: "original message, corrected" })).toBeVisible();

  // Delete for everyone
  const editedRow = alice.locator(".group", { hasText: "original message, corrected" }).first();
  await editedRow.hover();
  await editedRow.getByRole("button", { name: "More actions" }).click();
  await alice.getByRole("menuitem", { name: "Delete for everyone" }).click();
  await alice.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(alice.getByText("This message was deleted").first()).toBeVisible();
  await expect(bob.getByText("This message was deleted").first()).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});

test("a group can be created, chatted in and left", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "covered on desktop; the flow is identical");
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const bobName = `bob_${suffix()}`;
  await signup(alice, "Alice Test", `alice_${suffix()}`);
  await signup(bob, "Bob Test", bobName);

  await alice.getByRole("button", { name: "New chat" }).first().click();
  await alice.getByRole("tab", { name: "New group" }).click();
  await alice.getByLabel("Group name").fill("Weekend plans");
  await alice.getByLabel("Search people").fill(bobName);
  await alice
    .getByRole("listitem")
    .filter({ hasText: `@${bobName}` })
    .click();
  await alice.getByRole("button", { name: "Create group" }).click();
  await expect(alice).toHaveURL(/\/c\/[a-f0-9]{24}$/);
  await expect(alice.getByText("You created the group “Weekend plans”")).toBeVisible();
  await expect(alice.locator("main").getByText("2 members")).toBeVisible();

  await alice.getByRole("textbox", { name: "Message", exact: true }).fill("who is in?");
  await alice.getByRole("button", { name: "Send message" }).click();

  const item = bob
    .getByRole("list", { name: "Chats" })
    .getByRole("listitem")
    .filter({ hasText: "Weekend plans" });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Alice: who is in?");
  await item.click();
  await expect(bob.getByText("Alice created the group “Weekend plans”")).toBeVisible();
  await expect(bob.locator(".bubble").last()).toContainText("who is in?");
  await expect(bob.locator(".bubble").last()).toContainText("Alice Test");

  // Bob leaves from the group info drawer; Alice is told
  await bob.getByRole("button", { name: "Conversation details" }).click();
  await bob.getByRole("button", { name: "Leave group" }).click();
  await bob.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(bob).toHaveURL(/\/$/);
  await expect(bob.getByRole("list", { name: "Chats" })).not.toContainText("Weekend plans");
  // Scoped to the chat pane: the sidebar preview says "Bob left" as well
  await expect(alice.locator("main").getByText("Bob left")).toBeVisible();
  await expect(alice.locator("main").getByText("1 member")).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});
