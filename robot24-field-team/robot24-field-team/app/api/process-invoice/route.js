// One server function for all AI reading, to stay within the Vercel Hobby plan:
//   mode "invoice" (default): read an uploaded invoice and create draft bills (HR, finance, admin)
//   mode "ticket": read a flight, train or hotel ticket and return the fields to fill in (also production and assignments)
//   mode "help": Robbie, the help assistant, answers how-to questions (everyone signed in)
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/requireRole';
import { processInvoice } from '@/lib/processInvoice';
import { processTicket } from '@/lib/processTicket';
import { processHelp } from '@/lib/processHelp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const mode = ['ticket', 'help'].includes(body.mode) ? body.mode : 'invoice';

  const auth = await requireRole(req, mode === 'invoice' ? ['hr_finance', 'admin'] : ['production', 'assignments', 'hr_finance', 'admin']);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (mode === 'help') {
    try {
      return NextResponse.json(await processHelp({ ...body, role: auth.profile.role, isApprover: !!auth.profile.is_approver }));
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
