import { supabase } from './supabaseClient';
import { todayISO } from './format';
import { paidRef } from './sticky';

// Returns null on success, or an error message. ids can be one id or a list.
export async function paymentAction(action, ids, opts = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return null;
  let res;
  switch (action) {
    case 'send':
      res = await supabase.from('payments').update({ status: 'pending_approval' }).in('id', list);
      break;
    case 'withdraw':
    case 'redraft':
      res = await supabase.from('payments').update({ status: 'draft' }).in('id', list);
      break;
    case 'approve':
      res = await supabase.rpc('decide_payments', { p_ids: list, p_decision: 'approved', p_note: opts.note || null });
      break;
    case 'reject':
      res = await supabase.rpc('decide_payments', { p_ids: list, p_decision: 'rejected', p_note: opts.note || null });
      break;
    case 'unapprove':
      res = await supabase.from('payments').update({ status: 'pending_approval' }).in('id', list);
      break;
    case 'pay':
      res = await supabase.from('payments')
        .update({ status: 'paid', paid_on: opts.paidOn || todayISO(), paid_reference: opts.reference || null })
        .in('id', list);
      break;
    case 'unpay':
      res = await supabase.from('payments').update({ status: 'approved' }).in('id', list);
      break;
    default:
      return 'Unknown action';
  }
  return res.error ? res.error.message : null;
}

// Which buttons a person sees for a bill
export function actionsFor(p, { isFinance, isApprover, isAdmin }) {
  const a = [];
  if (p.status === 'draft' && isFinance) a.push(['send', 'Send for approval', 'primary']);
  if (p.status === 'pending_approval' && isApprover) a.push(['approve', 'Approve', 'primary'], ['reject', 'Reject', 'danger']);
  if (p.status === 'pending_approval' && isFinance && !isApprover) a.push(['withdraw', 'Withdraw', '']);
  if (p.status === 'approved' && isFinance) a.push(['pay', 'Mark paid', 'primary']);
  if (p.status === 'approved' && (isApprover || isAdmin)) a.push(['unapprove', 'Undo approval', 'ghost']);
  if (p.status === 'rejected' && isFinance) a.push(['redraft', 'Back to draft', '']);
  if (p.status === 'paid' && isAdmin) a.push(['unpay', 'Undo paid', 'ghost']);
  return a;
}

// Runs an action with any prompts it needs. Returns true if something changed.
export async function runAction(action, p, name) {
  const opts = {};
  if (action === 'reject') {
    const note = window.prompt(`Why is the bill for ${name} rejected?`, '');
    if (note === null) return false;
    opts.note = note;
  }
  if (action === 'pay') {
    // A reference Robbie was given is filled in, ready to confirm
    const ref = window.prompt(`Bank transfer reference for ${name} (optional)`, paidRef.value || '');
    paidRef.value = '';
    if (ref === null) return false;
    opts.reference = ref;
  }
  if (action === 'unpay' && !window.confirm('Mark this bill as not paid?')) return false;
  const err = await paymentAction(action, p.id, opts);
  if (err) { alert(err); return false; }
  return { action, opts, paid: action === 'pay' ? { ...p, status: 'paid', paid_on: opts.paidOn || new Date().toISOString().slice(0, 10), paid_reference: opts.reference || null } : null };
}
