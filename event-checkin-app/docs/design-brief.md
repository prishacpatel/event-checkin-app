# Design brief for Figma

Figma files can't be generated from code, so this is the spec to recreate the screens in Figma first. The built app in `client/` follows it, so you can also open the running app and match your frames to it.

## Who and what

| Person | Job to do | Device |
|---|---|---|
| Attendee | Get a ticket, show it at the door | Phone |
| Volunteer | Find a shift that fits, sign up, leave if plans change | Phone |
| Door staff | Scan fast, see a clear yes or no, handle edge cases | Phone or tablet, dim room |
| Organizer | Create events and shifts, see who is on each shift | Laptop |

Real problems this solves (from running events): paper lists at the door, double entry from shared tickets, volunteers double-booked or too many on easy shifts, and no live count of who is in.

## Design tokens

| Token | Value | Use |
|---|---|---|
| Ink | `#2B1639` | Ticket body, primary buttons, active tab |
| Saffron | `#F6A21A` | Attendee name on ticket, focus ring |
| Jade | `#17856B` | Success, filled bars, "my shift" edge |
| Rani | `#C93A6E` | Errors, invalid scans |
| Background | `#F5F2F8` | Page |
| Line | `#DDD6E6` | Borders |

Type: **Bricolage Grotesque** (headings, ticket, scan result) and **DM Sans** (everything else). Scale: 14 / 16 / 18 / 24 / 36. Corner radius 8 for controls, 12 for cards, 18 for the ticket.
Build a Light and a Dark variant of the color styles.

## Screens to design (mobile 390 wide first, then desktop 1280)

1. **Get a ticket**: event name, date, venue, "N tickets left" pill, name and email fields, primary button "Get my ticket".
2. **Ticket**: the hero. Ink panel with event details and the attendee's name, a dashed perforation with two notches, and a white stub holding a large QR code. On mobile the stub stacks below.
3. **Volunteer shifts**: name and email at the top, then shift cards: role, time range, "3 of 6 filled", progress bar, and a "Needs people" tag on the emptiest open shifts. Button states: Sign up, Leave shift, Full. A jade left edge marks "my shifts".
4. **Staff sign-in**: PIN field only.
5. **Door check-in**: live "42 of 120 are in" bar, camera view, a manual code field, and a result panel that fills the width. Three states: **Checked in** (jade), **Already used** (amber, show first scan time), **Not valid** (rani).
6. **Roster and organize** (desktop): who is on each shift, forms for new events and shifts.

```
Ticket (mobile)                   Door check-in
+-----------------------+         +-----------------------+
| Diwali Night          |         | 42 of 120 are in      |
| Sat 6:30 PM           |         | [=========-----]      |
| Student Union         |         | +-------------------+ |
| Asha Patel            |         | |   camera view     | |
+- - - - - - - - - - - -+         | +-------------------+ |
|      [  QR CODE  ]    |         | [ Stop camera ]       |
|   Show this at door   |         | +-------------------+ |
+-----------------------+         | | Checked in        | |
                                  | | Asha Patel        | |
                                  | +-------------------+ |
                                  | Type a ticket code    |
                                  +-----------------------+
```

## Prototype flows to wire up in Figma

- Attendee: Get a ticket, submit, Ticket
- Volunteer: Shifts, tap Sign up, success banner, then try an overlapping shift to show the conflict message
- Door: Scan, show all three result states

## Copy rules

Buttons say what happens ("Get my ticket", "Leave shift"). Errors say what to do next. Sentence case everywhere.

## Handoff

Name Figma frames to match the React files (`Tickets`, `Volunteer`, `Staff`) so design and code line up, and keep the tokens above as Figma variables.
