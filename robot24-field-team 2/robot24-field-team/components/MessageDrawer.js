'use client';
import { useState } from 'react';
import Drawer from './Drawer';

// Shows a ready-made message with Copy, WhatsApp and Email buttons. The text can be edited first.
export default function MessageDrawer({ title, intro, to = {}, subject, text, onClose }) {
  const [body, setBody] = useState(text);
  const [copied, setCopied] = useState(false);
  const phone = String(to.phone || '').replace(/[^\d]/g, '');
  async function copy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Drawer title={title} onClose={onClose}>
      {intro && <p className="hint">{intro}</p>}
      <p className="msg-to">To: <strong>{to.name || 'Freelancer'}</strong>{to.phone ? ` · ${to.phone}` : ''}{to.email ? ` · ${to.email}` : ''}</p>
      <textarea className="msg-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="drawer-actions">
        <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        {phone && <a className="btn" href={`https://wa.me/${phone}?text=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {to.email && <a className="btn" href={`mailto:${to.email}?subject=${encodeURIComponent(subject || 'Robot24')}&body=${encodeURIComponent(body)}`}>Email</a>}
        <span className="spacer" />
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
      {!phone && !to.email && <p className="hint">No phone or email on file for this person. Copy the message and send it another way, or add their details in People, Records and documents.</p>}
    </Drawer>
  );
}
