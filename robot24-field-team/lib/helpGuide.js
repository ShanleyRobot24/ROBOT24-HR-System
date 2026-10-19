// What Robbie, the help assistant, knows about the app. Keep this in step with the app: button names must match exactly.
// Each section says who may see it. Robbie only ever receives the sections for the person asking,
// so he cannot describe anything outside their access level, however the question is put.
export const HELP_PLACES = {
  '/home': 'Home, what needs you today',
  '/people': 'People, Directory',
  '/people?tab=records': 'People, Records and documents',
  '/jobs?tab=jobs': 'Jobs',
  '/jobs?tab=calendar': 'Jobs, Calendar',
  '/jobs?tab=travel': 'Jobs, Travel (flights, trains and hotels)',
  '/money?tab=inbox': 'Money, Inbox (upload invoices)',
  '/money?tab=bills': 'Money, Bills',
  '/money?tab=approvals': 'Money, Approvals',
  '/money?tab=missing': 'Money, Missing invoices',
  '/reports': 'Reports',
  '/admin?tab=users': 'Admin, Users',
  '/admin?tab=audit': 'Admin, Audit trail',
  '/staff': 'Staff overview',
  '/staff?tab=staff': 'Staff list',
  '/staff?tab=payroll': 'HR, Payroll',
  '/staff?tab=leave': 'HR, Leave',
  '/me': 'My Robot24',
  '/me?tab=leave': 'My Robot24, My leave',
  '/me?tab=documents': 'My Robot24, My documents',
};

// Who may be sent to each page
const PLACE_WHO = {
  '/home': 'all',
  '/people': 'all',
  '/people?tab=records': 'finance',
  '/jobs?tab=jobs': 'all',
  '/jobs?tab=calendar': 'all',
  '/jobs?tab=travel': 'all',
  '/money?tab=inbox': 'finance',
  '/money?tab=bills': 'finance',
  '/money?tab=approvals': 'approver',
  '/money?tab=missing': 'finance',
  '/reports': 'finance',
  '/admin?tab=users': 'admin',
  '/admin?tab=audit': 'admin',
  '/staff': 'staff',
  '/staff?tab=staff': 'staff',
  '/staff?tab=leave': 'staff',
  '/me': 'me',
  '/me?tab=leave': 'me',
  '/me?tab=documents': 'me',
  '/staff?tab=payroll': 'staff'
};

export const HELP_SECTIONS = [
  {"who": ["me"], "title": "MY ROBOT24 (your own portal)", "lines": ["- My Robot24 shows only your own information: Overview (annual leave available, sick leave used this year, time off in lieu, leave coming up, public holidays, your details), My leave, and My documents. It never shows salaries or anyone else.", "- Your request goes to your manager (shown under Reports to in My details) to approve. If you manage people, My team shows their leave waiting for you: click Approve, or Reject with a reason. You also see each person's annual leave left, who is off today and the team's leave coming up. You never see their salaries or documents.",
      "- Request leave: click \"+ Request leave\", choose the type (Annual, Sick, Maternity, Parental, Bereavement, Study, National service, Unpaid, Hajj, Time off in lieu, Working from home), the dates (half day for a single day), add a note and, for sick leave, attach the medical certificate (or Take photo on a phone), then \"Send request\". It shows how many days it is and what you will have left.", "- Your manager (or HR) approves or rejects it; follow it in My leave. You can cancel a request while it is waiting; for approved leave, ask HR.", "- Annual leave: 2 days a month once you have done 6 months, then 30 days a year. Weekends inside your leave count, public holidays do not. Sick leave: 15 days full pay, 30 half pay, then unpaid each year, after probation.", "- My documents shows the documents HR holds for you and when your passport, Emirates ID, labour card, work permit or visa expire. To update one, send the new copy to HR.", "- Ask Robbie about your own leave and documents (\"how much annual leave do I have?\", \"when does my visa expire?\"), have him fill in a leave request or cancel one that is waiting, or drop your medical certificate into his chat and he starts a sick leave request with it attached. He only sees your own information.",
      "- Passwords: forgot it? On the sign-in page click \"Forgot your password?\", enter your work email and open the link in the email to choose a new one. If HR gave you a temporary password (a new login or a reset), you are asked to choose your own the first time you sign in. To change it any time, click your name at the top right > Change password. HR can also reset it in Admin > Users > Reset password.",
      "- If your details are wrong, tell HR. To change your password, use your name at the top right."]},
  {
    "who": [
      "staff"
    ],
    "title": "STAFF (Robot24's own employees; HR and finance and admins only)",
    "lines": [
      "- Staff is a separate portal for Robot24 employees, not the field team. Open it from the start page or with \"Field team | Staff\" at the top. It is called HR. Its menu: Overview, Staff, Org chart, Leave, Payroll, Reports.",
      "- Org chart (HR > Org chart): everyone and who they report to, drawn as a tree. Drag a person onto their new manager to move them (Undo appears for a few seconds), or onto the top row to put them at the top. Click anyone to choose Reports to from a list (works on a phone) or open their profile. \"Suggest from job titles\" proposes the whole structure (for example editors under the Chief Editor, video producers under the Production Lead); untick any you don't want and Apply. Nobody can report to someone below them. People not placed yet are listed under the chart. Reports to is also on each profile.",
      "- Leave goes to the person's manager on the org chart, who approves or rejects it in My Robot24 > My team. If they have no manager, or the manager is away, an HR approver can approve or reject it in HR > Leave; the list shows who each request is waiting with.",
      "- Leave (HR > Leave): Requests (Waiting, Approved coming up, All), Calendar (who is off each day; solid approved, striped waiting), Balances (annual available, booked, sick days this year, time off in lieu, probation), Public holidays (add each year's holidays; Islamic ones when announced).",
      "- Record leave for someone: HR > Leave > \"+ Record leave\" (or \"+ Record leave\" on their profile). Choose who, type, from and to (half day for a single day), add a note or a document (medical certificate for sick leave), then \"Record leave\". It goes to an HR approver, who clicks \"Approve\", or \"Reject\" with a reason. Leave requested by employees in My Robot24 appears in the same list.",
      "- Leave rules: annual leave 2 days a month after 6 months' service, then 30 days a year, counted in calendar days without public holidays; sick leave 90 days a year after probation (15 full pay, 30 half pay, 45 unpaid; unpaid during probation); maternity 60 days (45 full, 15 half); parental 5 working days within 6 months of the birth; bereavement 5 days (spouse) or 3 (parent, child, sibling, grandchild, grandparent); study 10 working days a year after two years' service; national service; unpaid; Hajj (unpaid); time off in lieu (earned by adjusting the balance); working from home (logged only).",
      "- Payroll uses approved leave: unpaid days and half-pay days come off that month's pay automatically (monthly salary x 12 / 365 a day), shown on the payroll line.",
      "- Each profile has Probation ends, Annual leave a year, and an Opening annual leave balance with its date (for leave already earned before the app). \"Adjust a balance\" adds or removes annual days or time off in lieu, with a reason.",
      "- When someone is terminated, their profile shows the Final settlement: unused annual leave paid out plus end-of-service gratuity (21 days' basic pay a year for the first five years, 30 after, from one year of service, capped at two years' pay), from the basic salary.",
      "- Employee logins: Admin > Users > \"+ Add user\", choose \"Employee (My Robot24 only)\" and their staff record. Anyone else can also be linked to their own staff record to get My Robot24.",
      "- Two portals: Field team (freelancers: Home, People, Jobs, Money, Reports, Admin) and Staff (Robot24 employees: Overview, Staff, Payroll, Reports). HR and finance and admins land on a page that asks which one to open, and switch any time with \"Field team | Staff\" at the top.",
      "- Robbie can fill in Staff forms for you (you always check and save): add a new employee, change someone's details (salary, title, visa type or status, work week, WPS and so on), terminate someone with their last day and reason, make an offer letter, or open a month's payroll. Ask, for example, \"terminate Wissal, last day 2 October, resignation\" and click Open the filled-in form.",
      "- Overview: cards for the month's payroll and its status, payroll waiting for your approval (approvers), documents expiring, missing documents, offers waiting to be signed, starting in 30 days, visas in progress, leaving, active staff and the yearly salary run rate. Below: expiring soon, and joining and leaving.",
      "- Payroll approval: Staff > Payroll for the month in the navy strip. HR clicks \"Send for approval\". An approver in HR and finance (or an admin who approves) opens it (or the \"Staff payroll to approve\" card on Home) and clicks \"Approve\", or \"Reject\" with a reason. If figures change after sending, the page says so and HR clicks \"Update and resend\" (Approve is disabled until then). Rejected: fix it and \"Send again for approval\". Waiting: HR can \"Withdraw\". Approved: make the transfers, then \"Mark paid\" with the bank or WPS reference. Approved and paid payrolls cannot be changed. \"Print or save PDF\" gives the payroll report.",
      "- Reports: pick a year. Cards for paid and approved, still to come, expected total (plus offers not yet signed) and active staff. Chart of salary cost by month (paid, approved, projected, offers not signed). Projection table for the next 12 months (committed and offers not signed). By department, and joiners and leavers. \"Export CSV\" and \"Print or save PDF\".",
      "- Add someone: Staff > \"+ Add staff\". Step 1: upload the passport (photo or PDF); the name, passport number, nationality, date of birth and expiry fill in by themselves. Step 2: enter the job title, monthly salary, currency, start date and Working days (Monday to Friday or Monday to Saturday). Step 3: if they have signed the offer letter, upload it and they are added as Active; if not, click \"Add as Offer sent\".",
      "- Offer letter: open the person, \"⋯\" menu > \"Generate offer letter\", choose the letter date, tick \"Add Jersild Roberts's signature\" only if the company is signing now, tick \"Save a copy to their documents\", then \"Download Word letter\". When it comes back signed, upload it as Offer letter and they become Active.",
      "- Documents: open the person, choose the type (Passport copy, Emirates ID, Labour card, Work permit, NOC, MOHRE contract, Offer letter, Employment contract, Visa, Other) and \"Upload and read\". Emirates ID, labour card and visa numbers and expiry dates fill in automatically; anything different from the profile is pointed out.",
      "- Visa status: choose it on the profile (Not recorded yet, Not started, Entry permit applied, Entry permit issued, Medical and Emirates ID in progress, Residence visa issued, Own visa, Cancelled), then \"Save changes\".",
      "- Each profile has Visa type (Company sponsored, Golden visa, Spouse sponsorship, Family (parent) sponsorship, Other own visa, or Own visa with the type not recorded), Medical insurance (Company or Own) and Paid through WPS (Yes or No). The payroll export includes WPS and the visa type.",
      "- Own visa holders: upload their Work permit and Labour card (\"Upload and read\" fills in the work permit number and expiry). Spouse or family sponsored staff also need an NOC from their sponsor; uploading the NOC sets the visa type to Spouse or Family sponsorship. Golden visa holders do not need an NOC. The \"Still to upload\" list and Missing documents card follow the visa type. Work permit expiry is warned 60 days ahead.",
      "- Pay: Staff > Payroll shows the month chosen in the navy strip. A full month pays the monthly salary. Joining or leaving mid-month pays the day rate (monthly salary x 12 / 365) for each calendar day employed. \"Export CSV\" for the payroll run. People still on Offer sent are not paid.",
      "- Leaving: open the person, \"⋯\" > \"Terminate\", choose the last working day and reason. The record and documents are kept and pay stops after that day. \"Undo termination\" reverses it.",
      "- Remove: admins only, for mistakes: \"⋯\" > \"Remove (mistakes only)\", type DELETE. It deletes the person and all their documents.",
      "- Home shows staff documents expiring within 60 days, offers waiting to be signed, and staff starting in the next 30 days.",
      "- Only HR and finance and admins can use Staff. Production never has access, and employees do not sign in to it.",
      "- Contracts: uploading the MOHRE or employment contract fills in the contract type (limited or unlimited), contract end date and salary breakdown (basic, housing, transport, other) and points out if the total differs from the monthly salary.",
      "- Payroll approval also shows \"Things to check\" compared with last month: salary changes, new joiners, people missing, part months."
    ]
  },
  {
    "who": [
      "all"
    ],
    "title": "FINDING YOUR WAY AROUND",
    "lines": [
      "- Main menu (top of the screen on a computer, bottom bar on a phone): Home, People, Jobs, Money, Reports, Admin. Each person only sees their sections. Home: everyone. People: everyone. Jobs: production and up. Money: HR and finance, and approvers (approvers see only Approvals). Reports: HR and finance. Admin: admins.",
      "- The month for Home, Jobs and Money is chosen once in the navy strip at the top (‹ month ›) and stays the same on every page.",
      "- Your name at the top right opens a menu: Change password, Take the tour again, Sign out.",
      "- Robbie can also: answer questions from the data you can already see (who is booked where, leave balances, what a job cost, what expires when); list what needs you when you open him; read a file you drop or attach in his chat (paperclip) and offer where it goes; and open forms filled in for you: add or change jobs, send briefs, add travel, show or mark bills paid, remind missing invoices, month end, staff and leave forms, final settlements, public holidays, reporting lines, logins and new-hire onboarding as a checklist. He never saves, sends, approves or pays anything himself, and only does what your access allows.",
      "- Passwords: forgot it? On the sign-in page click \"Forgot your password?\", enter your work email and open the link in the email to choose a new one. If HR gave you a temporary password (a new login or a reset), you are asked to choose your own the first time you sign in. To change it any time, click your name at the top right > Change password. HR can also reset it in Admin > Users > Reset password.",
      "- The tour: Robbie walks you through your own screens, opening each one and pointing at the real buttons. Start it with \"Show me around\" in Robbie's chat (or ask for a tour), or from your name menu > Take the tour again. Next, Back and Skip tour are on the tour card; arrow keys work too.",
      "- Row actions: the main button is on the row; Edit, Delete and others are in the \"⋯\" menu at the end of the row.",
      "- HOME: cards for what needs you, and who is working and travelling this week. Click a card to go straight to it. Production sees clashing jobs.",
      "- Undo: deleting a job, a travel booking or a document shows \"Undo\" at the bottom for 10 seconds. Click it to put it back.",
      "- Checks before saving: if an amount looks like a typo (for example about 10 times the person's usual, or a missing zero), a date is far in the past or future, a job is unusually long, or someone is already on file, the app asks you to check before saving. You can still save.",
      "- Phones: upload buttons have a \"Take photo\" option that opens the camera for invoices, receipts, tickets, passports and documents.",
      "- Tour: your name at the top right > \"Take the tour again\" replays the welcome tour.",
      "- Robbie can fill in a job for you: ask \"add Ishaan to Gitex 12 to 14 October\" and click \"Open the filled-in form\". Check it and click \"Add assignment\"; Robbie never saves anything himself."
    ]
  },
  {
    "who": [
      "all"
    ],
    "title": "YOUR ACCESS LEVEL",
    "lines": [
      "- Production and assignments: Home, People (Directory), Jobs (jobs, calendar, travel). No rates, bills, payments, records or bank details."
    ]
  },
  {
    "who": [
      "finance"
    ],
    "title": "HR AND FINANCE ACCESS",
    "lines": [
      "- HR and finance: everything Production has, plus Money (Inbox, Bills, Missing invoices), People > Records and documents, and Reports.",
      "- Home cards for HR and finance: uploads that need a look, bills to check, approved and ready to pay, missing invoices, passports to chase, contracts not signed, exchange rates missing."
    ]
  },
  {
    "who": [
      "approver"
    ],
    "title": "APPROVER ACCESS",
    "lines": [
      "- Approver: adds Money > Approvals. No bill is paid until an approver approves it. Home shows a card for bills waiting for your approval."
    ]
  },
  {
    "who": [
      "admin"
    ],
    "title": "ADMIN ACCESS",
    "lines": [
      "- Admin: everything, plus Admin (Users, Audit trail) and editing any personnel detail. Home also shows freelancers without a proper day rate.",
      "- Backup: Admin > Backup > \"Download full backup\" gives every record as spreadsheet files in one zip. Once email is set up, a backup is also emailed to admins every Monday."
    ]
  },
  {
    "who": [
      "all"
    ],
    "title": "PEOPLE > DIRECTORY",
    "lines": [
      "- Every active freelancer grouped by location: photo, phone, email, WeChat, T-shirt and mic sponge status, contract signed or not.",
      "- Location chips jump to a location. Search by name, city or role. Filter by Journalist, Videographer or Video Journalist.",
      "- Click a person to see their month: days booked, planned and completed, each job with dates and place, and travel booked. Arrows change the month.",
      "- Wrong details: tell an admin."
    ]
  },
  {
    "who": [
      "all"
    ],
    "title": "JOBS",
    "lines": [
      "- Jobs has tabs: \"Jobs\", \"Calendar\", \"Travel\". The month is chosen in the navy strip at the top.",
      "- Country boxes at the top of the Jobs tab: people and jobs per country. Click a box to list who is booked there; \"Show all places\" to see all.",
      "- Add a job: click \"+ Add assignment\" (a side panel opens), choose the person, enter Assignment name, Event or OPP code, City, Country, Status (Planned, Confirmed, Completed, Cancelled), Starts, Ends, Notes, then \"Add assignment\". The form keeps the job details so the next person on the same job is quick to add.",
      "- Jobs from a brief: Jobs > \"Paste a brief\". Paste a client brief, email, WhatsApp message or itinerary, or upload it as a PDF or photo, then \"Read the brief\". The AI drafts one job per person (who, job, OPP code, city, country, dates, Planned or Confirmed). Check each one, fix the person or dates if needed, untick any you do not want, then \"Add N jobs\". Clashes and odd dates are pointed out. Nothing is saved until you click Add.",
      "- Change status straight from the list (dropdown on the row). \"Send brief\", \"Edit\" and \"Delete\" are in the \"⋯\" menu on each row.",
      "- Clash: saving a job that overlaps another job for the same person asks to confirm; clashing jobs show a red Clash badge.",
      "- \"+ Add travel\" on a job opens the travel form for that person and job.",
      "- \"Send brief\" (in the \"⋯\" menu on a job): ready-made message with job, dates, place, flights, hotel and how to invoice. Copy, WhatsApp or Email.",
      "- Calendar tab: month grid \"By person\" or \"By country\". Coloured bars (booked, planned, completed), clashes outlined in red, travel icons. Click a bar to see that person's month."
    ]
  },
  {
    "who": [
      "all"
    ],
    "title": "FLIGHTS, TRAINS AND HOTELS (Jobs > Travel)",
    "lines": [
      "- Robot24 books and pays every hotel and flight. Freelancers never invoice for them, they never go through bills.",
      "- Click \"Upload ticket, hotel booking or receipt\" and choose the file. The AI reads it (any language).",
      "- Then answer \"Is this receipt for one person, or shared?\":",
      "  - One person: choose the person, \"Continue for one person\". The form fills: person, category, what, supplier, booking reference, dates (check-in and check-out for hotels, departure and return for flights), amount, currency, and the matching assignment. Check it and click \"Add booking\".",
      "  - Shared: click \"Split this receipt\". People on the same job are added; \"+ Add someone else\" to add more, \"Remove\" to take someone off. Choose \"Split equally\" or \"Enter amounts\", check each person's assignment, then \"Save N shares\". Shares show as \"Shared, 1 of 2\".",
      "- Typing a booking by hand: fill the form; tick \"This receipt is shared between several people\" to split it.",
      "- Duplicate guard: if the booking reference is already recorded, a warning shows who it is on before saving again.",
      "- Travel dates that don't fit the job dates show a warning.",
      "- Deleting one share asks whether to delete the whole receipt or just that share."
    ]
  },
  {
    "who": [
      "finance"
    ],
    "title": "MONEY: MONTHLY INVOICES",
    "lines": [
      "- Money has tabs: Inbox (upload invoices), Bills, Approvals (approvers), Missing invoices. The month is chosen in the navy strip at the top.",
      "- Upload: Money > Inbox, pick the month in the navy strip, drag the PDFs or photos into the box or click \"Choose files\".",
      "- The AI finds the person (R24 reference, then email on the invoice, then name), splits fees from expenses, files each expense by what it was for (Uber, Careem, taxi to Taxi and Uber, per diem to Meals), links it to the job, and translates other languages.",
      "- Results: Added (bills made, check them in Bills), Who is this? (pick the person, Fee or Expenses, \"Create bill\"), Needs a look (quote, proforma, credit note or no amount: open the file and decide), Already uploaded (duplicate), Failed (\"Read again\" or create the bill by hand).",
      "- Hotels and flights on a freelancer invoice are left off the bill and flagged.",
      "- Check: Money > Bills, \"To check\" section. Click a bill to open it. Fix lines in the Expense breakdown (\"+ Add expense\", \"Remove\"), pick the job under \"For assignment\", \"Save changes\". \"+ Add expenses to this invoice\" adds expenses that came separately.",
      "- Check flags (hover to read): amount differs from day rate x days, currency differs, more days than booked, no receipt, bank details on the invoice, dated in another month, no R24 reference, hotel or flight left off, possible shared receipt.",
      "- Send: \"Send N for approval\" in Bills, or send one bill from inside it. Bills lock while waiting; \"Withdraw\" to edit.",
      "- Pay: approved bills sit in \"Approved, to pay\". \"Export CSV\" for the payment run, make the transfers, then \"Mark paid\" and enter the bank reference. A payment confirmation message opens (Copy, WhatsApp, Email). Resend later with \"Send payment confirmation\" on a paid bill.",
      "- Add a bill by hand: \"Add bill\" in Bills, fill it in, \"Attach invoice\".",
      "- Disputes: Money > Inbox, switch the list to \"All\", open the invoice, \"Replace with corrected invoice\", choose the file, give the reason. The original stays marked Replaced.",
      "- Delete: \"Delete bill\" or \"Delete whole invoice\" inside a bill, or tick several in Bills and \"Delete selected\". \"Remove file\" keeps the bill. Drafts and rejected bills: HR and finance can delete. Waiting for approval: Withdraw first. Approved or paid: admin only, type DELETE.",
      "- Money > Missing invoices: finished jobs with no invoice yet. \"Send reminder\" opens a message (Copy, WhatsApp, Email). \"Mark completed\" for jobs still Confirmed.",
      "- Month end checklist on Home: invoices uploaded, bills checked and sent, bills approved, freelancers paid, missing invoices chased. It ticks itself off as the work is done; \"Do the next step\" opens the next one.",
    ]
  },
  {
    "who": [
      "finance"
    ],
    "title": "PEOPLE > RECORDS AND DOCUMENTS",
    "lines": [
      "- People > Records and documents lists everyone with day rate, contract, passport status, address and kit. Click a person to open their profile.",
      "- Photo: \"Add photo\" or \"Change photo\".",
      "- Address: fill \"Home address\", \"Save address\".",
      "- Documents: in \"Contracts, passport and ID\" choose the type (Contract, Passport, ID card, Visa or permit, Bank letter, Other), choose the file, tick \"Signed copy\" and add the signed date for contracts, add the expiry date for passports and visas, then \"Upload\". A signed contract marks them Contract signed in the Directory. Passports show Missing, Expires (within 6 months) or Expired.",
      "- Send someone their reference: open the person, \"Email reference\" or \"Copy reference message\".",
      "- Day rate only: 10 and 15 day packages are legacy and never used. If only an old package is on file, the day rate is estimated and labelled Estimated."
    ]
  },
  {
    "who": [
      "admin"
    ],
    "title": "PEOPLE > RECORDS: ADMIN ONLY",
    "lines": [
      "- Edit: change fields, \"Save all changes\". Someone leaves: untick \"Active\" (never delete).",
      "- Add a freelancer: People > Records and documents > \"Add field team member\". In \"Fill in from documents\", upload their passport and signed contract: name, nationality, passport number, date of birth, role, day rate, email and address fill in. Choose the location group, check, then \"Add person\". Both documents are saved to their file and they get an R24 reference automatically."
    ]
  },
  {
    "who": [
      "approver"
    ],
    "title": "MONEY > APPROVALS",
    "lines": [
      "- Money > Approvals > \"Waiting for you\". Click a bill: lines, day rate, the job and days booked, flags, \"Open invoice\".",
      "- \"Approve\", or \"Reject\" with a reason (goes back to finance). \"Approve all\" next to a month approves the whole month.",
      "- \"Approved\" and \"Rejected\" tabs show past decisions.",
      "- \"Things to check before approving\" at the top lists anything unusual: an amount far from the person's usual, the same invoice number billed before, the same amount twice in a month, more days billed than booked, a bill not linked to a job, or a different currency."
    ]
  },
  {
    "who": [
      "finance"
    ],
    "title": "REPORTS",
    "lines": [
      "- Top: \"Spend so far\", \"Projection\", \"By opportunity\". Pick a year, a month or \"Whole year\", Location, and \"Show in\" USD or AED.",
      "- Spend so far: Count (Paid by bill month, Paid by payment date, Approved and paid, Everything billed). Paid in shows original currencies. Charts by month, location, expense category, top members; tables per member. Empty month: choose Everything billed.",
      "- Projection: day rate x days booked; Committed (confirmed and completed jobs plus travel booked), Planned, Projected total, Invoiced so far. Click a name for each job.",
      "- By opportunity: cost per OPP code (fees, expenses, travel, spent, still to come). Click one for each person's share.",
      "- Reports > Exchange rates button: \"Get today's rates\" fills this month; type past months by hand, \"Save\". AED is fixed at 3.6725 per USD.",
      "- \"Export CSV\" on tables, \"Print or save PDF\"."
    ]
  },
  {
    "who": [
      "admin"
    ],
    "title": "ADMIN",
    "lines": [
      "- \"+ Add user\": name, work email, choose Production and assignments, HR and finance or Admin, tick \"Can approve bills\", \"Create user\". A welcome message with a temporary password appears: \"Email it\" or \"Copy message\".",
      "- Each user row: change access, approver tick, \"Reset password\", \"Remove access\", \"Restore access\". Last signed in is shown.",
      "- Admin > \"Audit trail\" tab: who added, changed or deleted what, with before and after. Filter, search, \"Export CSV\". Nobody can edit it."
    ]
  },
  {
    "who": [
      "all"
    ],
    "title": "FREELANCERS",
    "lines": [
      "- Each has a unique reference like R24-CN-001 to write under their name on every invoice. Invoices go as a PDF to s.kajee@robot24.com with receipts for expenses. Never invoice hotels or flights."
    ]
  },
  {
    "who": [
      "all"
    ],
    "title": "TROUBLESHOOTING",
    "lines": [
      "- Can't see a page: your access level doesn't include it, ask an admin.",
      "- Forgot password: click Forgot your password? on the sign-in page, or ask an admin to reset it. Old page showing: refresh with Ctrl+F5.",
      "- No Approve button: you are not an approver, ask an admin.",
      "- Old links (Directory, Assignments, HR and finance, Approvals) forward to the new sections automatically."
    ]
  },
  {
    "who": [
      "finance"
    ],
    "title": "TROUBLESHOOTING FOR HR AND FINANCE",
    "lines": [
      "- \"This bill is locked\": it was sent for approval, click Withdraw.",
      "- Upload Failed: \"Read again\", or add the bill by hand.",
      "- Reports look empty: bills may not be paid yet, switch Count to Everything billed.",
      "- Someone missing from a projection: the note above the chart says why (often a missing exchange rate)."
    ]
  }
];

// What this person may see: 'all' plus their own access
export function accessOf({ role, isApprover, staffAccess, hasMe }) {
  // Employees only ever get the My Robot24 part of the guide
  const a = new Set(role === 'employee' ? [] : ['all']);
  if (hasMe || role === 'employee') a.add('me');
  if (role === 'employee') return a;
  if (role === 'admin' || role === 'hr_finance') a.add('staff'); // never production
  if (role === 'hr_finance' || role === 'admin') a.add('finance');
  if (role === 'admin') a.add('admin');
  if (isApprover) a.add('approver');
  return a;
}

export function guideFor(person) {
  const a = accessOf(person);
  return HELP_SECTIONS.filter((s) => s.who.some((w) => a.has(w))).map((s) => `${s.title}\n${s.lines.join('\n')}`).join('\n\n');
}

export function placesFor(person) {
  const a = accessOf(person);
  return Object.fromEntries(Object.entries(HELP_PLACES).filter(([path]) => a.has(PLACE_WHO[path] || 'admin')));
}

// For questions outside someone's access: who to ask, without any steps
export const WHO_HANDLES = 'Invoices, bills, payments, missing invoices, freelancer records and documents, rates, exchange rates and reports are handled by HR and finance. Approving bills is done by approvers. Users, access and the audit trail are handled by admins.';
