# Robot24 Field Team

One place for the field crew, their documents and their payments.

- **Production** sees who everyone is and how to reach them, grouped by location.
- **HR and finance** drag and drop invoices. AI reads each one, splits fees from expenses, and files it against the right person for the month.
- **An approver** approves every bill before finance can pay it.
- **Admin** controls all personnel details and who has access.

## Replacing the code with a new version

Each zip contains the complete app. To update:

1. Unzip it.
2. On GitHub, open your `robot24-field-team` folder, click **Add file > Upload files**, and drag in everything inside the unzipped `robot24-field-team` folder: the `app`, `components`, `lib` and `supabase` folders and the loose files. Files with the same name are replaced.
3. Commit. Vercel redeploys on its own.

Delete these if they are still in your repo, as they are no longer used (open the file, three dots, **Delete file**):
- `app/api/inbound-email/route.js`
- `app/api/process-email/route.js`
- `components/InboxPanel.js`
- `components/PaymentsBoard.js`
- `lib/processEmail.js`
- `supabase/migration_002_expenses.sql`
- `supabase/migration_003_ref_codes.sql`
- a `health` folder sitting directly inside `robot24-field-team`, and `app/api/health` (no longer used)

Database updates are separate and only needed once. Run any you haven't run yet, in order, in the Supabase SQL Editor: `supabase/updates_004_to_016.sql`, `supabase/migration_017_ai_and_guardrails.sql`. Changes that only affect the look or screens never need a database step.

## Server functions (Vercel Hobby)

The app uses 2 server functions: `api/process-invoice` (all AI reading, Robbie, and the scheduled month end and backup jobs) and `api/admin-users` (adds users, resets passwords, removes and restores access). Everything else runs in the browser.

## Look and feel

Matches robot24.com: light sky blue header with the navy ROBOT24.com wordmark, a navy strip below it, navy pill buttons, Poppins headings and Inter body text, and charts in navy and sky blue. Fonts load from Google Fonts.

## Who can do what

| | Production and assignments | HR and finance | Approver | Admin |
| --- | --- | --- | --- | --- |
| Directory: name, role, location, phone, email, WeChat, T-shirt, mic sponge, contract signed | Yes | Yes | Yes | Yes |
| See rates, bank details, payments | No | Yes | Bills they approve | Yes |
| Upload invoices, create and edit draft bills | No | Yes | No | Yes |
| Reports | No | Yes | No | Yes |
| Record flights, trains, hotels booked by Robot24 | Yes | Yes | No | Yes |
| Add assignments, upload tickets to fill in bookings | Yes | Yes | No | Yes |
| Send bills for approval, mark approved bills paid | No | Yes | No | Yes |
| **Approve or reject bills** | No | No | **Yes** | No (unless also approver) |
| Upload contracts, passports, IDs. Edit home address and photo | No | Yes | No | Yes |
| See field team photos | Yes | Yes | Yes | Yes |
| Edit any other personnel details | No | No | No | **Yes** |
| Add field team members | No | No | No | **Yes** |
| Add users, set access, choose approvers | No | No | No | **Yes** |
| See the audit trail | No | No | No | **Yes** |

"Approver" is a tick box on top of any access level. For example, the General Manager can be Production and assignments plus Approver.

These rules live inside the database, not just on screen. Nobody can skip approval, change an amount after it was sent for approval, fake who approved it, delete a paid bill, or give themselves more access. All of this was tested on a real database before release.

## How a bill moves

| Status | Meaning | Who moves it on |
| --- | --- | --- |
| **To check** | AI has read the invoice. Check the amount and person | HR/finance clicks **Send for approval** (one or all) |
| **Awaiting approval** | Locked. Waiting for the approver | Approver clicks **Approve** or **Reject** (one or all) |
| **Approved** | Cleared to pay | HR/finance clicks **Mark paid** after the transfer |
| **Paid** | Done, with date and bank reference | |
| **Rejected** | Sent back with the approver's reason | HR/finance fixes it, **Back to draft**, sends again |

---

## Setup

You need free accounts on GitHub, Supabase and Vercel, plus an Anthropic API account.

### Step 1. Supabase database

1. Create a project at supabase.com (Frankfurt or Mumbai region is closest to Dubai).
2. **Ran an older version of this app before?** Open **SQL Editor > New query**, paste `supabase/reset.sql`, click **Run**. This clears the old tables. Logins are kept.
3. New query, paste all of `supabase/schema.sql`, click **Run**.

**Already set up and just updating?** Don't rerun the reset or schema. Run only the update files you haven't run yet, in order:
- `supabase/updates_004_to_016.sql` (updates 4 to 16 combined: photos and disputes, bookings, assignments, access, audit trail, exchange rates, currencies, check-out dates, bills linked to jobs, shared receipts, staff portal, payroll approval, Staff access for HR and finance)
- `supabase/migration_017_ai_and_guardrails.sql` (freelancer passport details, staff contract details, approver checks)

They keep all your data and are safe to run twice.
4. New query, paste `supabase/seed.sql`, click **Run**. This loads the 30 people from Field_Team_Rates.xlsx. Run it once only.
5. **Authentication > Sign In / Providers > Email**: turn off **Allow new users to sign up**.

### Step 2. Copy your Supabase keys

| Value | Where |
| --- | --- |
| Project URL | Green **Connect** button at the top of Supabase |
| Publishable key | **Project Settings > API Keys**, starts `sb_publishable_` |
| Secret key | Same page, starts `sb_secret_`. Click the eye icon, then copy |

The secret key only ever goes into Vercel. Never GitHub, chat or email.

### Step 3. Make yourself admin

1. **Authentication > Users > Add user > Create new user** with your email and a password. Tick **Auto Confirm**.
2. In the SQL Editor run:

```sql
update public.profiles set role = 'admin' where email = 's.kajee@robot24.com';
```

Everyone else can be added from inside the app on the **Users** page once you're signed in.

If you ran `reset.sql`, run this line again. The reset puts everyone back to Production.

### Step 4. Anthropic API key

1. console.anthropic.com > **API keys > Create key**.
2. Add about $5 credit under Billing. Optional: set a monthly cap under **Settings > Limits**.

The app uses **Claude Haiku 4.5**, the fastest and cheapest model, at under 1 US cent per invoice. If it misreads handwritten, scanned or Chinese and Korean invoices, change `ANTHROPIC_MODEL` to `claude-opus-5-5` and `ANTHROPIC_MAX_TOKENS` to `8000` in Vercel, then redeploy. Expect about 3 to 6 cents per invoice on Opus.

### Step 5. Put the code on GitHub

Use a **private** repository. It contains names and rates.

**In the browser:** unzip the project, create a new private repo, click **uploading an existing file**, drag in everything **inside** the `robot24-field-team` folder, commit. On a Mac press `Cmd + Shift + .` first so hidden files show.

**Updating an existing repo:** upload the new files into the same folder as before. Then delete these old files from the repo, as they are no longer used:
- `app/api/inbound-email/route.js`
- `app/api/process-email/route.js`
- `components/InboxPanel.js`
- `components/PaymentsBoard.js`
- `lib/processEmail.js`
- `supabase/migration_002_expenses.sql`
- `supabase/migration_003_ref_codes.sql`

To delete a file on GitHub, open it, click the three dots at top right, then **Delete file**.

### Step 6. Deploy on Vercel

1. vercel.com > **Add New > Project** > import the repo. If your files sit inside subfolders, set **Root Directory** to the folder that holds `package.json`.
2. **Environment Variables**, add all of these **before** deploying:

| Name | Value |
| --- | --- |
| `NEXT_SUPABASE_URL` | Project URL |
| `NEXT_SUPABASE_ANON_KEY` | Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key |
| `ANTHROPIC_API_KEY` | From Step 4 |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |
| `ANTHROPIC_MAX_TOKENS` | `4000` |
| `DEFAULT_PAYMENT_TERMS_DAYS` | `14` |
| `NEXT_INVOICE_EMAIL` | `s.kajee@robot24.com` |

Remove `INBOUND_WEBHOOK_TOKEN` if you added it before. It's no longer used.

3. **Deploy**. Open the URL and sign in.

After changing any variable: **Deployments > Redeploy**.

### Step 7. Add your team

1. Sign in and open **Users**.
2. Click **+ Add user**, enter their name and work email, pick what they can do (Production and assignments, HR and finance, or Admin), and tick **Can approve bills** if needed.
3. Click **Create user**. The app creates a temporary password and a welcome message with the link, email and password. Click **Email it** or **Copy message** (for WhatsApp).
4. They sign in and click **Password** at the top to choose their own.

On each user's row: change access or the approver tick directly, **Reset password** (new temporary password and message), or **Remove access** (blocks sign-in, keeps their history; **Restore access** undoes it). The list shows when each person last signed in. All of this is recorded in the audit trail.

### Step 8. Send everyone their reference

Every field team member has a reference like `R24-CN-001`. It's the surest way for the AI to match an invoice. Open a person in **Team and documents** and click **Email reference**, or **Copy reference message** to paste into WeChat or WhatsApp. It asks them to write the reference on every invoice under their name.

---

## Using it

### Uploading invoices (HR and finance)

1. **HR and finance > Upload invoices.**
2. Pick the month with the arrows at the top.
3. Drag in PDFs or photos, as many as you like at once.

Each file is read and matched in a few seconds. A file can become:

| Result | What it means |
| --- | --- |
| **Added** | Matched. Fee and expenses become separate bills in **To check** |
| **Who is this?** | No match. Pick the person from the list and click **Create bill** |
| **Needs a look** | A quote, proforma, credit note, or no amount found. No bill created |
| **Already uploaded** | Same invoice number for the same person exists |
| **Failed** | Click **Read again**, or create the bill by hand |

**How a person is matched, in order:** the reference on the invoice or in the file name, then the name read by AI, then a similar name search. If someone forgot their reference, the bill carries a reminder flag.

A **Check** flag appears on a bill when:
- the amount differs from their rate card
- the currency differs from their rate card
- the lines don't add up to the total
- expenses have no receipt
- the invoice has bank details on it
- the invoice is dated in a different month from the one you filed it under

### Bills linked to jobs, missing invoices, payment confirmations

- **Shared expenses on freelancer invoices:** we reimburse whoever paid, so a bill is never split. Instead, if an expense line says it covered others ("taxi for 2 crew"), or a colleague on the same job claimed the same kind of expense for the same amount on the same day, the bill is flagged as a possible shared receipt so it is not paid twice.
- **Bills linked to jobs:** the AI links each invoice to the person's assignment, by OPP code or event name, then by work dates, then by month. A bill billing more days than the job was booked for is flagged, and so is an invoice that can't be matched. Change the link in the bill under **For assignment**. Month view and Approvals show the job on each bill.
- **Missing invoices** tab: finished jobs with no fee invoice linked yet, with how long ago they ended. **Send reminder** opens a ready-made message, and **Mark completed** tidies up jobs still set to Confirmed. The tab shows a count.
- **Payment confirmation:** after **Mark paid**, a message with the amount, date, bank reference and job opens to Copy, WhatsApp or Email. Resend it any time from the bill with **Send payment confirmation**.

### Disputed or wrong invoices

Open the invoice in **Upload invoices** (switch the list to **All**):

| Button | What it does |
| --- | --- |
| **Replace with corrected invoice** | Asks why (e.g. "overcharged hotel by USD 200"), removes the old bills, reads the corrected invoice in their place. The old file stays, marked **Replaced** with your reason, as a record of the dispute |
| **Delete invoice** | Removes the file and every bill made from it, for good |

Both are blocked once a bill from that invoice is approved or paid, so money already cleared can't vanish from the records. If a bill is waiting for approval, withdraw it first.

### Adding and removing invoices

| Where | Button | What it does |
| --- | --- | --- |
| Upload invoices | Drop files | Adds invoices, read and matched by AI |
| Month view | **Add bill** | Adds a bill by hand, no AI |
| Any bill | **Attach invoice** / **Replace file** | Adds or swaps the PDF or photo on that bill, without re-reading it |
| Any bill | **Remove file** | Takes the file off, keeps the bill |
| Any bill | **Delete bill** | Deletes just that bill |
| Any bill from an upload | **Delete whole invoice** | Deletes the fee bill, the expense bill and the file together |
| Upload invoices | **Delete invoice** | Same as above, from the upload list |
| Month view | Tick boxes, then **Delete selected** | Deletes several bills at once |

HR and finance can delete drafts and rejected bills. Bills waiting for approval must be withdrawn first. Approved or paid bills can only be deleted by an **admin**, who has to type DELETE to confirm, because it removes money already cleared from the records.

### Expenses

Every bill has a breakdown. Open it and use **+ Add expense** for each cost, pick the category, add the date and amount, tick **Receipt** if you have one, or **Remove** a line. The bill total adds itself up, and a summary shows totals per category.

Categories: Hotel, Flights, Train and bus, Taxi and Uber, Car, fuel, parking, Meals, per diem, Equipment hire, Data and phone, Visa and permits, Other. The AI sorts invoice lines into these automatically, and you can change any of them.

If an invoice only had a fee and the expenses came separately, open the fee bill and click **+ Add expenses to this invoice**. It creates an expense bill for the same person, month and invoice number.

### Clashes, briefs and the calendar (Assignments)

- **Clash check:** saving a job that overlaps another job for the same person asks you to confirm. Clashing jobs show a red **Clash** badge in the list, in each person's month and on the calendar. Travel that starts more than 3 days before a job, after it ends, or returns more than 3 days after it is flagged with ⚠.
- **Calendar** tab: the month as a grid, **By person** or **By country**. Booked, planned and completed jobs are coloured bars, clashes are outlined in red, and ✈ 🚆 🏨 mark travel days. Click a bar to see that person's month.
- **Brief** button on each assignment: the job, dates, place, notes, flights and hotel, plus how to invoice, in one message. **Copy**, **WhatsApp** or **Email**, and edit it first if you like.

### Directory: who is booked for what

Everyone (production, HR and finance, admin) can click a person in the **Directory** to see their month: days booked, planned and completed, each job with dates, place and status, and the flights, trains and hotels booked for them. Use the arrows to see other months.

### Assignments (production and assignments)

**Assignments** in the top bar. Pick the month. The top of the page shows a box for each country where people are booked: number of people and jobs, how many are booked, planned, completed or cancelled, who, and travel booked there. Click a box to list who is booked there and for what; click it again or **Show all places** to see everything. Country names are tidied automatically, so "UAE" and "United Arab Emirates" group together, and the Country field suggests names as you type.

**Paste a brief** drafts jobs from a client brief, email, WhatsApp message or itinerary (pasted, or uploaded as a PDF or photo): one job per person with the event, OPP code, place, dates and status. Check each one, untick any you don't want, and click **Add**. People not on the field team list, clashes and odd dates are pointed out, and nothing is saved until you add them.

Click **+ Add assignment** to:

1. **Add an assignment:** person, assignment name, event or OPP code, city, country, start and end dates, status (Planned, Confirmed, Completed, Cancelled), notes. The form keeps the job details after saving, so several people on one job are quick to add.
2. Click **+ Add travel** on an assignment. The travel form opens for that person and job.
3. Click **Upload ticket, hotel booking or receipt** and choose the e-ticket, train ticket, hotel confirmation or hotel receipt (folio). The AI fills in the person (from the passenger or guest name, or their email), category, route or hotel and nights, supplier, booking reference, dates (check-in and check-out for hotels, departure and return for flights) and amount. It links the booking to the right assignment: first by the OPP code or event name on the document, then by dates and city. Check it and click **Add booking**. The document is saved as the receipt.
4. **One person or shared?** After reading any ticket, booking or receipt, the app asks whether it is for one person or shared. It suggests **Shared** when the document names several people, or when colleagues are booked on the same job.
5. **Shared:** choose who it covers (people on the same job are offered first, or add anyone), then **Split equally** or **Enter amounts**. Each person gets their share, linked to their own job, and the receipt is attached to each. It is saved as one receipt in shares, shown as "Shared, 1 of 2", so reports count it once. Filling the form by hand works the same way: tick **This receipt is shared between several people**.
6. **Duplicate guard:** if a booking reference is already recorded, you see who it is on and the amount before anything is saved again.
7. Deleting one share asks whether to delete the whole receipt or just that share.

Change an assignment's status straight from the list. Production and assignments see names, contact details, assignments and travel, never rates, bills or bank details. Each person's profile lists their assignments.

### How invoices are matched to people

In order: the R24 reference, then the **email address on the invoice** matched to the email on file, then the name, then a similar name search. If the email and the name point to different people, the email wins and the bill is flagged.

Each expense line keeps what the person wrote it was for, and is filed by that purpose: Uber, Careem, Grab or taxi go to Taxi and Uber, per diem to Meals, and so on.

**Invoices in other languages** (Chinese, Korean, Turkish, French and so on) are translated automatically. Descriptions, event names and notes arrive in English, each line keeps its original wording underneath, and the bill and upload show **Translated from Korean** (or the language) with a short English summary. Local currencies (₩, 元/RMB, ₺, €), number formats like 1.234,56 and dates like 2026年10月3日 are understood. If an invoice's currency differs from the person's day rate currency, the bill is flagged to convert before approving. Tickets in other languages fill the booking form in English too.

**Hotels and flights are always booked and paid by Robot24, never invoiced by freelancers.** If one appears on an invoice anyway, it is left off the bill and the bill is flagged so you can check with the person. An invoice that only claims a hotel or flight creates no bill. Bills don't offer Hotel or Flights as categories; record those under **Booked by Robot24**. The same happens when you type an expense line yourself, until you pick a category by hand.

### Booked by Robot24 (flights, trains, hotels the company pays)

**HR and finance > Booked by Robot24**, for the month at the top. For each booking enter who it was for, the category (Flights, Train and bus, Hotel and so on), what it was (e.g. "DXB to ICN return"), the airline or supplier, booking reference, travel date, amount, and optionally the e-ticket or receipt. After saving, the form keeps the person and category, so several bookings for one trip are quick to add.

These are **not owed to the freelancer**, so they never appear in bills, approvals, "to pay" totals or the payment run CSV. Click any booking to edit it, or delete it.

In **Reports** they show as:
- a line under the headline figures: paid to members + booked by Robot24 = full field team cost
- **Booked by R24** and **Full cost** columns in the member table
- part of the expense categories and expenses by member, when **Include travel booked by Robot24** is ticked (on by default)

Each person's profile also lists their bookings.

### Month view

The month's bills, grouped by location, with totals for **To check**, **Awaiting approval**, **Approved, to pay** and **Paid**. Click a total to filter. Filter fees or expenses, by location, or search. **Send N for approval** sends every checked draft in one go. **Export CSV** gives a payment run list with bank details. Click any bill to see line items, the invoice file, and who approved it and when.

### Approvals (approver)

The **Approvals** page lists every bill waiting, grouped by month with totals. Open a bill to see line items, the rate card, any flags, and the invoice itself. Approve or reject one at a time, or **Approve all** for a month. Rejections ask for a reason, which finance sees.

### Reports (HR, finance and admin)

**Reports** in the top bar. Pick a year, then a month or **Whole year**.

- **Headline figures:** total, fees, expenses, members paid and average per member, each compared with the month or year before.
- **Month by month:** fees and expenses for every month of the year. Click a bar to jump to that month.
- **By location** and **Top members** for the chosen period.
- **Expenses by category:** hotel, flights, train and bus, Uber and taxis and the rest, read from the invoice lines.
- **Expenses by member:** what each person spent on each category, e.g. hotels and Uber for the month.
- **Each member:** fees, expenses, total and share of spend. Click a column heading to sort.
- **Year at a glance:** every member across January to December, shaded so busy months stand out, with year totals.

**Count** decides which bills are included:

| Option | Includes |
| --- | --- |
| Paid, by bill month | Paid bills, under the month they were uploaded for (default) |
| Paid, by payment date | Paid bills, under the month the money went out |
| Approved and paid | Also bills approved but not yet paid |
| Everything billed | Every bill except rejected ones |

Charts show one currency at a time, since USD and GBP can't be added together. A note appears when other currencies have amounts in the same period.

**Export CSV** on each table. **Print or save PDF** gives a clean A4 landscape report: choose "Save as PDF" in the print window.

### Cost per opportunity (in Reports)

Click **By opportunity** at the top of Reports. Each opportunity (OPP code, or the job name when there is no code) with a job in the chosen period shows its people and days, invoiced fees and expenses, flights and hotels booked by Robot24, what has been spent, and an estimate for jobs not yet invoiced (day rate × days). Click one to see each person's share. Everything is in USD or AED, and bills not linked to a job are pointed out so you can link them.

### Currencies in Reports

- **Show in USD or AED:** the toggle at the top of Reports. Every bill and booking is converted, so all currencies add up together.
- **Paid in:** under the headline figures, what was actually paid in each currency (e.g. £1,350.00 = US$1,714.50). The member table has a **Paid in** column showing each person's original currency, plus columns in USD and AED.
- **AED** is pegged at 3.6725 per USD, so that conversion is exact.
- **Exchange rates** (button at the top of Reports): one rate per currency per month, e.g. 1 GBP = 1.27 USD. **Get today's rates** fills the current month from ExchangeRate-API. For past months, enter the rate finance used. A month without a rate uses the closest earlier month. Changes are in the audit trail.
- If a currency has no rate at all, its amounts are left out of totals and a note says so, with a link to add one.
- Projections convert each day rate the same way, e.g. "£135.00/day = US$171.45".

### Projection (in Reports)

Click **Projection** at the top of Reports, then pick a month or the whole year, location and currency. It projects what each freelancer will cost from the Assignments page and their rate card:

| Part | Shows |
| --- | --- |
| Committed | Confirmed and completed jobs at their rate card, plus flights, trains and hotels already booked |
| Planned | Planned jobs at their rate card, still to confirm |
| Projected total | Committed + planned |
| Invoiced so far | Bills received for the period (not rejected), and confirmed fees still to be invoiced |
| By month chart | Confirmed fees, travel booked and planned fees for each month of the year |
| Per freelancer | Each person's committed, planned and invoiced amounts. Click a name to see each job and how its fee was worked out |

Rules: day rate × days booked (10 and 15 day packages were legacy contracts and are never used); jobs crossing a month end are split by days; cancelled jobs are left out; anyone with no rate on file is flagged. Day rates in GBP, AED and other currencies are converted using Exchange rates. Anyone booked in the period but not shown (other currency, other location, cancelled job, inactive) is listed above the chart with the reason.

### Team and documents

- Everyone, grouped by location, with rates, contract status, passport status (missing, expiring within 6 months, expired), address and kit.
- **Photos:** open a person and click **Add photo**. It's shrunk and cropped to a square automatically. Everyone signed in, including production, sees photos in the directory.
- **HR and finance** can add the photo and home address and upload contracts, passports, IDs, visas and bank letters, with signed and expiry dates. Uploading a signed contract marks the person as signed, which production sees.
- **Admin** can edit every field and add new field team members with **Add field team member**. New people get a reference automatically.
- Untick **Active** when someone leaves. History is kept.

#### Staff portal (Robot24 employees)

A separate **Staff** section for Robot24's own team, not the field team. It is HR and finance's tool: **HR and finance and admins have access automatically**, and an admin can tick **Staff access** (Admin > Users) for anyone else who needs it, for example a manager who approves salaries. Employees themselves do not sign in to it.

- **Add staff:** **+ Add staff**. 1) Upload the passport: name, passport number, nationality, date of birth, gender and expiry fill in. 2) Job title, monthly salary, currency, start date, working days (Monday to Friday, or Monday to Saturday). 3) Upload the signed offer letter if you have it: it is checked against what you entered and they are added as **Active**; otherwise they are saved as **Offer sent**.
- **Offer letter:** on their profile, **⋯ > Generate offer letter** fills the company template (`public/templates/offer-letter.docx`) and downloads it as Word, and can save a copy to their documents. Jersild Roberts's signature (`offer-letter-signed.docx`) is added only when you tick the box. To change the wording, edit the Word templates and keep the `{name}`, `{passport}`, `{dob}`, `{nationality}`, `{title}`, `{location}`, `{salary}`, `{start}`, `{workdays}` and `{date}` placeholders.
- **Documents:** passport copy, Emirates ID, labour card, MOHRE contract, offer letter, employment contract, visa, other. **Upload and read** fills in Emirates ID, labour card and visa numbers and expiry dates, and points out anything that differs from the profile. A signed offer letter or contract makes someone on Offer sent Active.
- **Visa status** on each profile: Not started, Entry permit applied, Entry permit issued, Medical and Emirates ID in progress, Residence visa issued, Own visa, Cancelled.
- **Payroll** tab, for the month in the navy strip: a full month pays the monthly salary; joining or leaving mid-month pays **monthly salary × 12 ÷ 365** for each calendar day employed. Working days (by their work week) are shown for reference. **Export CSV** for the payroll run. People on Offer sent are not paid.
- **Overview** (first tab): cards for this month's payroll and its status, payroll waiting for your approval, documents expiring, missing documents, offers waiting, starters, visas in progress, leavers, active staff and the yearly run rate, plus lists of what is expiring and who is joining or leaving.
- **Payroll approval:** HR clicks **Send for approval**; a snapshot of every line is saved as the payroll report. Approvers with Staff access (HR and finance, admins, or the tick) see it on Home and in Payroll and **Approve** or **Reject** with a reason. If salaries or dates change after sending, the page says what changed and HR clicks **Update and resend**. Once approved it is locked; HR clicks **Mark paid** with the bank or WPS reference. **Print or save PDF** gives the report. The database enforces all of this, and every step is in the audit trail.
- **Reports:** a year at a glance (paid and approved are actual, other months are worked out from staff records, unsigned offers shown separately), a 12-month projection, cost by department, and joiners and leavers. Export CSV or print.
- **Terminate:** **⋯ > Terminate**, last working day and reason. The record and documents are kept and pay stops after that day. **Undo termination** reverses it.
- **Remove:** admins only, for mistakes: type DELETE. Deletes the person and their documents.
- **Home** shows staff documents expiring within 60 days, offers waiting to be signed and staff starting within 30 days. Every change is in the audit trail. Robbie explains the Staff section only to people with Staff access.

### Less typing, fewer mistakes

- **Add a freelancer from documents:** People > Records > **Add field team member**, then upload their passport and signed contract under **Fill in from documents**. Both are saved to their file.
- **Staff contracts:** uploading a MOHRE or employment contract fills in contract type, end date and salary breakdown, and flags a total that differs from the monthly salary.
- **Robbie fills in jobs:** "add Ishaan to Gitex 12 to 14 October" > **Open the filled-in form** > check > **Add assignment**. He never saves anything himself.
- **Checks before saving:** amounts about 10 times (or a tenth of) the usual, very high amounts, dates far in the past or future, very long jobs or bookings, and people already on file all ask you to check first.
- **Approver checks:** "Things to check before approving" on bills (unusual amounts, duplicate invoice numbers, same amount twice, more days than booked, not linked to a job) and on staff payroll (compared with last month).
- **Month end checklist** on Home for HR and finance, ticking itself off.
- **Undo** for 10 seconds after deleting a job, a travel booking or a document.
- **Welcome tour** by Robbie on first sign-in, and again from the name menu.
- **Empty pages** say what to do next, with the button.
- **Take photo** on phones for every upload.
- **Backup:** Admin > Backup > **Download full backup** (every record as CSV files in a zip).

### Email and automatic jobs (optional, recommended)

Optional: a **backup emailed to admins every Monday** at 08:00 Dubai time (`vercel.json`). It only runs once email is set up; without it, download backups from **Admin > Backup** (Home reminds admins when the last one is over 7 days old). Nothing else is emailed automatically: freelancer reminders and payment confirmations are always sent by a person, from the app.

To turn the weekly backup email on:
1. Create a free account at resend.com and verify your domain (robot24.com) by adding the DNS records it shows you.
2. Create an API key.
3. In Vercel > Settings > Environment Variables add `RESEND_API_KEY` (the key), `MAIL_FROM` (e.g. `Robbie <robbie@robot24.com>`) and `CRON_SECRET` (any long random text). Optional: `BACKUP_TO` (comma-separated emails; otherwise all admins).
4. Redeploy. Each backup is recorded in the audit trail under Automation.

### Finding your way around (new layout)

The menu is organised by task: **Home**, **People**, **Jobs**, **Money**, **Reports**, **Admin**. On a phone it sits as a bar along the bottom. Each person only sees their sections.

| Section | What is there | Who |
| --- | --- | --- |
| Home | What needs you today (bills to check, approvals, uploads, missing invoices, clashes, passports, contracts, exchange rates) and who is working and travelling this week | Everyone |
| People | Directory; Records and documents (rates, contracts, passports, photos) | Everyone; records for HR and finance |
| Jobs | Jobs (country boxes and list), Calendar, Travel (flights, trains and hotels) | Production and up |
| Money | Inbox (upload invoices), Bills, Approvals, Missing invoices | HR and finance; approvers see Approvals |
| Reports | Spend so far, Projection, By opportunity, Exchange rates | HR and finance |
| Staff | Overview, Staff, Payroll (with approval), Reports (Robot24 employees) | HR and finance, admins, and anyone given Staff access; approving payroll needs the approver tick too |
| Admin | Users, Audit trail | Admins |

- **One month for the whole app:** pick it in the navy strip; Home, Jobs and Money follow it, and Reports starts from it.
- **Pages remember their data,** so switching back is instant and a new month loads behind a dimmed view instead of a blank "Loading".
- **Row actions** sit in a "⋯" menu at the end of each row, with the main button kept on the row.
- **Your name** at the top right opens Change password and Sign out.
- **Old links still work:** Directory, Assignments, HR and finance and Approvals forward to their new place, including tabs.

## Robbie, the help assistant (everyone)

The robot button in the bottom right corner opens **Robbie**. Ask how to do anything ("how do I split a hotel receipt?") and he answers with numbered steps using the exact button names, plus **Take me there**, which opens the right page and tab. **Robbie only knows what each person is allowed to use.** The guide in `lib/helpGuide.js` is split into sections tagged by access level (everyone, HR and finance, approver, admin), and the server sends Robbie only the sections for the person asking, worked out from their account, not from anything they type. Ask him about something outside your access and he says which team handles it, with no steps; claiming to be an admin doesn't change that, because he never received those parts. His **Take me there** links are limited to pages the person can open, and he cannot see any data (names, amounts, rates or bank details). **When you add or rename a feature, update `lib/helpGuide.js`** and tag the section with who may see it. Each answer costs well under a cent and runs through the existing `api/process-invoice` function.

Tabs now live in the address (e.g. `/finance?tab=month`), so they can be bookmarked and shared.

### Audit trail (admin)

**Users > Audit trail** shows every addition, change and deletion across field team details, bills, invoices, bookings, assignments, documents and user access: who did it, when, and for changes each field's before and after. Click a row to see the details.

- Filter by period, person, area, action, or search by name, invoice or file. **Export CSV** for a record.
- Invoices read by AI are credited to the person who uploaded them, marked "via AI reader".
- Every step of a bill is logged: added, sent for approval, approved or rejected (and by whom), paid with the reference.
- Bank details show as changed, never their value.
- The database writes the log itself, so it can't be skipped, and nobody, including admins, can edit or delete an entry.
- Activity is logged from the moment the update is installed. Earlier changes are not in it.

## Data to fix first

- Set a proper **day rate** for anyone who only has an old 10 or 15 day package on file: from the original list that is Jamal, Ciaran, Seth, Vagner and Vinging. Until then the app estimates their day rate from the old package (e.g. 1,350 for 10 days becomes 135 a day) and labels it **Estimated**.

- 12 people have no email on file (the China team, Lemuel and Benn).
- Add bank details so the CSV export is a complete payment run.
- Add addresses and passports for everyone.
- Charlie's contract is marked not signed.
- Sam La France had "Yes" in the 15 day rate column with no amount.

## Run on your own computer (optional)

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                   # http://localhost:3000
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Everyone's login fails | Supabase URL or publishable key missing or wrong in Vercel. Fix, then Redeploy |
| Signed in but only see Directory | Your access is Production. An admin changes it on the Users page (or the SQL in Step 3) |
| No Users page | Only admins see it. Run the Step 3 SQL for your email |
| Approve button missing | Your account isn't ticked as an approver on the Users page |
| "This bill is locked" | It was sent for approval. Withdraw it to draft, change it, send again |
| Upload says Failed with an API error | Check `ANTHROPIC_API_KEY`, the model name, and Anthropic credit |
| "Only an admin can change these details" | You're HR/finance. You can edit the address and documents only |
| Directory is empty | `seed.sql` wasn't run, or ran before `schema.sql` |
| Changed a Vercel setting, nothing changed | Deployments > Redeploy |
