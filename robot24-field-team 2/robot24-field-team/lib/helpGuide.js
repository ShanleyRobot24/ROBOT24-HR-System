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
  '/staff': 'Staff',
  '/staff?tab=payroll': 'Staff, Payroll',
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
  '/staff?tab=payroll': 'staff'
};

export const HELP_SECTIONS = [
  {"who": ["staff"], "title": "STAFF (Robot24's own employees; for HR and finance, admins and anyone given Staff access)", "lines": ["- Staff is a separate section for Robot24 employees, not the field team. Tabs: Overview, Staff, Payroll, Reports.",
      "- Overview: cards for the month's payroll and its status, payroll waiting for your approval (approvers), documents expiring, missing documents, offers waiting to be signed, starting in 30 days, visas in progress, leaving, active staff and the yearly salary run rate. Below: expiring soon, and joining and leaving.",
      "- Payroll approval: Staff > Payroll for the month in the navy strip. HR clicks \"Send for approval\". An approver who also has Staff access opens it (or the \"Staff payroll to approve\" card on Home) and clicks \"Approve\", or \"Reject\" with a reason. If figures change after sending, the page says so and HR clicks \"Update and resend\" (Approve is disabled until then). Rejected: fix it and \"Send again for approval\". Waiting: HR can \"Withdraw\". Approved: make the transfers, then \"Mark paid\" with the bank or WPS reference. Approved and paid payrolls cannot be changed. \"Print or save PDF\" gives the payroll report.",
      "- Reports: pick a year. Cards for paid and approved, still to come, expected total (plus offers not yet signed) and active staff. Chart of salary cost by month (paid, approved, projected, offers not signed). Projection table for the next 12 months (committed and offers not signed). By department, and joiners and leavers. \"Export CSV\" and \"Print or save PDF\".", "- Add someone: Staff > \"+ Add staff\". Step 1: upload the passport (photo or PDF); the name, passport number, nationality, date of birth and expiry fill in by themselves. Step 2: enter the job title, monthly salary, currency, start date and Working days (Monday to Friday or Monday to Saturday). Step 3: if they have signed the offer letter, upload it and they are added as Active; if not, click \"Add as Offer sent\".", "- Offer letter: open the person, \"⋯\" menu > \"Generate offer letter\", choose the letter date, tick \"Add Jersild Roberts's signature\" only if the company is signing now, tick \"Save a copy to their documents\", then \"Download Word letter\". When it comes back signed, upload it as Offer letter and they become Active.", "- Documents: open the person, choose the type (Passport copy, Emirates ID, Labour card, MOHRE contract, Offer letter, Employment contract, Visa, Other) and \"Upload and read\". Emirates ID, labour card and visa numbers and expiry dates fill in automatically; anything different from the profile is pointed out.", "- Visa status: choose it on the profile (Not started, Entry permit applied, Entry permit issued, Medical and Emirates ID in progress, Residence visa issued, Own visa, Cancelled), then \"Save changes\".", "- Pay: Staff > Payroll shows the month chosen in the navy strip. A full month pays the monthly salary. Joining or leaving mid-month pays the day rate (monthly salary x 12 / 365) for each calendar day employed. \"Export CSV\" for the payroll run. People still on Offer sent are not paid.", "- Leaving: open the person, \"⋯\" > \"Terminate\", choose the last working day and reason. The record and documents are kept and pay stops after that day. \"Undo termination\" reverses it.", "- Remove: admins only, for mistakes: \"⋯\" > \"Remove (mistakes only)\", type DELETE. It deletes the person and all their documents.", "- Home shows staff documents expiring within 60 days, offers waiting to be signed, and staff starting in the next 30 days.", "- HR and finance and admins have Staff access automatically. An admin can give it to anyone else in Admin > Users (tick Staff access), for example a manager who approves salaries. Employees do not sign in to it."]},
  {
    "who": [
      "all"
    ],
    "title": "FINDING YOUR WAY AROUND",
    "lines": [
      "- Main menu (top of the screen on a computer, bottom bar on a phone): Home, People, Jobs, Money, Reports, Staff, Admin. Each person only sees their sections. Home: everyone. People: everyone. Jobs: production and up. Money: HR and finance, and approvers (approvers see only Approvals). Reports: HR and finance. Staff (Robot24 employees): HR and finance, admins, and anyone given the Staff access tick. Employees do not sign in to it. Admin: admins.",
      "- The month for Home, Jobs and Money is chosen once in the navy strip at the top (‹ month ›) and stays the same on every page.",
      "- Your name at the top right opens a menu: Change password, Sign out.",
      "- Row actions: the main button is on the row; Edit, Delete and others are in the \"⋯\" menu at the end of the row.",
      "- HOME: cards for what needs you, and who is working and travelling this week. Click a card to go straight to it. Production sees clashing jobs."
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
      "- Admin: everything, plus Admin (Users, Audit trail) and editing any personnel detail. Home also shows freelancers without a proper day rate."
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
      "- Money > Missing invoices: finished jobs with no invoice yet. \"Send reminder\" opens a message (Copy, WhatsApp, Email). \"Mark completed\" for jobs still Confirmed."
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
      "- Add a freelancer: \"Add field team member\", enter name, location group, role, contacts, day rate, currency, payment terms, kit; \"Add person\". They get an R24 reference automatically.",
      "- Edit: change fields, \"Save all changes\". Someone leaves: untick \"Active\" (never delete)."
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
      "- \"Approved\" and \"Rejected\" tabs show past decisions."
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
      "- Forgot password: ask an admin to reset it. Old page showing: refresh with Ctrl+F5.",
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
export function accessOf({ role, isApprover, staffAccess }) {
  const a = new Set(['all']);
  if (role === 'admin' || role === 'hr_finance' || staffAccess) a.add('staff');
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
export const WHO_HANDLES = 'Robot24 staff records, salaries and staff documents are handled by HR and finance. Invoices, bills, payments, missing invoices, freelancer records and documents, rates, exchange rates and reports are handled by HR and finance. Approving bills is done by approvers. Users, access and the audit trail are handled by admins.';
