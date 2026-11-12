# Workflow report: loading and pending states

Research from Mobbin (November 2026) on how mobile and desktop apps show that something is loading, saving, syncing or being generated. It ends with what fits Kineō, whether loading text is worth the extra code, and suggested changes.

## Summary

- Kineō reads and writes to a local database first, so most screens have nothing to wait for. Its loading states should be **rare, short and quiet**.
- Keep **skeletons** for the first open of a screen, but shape them like the screen they stand in for.
- Use **in-button pending states** ("Sending…") for actions, never a full-screen spinner.
- Use **one short line of text** only where a wait is long, can fail, or asks something of the user. Step-by-step progress lists are not worth it for Kineō.
- Show sync as a quiet status line ("Saved on this device"), not a screen.

---

## 1. Patterns found

### A. Skeleton screens (content placeholders)

- [Swiggy](https://mobbin.com/screens/157d2a19-df5e-4eb7-9cf4-0e134d591baa), [Trainline](https://mobbin.com/screens/e7a287a4-0d1d-491a-b3f3-9e85ce594c94), [Waymo](https://mobbin.com/screens/209d586d-c74b-476b-883f-50b5d26c6a78): grey blocks in the exact shape of the coming cards, inside the real header and tab bar.
- [talabat](https://mobbin.com/screens/c2ce6bf5-3ae0-4250-9ce4-9a3f9e2eb369): skeleton rows tinted in the brand colour under a live search field.
- [Google](https://mobbin.com/screens/c18a51d4-44f9-445c-abac-10c3c384ad2e): plain bars with a soft shimmer.

**Works because** the layout doesn't jump when data arrives and the real chrome (back arrow, tabs) is usable right away. **Fails when** the blocks don't match the real layout (Google's identical bars say nothing about what is coming).

### B. Spinner on an empty or near-empty screen

- [Perplexity](https://mobbin.com/screens/87df2e24-7e21-47fd-a781-8e676194fa72): a few skeleton shapes plus a small spinner.
- [Airbnb receipt](https://mobbin.com/screens/4adff428-e9db-4b68-a6f9-09e8f1dd5417): a thin bar, "Loading" and "Cancel" on a blank page.
- [Medium](https://mobbin.com/screens/fd140a05-1a71-4dab-9324-63387392f3f6): "Syncing…" in the middle of an otherwise empty tab.

**Works** for short, one-off waits with nothing to show. **Fails** for anything the user does often: the whole screen is blocked and "Loading" says nothing.

### C. Spinner with a heading and one line of explanation

- [MagicPath](https://mobbin.com/screens/caacb764-3107-461b-8f14-454dc3d0341e): "Preparing project" plus what is being checked.
- [Square](https://mobbin.com/screens/c4df63a3-d65b-40ca-9c11-196eb4c545e0): spinner, "17% complete", a heading and "Your results will be ready in a moment."
- [Bevel](https://mobbin.com/screens/29eb15ea-829a-4785-8d20-076e09a75d60) and [Base](https://mobbin.com/screens/503d3f84-fc4b-4087-8bfd-9ff94d1bc18b): "Ending workout · Please keep the app open", "Processing · Do not close this window".
- [WHOOP](https://mobbin.com/screens/1f3261a5-156f-4e20-bc7d-7b508da0d105): "Saving your schedule… Keep your WHOOP close by and connected."

**Works** when the text tells the user something they must do (keep the app open, stay connected) or how long to expect. **Adds nothing** when it only restates the obvious ("Processing", Fiverr's "Stay tuned…").

### D. Step-by-step progress lists

- [Brainly](https://mobbin.com/screens/5dcf2f0b-0988-470d-b180-52b26ec69833): "Generating your notes" with four steps that tick off.
- [AirOps](https://mobbin.com/screens/0a9b3407-3578-4f6b-b18b-b6d9ae306fc4): progress bar, four steps, tips and testimonials beside it.
- [Searchable](https://mobbin.com/screens/2fa6832e-e5a0-464f-b914-da10808a449b): a changing one-line caption ("Identifying competitors") over an animated grid.

**Works** for long (10 s+), multi-stage jobs like AI generation, where seeing progress keeps people from giving up. Each step needs real events from the backend to stay truthful.

### E. Percentage and time left

- [TikTok](https://mobbin.com/screens/27813f2f-decc-412a-b028-47710b83486c): "66%", "Around 6m left", and a button to keep working while it runs.

**Works** only for minutes-long jobs with measurable progress.

### F. Sync and background status

- [Bevel](https://mobbin.com/screens/29eb15ea-829a-4785-8d20-076e09a75d60): a small "Syncing…" pill at the top while the rest of the screen stays usable.
- [Google Health](https://mobbin.com/screens/1ddd8279-4192-4cbf-b203-2d112f174b5f): a "syncing" confirmation page that explains what happens next, then Done.

**Works** when sync runs in the background and the user can keep going.

### G. Done states after a wait

- [Swiggy](https://mobbin.com/screens/dab00723-a840-45e6-a255-0ebc60e177ac): a large badge and "All set!" after requesting invoices. Kineō uses toasts for this, which is quieter and fits the brief.

---

## 2. Comparison

| Pattern                            | Typical wait | Blocks the screen | Text                      | Code cost                          | Fit for Kineō                              |
| ---------------------------------- | ------------ | ----------------- | ------------------------- | ---------------------------------- | ------------------------------------------ |
| Skeleton in real layout            | under 1 s    | No (chrome works) | None                      | Low: one skeleton per screen       | **Yes**, first open only                   |
| Spinner on blank page              | 1–3 s        | Yes               | "Loading"                 | Lowest                             | Only the sign-in gate                      |
| Spinner + one line                 | 2–10 s       | Usually           | One sentence              | Low: one string per state          | **Yes**, for the few slow or risky actions |
| In-button pending                  | under 3 s    | No                | Button label ("Sending…") | Low                                | **Yes**, every save/send action            |
| Step list                          | 10 s+        | Yes               | One line per step         | High: each step needs a real event | No                                         |
| Percentage / time left             | minutes      | Partly            | Numbers                   | High: needs measurable progress    | No                                         |
| Background sync pill / status line | any          | No                | A few words               | Low                                | **Yes**                                    |

---

## 3. Is text on loading screens worth the extra code?

**Short answer: yes for a handful of states, no for the rest.**

The code for a line of text is small (a string and a state). The real cost is keeping it true: text that names a step must change when that step really happens, or it misleads. So text pays off only where it gives the user something they can't get from a spinner alone:

1. **What to do or not do** ("Keep Kineō open until this finishes"). Bevel, Base and WHOOP all do this.
2. **What is happening when it's not obvious**, such as waiting for the server before an invoice can be sent.
3. **What to do when it fails**, in the same place ("Couldn't reach the server. Your invoice is saved on this device. Try again").
4. **Waits over about 2 seconds**, where silence makes people tap again or leave.

Text is not worth it for waits under a second (it flashes and can't be read), for skeletons (the shape already says what's coming), or as filler ("Stay tuned…"). Step lists like Brainly's are built for long AI jobs; Kineō has none.

For screen readers, any text shown must go in a `role="status"` region so it is announced once. Skeletons themselves should be hidden from screen readers, with one "Loading" label on the container (`aria-busy="true"`).

---

## 4. Where Kineō stands today

- **Phone:** `apps/mobile/src/data/practice-data.tsx` shows a skeleton (one bar, one pill, three cards) until the first local read finishes.
- **Desktop:** `apps/desktop/src/data/PracticeStoreProvider.tsx` shows a similar skeleton; `InvoiceStyle.tsx` has a skeleton for the logo; `auth/AuthGate.tsx` shows a bare spinner labelled "Loading" while sign-in is checked.
- Both apps use the HeroUI `Skeleton`, so they already match the design rules ("loading skeletons" are required by the brief).

---

## 5. Suggestions

Listed most useful first. None of them adds a screen; each changes an existing state.

1. **Shape each skeleton like its screen.** The current skeleton is the same generic shape everywhere. Give Home, Patient and Invoices their own: Home gets the search field and three card rows, Patient gets the name, note box and visit rows, Invoices gets list rows with a tag-shaped pill. Keep the real back arrow and tab bar live around it.
2. **Don't flash skeletons.** Local reads usually finish in a few milliseconds. Show the skeleton only if loading takes more than about 300 ms, and once shown, keep it at least about 400 ms so it doesn't flicker.
3. **Put pending states in the button.** "Save note" → "Saving…", "Send invoice" → "Sending…", "Share PDF" → "Preparing PDF…", with a small spinner in the button, the width held steady, and repeat taps ignored. The rest of the screen stays usable.
4. **One line of text for the slow or risky cases only:**
   - First sign-in on a new device: "Getting your patients and invoices. This only happens once."
   - A new invoice not yet on the server (the domain rule that blocks sending): a status line on the invoice, "Waiting to reach the server before you can send", in place of a disabled button with no reason.
   - Sign out with unsynced changes: already covered by the brief's "Some changes haven't been saved yet" dialog.
5. **Show sync as a quiet status line, not a screen.** The storyboard already uses "Saved on this device" beside the invoice title. Use the same spot for "Saving…", "Saved" and "Offline: saved on this device".
6. **Give the sign-in gate the wordmark.** Replace the bare spinner in `AuthGate.tsx` with the Kineō wordmark and a small spinner below it, so the first thing people see is the product rather than a blank window. No text needed unless it takes more than about 2 seconds, then "Signing you in".
7. **Respect reduced motion.** Under `prefers-reduced-motion` (desktop) or the system Reduce Motion setting (phone), turn the skeleton shimmer into a static block.

Not recommended: progress percentages, step lists, tips or illustrations while loading, or full-screen loaders after the first open. They suit long jobs and marketing moments, not a calm local-first app.

## 6. Possible storyboard additions

If useful, the storyboard could gain one frame per platform showing: the shaped Home skeleton, an in-button "Sending…" state, the "Waiting to reach the server" line on a new invoice, and the sign-in gate with the wordmark, in light and dark.
