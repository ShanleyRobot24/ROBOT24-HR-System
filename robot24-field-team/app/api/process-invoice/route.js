// One server function for all AI reading, to stay within the Vercel Hobby plan:
//   mode "invoice" (default): read an uploaded invoice and create draft bills (HR, finance, admin)
//   mode "ticket": read a flight, train or hotel ticket and return the fields to fill in (also production and assignments)
//   mode "help": Robbie, the help assistant, answers how-to questions (everyone signed in)
//   mode "brief": draft jobs from a pasted or uploaded client brief (production and up)
//   mode "staffdoc": read a staff passport, Emirates ID, labour card, visa or offer letter (admins and Staff access only)
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/requireRole';
import { processInvoice } from '@/lib/processInvoice';
import { processTicket } from '@/lib/processTicket';
import { processHelp } from '@/lib/processHelp';
import { processStaffDoc, processOrg, processClassify } from '@/lib/processStaffDoc';
import { processBrief } from '@/lib/processBrief';
import { runBackup } from '@/lib/cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The scheduled weekly backup (vercel.json). Vercel sends the CRON_SECRET; nobody else can run it.
export async function GET(req) {
  const job = new URL(req.url).searchParams.get('cron');
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  try {
    if (job === 'backup') return NextResponse.json(await runBackup());
    return NextResponse.json({ error: 'Unknown job' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const mode = ['ticket', 'help', 'staffdoc', 'brief', 'org', 'classify'].includes(body.mode) ? body.mode : 'invoice';

  // Employees (My Robot24 only) may ask Robbie for help, and nothing else
  const auth = await requireRole(req, mode === 'invoice' ? ['hr_finance', 'admin'] : ['help', 'classify'].includes(mode) ? ['production', 'assignments', 'hr_finance', 'admin', 'employee'] : ['production', 'assignments', 'hr_finance', 'admin']);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (mode === 'classify') {
    // Only files in a place this person may upload to: employees their own leave folder, HR the staff bucket, the field team the travel folder
    const role = auth.profile.role, path = String(body.path || '');
    const ok = body.bucket === 'staff'
      ? (['admin', 'hr_finance'].includes(role) && path.startsWith('robbie/')) || (auth.profile.staff_id && path.startsWith(`leave/${auth.profile.staff_id}/`))
      : body.bucket === 'invoices' && role !== 'employee' && path.startsWith('direct/robbie/');
    if (!ok || path.includes('..')) return NextResponse.json({ error: 'That file is not in a place you can use' }, { status: 403 });
    try { return NextResponse.json(await processClassify(body)); } catch (e) { return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status: 400 }); }
  }

  if (mode === 'org') {
    if (!['admin', 'hr_finance'].includes(auth.profile.role)) return NextResponse.json({ error: 'Only HR can do this' }, { status: 403 });
    try { return NextResponse.json(await processOrg(body)); } catch (e) { return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status: 400 }); }
  }

  if (mode === 'brief') {
    try {
      return NextResponse.json(await processBrief(body));
    } catch (e) {
      return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status: 400 });
    }
  }

  if (mode === 'staffdoc') {
    const freelancer = String(body.docType || '').startsWith('freelancer_');
    const allowed = ['admin', 'hr_finance'].includes(auth.profile.role);
    if (!allowed) return NextResponse.json({ error: freelancer ? 'HR and finance access is needed for this' : 'Staff access is needed for this' }, { status: 403 });
    try {
      return NextResponse.json(await processStaffDoc(body));
    } catch (e) {
      return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status: 400 });
    }
  }

  if (mode === 'help') {
    try {
      return NextResponse.json(await processHelp({ ...body, role: auth.profile.role, isApprover: auth.profile.role !== 'employee' && !!auth.profile.is_approver, staffAccess: ['admin', 'hr_finance'].includes(auth.profile.role), hasMe: !!auth.profile.staff_id }));
    } catch (e) {
      return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status: 400 });
    }
  }

  if (mode === 'ticket') {
    try {
      return NextResponse.json(await processTicket(body));
    } catch (e) {
      return NextResponse.json({ error: String(e.message || e).slice(0, 300) }, { status: 400 });
    }
  }

  const { path, fileName, contentType, period, uploadId } = body;
  if (!uploadId && (!path || !fileName || !/^\d{4}-\d{2}-01$/.test(period || ''))) {
    return NextResponse.json({ error: 'Missing file or month' }, { status: 400 });
  }
  const result = await processInvoice({ path, fileName, contentType, period, uploadId, userId: auth.user.id });
  return NextResponse.json(result);
}
